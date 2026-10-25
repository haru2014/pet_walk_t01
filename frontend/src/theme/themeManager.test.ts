/**
 * [편안하개 - PetWalk]
 * ThemeManager 및 테마 토큰 전환 단위 테스트
 */

import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
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
  afterEach(async () => {
    vi.restoreAllMocks();
    await themeManager.setTheme('dusty_amber');
  });

  beforeEach(async () => {
    memoryStore.clear();
    await themeManager.setTheme('dusty_amber');
  });

  it('THEME_LIST에 중복 민트 테마 없이 upstream·오션·코랄 테마가 정의되어 있어야 한다', () => {
    expect(THEME_LIST).toHaveLength(6);
    const ids = THEME_LIST.map((t) => t.id);
    expect(ids).toContain<ThemeId>('dusty_amber');
    expect(ids).toContain<ThemeId>('forest');
    expect(ids).toContain<ThemeId>('vivid_violet');
    expect(ids).toContain<ThemeId>('dark');
    expect(ids).not.toContain('mint');
    expect(ids).toContain<ThemeId>('ocean');
    expect(ids).toContain<ThemeId>('coral');
  });

  it('테마 선택 UI에 디자인 파일명이나 시안 번호 대신 사용자용 배지를 표시한다', () => {
    expect(THEME_LIST.map((theme) => theme.badgeText)).toEqual([
      '앰버 & 세이지',
      '숲길',
      '바이올렛',
      '야간',
      '바다',
      '코랄',
    ]);
    expect(THEME_LIST.map((theme) => theme.description).join(' ')).not.toMatch(/app_design|시안|zlzl/i);
  });

  it('기본 테마는 dusty_amber(더스티 앰버 & 세이지 그린)이며 토큰 기본 색상을 반영한다', () => {
    expect(themeManager.getTheme()).toBe('dusty_amber');
    expect(TOKENS.colors.primary).toBe(THEME_PALETTES.dusty_amber.primary);
  });

  it('저장된 테마를 초기화하고 구독자에게 반영한다', async () => {
    memoryStore.set(STORAGE_KEYS.APP_THEME, JSON.stringify('ocean'));
    let notifiedTheme: ThemeId | null = null;
    const unsubscribe = themeManager.subscribe((next) => {
      notifiedTheme = next;
    });

    await expect(themeManager.init()).resolves.toBe('ocean');
    expect(themeManager.getTheme()).toBe('ocean');
    expect(TOKENS.colors.primary).toBe(THEME_PALETTES.ocean.primary);
    expect(notifiedTheme).toBe('ocean');
    unsubscribe();
  });

  it('기존 설치에 저장된 민트 테마를 같은 팔레트인 숲길 테마로 이전한다', async () => {
    memoryStore.set(STORAGE_KEYS.APP_THEME, JSON.stringify('mint'));

    await expect(themeManager.init()).resolves.toBe('forest');
    expect(themeManager.getTheme()).toBe('forest');
    expect(memoryStore.get(STORAGE_KEYS.APP_THEME)).toBe(JSON.stringify('forest'));
  });

  it('저장에 실패하면 활성 테마와 토큰을 변경하지 않는다', async () => {
    const activeTheme = themeManager.getTheme();
    const activePrimary = TOKENS.colors.primary;
    const setItem = vi.spyOn(LocalStorageService, 'setItem').mockResolvedValue(false);

    await expect(themeManager.setTheme('ocean')).resolves.toBe(false);

    expect(themeManager.getTheme()).toBe(activeTheme);
    expect(TOKENS.colors.primary).toBe(activePrimary);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEYS.APP_THEME, 'ocean');
  });

  it('vivid_violet(app_design1.jpg 언어)으로 변경 시 토큰 색상이 보라색/네온 옐로우 계열로 즉시 전환된다', async () => {
    await expect(themeManager.setTheme('vivid_violet')).resolves.toBe(true);
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
