/**
 * [편안하개 - PetWalk]
 * 경로 기하 및 요약 산출 단위 테스트 (Phase 3, US-C1)
 *
 * 대상: frontend/src/services/routeGeometry.ts
 */

import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  polylineLengthMeters,
  buildCourseSummary,
  createProjector,
} from './routeGeometry';
import { RouteFeatureCollection, LonLat } from '../types/route';
import { SAMPLE_ROUTE } from './sampleRoute';

describe('routeGeometry - haversineMeters', () => {
  it('동일한 좌표 간의 거리는 0m이어야 한다', () => {
    const point: LonLat = [127.0374, 37.5443];
    const dist = haversineMeters(point, point);
    expect(dist).toBe(0);
  });

  it('거리 연산은 방향과 무관하게 대칭적이어야 한다', () => {
    const a: LonLat = [127.0374, 37.5443];
    const b: LonLat = [127.0419, 37.5441];
    const distAB = haversineMeters(a, b);
    const distBA = haversineMeters(b, a);
    expect(distAB).toBeCloseTo(distBA, 5);
    expect(distAB).toBeGreaterThan(0);
  });

  it('위도 1도 차이의 대원 거리는 약 111km이어야 한다', () => {
    const p1: LonLat = [0, 0];
    const p2: LonLat = [0, 1];
    const distM = haversineMeters(p1, p2);
    // 1도 ≈ 111,195m
    expect(distM).toBeGreaterThan(111000);
    expect(distM).toBeLessThan(112000);
  });
});

describe('routeGeometry - polylineLengthMeters', () => {
  it('좌표가 1개 이하일 경우 거리는 0m이어야 한다', () => {
    expect(polylineLengthMeters([])).toBe(0);
    expect(polylineLengthMeters([[127.0, 37.0]])).toBe(0);
  });

  it('여러 좌표의 폴리라인 누적 거리를 올바르게 합산해야 한다', () => {
    const coords: LonLat[] = [
      [127.0374, 37.5443],
      [127.0381, 37.5449],
      [127.0390, 37.5455],
    ];
    const total = polylineLengthMeters(coords);
    const seg1 = haversineMeters(coords[0], coords[1]);
    const seg2 = haversineMeters(coords[1], coords[2]);
    expect(total).toBeCloseTo(seg1 + seg2, 4);
  });
});

describe('routeGeometry - buildCourseSummary', () => {
  it('빈 코스이거나 유효하지 않은 속도일 때 0으로 구성된 요약을 반환해야 한다', () => {
    const emptyCollection: RouteFeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    const summary = buildCourseSummary(emptyCollection, 2.8);
    expect(summary).toEqual({
      totalDistanceKm: 0,
      estimatedMinutes: 0,
      maxSlopePercent: 0,
      shadeRatioPercent: 0,
    });

    const invalidSpeed = buildCourseSummary(SAMPLE_ROUTE, 0);
    expect(invalidSpeed.estimatedMinutes).toBe(0);
  });

  it('샘플 코스의 요약 지표(거리, 소요시간, 최대 경사, 그늘 비율)를 정확히 산출해야 한다', () => {
    // 말티즈 기준 권장 속도 2.2 km/h
    const summary = buildCourseSummary(SAMPLE_ROUTE, 2.2);

    expect(summary.totalDistanceKm).toBeGreaterThan(0.8);
    expect(summary.totalDistanceKm).toBeLessThan(1.5);
    expect(summary.estimatedMinutes).toBeGreaterThan(15);
    expect(summary.maxSlopePercent).toBe(7.8); // caution 세그먼트의 7.8%
    expect(summary.shadeRatioPercent).toBeGreaterThan(0);
    expect(summary.shadeRatioPercent).toBeLessThanOrEqual(100);
  });

  it('반려견 보행 속도가 빠를수록 예상 소요시간이 감소해야 한다 (US-A3 연계)', () => {
    const seniorDogSpeed = 2.2; // 노령견 (2.2 km/h)
    const largeDogSpeed = 4.2;  // 대형견 (4.2 km/h)

    const seniorSummary = buildCourseSummary(SAMPLE_ROUTE, seniorDogSpeed);
    const largeSummary = buildCourseSummary(SAMPLE_ROUTE, largeDogSpeed);

    expect(seniorSummary.totalDistanceKm).toBe(largeSummary.totalDistanceKm);
    expect(seniorSummary.estimatedMinutes).toBeGreaterThan(largeSummary.estimatedMinutes);
  });
});

describe('routeGeometry - createProjector', () => {
  it('모든 좌표가 지정된 뷰포트 내부 영역으로 정상 투영되어야 한다', () => {
    const coords: LonLat[] = [
      [127.0374, 37.5443],
      [127.0399, 37.5459],
      [127.0419, 37.5441],
      [127.0406, 37.5430],
    ];
    const viewport = { width: 350, height: 420, padding: 40 };
    const project = createProjector(coords, viewport);

    for (const pt of coords) {
      const { x, y } = project(pt);
      expect(x).toBeGreaterThanOrEqual(viewport.padding - 1);
      expect(x).toBeLessThanOrEqual(viewport.width - viewport.padding + 1);
      expect(y).toBeGreaterThanOrEqual(viewport.padding - 1);
      expect(y).toBeLessThanOrEqual(viewport.height - viewport.padding + 1);
    }
  });

  it('위도가 높을수록 화면 y 좌표는 작아야 한다 (지도 좌표계 반전)', () => {
    const coords: LonLat[] = [
      [127.0, 37.50],
      [127.0, 37.55],
    ];
    const project = createProjector(coords, { width: 300, height: 300, padding: 20 });
    const pSouth = project([127.0, 37.50]);
    const pNorth = project([127.0, 37.55]);

    expect(pNorth.y).toBeLessThan(pSouth.y);
  });
});
