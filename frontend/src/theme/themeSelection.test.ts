import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageService } from '../services/storage';
import { STORAGE_KEYS } from '../types/storage';
import { themeManager } from './themeManager';
import { ThemeId } from '../types/theme';
import { THEME_PALETTES, TOKENS } from './tokens';

describe('Theme selection persistence', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(LocalStorageService, 'setItem').mockResolvedValue(true);
    await themeManager.setTheme('dusty_amber');
    vi.restoreAllMocks();
  });

  it('uses the default theme when no saved theme exists', async () => {
    vi.spyOn(LocalStorageService, 'getItem').mockResolvedValue(null);

    await expect(themeManager.init()).resolves.toBe('dusty_amber');
  });

  it('loads a valid saved theme and falls back for an unknown value', async () => {
    const getItem = vi.spyOn(LocalStorageService, 'getItem');
    getItem.mockResolvedValueOnce('ocean');
    await expect(themeManager.init()).resolves.toBe('ocean');

    getItem.mockResolvedValueOnce('not-a-theme');
    await expect(themeManager.init()).resolves.toBe('dusty_amber');
  });

  it('returns the storage result when saving a theme', async () => {
    const setItem = vi.spyOn(LocalStorageService, 'setItem').mockResolvedValue(false);

    await expect(themeManager.setTheme('coral')).resolves.toBe(false);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEYS.APP_THEME, 'coral');
  });

  it('keeps the active theme unchanged when persistence fails', async () => {
    const setItem = vi.spyOn(LocalStorageService, 'setItem');
    setItem.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await themeManager.setTheme('mint');
    const activeTheme = themeManager.getTheme();
    const activePrimary = TOKENS.colors.primary;

    await expect(themeManager.setTheme('ocean')).resolves.toBe(false);

    expect(themeManager.getTheme()).toBe(activeTheme);
    expect(TOKENS.colors.primary).toBe(activePrimary);
  });

  it('activates the selected theme only after persistence succeeds', async () => {
    const setItem = vi.spyOn(LocalStorageService, 'setItem').mockResolvedValue(true);

    await expect(themeManager.setTheme('coral')).resolves.toBe(true);

    expect(themeManager.getTheme()).toBe<ThemeId>('coral');
    expect(TOKENS.colors.primary).toBe(THEME_PALETTES.coral.primary);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEYS.APP_THEME, 'coral');
  });
});
