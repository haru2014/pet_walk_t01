/**
 * [편안하개 - PetWalk]
 * 멀티 테마 상태 및 영속성 관리 매니저 (US-THEME)
 *
 * 1. Upstream palette themes: amber, forest, violet, dark
 * 2. PR #202 palette themes: mint, ocean, coral
 */

import { useState, useEffect } from 'react';
import { ThemeId } from '../types/theme';
import { STORAGE_KEYS } from '../types/storage';
import { LocalStorageService } from '../services/storage';
import { applyThemeTokens, THEME_PALETTES, ThemeColors } from './tokens';

type ThemeChangeListener = (theme: ThemeId) => void;

class ThemeManager {
  private currentTheme: ThemeId = 'dusty_amber';
  private initialized = false;
  private readonly listeners = new Set<ThemeChangeListener>();

  async init(): Promise<ThemeId> {
    const saved = await LocalStorageService.getItem<unknown>(STORAGE_KEYS.APP_THEME);
    this.currentTheme = isThemeId(saved) ? saved : 'dusty_amber';
    applyThemeTokens(this.currentTheme);
    this.initialized = true;
    this.listeners.forEach((listener) => listener(this.currentTheme));
    return this.currentTheme;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getTheme(): ThemeId {
    return this.currentTheme;
  }

  getColors(): ThemeColors {
    return THEME_PALETTES[this.currentTheme] ?? THEME_PALETTES.forest;
  }

  async setTheme(next: ThemeId): Promise<boolean> {
    const saved = await LocalStorageService.setItem(STORAGE_KEYS.APP_THEME, next);
    if (!saved) return false;

    this.currentTheme = next;
    applyThemeTokens(next);
    this.initialized = true;
    this.listeners.forEach((listener) => listener(next));
    return true;
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
  const [isReady, setIsReady] = useState(() => themeManager.isInitialized());

  useEffect(() => {
    return themeManager.subscribe((next) => {
      setTheme(next);
      setIsReady(themeManager.isInitialized());
    });
  }, []);

  return {
    theme,
    colors: themeManager.getColors(),
    isReady,
    setTheme: (next: ThemeId) => themeManager.setTheme(next),
  };
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(THEME_PALETTES, value);
}
