import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppThemeService, persistThemeSelection } from './appThemeService';
import { LocalStorageService } from './storage';
import { STORAGE_KEYS } from '../types/storage';
import { DEFAULT_APP_THEME_ID } from '../types/appTheme';

describe('AppThemeService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the default theme when no saved theme exists', async () => {
    vi.spyOn(LocalStorageService, 'getItem').mockResolvedValue(null);

    await expect(AppThemeService.getTheme()).resolves.toBe(DEFAULT_APP_THEME_ID);
  });

  it('loads a valid saved theme and falls back for an unknown value', async () => {
    const getItem = vi.spyOn(LocalStorageService, 'getItem');
    getItem.mockResolvedValueOnce('ocean');
    await expect(AppThemeService.getTheme()).resolves.toBe('ocean');

    getItem.mockResolvedValueOnce('not-a-theme');
    await expect(AppThemeService.getTheme()).resolves.toBe(DEFAULT_APP_THEME_ID);
  });

  it('returns the storage result when saving a theme', async () => {
    const setItem = vi.spyOn(LocalStorageService, 'setItem').mockResolvedValue(false);

    await expect(AppThemeService.saveTheme('coral')).resolves.toBe(false);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEYS.APP_THEME, 'coral');
  });

  it('keeps the active theme unchanged when persistence fails', async () => {
    let activeTheme = DEFAULT_APP_THEME_ID;
    const activate = vi.fn((themeId) => { activeTheme = themeId; });

    const saved = await persistThemeSelection(
      'ocean',
      async () => false,
      activate,
    );

    expect(saved).toBe(false);
    expect(activeTheme).toBe(DEFAULT_APP_THEME_ID);
    expect(activate).not.toHaveBeenCalled();
  });

  it('activates the selected theme only after persistence succeeds', async () => {
    let activeTheme = DEFAULT_APP_THEME_ID;

    const saved = await persistThemeSelection(
      'coral',
      async () => true,
      (themeId) => { activeTheme = themeId; },
    );

    expect(saved).toBe(true);
    expect(activeTheme).toBe('coral');
  });
});
