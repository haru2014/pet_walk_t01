import { describe, it, expect } from 'vitest';
import { LonLat, RouteFeatureCollection } from '../types/route';
import {
  LOOP_START_PIN_ID,
  analyzeCourseLaps,
  createLoopStartPin,
  formatCourseLapSummary,
  mergeLoopStartPin,
} from './courseLapInfo';

function routeOf(coords: LonLat[]): RouteFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1, shaded: true },
        geometry: { type: 'LineString', coordinates: coords },
      },
    ],
  };
}

// 출발(P0) → 진입로 → 진입점(E) → 순환로(C1, C2, C3) × N바퀴 → 진입점(E) → 진입로 복귀 → 출발
const P0: LonLat = [127.0, 36.0];
const P1: LonLat = [127.0, 36.001];
const E: LonLat = [127.0, 36.002];
const C1: LonLat = [127.001, 36.003];
const C2: LonLat = [127.002, 36.002];
const C3: LonLat = [127.001, 36.001];

function buildLoopRoute(laps: number): RouteFeatureCollection {
  const lap: LonLat[] = [C1, C2, C3, E];
  const coords: LonLat[] = [P0, P1, E];
  for (let i = 0; i < laps; i += 1) coords.push(...lap);
  coords.push(P1, P0);
  return routeOf(coords);
}

describe('courseLapInfo - 순환 코스 바퀴 수와 반복 구간 분석', () => {
  it('3바퀴 코스에서 순환 진입점, 한 바퀴 길이, 진입 거리를 찾는다', () => {
    const info = analyzeCourseLaps(buildLoopRoute(3), 3, 480);

    expect(info).not.toBeNull();
    expect(info!.lapCount).toBe(3);
    expect(info!.entry).toEqual(E);
    expect(info!.lapCycleMeters).toBe(480);
    expect(info!.approachMeters).toBeGreaterThan(150);
    expect(info!.approachMeters).toBeLessThan(300);
  });

  it('한 바퀴 길이를 서버가 주지 않으면 좌표에서 직접 계산한다', () => {
    const info = analyzeCourseLaps(buildLoopRoute(2), 2, null);

    expect(info).not.toBeNull();
    expect(info!.lapCycleMeters).toBeGreaterThan(300);
  });

  it('한 바퀴이거나 바퀴 수 정보가 없으면 null', () => {
    expect(analyzeCourseLaps(buildLoopRoute(1), 1, 400)).toBeNull();
    expect(analyzeCourseLaps(buildLoopRoute(3), undefined, undefined)).toBeNull();
  });

  it('요약 문구에 진입 거리, 순환로 길이, 바퀴 수, 복귀를 모두 표시한다', () => {
    const info = analyzeCourseLaps(buildLoopRoute(3), 3, 480)!;
    const summary = formatCourseLapSummary(info);

    expect(summary).toContain('순환 진입');
    expect(summary).toContain('순환로 480m × 3바퀴');
    expect(summary).toContain('출발점 복귀');
  });

  it('순환 시작 핀을 한 번만 병합하고 바퀴 수를 안내한다', () => {
    const info = analyzeCourseLaps(buildLoopRoute(3), 3, 480)!;
    const pin = createLoopStartPin(info);
    expect(pin.id).toBe(LOOP_START_PIN_ID);
    expect(pin.position).toEqual(E);
    expect(pin.instruction).toContain('3바퀴');

    const once = mergeLoopStartPin([], info);
    const twice = mergeLoopStartPin(once, info);
    expect(twice.filter((p) => p.id === LOOP_START_PIN_ID)).toHaveLength(1);
    expect(mergeLoopStartPin(once, null)).toBe(once);
  });
});
