import { describe, it, expect } from 'vitest';
import {
  MAP_FALLBACK_CHAIN,
  STYLE_LOAD_TIMEOUT_MS,
  buildOfflineGeoJsonStyle,
  buildOsmRasterStyle,
  getNextFallbackTier,
  isStyleLoadError,
  resolveFallbackStyle,
} from './mapFallback';
import { OPENFREEMAP_STYLES } from './mapStyles';

describe('지도 3단계 안전 폴백 체계 (T-OFM-7)', () => {
  it('폴백 체인은 OpenFreeMap → 정적 GeoJSON → OSM 래스터 순서여야 한다', () => {
    expect(MAP_FALLBACK_CHAIN).toEqual(['openfreemap', 'offline_geojson', 'osm_raster']);
  });

  it('경로가 있으면 한 단계씩 순서대로 내려가고 마지막 단계에서는 null을 반환한다', () => {
    expect(getNextFallbackTier('openfreemap', true)).toBe('offline_geojson');
    expect(getNextFallbackTier('offline_geojson', true)).toBe('osm_raster');
    expect(getNextFallbackTier('osm_raster', true)).toBeNull();
  });

  it('그릴 경로가 없으면 배경이 없는 정적 단계를 건너뛰고 OSM 래스터로 전환한다', () => {
    expect(getNextFallbackTier('openfreemap', false)).toBe('osm_raster');
    expect(getNextFallbackTier('osm_raster', false)).toBeNull();
  });

  it('1차는 선택된 OpenFreeMap 스타일 URL을 그대로 사용한다', () => {
    const style = resolveFallbackStyle('openfreemap', OPENFREEMAP_STYLES.dark, '#0F172A');
    expect(style).toBe(OPENFREEMAP_STYLES.dark);
  });

  it('2차 정적 스타일은 배경색 레이어만 가지며 네트워크 소스를 요청하지 않는다', () => {
    const style = buildOfflineGeoJsonStyle('#0F172A');
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toHaveLength(0);
    expect(style.layers).toHaveLength(1);
    expect(style.layers[0]).toMatchObject({ type: 'background', paint: { 'background-color': '#0F172A' } });
    expect(JSON.stringify(style)).not.toContain('http');
    expect(resolveFallbackStyle('offline_geojson', OPENFREEMAP_STYLES.liberty, '#0F172A')).toEqual(style);
  });

  it('3차 OSM 래스터 스타일은 OpenFreeMap 호스트에 의존하지 않고 XYZ 타일 템플릿을 사용한다', () => {
    const style = buildOsmRasterStyle();
    const source = style.sources['osm-raster'] as { type: string; tiles: string[]; tileSize: number };
    expect(source.type).toBe('raster');
    expect(source.tileSize).toBe(256);
    expect(source.tiles[0]).toContain('{z}/{x}/{y}');
    expect(JSON.stringify(style)).not.toContain('openfreemap');
    expect(resolveFallbackStyle('osm_raster', OPENFREEMAP_STYLES.liberty, '#fff')).toEqual(style);
  });

  it('스타일 로드 실패만 폴백 대상이며 개별 타일/소스 오류는 무시한다', () => {
    expect(isStyleLoadError(null)).toBe(false);
    expect(isStyleLoadError(undefined)).toBe(false);
    expect(isStyleLoadError({})).toBe(false);
    expect(isStyleLoadError({ error: new Error('Failed to fetch') })).toBe(true);
    expect(isStyleLoadError({ error: new Error('404'), sourceId: 'openmaptiles' })).toBe(false);
    expect(isStyleLoadError({ error: new Error('404'), tile: { z: 15 } })).toBe(false);
  });

  it('스타일 로드 타임아웃은 사용자가 기다릴 수 있는 범위(1~15초)여야 한다', () => {
    expect(STYLE_LOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
    expect(STYLE_LOAD_TIMEOUT_MS).toBeLessThanOrEqual(15000);
  });
});
