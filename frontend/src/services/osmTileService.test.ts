import { describe, it, expect } from 'vitest';
import { lon2tile, lat2tile, tile2lon, tile2lat, calculateOsmTiles } from './osmTileService';
import { LonLat } from '../types/route';

describe('osmTileService (OpenStreetMap Web Mercator 타일 연산)', () => {
  it('서울숲 좌표를 올바른 타일 인덱스로 변환해야 한다', () => {
    const lon = 127.0395;
    const lat = 37.5445;
    const zoom = 15;

    const x = lon2tile(lon, zoom);
    const y = lat2tile(lat, zoom);

    expect(x).toBe(27947);
    expect(y).toBe(12692);
  });

  it('타일 좌표를 다시 위경도로 역변환했을 때 오차 범위 내로 복원되어야 한다', () => {
    const zoom = 15;
    const x = 27947;
    const y = 12692;

    const lon = tile2lon(x, zoom);
    const lat = tile2lat(y, zoom);

    expect(lon).toBeCloseTo(127.035, 1);
    expect(lat).toBeCloseTo(37.553, 1);
  });

  it('좌표 목록이 주어졌을 때 배경 타일 목록을 정상적으로 산출해야 한다', () => {
    const coords: LonLat[] = [
      [127.0374, 37.5443],
      [127.0419, 37.5441],
    ];
    const project = ([lon, lat]: LonLat) => ({ x: lon * 10, y: lat * 10 });

    const tiles = calculateOsmTiles(coords, project, 15);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles[0].url).toContain('https://a.basemaps.cartocdn.com/rastertiles/voyager/15/');
    expect(tiles[0].width).toBeGreaterThan(0);
  });

  it('provider가 osm일 때 공식 OSM 타일 URL을 반환해야 한다', () => {
    const coords: LonLat[] = [
      [127.0374, 37.5443],
      [127.0419, 37.5441],
    ];
    const project = ([lon, lat]: LonLat) => ({ x: lon * 10, y: lat * 10 });

    const tiles = calculateOsmTiles(coords, project, 16, 'osm');
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles[0].url).toContain('https://tile.openstreetmap.de/16/');
  });
});
