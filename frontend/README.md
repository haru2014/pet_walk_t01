# 🐾 편안하개 (PetWalk) - Frontend & Expo Mobile

React Native (Expo SDK 57) 기반의 시선 해방(Eyes-Free) 핸즈프리 모바일 애플리케이션 모듈입니다.

---

## 📌 1. 아키텍처 개요

- **Core Framework**: React Native (Expo SDK 57), TypeScript 6.0
- **Hands-Free Navigation**: Android Foreground Service + `expo-speech` 백그라운드 무중단 음성 안내
- **Ultra Power Saving**: OLED `#000000` True Black 다크 포켓 모드 (`DarkPocketScreen.tsx`)
- **Map & Route Visualization**: `react-native-maps` / SVG 기반 3색 Polyline 분기 렌더링
- **Local-First Persistence**: `@편안하개:*` 프리픽스 기반 `AsyncStorage` (개인정보 및 궤적 로컬 영구 보관)
- **Zero-Install Web Demo**: Expo Web 무충돌 브라우저 렌더링 지원 (`npm run web`)
- **Deployment**: EAS Build (Android Standalone APK 1회 패키징) & EAS Update (`expo-updates` 무선 OTA 실시간 핫픽스)

---

## 📂 2. 폴더 구조

```text
frontend/
├── App.tsx                     # 메인 애플리케이션 진입점 및 화면 라우팅
├── app.json                    # Expo 모바일 설정 및 권한 매니페스트
├── eas.json                    # EAS Build & Update 프로필 설정
├── package.json                # 모바일 의존성 및 스크립트
├── tsconfig.json               # TypeScript 컴파일러 설정
├── vitest.config.mjs           # Vitest 단위 테스트 설정
├── .env.example                # 모바일 환경 변수 템플릿
├── assets/                     # 앱 아이콘 및 스플래시 이미지
└── src/
    ├── components/             # 재사용 가능한 UI 컴포넌트
    │   ├── bookmark/           # 즐겨찾기 보관함 컴포넌트 (US-29)
    │   ├── common/             # 공통 UI (버튼, 바텀바, 모달)
    │   ├── feedback/           # 3초 원터치 피드백 모달 (US-E2)
    │   ├── home/               # 홈 화면 카드 위젯
    │   ├── map/                # 3색 경로 지도 및 안심 지표 카드 (US-C1)
    │   ├── onboarding/         # 온보딩 위저드 투어 (US-21)
    │   ├── privacy/            # 위치 동의 및 데이터 초기화 (US-23)
    │   ├── profile/            # 반려견 프로필 관리 (US-A2)
    │   └── walk/               # 산책 플래너 및 코스 추천 뷰
    ├── hooks/                  # 커스텀 React 훅 (useWalkGuidance, useLocationConsent)
    ├── screens/                # 메인 탭 및 전체 화면 컴포넌트
    │   ├── HomeScreen.tsx
    │   ├── WalkTabScreen.tsx
    │   ├── CommunityTabScreen.tsx
    │   ├── MyProfileTabScreen.tsx
    │   ├── DarkPocketScreen.tsx
    │   └── WalkReportScreen.tsx
    ├── services/               # 백그라운드 GPS, TTS, 스토리지, API 클라이언트
    └── theme/                  # 디자인 시스템 컬러 토큰 및 규격
```

---

## 🚀 3. 로컬 실행 및 테스트 가이드

### 3.1 패키지 설치
```bash
cd frontend
npm install
```

### 3.2 로컬 브라우저 데모 실행 (Expo Web)
별도 에뮬레이터 없이 웹 브라우저에서 즉시 인터랙션을 테스트할 수 있습니다:
```bash
npm run web
# 브라우저에서 http://localhost:8081 오픈
```

### 3.3 Android 실기기 / 에뮬레이터 실행
```bash
npm run android
```

### 3.4 로컬 프로덕션 번들 내보내기 (Export)
```bash
# Web 프로덕션 정적 번들 생성 (dist/)
npm run export:web

# Android Hermes 바이트코드 번들 생성 (dist/)
npm run export:android
```

### 3.5 단위 테스트 및 타입 검사
```bash
# Vitest 단위 테스트 81개 실행 (100% Pass)
npm test

# TypeScript 정적 타입 검사 (0 Errors)
npm run check
```

---

## 📱 4. EAS 빌드 및 무선 OTA 배포 (Member D)

본 프로젝트는 **EAS(Expo Application Services)**와 연동되어 클라우드 자동 빌드 및 무선 무점검 핫픽스 체계를 갖추고 있습니다.

- **EAS Project**: `@pettrail/petwalk-production` (`52ded2f2-d6e7-420f-9c9f-3d999f262454`)
- **Package ID**: `com.petwalk.app`
- **배포 대시보드**: [Expo 대시보드 바로가기](https://expo.dev/accounts/pettrail/projects/petwalk-production)
- **최신 Standalone APK**: [APK 다운로드 링크 (Build ID: cbf76e84...)](https://expo.dev/artifacts/eas/N6VL_NxLIfMFroFS-Kmul-JtlDUP1bVw4H3riyr1OHs.apk)

### 4.1 테스터용 독립 실행형 APK 빌드 (EAS Build)
에뮬레이터가 없는 팀원 및 5인 필드 테스터용 Standalone `.apk` 생성:
```bash
npm run build:apk
# 또는: npx eas-cli build -p android --profile preview
```
- 빌드 상태 및 진행 로그 확인:
```bash
npx eas-cli build:view
```

### 4.2 무선 무점검 실시간 핫픽스 (EAS Update)
스마트폰에 앱이 이미 설치된 상태에서 JS/UI 코드를 앱 재설치 없이 5초 내 실시간 반영:
```bash
npm run ota:update
# 또는: npx eas-cli update --branch preview --message "UI 핫픽스 실시간 반영"
```
