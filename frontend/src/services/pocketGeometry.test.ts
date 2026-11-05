import { describe, expect, it } from 'vitest';
import { RouteFeatureCollection } from '../types/route';
import {
  buildRoutePath,
  calcBearingDeg,
  haversineMeters,
  pointAtProgress,
  projectProgress,
} from './pocketGeometry';

const LOOP_ROUTE: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: [
        [127.0, 36.0],       // start (0m)
        [127.0, 36.002],     // north (약 222m)
        [127.002, 36.002],   // east (약 180m)
        [127.002, 36.0],     // south (약 222m)
        [127.00005, 36.0],   // loop end near start (약 180m, 총 약 804m)
      ],
    },
  }] as never,
};

describe('pocketGeometry', () => {
  it('calculates haversine distance correctly', () => {
    const dist = haversineMeters([127.0, 36.0], [127.0, 36.001]);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(113);
  });

  it('calculates bearing degrees correctly', () => {
    expect(calcBearingDeg([127.0, 36.0], [127.0, 36.001])).toBeCloseTo(0, 0); // North
    expect(calcBearingDeg([127.0, 36.0], [127.001, 36.0])).toBeCloseTo(90, 0); // East
    expect(calcBearingDeg([127.0, 36.001], [127.0, 36.0])).toBeCloseTo(180, 0); // South
    expect(calcBearingDeg([127.001, 36.0], [127.0, 36.0])).toBeCloseTo(270, 0); // West
  });

  it('projects progress preventing loop start from jumping to loop end', () => {
    const path = buildRoutePath(LOOP_ROUTE);
    // 출발 직후 (시작점 바로 앞, walkedMeters: 50m)
    // 위치가 시작점과 끝점 모두에 가까움
    const pos: [number, number] = [127.0, 36.0003]; // 시작점에서 약 33m 북쪽
    const progress = projectProgress(pos, path, { walkedMeters: 35, currentBearing: 0 });

    // 끝점(800m)으로 점프하지 않고 시작 부근(약 33m)으로 투영되어야 함
    expect(progress).toBeDefined();
    expect(progress!).toBeLessThan(100);
    expect(progress!).toBeGreaterThan(20);
  });

  it('interpolates point at progress', () => {
    const path = buildRoutePath(LOOP_ROUTE);
    const startPoint = pointAtProgress(path, 0);
    expect(startPoint[0]).toBeCloseTo(127.0, 5);
    expect(startPoint[1]).toBeCloseTo(36.0, 5);

    const midPoint = pointAtProgress(path, 111);
    expect(midPoint[0]).toBeCloseTo(127.0, 5);
    expect(midPoint[1]).toBeGreaterThan(36.0);
  });
});

