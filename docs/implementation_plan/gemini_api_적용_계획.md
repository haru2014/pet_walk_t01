# 🤖 [구현 계획서] Gemini API 기반 음성 의도 분석·경로 오케스트레이션·맞춤 안내 고도화 계획

> **문서 버전**: v1.0 (하이브리드 AI-LBS 아키텍처 수립판)  
> **작성 일자**: 2026년 10월 13일  
> **수립 주체**: 편안하개 프로젝트 개발팀 (총괄: 조현정 PM, 모바일: 김승현, 백엔드: 노희선, 데이터: 전황진, UI/CBT: 김정님)  
> **연관 요구사항**: [US-A1] 대화형 자연어 산책 요청, [US-B3] 다요소 라우팅, [US-C2] 시선 해방 핸즈프리 안내, [US-E2] 보행 체감 피드백  

---

## 📌 1. 개요 및 설계 원칙 (Executive Summary & Principles)

본 계획서는 **편안하개 (PetWalk)** 서비스의 AI Native 사용성을 극대화하기 위해 **Gemini API**를 **(1) 음성입력 의도 분석, (2) 산책 경로 생성 오케스트레이션, (3) 상황 반응형 맞춤 코스 브리핑**의 3대 핵심 영역에 단계별로 적용하기 위한 공식 구현 계획서입니다.

### 📐 핵심 아키텍처 설계 원칙: 하이브리드(Hybrid) AI-LBS
1. **경로 지오메트리 직접 생성 금지 (Zero Spatial Hallucination)**:
   - 위경도 좌표(Polyline)를 LLM이 직접 생성하지 않고, **Gemini는 '조건 결정(두뇌)'**, **OSRM/ORS는 '물리적 도로망 순환 루프 탐색(엔진)'**으로 역할을 엄격히 분리하여 건물 관통 및 계단 오인 등 공간 환각을 100% 방지함.
2. **턴바이턴(TBT) 회전 안내의 온디바이스 분리 (0초 무지연 사수)**:
   - 30m 전 방향 전환("우회전") 안내는 네트워크 통신 지연(0.5~2초)을 배제하고 프론트엔드 온디바이스 엔진([`guidanceEngine.ts`](file:///d:/코디세이/pet_walk_t01/frontend/src/services/guidanceEngine.ts)) + `expo-speech`로 0초 즉시 발화함.
   - Gemini는 **출발 전 종합 브리핑, 기상/노면 주의 코칭, 완주 리포트 총평** 등 문맥 기반 고차원 언어 생성에 집중함.
3. **Cascading Fallback 지원 모델군**:
   - 구형 1.5 계열을 전면 배제하고, 지연시간 $\le 400\text{ms}$의 경량·고속 모델 우선 체인 채택:  
     `gemini-3.5-flash-lite` $\rightarrow$ `gemini-3.1-flash-lite` $\rightarrow$ `gemini-3.6-flash` (오프라인 시 로컬 룰베이스 폴백).

---

## 🏗️ 2. Gemini API 3대 적용 영역 상세 설계

```mermaid
flowchart TD
    subgraph Client ["모바일 클라이언트 (Expo SDK 57)"]
        VoiceInput[음성 녹음 / STT 입력]
        TBT[온디바이스 턴바이턴 안내 (0초)]
        UI[경로 지도 & 브리핑 카드]
    end

    subgraph Backend ["FastAPI & LangGraph Agent"]
        IntentService[영역 1: 음성 의도 분석기]
        Orchestrator[영역 2: ReAct 경로 오케스트레이터]
        BriefingService[영역 3: 상황별 브리핑 생성기]
    end

    subgraph Engines ["물리 엔진 & 실데이터"]
        OSRM[OSRM 보행 도로망 루프 엔진]
        Weather[기상청 지면열 & 4대 거점 공영주차장]
    end

    VoiceInput --> IntentService
    IntentService -->|Gemini Structured Output| Orchestrator
    Orchestrator -->|기상·주차장 컨텍스트| Weather
    Orchestrator -->|출발지·시간·노면 제약조건| OSRM
    OSRM -->|실제 도로 GeoJSON| Orchestrator
    Orchestrator --> BriefingService
    BriefingService -->|Gemini 맞춤 해설| UI
    UI --> TBT
```

### 2.1 [영역 1] 음성입력 분석 (Speech & Voice Intent Analysis)
- **목적**: 모바일에서 텍스트 타이핑 없이 음성으로 산책 조건을 말하면 0.5초 내에 정형 파라미터로 추출.
- **입력 예시**: *"날씨가 더우니까 뽀삐랑 25분만 그늘진 흙길로 유림공원 한 바퀴 돌고 싶어"*
- **Gemini 프롬프트 & Pydantic Structured Output 규격**:
  ```python
  class VoiceWalkIntentPayload(BaseModel):
      target_duration_minutes: int = Field(default=30, ge=10, le=90)
      prefer_shade: bool = True
      prefer_cushion: bool = True
      avoid_stairs: bool = True
      joint_care_level: int = Field(default=1, ge=0, le=2)
      destination_landmark: Optional[str] = "유림공원"
      max_surface_temp_limit: float = 35.0
  ```
- **오프라인 안전망**: 네트워크 단절 시 프론트엔드 정규식 기반 키워드 파서(`extractLocalVoiceIntent`)로 즉시 폴백.

### 2.2 [영역 2] 산책 경로 생성 오케스트레이션 (Agentic Route Orchestration)
- **목적**: 기상청 단기예보, 대전/세종 4대 거점 공영주차장, 사용자 의도를 종합하여 최적의 OSRM 라우팅 도구를 호출.
- **동작 흐름**:
  1. **컨텍스트 주입**: 현위치 위경도 기준 `GET /weather/heat-risk` 실시간 지면온도(예: 36.5℃) 및 `GET /parking/nearby` 주차장 출입구 좌표 로드.
  2. **Gemini ReAct 판단**: *"현재 한낮 지면온도가 35℃를 초과하므로 아스팔트 대로변을 배제하고 유림공원 갑천 둔치 흙길/그늘길 위주로 1.2km 루프를 형성하도록 OSRM 웨이포인트를 배치한다."*
  3. **OSRM 실행**: 실제 도로망 그래프에서 폐곡선 루프 좌표열(GeoJSON LineString) 산출.
  4. **무결성 점검**: DEM 경사도 15도 미만 및 계단 0개 여부 자동 채점.

### 2.3 [영역 3] 상황 반응형 AI 음성 브리핑 (Contextual Voice Briefing)
- **출발 전 맞춤 브리핑 (Pre-walk Briefing)**:
  - *"현재 유림공원 지면온도는 31℃로 발바닥 패드가 편안한 안심 시간대예요. 갑천변 폭신한 흙길을 따라 1.2km(24분) 완만 산책을 시작합니다."*
- **돌발 위험 제보 시 우회 안내 (Reroute Coaching)**:
  - *"전방 50m 공사 구간이 감지되어 덜컹거림이 적은 우측 수변 데크길로 안전하게 우회합니다."*
- **완주 후 건강 리포트 총평 (Post-walk Summary)**:
  - *"오늘 총 1.4km를 완주하며 완만길 92%를 달성했어요! 뽀삐 관절에 무리 없는 훌륭한 산책이었습니다."*

---

## 📅 3. 단계별 추진 로드맵 (Phase Roadmap)

### 🚀 1단계 (Sprint 2 전반, 10/19 ~ 10/22): 음성 의도 분석 & 출발 브리핑 구축
- **과제 1-1. 백엔드 Gemini 음성 의도 파싱 서비스 (`voice_intent_service.py`) 신설**:
  - `POST /api/v1/voice/intent` 엔드포인트 구현.
  - Gemini Flash-Lite Structured Output 기반 Pydantic 스키마 변환 및 단위 테스트 작성.
- **과제 1-2. 백엔드 Gemini 코스 브리핑 생성기 (`gemini_briefing_service.py`) 신설**:
  - 생성된 GeoJSON 노면 속성(흙길 비율, 평균 경사, 지면온도)을 프롬프트 컨텍스트로 전달하여 2문장 이내 안심 웰니스 카피 생성.
- **과제 1-3. 모바일 원터치 음성 입력 모달 (`VoiceInputModal.tsx`) 신설**:
  - 마이크 권한 획득, 실시간 음성 녹음 및 텍스트 변환 전달 플로우 구축.

### ⚙️ 2단계 (Sprint 2 후반, 10/23 ~ 10/25): LangGraph ReAct 통합 & 대전·세종 4대 거점 E2E 결합
- **과제 2-1. LangGraph WalkPlanningAgent에 Gemini ReAct 툴 체인 결합**:
  - 기상청 단기예보 툴 + 대전/세종 공영주차장 P&R 툴 + OSRM 루프 생성 툴 연계.
- **과제 2-2. 백엔드 응답 레이턴시 튜닝 ($\le 1.5$초 SLA 달성)**:
  - 프롬프트 토큰 최적화 및 Gemini Streaming 또는 비동기 병렬 처리로 RTT 1.5초 이내 사수.
- **과제 2-3. 위험 우회(`POST /reroute`) 시 Gemini 우회 사유 음성 생성 연계**:
  - 장애물 종류(공사, 턱, 대형견)에 따른 맞춤 순화 안내 문구 도출.

### 🛡️ 3단계 (Sprint 3, 10/26 ~ 10/30): 현장 CBT 실기기 검증 & 10/30 Code Freeze
- **과제 3-1. 대전 3대 공원 & 세종호수공원 현장 음성 인식률 및 브리핑 실측**:
  - 야외 바람 소리 및 주변 소음 환경에서의 음성 의도 파싱 성공률 90% 이상 검증.
- **과제 3-2. 전사 린트 및 안정성 전수 감사**:
  - 전 신규 파일 250줄 엄수, API 키 보안 검수, 오프라인 무중단 폴백 무결성 확인.
- **과제 3-3. 11/1 ~ 11/7 실사용자 5인 CBT 시나리오 반영**:
  - 음성 산책 시작 및 AI 브리핑 만족도 설문 문항(SUS) 추가.

---

## 👥 4. 팀원별 R&R 및 협업 매트릭스

| 팀원 | 역할 | Gemini API 연계 세부 과제 |
|:---:|---|---|
| **1번 조현정**<br>(총괄 PM / AI) | AI Agent Lead | • Gemini ReAct 시스템 프롬프트 및 Zero Medical Slang 가드레일 설계<br>• Candidate Route Scorer 100점 채점기와 Gemini 의도 파라미터 결합 |
| **2번 전황진**<br>(데이터) | Spatial Data | • 기상청 지면열 및 대전/세종 주차장 실데이터를 Gemini 프롬프트 컨텍스트로 정규화 피딩<br>• DEM 고도차 및 노면 재질별 메타데이터 JSON 템플릿 제공 |
| **3번 노희선**<br>(서버) | Backend Lead | • `voice_intent_service.py` 및 `gemini_briefing_service.py` 백엔드 REST API 구현<br>• Gemini 후보 모델 체인(3.5 $\rightarrow$ 3.1 $\rightarrow$ 3.6) Cascading Fallback 구축 |
| **4번 김승현**<br>(모바일) | Mobile App Lead | • `VoiceInputModal.tsx` 모바일 음성 녹음/STT 연동 UI 개발<br>• 온디바이스 턴바이턴(`guidanceEngine.ts`)과 Gemini 상황 브리핑 하이브리드 바인딩 |
| **5번 김정님**<br>(UI / CBT) | UI/UX & QA Lead | • 음성 입력 파형 시각화 디자인 및 야외 직사광선 브리핑 카드 UI 렌더링<br>• 대전/세종 4대 거점 현장 CBT 음성 사용성 체크리스트 작성 및 테스트 |

---

## 🔒 5. 비용·보안 및 품질 가드레일 (Safety & Cost Controls)

1. **API Key 보안 관리**:
   - `GEMINI_API_KEY`는 모바일 클라이언트에 절대 노출하지 않고 FastAPI 백엔드 환경변수(`.env`)에서만 호출.
2. **토큰 및 레이트 리밋 제어**:
   - 시스템 프롬프트 캐싱 및 Few-shot 최소화로 요청당 $\le 300$ 토큰 유지.
   - 동일 사용자 연속 음성 호출 시 3초 쿨다운(Debounce) 적용.
3. **의료/공포 슬랭 원천 차단 (Zero Medical Slang)**:
   - "탈진", "화상 위험", "관절염 악화" 등의 부정적 용어 생성을 시스템 프롬프트 수준에서 엄격히 금지하고 **"발바닥 패드가 편안한 안심 코스"**, **"안전한 휴식을 권장해요"**로 정제 출력.
