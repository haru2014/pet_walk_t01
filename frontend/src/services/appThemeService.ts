import { STORAGE_KEYS } from '../types/storage';
import { AppThemeId, DEFAULT_APP_THEME_ID, isAppThemeId } from '../types/appTheme';
import { LocalStorageService } from './storage';

export async function persistThemeSelection(
  themeId: AppThemeId,
  persist: (themeId: AppThemeId) => Promise<boolean>,
  activate: (themeId: AppThemeId) => void,
): Promise<boolean> {
  const saved = await persist(themeId);
  if (!saved) return false;
  activate(themeId);
  return true;
}

export class AppThemeService {
  static async getTheme(): Promise<AppThemeId> {
    const savedTheme = await LocalStorageService.getItem<unknown>(STORAGE_KEYS.APP_THEME);
    return isAppThemeId(savedTheme) ? savedTheme : DEFAULT_APP_THEME_ID;
  }

  static async saveTheme(themeId: AppThemeId): Promise<boolean> {
    return LocalStorageService.setItem(STORAGE_KEYS.APP_THEME, themeId);
  }
}
