/**
 * [편안하개 - PetWalk]
 * React Native 모바일 디자인 토큰 (Design Tokens)
 *
 * 1. 숲길 그린 (기본 에메랄드 & 민트)
 * 2. 비비드 바이올렛 (error/app_design1.jpg 디자인 언어: 보라, 네온 옐로우, 파스텔 라일락)
 * 3. 다크 포켓 (야간 OLED 다크 테마)
 */

import { ThemeId } from '../types/theme';

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

export const THEME_PALETTES: Record<ThemeId, ThemeColors> = {
  // 🌿 1. 숲길 그린 (기본 디자인 유지)
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
    textMuted: '#6B756F',
    textWhite: '#FFFFFF',

    routeSafe: '#10B981',
    routeNormal: '#3B82F6',
    routeCaution: '#F97316',

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
    routeCaution: '#F59E0B',// 옐로우 주의길

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
    routeCaution: '#FB923C',

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

export const TOKENS = {
  colors: { ...THEME_PALETTES.forest },

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
};

export function applyThemeTokens(themeId: ThemeId): ThemeColors {
  const selected = THEME_PALETTES[themeId] ?? THEME_PALETTES.forest;
  Object.assign(TOKENS.colors, selected);
  return TOKENS.colors;
}

export type ThemeTokens = typeof TOKENS;
