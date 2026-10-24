/**
 * [편안하개 - PetWalk]
 * React Native 모바일 디자인 토큰 (Design Tokens)
 *
 * Upstream: dusty amber, forest, violet, and dark palettes
 * PR #202: mint, ocean, and coral palettes
 */

import { ThemeId } from '../types/theme';

export const ROUTE_CAUTION_COLOR = '#E87524';
export const CORAL_ROUTE_CAUTION_COLOR = '#B45309';

/** 앱 전역 텍스트 역할별 크기. 화면 크기와 무관하게 같은 역할은 같은 크기를 사용한다. */
export const TYPOGRAPHY = {
  screenTitle: 22,
  sectionTitle: 20,
  cardTitle: 18,
  body: 16,
  support: 14,
  label: 14,
  button: 16,
  caption: 12,
  micro: 11,
  metricValue: 20,
  displayValue: 32,
} as const;

export const TYPOGRAPHY_LINE_HEIGHT = {
  screenTitle: 28,
  sectionTitle: 26,
  cardTitle: 24,
  body: 24,
  support: 21,
  label: 20,
  button: 20,
  caption: 18,
  micro: 16,
  metricValue: 24,
  displayValue: 38,
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  border: string;
  borderSoft: string;
  borderSubtle: string;

  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryWash: string;
  primaryMint: string;
  primarySubtle: string;

  textMain: string;
  textMuted: string;
  textWhite: string;

  routeSafe: string;
  routeNormal: string;
  routeCaution: string;

  mapGround: string;
  mapPark: string;
  mapWater: string;
  mapRoad: string;
  mapRoadEdge: string;
  mapLabel: string;

  pocketBg: string;
  pocketHud: string;
  pocketHudSubtle: string;

  success: string;
  warning: string;
  error: string;
  accent: string;
  accentLight: string;
}

type LegacyThemeId = Exclude<ThemeId, 'mint' | 'ocean' | 'coral'>;

const BASE_THEME_PALETTES: Record<LegacyThemeId, ThemeColors> = {
  // 🐶 0. 더스티 앰버 & 세이지 그린 (02번 디자인 시안 - docs/reference/UI개선/app_design_n2-1.png)
  dusty_amber: {
    background: '#F5EFE0', // Soft Cream
    surface: '#FDFAF4',    // 따뜻한 크림 화이트 카드 서피스
    border: '#E5DCC9',     // 크림 오커 보더
    borderSoft: '#EFE7D6',
    borderSubtle: '#DCD2BE',

    primary: '#5A7361',    // Sage Green
    primaryDark: '#3E5244',// 딥 포레스트 세이지
    primaryLight: '#E3ECE4',// 소프트 세이지 워시
    primaryWash: '#F0F5F1',
    primaryMint: '#8C9E7D',// Leaf Green
    primarySubtle: '#D6E3D8',

    textMain: '#2D3A31',   // 딥 세이지 차콜 텍스트
    textMuted: '#566659',  // 세이지 차콜 뮤트 텍스트 (명도 대비 강화: 4.8:1 이상)
    textWhite: '#FFFFFF',

    routeSafe: '#5A7361',  // 세이지 그린 안심길
    routeNormal: '#B59C5E',// 올리브 오커 일반길
    routeCaution: ROUTE_CAUTION_COLOR,

    mapGround: '#F5EFE0',
    mapPark: '#E2ECE3',
    mapWater: '#D4E4E6',
    mapRoad: '#FFFFFF',
    mapRoadEdge: '#E3DBC7',
    mapLabel: '#5A7361',

    pocketBg: '#1E2520',
    pocketHud: '#CFA052',
    pocketHudSubtle: '#8C9E7D',

    success: '#5A7361',
    warning: '#CFA052',    // Dusty Amber
    error: '#D9534F',
    accent: '#CFA052',     // Dusty Amber 액센트
    accentLight: '#F7ECCF',
  },

  // 🌿 1. 숲길 그린 (기존 테마)
  forest: {
    background: '#F8FAF9',
    surface: '#FFFFFF',
    border: '#E8EDEA',
    borderSoft: '#F0F5F2',
    borderSubtle: '#E8EDEA',

    primary: '#10B981',
    primaryDark: '#087F5B',
    primaryLight: '#D1FAE5',
    primaryWash: '#ECFDF5',
    primaryMint: '#A7F3D0',
    primarySubtle: '#D1FAE5',

    textMain: '#17211C',
    textMuted: '#4E5853',  // 차콜 뮤트 텍스트 (명도 대비 강화: 5.5:1 이상)
    textWhite: '#FFFFFF',

    routeSafe: '#10B981',
    routeNormal: '#3B82F6',
    routeCaution: ROUTE_CAUTION_COLOR,

    mapGround: '#F2F5F0',
    mapPark: '#DAECD9',
    mapWater: '#DCEFF0',
    mapRoad: '#FFFFFF',
    mapRoadEdge: '#E7EBE7',
    mapLabel: '#799084',

    pocketBg: '#000000',
    pocketHud: '#10B981',
    pocketHudSubtle: '#34D399',

    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    accent: '#F59E0B',
    accentLight: '#FEF3C7',
  },

  // 💜 2. 비비드 바이올렛 (error/app_design1.jpg 지지(zlzl) 디자인 언어)
  vivid_violet: {
    background: '#F5F3FF', // 부드러운 라일락 배경
    surface: '#FFFFFF',    // 화사한 화이트 서피스
    border: '#E9D5FF',     // 소프트 바이올렛 보더
    borderSoft: '#F3E8FF',
    borderSubtle: '#DDD6FE',

    primary: '#7C3AED',    // 메인 비비드 바이올렛
    primaryDark: '#5B21B6',// 딥 바이올렛
    primaryLight: '#EDE9FE',// 라일락 워시
    primaryWash: '#FAF5FF',
    primaryMint: '#C4B5FD', // 라일락 하이라이트
    primarySubtle: '#EDE9FE',

    textMain: '#2E1065',   // 딥 바이올렛 블랙 텍스트
    textMuted: '#7C3AED',  // 퍼플 액센트 뮤트
    textWhite: '#FFFFFF',

    routeSafe: '#8B5CF6',  // 바이올렛 안심길
    routeNormal: '#06B6D4',// 민트/시안 일반길
    routeCaution: ROUTE_CAUTION_COLOR,

    mapGround: '#F5F3FF',
    mapPark: '#EDE9FE',
    mapWater: '#E0E7FF',
    mapRoad: '#FFFFFF',
    mapRoadEdge: '#DDD6FE',
    mapLabel: '#6D28D9',

    pocketBg: '#1E1B4B',   // 딥 인디고 포켓 배경
    pocketHud: '#A78BFA',  // 네온 바이올렛 HUD
    pocketHudSubtle: '#C4B5FD',

    success: '#10B981',
    warning: '#FACC15',    // app_design1의 QUIZ TIME 네온 옐로우
    error: '#EF4444',
    accent: '#FACC15',     // 네온 옐로우 액센트
    accentLight: '#FEF08A',
  },

  // 🌙 3. 다크 포켓 (모던 다크 모드)
  dark: {
    background: '#0F172A', // 슬레이트 미드나잇 다크
    surface: '#1E293B',    // 다크 카드 서피스
    border: '#334155',     // 슬레이트 보더
    borderSoft: '#1E293B',
    borderSubtle: '#475569',

    primary: '#10B981',    // 네온 에메랄드
    primaryDark: '#34D399',// 밝은 네온 민트
    primaryLight: '#064E3B',// 딥 에메랄드 칩
    primaryWash: '#022C22',
    primaryMint: '#059669',
    primarySubtle: '#064E3B',

    textMain: '#F8FAFC',   // 화이트 텍스트
    textMuted: '#94A3B8',  // 슬레이트 그레이 텍스트
    textWhite: '#FFFFFF',

    routeSafe: '#10B981',
    routeNormal: '#38BDF8',
    routeCaution: ROUTE_CAUTION_COLOR,

    mapGround: '#0F172A',
    mapPark: '#1E293B',
    mapWater: '#0C4A6E',
    mapRoad: '#334155',
    mapRoadEdge: '#475569',
    mapLabel: '#94A3B8',

    pocketBg: '#000000',
    pocketHud: '#10B981',
    pocketHudSubtle: '#34D399',

    success: '#10B981',
    warning: '#FBBF24',
    error: '#F87171',
    accent: '#38BDF8',    // 네온 블루
    accentLight: '#0369A1',
  },
};

export const THEME_PALETTES: Record<ThemeId, ThemeColors> = {
  ...BASE_THEME_PALETTES,
  mint: {
    ...BASE_THEME_PALETTES.forest,
    primary: '#10B981',
    primaryDark: '#087F5B',
    primaryLight: '#D1FAE5',
    primaryWash: 'rgba(16, 185, 129, 0.14)',
    primaryMint: '#A7F3D0',
    primarySubtle: '#D1FAE5',
  },
  ocean: {
    ...BASE_THEME_PALETTES.forest,
    background: '#EFF6FF',
    surface: '#FFFFFF',
    border: '#DBEAFE',
    borderSoft: '#EFF6FF',
    borderSubtle: '#BFDBFE',
    primary: '#2563EB',
    primaryDark: '#1D4ED8',
    primaryLight: '#DBEAFE',
    primaryWash: 'rgba(37, 99, 235, 0.14)',
    primaryMint: '#93C5FD',
    primarySubtle: '#DBEAFE',
    textMain: '#1E3A8A',
    textMuted: '#475569',
    routeSafe: '#2563EB',
    routeNormal: '#06B6D4',
    mapGround: '#EFF6FF',
    mapPark: '#DBEAFE',
    mapWater: '#E0F2FE',
    mapRoadEdge: '#BFDBFE',
    mapLabel: '#1D4ED8',
    accent: '#0EA5E9',
    accentLight: '#DBEAFE',
  },
  coral: {
    ...BASE_THEME_PALETTES.forest,
    background: '#FFF7ED',
    surface: '#FFFCF8',
    border: '#FED7AA',
    borderSoft: '#FFF7ED',
    borderSubtle: '#FDBA74',
    primary: '#F97316',
    primaryDark: '#C2410C',
    primaryLight: '#FFEDD5',
    primaryWash: 'rgba(249, 115, 22, 0.14)',
    primaryMint: '#FDBA74',
    primarySubtle: '#FFEDD5',
    textMain: '#431407',
    textMuted: '#7C2D12',
    routeSafe: '#F97316',
    routeCaution: CORAL_ROUTE_CAUTION_COLOR,
    mapGround: '#FFF7ED',
    mapPark: '#FFEDD5',
    mapRoadEdge: '#FED7AA',
    mapLabel: '#C2410C',
    success: '#16A34A',
    warning: '#F97316',
    accent: '#FB923C',
    accentLight: '#FFEDD5',
  },
};

export const TOKENS = {
  colors: { ...THEME_PALETTES.dusty_amber },

  borderRadius: {
    frame: 40,
    card: 20,
    badge: 20,
    button: 14,
    iconBox: 14,
    avatar: 9999,
  },

  fontSize: {
    xs: TYPOGRAPHY.caption,
    sm: TYPOGRAPHY.caption,
    base: TYPOGRAPHY.label,
    md: TYPOGRAPHY.support,
    lg: TYPOGRAPHY.body,
    xl: TYPOGRAPHY.cardTitle,
    title: TYPOGRAPHY.screenTitle,
  },
};

export function applyThemeTokens(themeId: ThemeId): ThemeColors {
  const selected = THEME_PALETTES[themeId] ?? THEME_PALETTES.dusty_amber;
  Object.assign(TOKENS.colors, selected);
  return TOKENS.colors;
}

export type ThemeTokens = typeof TOKENS;
