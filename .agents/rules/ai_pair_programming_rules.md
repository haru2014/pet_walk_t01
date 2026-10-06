# PawTrail AI Pair Programming 자동 점검 규칙 (Always-On Global Rules)

본 규칙은 **PawTrail** 프로젝트에서 모든 AI 코딩 어시스턴트(Antigravity, Gemini Code Assist 등)가 코드를 생성, 수정, 리팩토링, 리뷰할 때 **사용자의 별도 지시나 팀원의 수동 확인 없이 자동으로 즉시 점검하고 적용해야 하는 절대 강제 규칙(Mandatory Automated Rules)**입니다.

---

## 1. 5인 역할별 자동 점검 매트릭스 (Role-Based Automated Verification)

AI는 작업 대상 파일 경로 및 모듈 유형에 따라 아래 5대 역할별 체크리스트를 **사전(Pre-gen) / 사후(Post-gen)로 자동 실행**합니다.

```
+-------------------------------------------------------------------------------------------------+
|                                 작업 대상 파일/모듈 자동 식별                                     |
+-------------------------------------------------------------------------------------------------+
        |                        |                     |                     |                  |
[Member A: AI Agent]    [Member B: Vision/GIS]   [Member C: Backend]  [Member D: Mobile]  [Member E: UX/Design]
 • LangGraph ReAct       • Gemini 모델 3단계      • FastAPI Stateless  • React Native       • 웰니스 카피라이팅
 • 무상태 프롬프트 주입     • Structured JSON        • OSM 계단 배제 라우팅 • 백그라운드 GPS/TTS • 고대비 시인성 토큰
 • Pydantic V2 Strict    • 200m 공간 지터링       • 클린코드 임계치 엄수 • Local-First 저장  • 6대 화면 시나리오
```

### [Member A] AI Agent & PM 모듈 점검 규칙 (`agent/`, `prompts/`, `orchestrator/`, `scorer/`)
- [ ] **무상태(Stateless) 프롬프트 원칙 강제**: 서버 세션/DB에 대화 히스토리를 누적하지 않고, 클라이언트가 전달한 단발성 페이로드(`client_dog_context`, `client_recent_feedback`)만 프롬프트에 주입하는가?
- [ ] **엄격한 스키마 검증 (Strict Schema)**: Pydantic V2 BaseModel을 통해 `TargetDuration`(10~90분 슬라이더 범위), `AvoidStairs`, `SlopePreference`, `ShadePriority` 4대 엔티티를 엄격히 검증하는가?
- [ ] **다요소 라우팅 랭킹 (Candidate Scorer)**: 후보 경로 평가 시 안전도, 완만도, 그늘도 다요소 합산 스코어(100점 만점) 수식을 정확히 적용하는가?
- [ ] **AI 환각 방지(Grounding Guardrail)**: 라우팅 API 좌표 및 실측 데이터에 없는 가상의 경유지/공원을 임의로 지어내지 않는가?

### [Member B] AI Vision & Spatial Data 모듈 점검 규칙 (`vision/`, `spatial/`, `models/`, `pipeline/`)
- [ ] **Gemini 가용 모델 순차 선택 체인 강제**:
  - 반드시 `GeminiModelSelector`를 통해 **1순위 `gemini-3.5-flash-lite` ➔ 2순위 `gemini-3.1-flash-lite` ➔ 3순위 `gemini-3.6-flash`** 순으로 호출하는가?
  - 구형 또는 사용 불가능한 `gemini-1.5` 계열 호출 코드가 100% 배제되어 있는가? (적발 시 즉시 예외 발생)
- [ ] **Structured JSON 출력 강제**: 모델 호출 시 `response_schema` 또는 `response_mime_type="application/json"`을 강제하여 자연어 대신 파싱 가능한 JSON DTO만 반환받는가?
- [ ] **공간 데이터 무결성 & 200m 지터링**:
  - DEM 경사도 계산 시 표고차/수평거리 삼각함수 공식 및 EPSG:4326/3857 좌표계 일치를 준수하는가?
  - 커뮤니티 경로 저장/조회 시 사용자 출발지 및 도착지 반경 200m 공간 가우시안 마스킹(Jittering)이 누락 없이 적용되는가?

### [Member C] Backend & Spatial Routing 모듈 점검 규칙 (`backend/`, `api/`, `routing/`, `db/`)
- [ ] **보행 네트워크 계단 배제 (Hard Constraint)**: OSM `highway=steps` 링크는 페널티 부여가 아니라 **후보 네트워크 그래프에서 완전 배제(Inaccessible)** 처리하는가?
- [ ] **위험 우회 재탐색 성능**: 비전 AI 장애물 감지 시 해당 노드 비용 10배 페널티 부여 후 **3초 이내**에 신규 경로가 도출되는가?
- [ ] **FastAPI 클린코드 임계치 자동 검사**:
  - 단일 파일 라인 수 **250 라인 이하** (최대 400 라인 엄격 제한)
  - 단일 함수 라인 수 **40 라인 이하** (최대 80 라인 제한)
  - 인지 복잡도(Cognitive Complexity) **10 이하** (들여쓰기 Depth 2 이내, 조기 반환 Guard Clause 적용)
- [ ] **Supabase RLS 보안**: 모든 커뮤니티/공유 테이블에 Row Level Security 및 `auth.uid()` 기반 인가 검증이 적용되었는가?

### [Member D] Frontend & Mobile App 모듈 점검 규칙 (`frontend/`, `mobile/`, `screens/`, `components/`)
- [ ] **시선 해방(Eyes-Free) 백그라운드 무중단 보장**:
  - Android Foreground Service + `expo-location`이 화면 꺼짐(Screen-off) 상태에서도 GPS를 수집하는가?
  - 회전 30m 전 `expo-speech` 사전 음성 브리핑 및 40m 경로 이탈 감지 경고가 정확히 발화되는가?
- [ ] **React Native Maps 최적화**:
  - Polyline 구간별 색상 분기(초록: 흙/잔디, 주황: 우레탄, 파랑: 보도블록, 빨강: 위험/급경사)가 깜빡임(Flickering) 없이 렌더링되는가?
  - 불필요한 전체 맵 리렌더링 방지를 위해 `React.memo` 및 `useCallback`이 적용되었는가?
- [ ] **Local-First 프라이버시 보호**:
  - 반려견 프로필, 실보행 GPS 트랙은 서버로 자동 전송하지 않고 기기 내부 `AsyncStorage`에만 영구 보관하는가?
  - 기기 변경 대비 JSON 내보내기/가져오기 백업 기능이 완비되었는가?

### [Member E] UI/UX & Copywriting 모듈 점검 규칙 (`styles/`, `theme/`, `assets/`, `text/`, `copy/`)
- [ ] **긍정적 웰니스 카피라이팅 100% 준수 (Zero Medical Slang)**:
  - '슬개골 탈구', '관절염', '수술', '질병 단계' 등 임상적/의학적 공포 유발 단어가 코드/문구에 단 1개라도 존재하는가?
  - ➔ 발견 즉시 **"폭신한 길"**, **"관절 안심 케어"**, **"부드러운 잔디길"**, **"편안한 발걸음"**으로 자동 치환.
- [ ] **야외 시인성 보장 고대비 토큰**:
  - 태양광 아래에서 명도 대비(Contrast Ratio) 4.5:1 이상(WCAG AA)을 만족하는 `#FAFAFA` (아이보리 저반사 배경) 및 `#1E293B` (고대비 차콜 텍스트)를 사용하는가?
- [ ] **한 손 조작(One-Hand Ergonomics)**:
  - 10~90분 산책 시간 조절 슬라이더 및 주요 액션 버튼이 화면 하단 50% Thumb Zone에 배치되어 있는가?

---

## 2. AI 자동 코드 생성 전/후 의무 실행 프로토콜 (Execution Protocol)

AI 코딩 어시스턴트는 사용자의 코드 작성 또는 수정 요청을 수행할 때 다음 3단계를 **자동으로 거쳐야 하며, 위반 시 답변을 자가 수정(Self-Correction)**합니다.

### 1단계: 사전 검증 (Pre-Generation Guard)
- 구현 대상 요구사항이 18개 User Story (`US-A1 ~ US-H1`) 및 68개 Task에 포함되어 있는지 확인.
- 정의되지 않은 불필요한 기능 추가(Spec Creep) 원천 차단 (YAGNI 원칙).
- 변경할 코드가 클린코드 임계치(250라인/40라인/복잡도 10)를 초과할 가능성이 있으면 즉시 모듈 분할 구조로 설계.

### 2단계: 코드 생성 및 셀프 린트 (In-Generation Linting)
- Gemini 호출부: `gemini-1.5` 탐지 시 `GeminiModelSelector`로 강제 교체.
- 예외 처리: 모든 비동기 호출에 Timeout 및 정제된 예외 핸들러 부착.
- 텍스트 검사: 질병 단어 검사 정규식 실행 ➔ 웰니스 단어로 강제 변환.

### 3단계: 사후 테스트 및 추적성 검증 (Post-Generation Verification)
- 코드 수정 후 영향받는 도메인 테스트 실행 (`pytest test_case/ -v`).
- 74개 기존 테스트가 100% 통과하는지 확인하고, 요구사항 변경 시 테스트케이스도 함께 갱신.
- 사용자에게 결과 보고 시 5인 역할별 준수 사항 충족 여부를 명시.
