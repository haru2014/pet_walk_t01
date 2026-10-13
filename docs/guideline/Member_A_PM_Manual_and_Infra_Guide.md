# Member A 외장 활동 및 인프라 매뉴얼: PM & AI Agent Lead (1번 조현정)

## 1. 개요
본 문서는 Member A(1번 조현정: PM & AI Agent Lead)가 AI Pair Programming 도구에 위임할 수 없는 **인간 주도의 클라우드 프로젝트 생성, Gemini API 인증키 발급, 할당량/비용 모니터링, 저장소 보안 설정 및 릴리즈 거버넌스 운영 절차**를 규정합니다.

---

## 2. Google Cloud Platform & Gemini API Key 발급 절차

AI 코딩 어시스턴트는 실제 Google 계정에 로그인하거나 결제 수단을 연동할 수 없으므로, Member A가 직접 수행해야 합니다.

### 2.1 Google Cloud Project 생성 및 결제 계정 연결
1. **Google Cloud Console 접속**: [console.cloud.google.com](https://console.cloud.google.com/) 접속 및 팀 공용 Google 계정 로그인.
2. **프로젝트 생성**:
   - 프로젝트명: `petwalk-production` (또는 `petwalk-dev`)
   - 조직/위치: 기본 설정 유지.
3. **결제 계정 연동**:
   - Gemini API 사용(Pay-As-You-Go)을 위해 신용카드 또는 법인 결제 계정 연결.
   - 예산 및 알림(Budget & Alerts) 설정: **월 $30 / 일 $3 도달 시 팀 이메일로 80%, 100% 임계치 경고 발송**.

### 2.2 Google AI Studio / Gemini API Key 발급
1. [aistudio.google.com](https://aistudio.google.com/) 접속.
2. 상단 메뉴의 **"Get API key"** 클릭 ➔ 앞서 생성한 `petwalk-production` 프로젝트 선택.
3. 생성된 `GEMINI_API_KEY` 복사 (절대 공개 저장소에 올리지 말 것).
4. **사용 대상 모델 활성화 여부 확인**:
   - `gemini-3.5-flash-lite` (1순위 초경량 ReAct 플래너)
   - `gemini-3.1-flash-lite` (2순위 경량 폴백)
   - `gemini-3.6-flash` (3순위 고지능 멀티모달 폴백)
   - *주의: 구형 `gemini-1.5` 계열은 사용 중단 상태이므로 활성화 목록에서 배제.*

### 2.3 할당량(Quota) 및 속도 제한(Rate Limit) 설정
1. Google Cloud Console ➔ **"IAM & 관리" ➔ "할당량 및 시스템 한도(Quotas)"** 이동.
2. `Generative Language API` 검색:
   - `Requests per minute (RPM)` 한도 확인 (기본 분당 60~1000 RPM).
   - 필요 시 할당량 상향 요청(Quota Increase Request)을 사전 제출하여 테스트 폭주 시 429 에러 방지.

---

## 3. GitHub Repository 거버넌스 및 CI/CD 시크릿 관리

### 3.1 Repository Secrets 등록
AI 에이전트나 로컬 빌드가 GitHub Actions CI/CD를 탈 때 필요한 시크릿을 수동으로 등록합니다.
1. GitHub 저장소(`haru2014/pet_walk_t01`) ➔ **Settings ➔ Secrets and variables ➔ Actions**
2. **New repository secret** 등록:
   - `GEMINI_API_KEY`: Google AI Studio에서 발급받은 키.
   - `SUPABASE_URL`: Member C로부터 전달받은 Supabase 프로젝트 URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: 서버용 관리자 키.
   - `EXPO_TOKEN`: Member D로부터 전달받은 Expo 빌드 토큰.

### 3.2 브랜치 보호 규칙(Branch Protection Rules) 및 CI 자동 머지
1. Settings ➔ **Branches ➔ Add classic branch protection rule**
2. 대상 브랜치: `main`
3. 필수 체크 항목:
   - [x] `Require status checks to pass before merging` (`backend-test` pytest 156건 및 `mobile-app-ci` vitest/tsc 통과 필수)
   - [x] `.github/workflows/ci.yml`의 `automerge` job과 연동하여 CI 성공 시 Squash & Merge 자동 수행.

---

## 4. 정기 모니터링 및 비상 대응 프로토콜 (Incident Response)

### 4.1 주간 비용 및 토큰 소모 모니터링 (매주 월요일)
- Google AI Studio Usage 대시보드에서 `Total Tokens Used`, `Cached Tokens`, `Cost Estimate` 확인.
- 1인당 1일 산책 생성 평균 토큰 소모량이 3,500토큰을 초과할 경우, 프롬프트 압축 최적화 작업을 스프린트 백로그에 긴급 등록.

### 4.2 Gemini API 장애(Outage) 및 429 에러 발생 시 수동 조치
1. Google Cloud Service Health 대시보드 확인.
2. 3단계 모델 체인(`3.5 Flash-Lite` ➔ `3.1 Flash-Lite` ➔ `3.6 Flash`)이 모두 429 또는 503 발생 시:
   - LangGraph Agent 내부의 Rule-based 폴백 및 Member C의 10분 TTL 캐시 레이어가 동작하는지 모니터링.
   - 팀 슬랙/노션 공지 채널에 장애 상황 전파.

---

## 5. 주간 스프린트 미팅 및 릴리즈 승인 주관

1. **스프린트 플래닝 (매주 월요일 09:30)**:
   - 5인 팀원의 실 공수(Story Points & Hours) 소진율 점검.
   - [`docs/05_편안하개_프로젝트_수행계획서_일정.md`](file:///d:/코디세이/pet_walk_t01/docs/05_편안하개_프로젝트_수행계획서_일정.md)의 마일스톤 준수율 갱신.
2. **릴리즈 게이트 심사 (10월 30일 Code Freeze & 매주 금요일)**:
   - Member D의 신규 APK 빌드본 및 Member E의 UX 인터랙션 검수 완료 여부 확인.
   - [`docs/03_편안하개_Agile_User_Stories.md`](file:///d:/코디세이/pet_walk_t01/docs/03_편안하개_Agile_User_Stories.md)의 모든 인수 조건(Acceptance Criteria) 충족 시 배포 승인(Sign-off).
