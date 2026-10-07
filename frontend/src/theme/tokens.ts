/**
 * [편안하개 - PetWalk]
 * 모바일 클라이언트 디자인 토큰 (Design Tokens)
 * 
 * UI_design/src/App.tsx 및 docs/03, docs/05 명세 기반:
 * - 브랜드 컬러, 표면색, 노면/경사 분기 색상, 라운딩, 그림자 정의
 * - 웰니스 카피라이팅 원칙 준수 (질병 용어 배제)
 */

export const TOKENS = {
  colors: {
    // 1. 기본 배경 및 표면
    background: '#F8FAF9',        // 전체 화면 배경 (Soft Mint Gray)
    surface: '#FFFFFF',           // 기본 카드/모달 서피스
    border: '#F0F5F2',            // 기본 디바이더 및 보더
    borderSubtle: '#E8EDEA',      // 프로그레스 트랙 등 은은한 보더

    // 2. 브랜드 컬러 (Brand Greens)
    primary: '#10B981',           // 메인 에메랄드 그린
    primaryDark: '#087F5B',       // 다크 에메랄드 (버튼 그라디언트 끝점)
    primaryLight: '#ECFDF5',      // 연한 민트 배경 (뱃지/칩)
    primaryMint: '#A7F3D0',       // 민트 보더 (칩/하이라이트)
    primarySubtle: '#D1FAE5',     // 아바타 링 및 배경

    // 3. 텍스트 계층 (Typography Colors)
    textMain: '#17211C',          // 주요 제목 및 텍스트 (Slate Black)
    textMuted: '#6B756F',         // 부제목, 설명, 캡션 (Slate Gray)
    textWhite: '#FFFFFF',         // 반전 텍스트

    // 4. 지도 Polyline 분기 색상 (US-C1)
    routeSafe: '#10B981',         // 🌿 완만(<=3%), 그늘, 흙/잔디 안심길
    routeNormal: '#3B82F6',       // 🏢 일반 보도 / 아스팔트
    routeRubber: '#F97316',       // 🏃 탄성포장 (우레탄)
    routeHazard: '#EF4444',       // ⚠️ 높은 턱, 급경사(>8%), 위험 구간

    // 5. 초절전 다크 포켓 모드 (US-C2)
    pocketBg: '#000000',          // True Black OLED 절전 배경
    pocketHud: '#10B981',         // HUD 네온 그린
    pocketHudSubtle: '#34D399',   // 보조 게이지 그린

    // 6. 상태 알림
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
  },

  // 모바일 규격 라운딩
  borderRadius: {
    frame: 40,                    // 디바이스 최외곽 라운딩
    card: 20,                     // 메인 카드
    badge: 20,                    // 칩, 태그, 뱃지
    button: 14,                   // 메인 액션 버튼
    iconBox: 14,                  // 아이콘 배경 박스
    avatar: 9999,                 // 원형
  },

  // 카드 및 버튼 그림자 (iOS shadow / Android elevation)
  shadows: {
    card: {
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.10,
      shadowRadius: 16,
      elevation: 3,
    },
    cardSubtle: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 1,
    },
    buttonPrimary: {
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 5,
    },
    bottomBar: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.05,
      shadowRadius: 20,
      elevation: 8,
    },
  },

  // 타이포그래피 스케일
  fontSize: {
    xs: 10,
    sm: 11,
    base: 13,
    md: 14,
    lg: 16,
    xl: 17,
    title: 24,
  },

  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

export type ThemeTokens = typeof TOKENS;
