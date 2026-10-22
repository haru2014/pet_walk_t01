export const APP_THEMES = {
  mint: {
    id: 'mint',
    label: '민트',
    primary: '#10B981',
    primaryDark: '#087F5B',
    primaryWash: 'rgba(16, 185, 129, 0.14)',
  },
  ocean: {
    id: 'ocean',
    label: '바다',
    primary: '#2563EB',
    primaryDark: '#1D4ED8',
    primaryWash: 'rgba(37, 99, 235, 0.14)',
  },
  coral: {
    id: 'coral',
    label: '코랄',
    primary: '#F97316',
    primaryDark: '#C2410C',
    primaryWash: 'rgba(249, 115, 22, 0.14)',
  },
} as const;

export type AppThemeId = keyof typeof APP_THEMES;
export type AppTheme = (typeof APP_THEMES)[AppThemeId];

export const DEFAULT_APP_THEME_ID: AppThemeId = 'mint';

export function isAppThemeId(value: unknown): value is AppThemeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(APP_THEMES, value);
}
