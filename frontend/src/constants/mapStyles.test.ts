import { describe, it, expect } from 'vitest';
import {
  OPENFREEMAP_STYLES,
  getMapStyleKeyForTheme,
  getMapStyleForTheme,
  getMapRouteColors,
} from './mapStyles';
import { ThemeId } from '../types/theme';

describe('OpenFreeMap & MapLibre 스타일 및 테마 매핑 (T-OFM-2)', () => {
  it('OpenFreeMap 공식 3대 스타일 엔드포인트가 정의되어 있어야 한다', () => {
    expect(OPENFREEMAP_STYLES.liberty).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(OPENFREEMAP_STYLES.bright).toBe('https://tiles.openfreemap.org/styles/bright');
    expect(OPENFREEMAP_STYLES.dark).toBe('https://tiles.openfreemap.org/styles/dark');
  });

  it('편안하개 3대 테마가 각각 적절한 OpenFreeMap 스타일에 매핑되어야 한다', () => {
    // 1. 숲길 그린 -> 녹지/자연 디테일이 강조된 liberty
    expect(getMapStyleKeyForTheme('forest')).toBe('liberty');
    expect(getMapStyleForTheme('forest')).toBe(OPENFREEMAP_STYLES.liberty);

    // 2. 비비드 바이올렛 -> 밝고 고대비 도심 보행로 bright
    expect(getMapStyleKeyForTheme('vivid_violet')).toBe('bright');
    expect(getMapStyleForTheme('vivid_violet')).toBe(OPENFREEMAP_STYLES.bright);

    // 3. 다크 포켓 -> 야간 OLED 저전력 다크 스타일 dark
    expect(getMapStyleKeyForTheme('dark')).toBe('dark');
    expect(getMapStyleForTheme('dark')).toBe(OPENFREEMAP_STYLES.dark);
  });

  it('정의되지 않은 비정상 테마가 전달될 경우 기본값인 liberty로 안전하게 폴백되어야 한다', () => {
    const invalidTheme = 'unknown_theme' as ThemeId;
    expect(getMapStyleKeyForTheme(invalidTheme)).toBe('liberty');
    expect(getMapStyleForTheme(invalidTheme)).toBe(OPENFREEMAP_STYLES.liberty);
  });

  it('각 테마별 보행로 3색(safe/normal/caution) 및 마스킹 원 색상을 올바르게 반환해야 한다', () => {
    const forestColors = getMapRouteColors('forest');
    expect(forestColors.safe).toBe('#10B981');
    expect(forestColors.normal).toBe('#3B82F6');
    expect(forestColors.caution).toBe('#F59E0B');
    expect(forestColors.maskCircle).toContain('rgba(');

    const vividColors = getMapRouteColors('vivid_violet');
    expect(vividColors.normal).toBe('#7C3AED'); // 비비드 바이올렛 포인트 반영

    const darkColors = getMapRouteColors('dark');
    expect(darkColors.safe).toBe('#34D399');   // 야간 고시인성 네온 민트
    expect(darkColors.casing).toBe('#0F172A'); // 다크 테두리
  });
});
