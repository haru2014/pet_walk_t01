/**
 * [편안하개 - PetWalk]
 * ThemeManager 및 테마 토큰 전환 단위 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { themeManager } from './themeManager';
import { THEME_LIST, ThemeId } from '../types/theme';
import { TOKENS, THEME_PALETTES } from './tokens';
import { LocalStorageService } from '../services/storage';
import { STORAGE_KEYS } from '../types/storage';

const memoryStore = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => memoryStore.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      memoryStore.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      memoryStore.delete(key);
    }),
    getAllKeys: vi.fn(async () => Array.from(memoryStore.keys())),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const k of keys) {
        memoryStore.delete(k);
      }
    }),
  },
}));

describe('ThemeManager & Theme Tokens', () => {
  beforeEach(async () => {
    memoryStore.clear();
    await themeManager.setTheme('dusty_amber');
  });

  it('THEME_LIST에 4가지 테마(더스티 앰버, 숲길 그린, 비비드 바이올렛, 다크 포켓)가 정의되어 있어야 한다', () => {
    expect(THEME_LIST).toHaveLength(4);
    const ids = THEME_LIST.map((t) => t.id);
    expect(ids).toContain<ThemeId>('dusty_amber');
    expect(ids).toContain<ThemeId>('forest');
    expect(ids).toContain<ThemeId>('vivid_violet');
    expect(ids).toContain<ThemeId>('dark');
  });

  it('기본 테마는 dusty_amber(더스티 앰버 & 세이지 그린)이며 토큰 기본 색상을 반영한다', () => {
    expect(themeManager.getTheme()).toBe('dusty_amber');
    expect(TOKENS.colors.primary).toBe(THEME_PALETTES.dusty_amber.primary);
  });

  it('vivid_violet(app_design1.jpg 언어)으로 변경 시 토큰 색상이 보라색/네온 옐로우 계열로 즉시 전환된다', async () => {
    await themeManager.setTheme('vivid_violet');
    expect(themeManager.getTheme()).toBe('vivid_violet');
    expect(TOKENS.colors.primary).toBe(THEME_PALETTES.vivid_violet.primary);
    expect(TOKENS.colors.accent).toBe(THEME_PALETTES.vivid_violet.accent);

    const saved = await LocalStorageService.getItem<ThemeId>(STORAGE_KEYS.APP_THEME);
    expect(saved).toBe('vivid_violet');
  });

  it('dark(다크 포켓)으로 변경 시 어두운 배경색과 서피스 색상이 반영된다', async () => {
    await themeManager.setTheme('dark');
    expect(themeManager.getTheme()).toBe('dark');
    expect(TOKENS.colors.background).toBe(THEME_PALETTES.dark.background);
    expect(TOKENS.colors.surface).toBe(THEME_PALETTES.dark.surface);

    const saved = await LocalStorageService.getItem<ThemeId>(STORAGE_KEYS.APP_THEME);
    expect(saved).toBe('dark');
  });

  it('리스너 등록 시 테마 변경 이벤트를 구독받을 수 있다', async () => {
    let notifiedTheme: ThemeId | null = null;
    const unsubscribe = themeManager.subscribe((newTheme) => {
      notifiedTheme = newTheme;
    });

    await themeManager.setTheme('vivid_violet');
    expect(notifiedTheme).toBe('vivid_violet');

    unsubscribe();
    await themeManager.setTheme('forest');
    expect(notifiedTheme).toBe('vivid_violet');
  });
});
