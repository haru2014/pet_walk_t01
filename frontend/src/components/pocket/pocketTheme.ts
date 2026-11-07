/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 오버레이 공통 색상 (SSOT)
 * OLED 절전을 위해 거의 검정에 가까운 면과 헤어라인만 사용한다.
 */

export const POCKET_COLORS = {
  surface: '#0E1311',
  surfaceRaised: '#1A201D',
  overlay: 'rgba(14, 19, 17, 0.94)',
  hairline: 'rgba(255,255,255,0.08)',
  mapBackground: '#0B0F0D',
  textPrimary: '#F4F5F2',
  textSecondary: '#A3AAA4',
  textMuted: '#6F7771',
  warn: '#F5B544',
  danger: '#F38B8B',
  dangerSurface: '#2A1C1C',
  poop: '#E7A962',
  pee: '#8EC1EE',
  returnBlue: '#8CC8F0',
  returnSurface: '#17202B',
  onAccent: '#06110C',
} as const;

/** 한 손 조작 최소 터치 타깃 (UX_COMPACT_RULES 3번) */
export const POCKET_TOUCH_TARGET = 48;

/** #RRGGBB → rgba 문자열 */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
