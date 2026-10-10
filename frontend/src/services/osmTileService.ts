/**
 * [편안하개 - PetWalk]
 * OpenStreetMap (OSM) 기반 도로망 배경 타일 연동 서비스
 *
 * Web Mercator (EPSG:3857) 타일 계산 공식을 활용하여
 * 경로 위경도 범위에 매칭되는 실제 도로/공원 지도 타일 이미지를 산출합니다.
 */

import { LonLat } from '../types/route';

export interface MapTile {
  readonly key: string;
  readonly url: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

export function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom),
  );
}

export function tile2lon(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

export function tile2lat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * 주어진 경로 좌표 목록과 투영 함수를 바탕으로
 * 지도 캔버스 배경에 오버레이할 OSM 타일 목록을 생성합니다.
 */
export function calculateOsmTiles(
  coords: readonly LonLat[],
  project: (coord: LonLat) => { x: number; y: number },
  zoom: number = 15,
): readonly MapTile[] {
  if (coords.length === 0) return [];

  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const startX = lon2tile(minLon, zoom);
  const endX = lon2tile(maxLon, zoom);
  const startY = lat2tile(maxLat, zoom);
  const endY = lat2tile(minLat, zoom);

  const tiles: MapTile[] = [];

  for (let tx = startX; tx <= endX; tx++) {
    for (let ty = startY; ty <= endY; ty++) {
      const nwLon = tile2lon(tx, zoom);
      const nwLat = tile2lat(ty, zoom);
      const seLon = tile2lon(tx + 1, zoom);
      const seLat = tile2lat(ty + 1, zoom);

      const nw = project([nwLon, nwLat]);
      const se = project([seLon, seLat]);

      // CartoDB Voyager 타일 (OSM 기반, 밝고 깔끔한 보행로/공원 시인성 최적화)
      const url = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${tx}/${ty}.png`;

      tiles.push({
        key: `tile_${zoom}_${tx}_${ty}`,
        url,
        x: nw.x,
        y: nw.y,
        width: Math.max(1, se.x - nw.x),
        height: Math.max(1, se.y - nw.y),
      });
    }
  }

  return tiles;
}
