/**
 * [편안하개 - PetWalk]
 * 멀티 테마 상태 및 영속성 관리 매니저 (US-THEME)
 *
 * 1. 숲길 그린 (기본)
 * 2. 비비드 바이올렛 (error/app_design1.jpg 지지(zlzl) 디자인 언어)
 * 3. 다크 포켓 (모던 다크 모드)
 */

import { useState, useEffect } from 'react';
import { ThemeId } from '../types/theme';
import { STORAGE_KEYS } from '../types/storage';
import { LocalStorageService } from '../services/storage';
import { applyThemeTokens, THEME_PALETTES, ThemeColors } from './tokens';

type ThemeChangeListener = (theme: ThemeId) => void;

class ThemeManager {
  private currentTheme: ThemeId = 'dusty_amber';
  private readonly listeners = new Set<ThemeChangeListener>();

  async init(): Promise<ThemeId> {
    const saved = await LocalStorageService.getItem<ThemeId>(STORAGE_KEYS.APP_THEME);
    if (saved && (saved === 'dusty_amber' || saved === 'forest' || saved === 'vivid_violet' || saved === 'dark')) {
      this.currentTheme = saved;
      applyThemeTokens(saved);
    } else {
      this.currentTheme = 'dusty_amber';
      applyThemeTokens('dusty_amber');
    }
    return this.currentTheme;
  }

  getTheme(): ThemeId {
    return this.currentTheme;
  }

  getColors(): ThemeColors {
    return THEME_PALETTES[this.currentTheme] ?? THEME_PALETTES.forest;
  }

  async setTheme(next: ThemeId): Promise<void> {
    this.currentTheme = next;
    applyThemeTokens(next);
    await LocalStorageService.setItem(STORAGE_KEYS.APP_THEME, next);
    this.listeners.forEach((listener) => listener(next));
  }

  subscribe(listener: ThemeChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const themeManager = new ThemeManager();

/**
 * 컴포넌트에서 실시간 테마 상태와 색상을 구독하는 React Hook
 */
export function useAppTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => themeManager.getTheme());

  useEffect(() => {
    return themeManager.subscribe((next) => {
      setTheme(next);
    });
  }, []);

  return {
    theme,
    colors: themeManager.getColors(),
    setTheme: (next: ThemeId) => void themeManager.setTheme(next),
  };
}
