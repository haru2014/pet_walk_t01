## 📌 PR 개요 (Overview)
- **작업자**: 4번 김승현 (Frontend & Mobile App Lead)
- **목표 브랜치**: `main` <- `feat/member4`
- **핵심 내용**: 
  1. 웹 환경 전용 **실시간 OpenStreetMap 대화형 지도(인터랙티브 임베드 뷰어)** 및 **안심 코스 듀얼 맵 모드** 구현
  2. CartoDB 거대 워터마크 제거 및 공식 OpenStreetMap 고해상도(Zoom 16) 도로 타일 시인성 대폭 강화
  3. 초보자 친화적 **인프라 구축 및 환경설정 가이드(01번)** 전면 개정 (Expo/EAS, Supabase DDL/RLS, ORS 토큰)
  4. 웹 브라우저 콘솔 경고 2종(`useNativeDriver`, `TTS Web Autoplay`) 및 FastAPI/SonarLint 경고 완벽 해소

---

## 🛠️ 주요 변경 사항 (Key Changes)

### 1. 🗺️ 실제 지도가 보이는 듀얼 맵 인터페이스 (US-C1, Phase 3)
- **`RealOsmWebView.tsx` (신규)**:
  - Web 브라우저 환경에서 실제 성수동/서울숲 일대의 도로명, 공원 산책로, 건물, 지하철역을 100% 완전한 실제 인터랙티브 지도로 렌더링.
  - 마우스 드래그 이동 및 휠 확대/축소, '새 창에서 크게보기 ↗' 지원.
- **`RouteMapView.tsx` (개선)**:
  - 상단 탭 스위처 탑재: `[🧭 안심 코스 뷰] / [🗺️ 실제 OSM 지도]` 자유로운 전환.
  - Svg 레이아웃 보정 (`StyleSheet.absoluteFill` 및 zIndex 적용)으로 배경 타일 위에 3색 Polyline(완만 초록/일반 파랑/주의 주황)과 안심 스텝 핀을 또렷하게 오버레이.
- **`RouteMapLegend.tsx` (신규)**:
  - 범례 컴포넌트를 분리하여 SonarLint 단일 파일 250줄 규칙 준수 (RouteMapView 226줄 유지).
- **`osmTileService.ts` & `osmTileService.test.ts`**:
  - 워터마크 없는 공식 OpenStreetMap 독일/글로벌 타일(`tile.openstreetmap.de`) provider 지원.
  - 타일 연산 단위 테스트 케이스 추가 (Vitest 37개 전체 통과).

### 2. ⚡ 웹 환경 콘솔 경고 및 백엔드 SonarLint 경고 해결
- **`SlideToUnlock.tsx`**: Web 환경에서 `useNativeDriver: Platform.OS !== 'web'` 조건 분기로 네이티브 애니메이션 모듈 부재 경고 제거.
- **`ttsNavigation.ts`**: 브라우저의 Web Audio Autoplay Policy(사용자 인터랙션 전 오디오 차단)에 따른 발화 대기 상태 시 경고 로깅 완화.
- **`main.py`**: `@app.post("/api/v1/walk/plan")`에 `responses={500: {"description": "..."}}` 추가로 FastAPI/SonarLint HTTPException 500 문서화 경고 해결.

### 3. 📚 초보자용 인프라 구축 및 환경설정 가이드 완비
- **`docs/01_편안하개_인프라_구축_및_환경설정_가이드.md`**:
  - Expo / EAS CLI 설치, 로그인, `eas project:init`, `eas.json` 설정, APK 빌드 및 무선 OTA 배포 가이드.
  - Supabase 회원가입, 프로젝트 생성, Auth 이메일 설정, `community_courses` 및 `hazard_reports` 테이블 DDL(SQL)과 RLS 정책 명시.
  - OpenRouteService 토큰 발급 및 Step 2 듀얼 모드(실시간 AI 서버 연동 및 오프라인 자동 폴백) 설정법 수록.

---

## 🧪 테스트 및 품질 검증 결과 (Verification)

| 구분 | 검증 항목 | 결과 | 비고 |
| :--- | :--- | :---: | :--- |
| **Frontend** | `npx tsc --noEmit` | **0 Errors** | TypeScript 무결성 검증 |
| **Frontend** | `npx vitest run` | **37 / 37 Passed** | 모든 단위 및 통합 테스트 100% 통과 |
| **Backend** | `python -m pytest test_case` | **100 / 100 Passed** | 라우팅, ReAct 에이전트, 피드백 등 전체 통과 |
| **Code Quality** | SonarLint 단일 파일 250줄 제한 | **100% 준수** | `RouteMapView.tsx`: 226줄, `main.py`: 173줄 |

---

## 📸 화면 스크린샷 (Web Demo)
1. **🧭 안심 코스 뷰**: 워터마크 없는 고해상도 실제 도로망 배경 + 3색 안전 Polyline 및 스텝 핀 오버레이
2. **🗺️ 실제 OSM 지도 뷰**: OpenStreetMap 정식 실시간 인터랙티브 뷰어로 성수동 골목길, 서울숲 숲길, 지하철역 완벽 탐색 가능
