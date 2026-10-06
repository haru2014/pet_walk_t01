# PawTrail 코딩 컨벤션 및 정적 분석(SonarLint) 가이드라인

본 문서는 **PawTrail** 프로젝트의 코드 품질, 안정성 및 유지보수성을 극대화하고 SonarLint 정적 분석 경고를 사전에 방지하기 위한 통합 코딩 규칙입니다. 모든 프론트엔드(TypeScript/React Native Expo) 및 백엔드/AI(Python/FastAPI/LangGraph) 코드 작성 및 리팩토링 시 본 규칙을 엄격하게 준수해야 합니다.

---

## 0. 기본 원칙 (Core Principles)

- **AI Native 실용주의**: 복잡한 알고리즘을 불필요하게 바닥부터 짜지 않고, 표준화된 라이브러리 및 API를 도구(`@tool`)로 적극 활용합니다.
- **조기 반환 (Early Return)**: 유효성 검증 실패나 예외 케이스는 함수 최상단에서 즉시 반환(Guard Clause)하여 코드의 들여쓰기 깊이(Depth)를 2단계 이내로 억제합니다.
- **타입 안전성 (Type Safety First)**: 프론트엔드는 TypeScript 인터페이스, 백엔드는 Pydantic V2 모델을 통해 모든 데이터 입출력의 타입을 명시하고 검증합니다.
- **가독성 및 주석**: 비즈니스 로직 및 알고리즘의 의도가 드러나도록 함수와 인터페이스에 명확한 한글 주석 또는 표준 Docstring을 작성합니다.

---

## 1. 프론트엔드 규칙 (React Native / Expo SDK 51+ / TypeScript / React Native Maps)

### 1.1 컴포넌트 및 상태 관리
- **함수형 컴포넌트 & 명시적 Props**:
  모든 컴포넌트는 함수형으로 작성하며, Props는 TypeScript `interface` 또는 `type`으로 명확히 선언합니다.
  ```tsx
  // Good
  interface RoutePreviewProps {
    readonly routeGeoJson: GeoJSON.FeatureCollection;
    readonly selectedSurfaces: SurfaceType[];
    readonly onCheckIn: (sessionId: string) => void;
  }
  export const RoutePreview: React.FC<RoutePreviewProps> = ({ routeGeoJson, selectedSurfaces, onCheckIn }) => { ... };
  ```
- **파생 상태 생성 금지**:
  Props나 기존 state로부터 계산 가능한 값은 불필요하게 `useState`를 만들지 않고 `useMemo`나 일반 변수로 계산합니다.
- **React Hook 의존성 배열 엄수 (`react-hooks/exhaustive-deps`)**:
  `useEffect`, `useCallback`, `useMemo` 내에서 참조하는 모든 외부 변수/함수를 의존성 배열에 빠짐없이 포함합니다. 함수 재생성이 원인인 경우 컴포넌트 외측 분리 또는 `useCallback`을 적용합니다.

### 1.2 지도(Mapbox / Leaflet) 라이프사이클 및 메모리 관리
- **지도 인스턴스 정리 (Memory Cleanup)**:
  컴포넌트 언마운트 시 반드시 지도 인스턴스와 이벤트 리스너를 정리하여 모바일 웹 브라우저 메모리 누수를 방지합니다.
  ```tsx
  useEffect(() => {
    const map = new mapboxgl.Map({ ... });
    mapRef.current = map;
    return () => {
      map.remove(); // 필수: 메모리 해제
    };
  }, []);
  ```
- **좌표계 규격**:
  GeoJSON 및 지도 라이브러리는 경도(Longitude), 위도(Latitude) 순서 `[lon, lat]`를 표준으로 사용하므로 위경도 순서 역전 버그를 철저히 방지합니다.

### 1.3 JSX 문법 및 표현식
- **[S3358] 중첩 삼항 연산자 전면 금지**:
  `condition ? A : condition2 ? B : C` 형태는 가독성을 심각하게 해치므로 사용하지 않습니다. 매핑 테이블 객체(`Record<Type, Component>`)나 독립된 렌더링 헬퍼 함수(`renderContent()`)로 분리합니다.
- **[S6479] 배열 렌더링 시 고유 Key 사용**:
  배열 매핑 렌더링 시 배열 인덱스(`index`)를 `key`로 사용하지 않고, 반드시 고유 ID(`route.id`, `waypoint.id`)를 key로 지정합니다.
- **[S6582] 옵셔널 체이닝 및 널 병합 연산자**:
  `props.data && props.data.items` 대신 `props.data?.items`를 사용하고, 기본값 지정 시 `??` (Nullish Coalescing)를 사용합니다.

---

## 2. 백엔드 및 AI 에이전트 규칙 (Python / FastAPI / LangGraph / Gemini)

### 2.1 Pydantic V2 기반 요청/응답 검증
- 모든 엔드포인트의 입력과 출력은 Pydantic V2 `BaseModel`을 통해 유효성을 엄격하게 검증합니다.
  ```python
  from pydantic import BaseModel, Field
  from typing import List, Optional

  class WalkPlanRequest(BaseModel):
      dog_id: str = Field(..., description="반려견 고유 식별자")
      target_duration_minutes: int = Field(ge=5, le=120, description="목표 산책 시간(분)")
      preferred_surfaces: List[str] = Field(min_length=1, description="선호 노면 목록")
      origin_lat: float = Field(ge=-90.0, le=90.0)
      origin_lon: float = Field(ge=-180.0, le=180.0)
  ```

### 2.2 비동기(async/await) 및 연결 자원 관리
- I/O 바운드 작업(Gemini API 호출, Supabase 쿼리, 외부 라우팅 HTTP 요청)은 반드시 `async def`와 `httpx.AsyncClient` 등을 사용하여 비동기로 논블로킹 처리합니다.
- 외부 API 호출 시 반드시 타임아웃(`timeout=5.0`)을 설정하여 서버 워커 고갈을 방지합니다.

### 2.3 LangGraph 에이전트 및 Tool Calling
- **State 불변성**: LangGraph 노드 함수는 기존 상태(State)를 직접 변형(Mutate)하지 않고, 업데이트할 변경 사항 딕셔너리를 반환합니다.
- **Tool Docstring 및 스키마 명확화**:
  Agent가 호출하는 모든 도구(`@tool`)에는 명확한 설명과 Args 설명을 기재하여 LLM이 도구 목적을 정확히 인지하도록 합니다.
- **비전 모델 Structured Output**:
  Gemini Flash를 통한 노면 판독 시 응답을 JSON Schema로 강제하여 파싱 오류를 원천 차단합니다.

### 2.4 예외 처리 및 표준 에러 응답
- 단순 500 에러를 방치하지 않고, `HTTPException(status_code=..., detail=...)`을 사용하여 클라이언트가 원인을 파악하고 복구할 수 있는 메시지를 반환합니다.
- 예외 발생 시 `logger.error(f"Reason: {str(e)}", exc_info=True)`로 스택 트레이스를 기록하되, 클라이언트 응답에는 시스템 내부 스택이나 비밀키가 절대 노출되지 않도록 마스킹합니다.

### 2.5 백엔드 보안 및 안전 표준 (Security & Safety)
- **비밀키 및 인증 정보 관리**: Gemini API Key, Supabase Service Key 등은 소스 코드에 절대 포함하지 않고 환경변수(`.env`)로 격리하며, `.gitignore`에 등록합니다.
- **이미지 업로드 검증**: 노면 사진 업로드 시 확장자(jpg, jpeg, png, webp), MIME 타입(`image/*`), 파일 크기(최대 10MB)를 서버 측에서 엄격히 검증하여 악성 파일 주입을 차단합니다.
- **위치 데이터 개인정보 마스킹**: 커뮤니티 피드 공유 시 출발지/도착지 좌표를 반경 100~200m 범위로 랜덤 지터링(Jittering) 또는 블러링하여 사용자의 실제 거주지가 특정되지 않도록 보호합니다.

---

## 3. 공간 데이터 및 노면 비용 모델 규칙 (Spatial & Cost Model)

### 3.1 노면 비용 함수 구현 규칙
- 노면 비용 공식: $\text{Cost}(e) = \text{Length}(e) \times W_{\text{base}} \times W_{\text{pref}}$
- 노면 가중치 계수는 하드코딩하지 않고 환경설정 또는 상수로 중앙 집중 관리합니다.
  ```python
  SURFACE_BASE_WEIGHTS = {
      "grass": 0.6,
      "dirt": 0.6,
      "rubber": 0.7,
      "paved": 1.0,
      "asphalt": 2.5,
      "gravel": 3.5,
  }
  PREF_DISCOUNT_FACTOR = 0.45  # 선호 노면 선택 시 할인 계수 (0.4 ~ 0.5)
  ```
- 결측 노면 Fallback 규칙을 단계별로 누락 없이 적용합니다.

### 3.2 GeoJSON 표준 준수
- 프론트엔드에 전달되는 경로 데이터는 반드시 표준 `FeatureCollection` 형식을 준수하며, 각 `Feature`의 `properties`에 `surface_type`, `distance_m`, `safety_score`를 필수 메타데이터로 포함합니다.

---

## 4. 구조, 코드 규모 및 인지 복잡도 관리 (Architecture, Size & Complexity)

코드베이스의 유지보수성과 가독성을 보장하기 위해 파일 크기, 함수 길이, 복잡도 임계치를 엄격하게 관리하며, 기준을 초과할 경우 **선제적 리팩토링(Proactive Refactoring)을 권고하고 실행**합니다.

### 4.1 코드 규모 및 복잡도 임계치 기준 (Code Metrics & Thresholds)

| 측정 항목 | 권고 기준 (Warning / Refactor 권고) | 절대 제한 (Error / 즉시 분할 필수) | 주요 조치 방안 |
|---|:---:|:---:|---|
| **단일 파일 라인 수 (File LOC)** | **250 라인 초과** | **400 라인 초과** | 모듈 분할, 역할별 파일 분리 (`hooks/`, `components/`, `services/`) |
| **단일 함수/메서드/컴포넌트 라인 수** | **40 라인 초과** | **80 라인 초과** | 단일 책임 원칙(SRP)에 따른 하위 함수/컴포넌트 추출 |
| **인지 복잡도 (Cognitive Complexity, S3776)** | **10 초과** | **15 초과** | 조건문 중첩 해제, 헬퍼 함수 분리, 조기 반환(Early Return) |
| **순환 복잡도 (Cyclomatic Complexity, S1541)** | **8 초과** | **12 초과** | `switch/case`나 다중 `if-else`를 매핑 객체/전략 패턴으로 전환 |
| **제어문 중첩 깊이 (Nesting Depth)** | **2단계 초과 (Depth >= 3)** | **3단계 초과 (Depth >= 4)** | Guard Clause(조기 반환) 적용, 서브루틴 분리 |
| **함수 매개변수 개수 (Parameter Count, S107)** | **4개 이상** | **5개 이상** | TypeScript `interface` / Python Pydantic DTO로 파라미터 객체화 |

### 4.2 리팩토링 권고 및 선제 조치 가이드라인 (Refactoring Triggers)

1. **임계치 초과 감지 시 리팩토링 권고**:
   - 코드 작성 또는 수정 시 파일이 250 라인을 넘어가거나 단일 함수의 인지 복잡도가 10을 초과하면, 추가 기능 작성을 멈추고 **구조 개선 및 리팩토링 방안을 사용자에게 먼저 권고**합니다.
   - 거대한 단일 파일(God Component / God Class)의 형성을 사전에 차단합니다.

2. **도메인별 핵심 리팩토링 패턴**:
   - **프론트엔드 (React Native Expo)**:
     - **Custom Hook 추출 (`hooks/`)**: 컴포넌트 내 `useEffect`, `useState`, Geolocation(Foreground Service), TTS Speech, Maps 이벤트 바인딩 등 비즈니스/상태 로직이 30라인을 넘기면 즉시 커스텀 훅(`useVoiceNavi`, `useWalkTracker`, `useSurfaceMap`, `useDogProfile` 등)으로 추출합니다.
     - **프레젠테이션 컴포넌트 분리 (`components/`)**: 단일 컴포넌트에 2개 이상의 의미 있는 UI 블록(헤더, 지도 컨트롤, 하단 시트, 통계 뱃지 등)이 혼재되면 독립 컴포넌트로 쪼갭니다.
   - **백엔드 및 AI (FastAPI / LangGraph)**:
     - **Service Layer 이관 (`services/`)**: 라우터 엔드포인트(`api/routes/`) 함수 내에 데이터 파싱, 외부 API 호출, DB 쿼리가 40라인 이상 뒤섞이지 않도록 순수 라우팅과 비즈니스 로직(Service/Domain Layer)을 엄격히 분리합니다.
     - **매핑 테이블 치환 (Lookup Table)**: 노면 판정, 색상 코드 매핑, 가중치 산출 시 중첩 `if/elif` 대신 `dict` 또는 `Record<Key, Value>` 상수 맵을 활용합니다.

3. **리팩토링 시 안전 수칙**:
   - 리팩토링 후에는 반드시 단위 테스트(`pytest test_case/`, Jest 등)를 즉각 실행하여 **기존 비즈니스 로직과 인터페이스 규격의 100% 무결성을 증명**해야 합니다.

---

## 5. 클린 코드 및 정적 분석 규칙 (SonarLint Compliance)

### [S1128 / S1481] 미사용 코드 및 Import 즉시 제거
- 코드 수정 및 리팩토링 후 사용하지 않는 import 구문, 선언 후 읽히지 않는 변수, 주석 처리된 과거 코드는 지체 없이 완전히 삭제합니다.

### [S3403] 엄격한 동치 연산자 사용 (TypeScript/JavaScript)
- 형변환 문제를 유발하는 `==` 및 `!=` 대신 반드시 `===` 및 `!==`을 사용합니다.

### [S7755] 모던 배열 메서드 활용
- 배열 마지막 원소 접근 시 `arr[arr.length - 1]` 대신 가독성이 우수한 `arr.at(-1)`을 사용합니다.

### [S3696] 표준 Error 객체 인스턴스 사용
- 예외 발생 시 단순 문자열(`throw "error"`)이 아닌 `throw new Error("error")`를 사용하여 디버깅 호출 스택을 보존합니다.

### [DRY & Single Source of Truth]
- 2회 이상 중복되는 로직(노면 색상 매핑, 거리 포맷팅, 날짜 파싱 등)은 반드시 공통 유틸리티(`utils/`)로 모듈화하여 단일 진실 공급원을 유지합니다.

### [Wellness Copywriting Rule] 앱 내 질병 용어 전면 배제 및 긍정적 웰니스 표현 일원화
- UI 컴포넌트 텍스트, TTS 음성 스크립트, 프롬프트 템플릿, DTO 필드 주석 전역에서 "슬개골 탈구", "질환 단계" 등 임상/의학적 용어 사용을 전면 금지합니다.
- 항상 "폭신한 길", "관절 안심 케어", "부드러운 잔디/흙길", "편안한 발걸음" 등 긍정적 웰니스 용어를 사용합니다. (※ 질병 통계는 투자 유치용 발표 자료에만 제한적으로 활용)

---

## 6. 요구사항(User Story/Task) 변경과 테스트케이스 동기화 (Test Synchronization)

구현 과정에서 **사용자 스토리(US-01~US-13)** 또는 **개발 Task**의 명세가 변경될 경우, 테스트케이스를 최신 상태로 유지하기 위해 다음 규칙을 반드시 준수합니다.

### 6.1 인수 조건(Acceptance Criteria) 연동 갱신
- 사용자 스토리의 인수 조건이나 완료 정의(DoD)가 수정·추가되면, 해당 조건을 검증하는 테스트 코드의 단언문(`assert`, `expect`)을 지체 없이 수정합니다.
- 요구사항이 바뀌었음에도 과거 테스트케이스를 임시 주석 처리(`skip`, `xfail`)로 방치하는 행위를 엄격히 금지합니다.

### 6.2 도메인 모듈별 테스트 갱신 기준
- **AI Agent (LangGraph / ReAct)**:
  - 자연어 파싱 엔티티(`DogBreed`, `TargetDuration`, `Condition`)나 Clarification 흐름이 변경되면 프롬프트 단위 테스트 및 Mock 대화 테스트케이스를 갱신합니다.
- **노면 라우팅 & 비용 모델 (FastAPI / GIS)**:
  - 선호 노면 할인 계수($W_{\text{pref}}$), 아스팔트/자갈 페널티, 결측치 Fallback 규칙이 수정되면 라우팅 결과의 노면 비율 및 비용 산출 단위 테스트 기대값을 즉각 동기화합니다.
- **비전 분석 (Gemini Flash)**:
  - Structured JSON 출력 필드나 노면 위험도 점수(`safety_score`) 판정 기준이 변경되면 비전 파서 테스트 및 샘플 이미지 판독 테스트 픽스처를 업데이트합니다.
- **API 및 데이터 모델 (Pydantic V2 / Supabase)**:
  - 요청/응답 DTO 스키마 필드가 추가·삭제·타입 변경될 경우, API 통합 테스트 및 테스트 픽스처(Mock Data)를 전수 최신화합니다.

### 6.3 회귀 방지 전수 테스트 실행 및 보고
- 테스트케이스를 갱신한 직후, 관련 테스트 스위트(Pytest, Jest 등)를 직접 실행하여 **회귀 결함(Regression) 발생 여부를 확인**하고 테스트 통과 결과를 보고서에 명시합니다.
- `docs/03_PawTrail_Agile_User_Stories.md`의 DoD 체크박스를 최신 통과 현황에 맞게 동기화합니다.

---

## 7. Git 형상 관리 및 Merge Request(MR) 협업 규칙

팀원 간 병렬 작업 시 코드 충돌을 예방하고 배포 브랜치의 무결성을 보장하기 위해 다음 Git 워크플로우를 준수합니다.

### 7.1 독립 feature 브랜치 생성 원칙
- `main` 및 `develop` 브랜치에 직접 커밋/푸시(Direct Push)하는 행위를 금지합니다.
- 모든 작업(기능 구현, 버그 수정, 리팩토링)은 최신 `develop` 브랜치에서 분기한 개별 브랜치에서 진행합니다:
  - 기능 개발: `feature/{member}-{task-id}` 또는 `feature/{story-id}-{feature-name}` (예: `feature/member-a-us01-agent`, `feature/us16-target-duration`)
  - 버그 수정: `fix/{issue-id}-{issue-summary}` (예: `fix/gps-drift-dead-reckoning`)
  - 리팩토링: `refactor/{target-module}`

### 7.2 Merge Request (MR) 생성 및 머지 절차
- **사전 검증**: 작업 완료 후 로컬에서 `pytest test_case/` 전수 통과 및 SonarLint 복잡도 규칙 준수 여부를 확인합니다.
- **MR 제출**: 타깃 브랜치를 `develop`으로 지정하여 Merge Request를 생성하고, 연계된 사용자 스토리/Task ID, 변경 내용 요약, 테스트 통과 증빙을 첨부합니다.
- **코드 리뷰 및 머지**: 최소 1인 이상의 동료 리뷰어 승인을 얻은 후 병합하며, 병합 완료 후 사용된 feature 브랜치는 즉시 삭제합니다.