/**
 * [편안하개 - PetWalk]
 * 지도 3단계 안전 폴백 체계 (T-OFM-7, docs/08_OpenFreeMap_MapLibre_배경지도_구현계획서.md)
 *
 * 1차 openfreemap     : OpenFreeMap 공식 벡터 타일 서버 (tiles.openfreemap.org)
 * 2차 offline_geojson : 배경 타일 없이 로컬 GeoJSON(경로/마스킹/핀)만 그리는 정적 스타일
 * 3차 osm_raster      : OSM 래스터 타일 페일오버 (MapLibre 인메모리 타일 캐시 사용)
 *
 * 이 모듈은 순수 함수만 포함하며 react-native / maplibre-gl에 의존하지 않습니다.
 * (WebView 템플릿과 웹 컴포넌트가 동일한 정책을 공유하는 단일 진실 공급원)
 */

export type MapFallbackTier = 'openfreemap' | 'offline_geojson' | 'osm_raster';

/** 성능 저하 순서의 폴백 체인 (앞쪽이 우선) */
export const MAP_FALLBACK_CHAIN: readonly MapFallbackTier[] = [
  'openfreemap',
  'offline_geojson',
  'osm_raster',
];

/** 스타일 로드 완료(load 이벤트)를 기다리는 최대 시간(ms). 초과하면 다음 단계로 전환합니다. */
export const STYLE_LOAD_TIMEOUT_MS = 8000;

export const OSM_RASTER_TILE_URL = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>';

/** maplibre-gl StyleSpecification 중 폴백 스타일에 필요한 최소 구조 */
export interface MapStyleSpec {
  readonly version: 8;
  readonly sources: Readonly<Record<string, unknown>>;
  readonly layers: readonly Record<string, unknown>[];
}

export type MapStyleSource = string | MapStyleSpec;

/** 2차: 배경색 레이어만 가진 정적 스타일. 네트워크 요청이 전혀 발생하지 않습니다. */
export function buildOfflineGeoJsonStyle(background: string): MapStyleSpec {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'offline-background', type: 'background', paint: { 'background-color': background } }],
  };
}

/** 3차: OSM 래스터 타일 스타일. */
export function buildOsmRasterStyle(): MapStyleSpec {
  return {
    version: 8,
    sources: {
      'osm-raster': {
        type: 'raster',
        tiles: [OSM_RASTER_TILE_URL],
        tileSize: 256,
        maxzoom: 18,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster' }],
  };
}

/** 단계에 대응하는 MapLibre 스타일(URL 또는 스타일 객체)을 반환합니다. */
export function resolveFallbackStyle(
  tier: MapFallbackTier,
  primaryStyleUrl: string,
  offlineBackground: string,
): MapStyleSource {
  if (tier === 'offline_geojson') return buildOfflineGeoJsonStyle(offlineBackground);
  if (tier === 'osm_raster') return buildOsmRasterStyle();
  return primaryStyleUrl;
}

/**
 * 현재 단계 다음에 시도할 단계를 반환합니다. 마지막 단계이면 null.
 * 그릴 경로가 없으면(예: 온보딩 탐색 지도) 배경이 없는 2차 단계는 의미가 없으므로 건너뜁니다.
 */
export function getNextFallbackTier(
  current: MapFallbackTier,
  hasStaticRoute: boolean,
): MapFallbackTier | null {
  const next = MAP_FALLBACK_CHAIN[MAP_FALLBACK_CHAIN.indexOf(current) + 1] ?? null;
  if (next === 'offline_geojson' && !hasStaticRoute) return getNextFallbackTier(next, hasStaticRoute);
  return next;
}

/** MapLibre 'error' 이벤트 중 개별 타일/소스 오류를 제외한 스타일 로드 실패만 판별합니다. */
export function isStyleLoadError(event: {
  readonly error?: unknown;
  readonly sourceId?: unknown;
  readonly tile?: unknown;
} | null | undefined): boolean {
  if (!event?.error) return false;
  return event.sourceId == null && event.tile == null;
}
