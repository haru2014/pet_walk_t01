/**
 * [편안하개 - PetWalk]
 * React Native 모바일 디자인 토큰 (Design Tokens)
 * 
 * - 브랜드 컬러, 표면색, 3색 Polyline 분기 색상, 라운딩, 그림자 정의
 * - 웰니스 카피라이팅 원칙 준수 (질병 용어 배제)
 */

export const TOKENS = {
  colors: {
    // 1. 기본 배경 및 표면
    background: '#F8FAF9',        // 전체 화면 배경 (Soft Mint Gray)
    surface: '#FFFFFF',           // 기본 카드/모달 서피스
    border: '#F0F5F2',            // 기본 디바이더 및 보더
    borderSubtle: '#E8EDEA',

    // 2. 브랜드 컬러 (Brand Greens)
    primary: '#10B981',           // 메인 에메랄드 그린
    primaryDark: '#087F5B',       // 다크 에메랄드
    primaryLight: '#ECFDF5',      // 연한 민트 배경 (뱃지/칩)
    primaryMint: '#A7F3D0',       // 민트 보더 (칩/하이라이트)
    primarySubtle: '#D1FAE5',

    // 3. 텍스트 계층
    textMain: '#17211C',          // 주요 제목 및 텍스트 (다크 슬레이트)
    textMuted: '#6B756F',         // 설명 및 보조 텍스트 (슬레이트 그레이)
    textWhite: '#FFFFFF',

    // 4. 지도 Polyline 분기 색상 (US-C1)
    routeSafe: '#10B981',         // 🌿 완만(<=3%), 그늘, 흙/잔디 안심길
    routeNormal: '#3B82F6',       // 🏢 일반 보도 / 아스팔트
    routeCaution: '#F97316',      // ⚠️ 급경사, 높은 턱 주의 구간

    // 5. 초절전 다크 포켓 모드 (US-C2)
    pocketBg: '#000000',          // True Black OLED 절전 배경
    pocketHud: '#10B981',         // HUD 네온 그린
    pocketHudSubtle: '#34D399',

    // 6. 상태 알림
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
  },

  borderRadius: {
    frame: 40,
    card: 20,
    badge: 20,
    button: 14,
    iconBox: 14,
    avatar: 9999,
  },

  fontSize: {
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 16,
    xl: 18,
    title: 22,
  },
} as const;

export type ThemeTokens = typeof TOKENS;
