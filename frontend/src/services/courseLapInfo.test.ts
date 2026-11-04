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

describe('courseLapInfo - 서버 구간 분할과 서버 진입점 정보', () => {
  /** 서버 build_segmented_geojson 처럼 at 위치에서 구간을 나누고, 다음 구간 첫 점에 경계점을 다시 넣는다. */
  function splitRoute(coords: LonLat[], at: number[]): RouteFeatureCollection {
    const features: RouteFeatureCollection['features'][number][] = [];
    let start = 0;
    [...at, coords.length - 1].forEach((end) => {
      features.push({
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1, shaded: true },
        geometry: { type: 'LineString', coordinates: coords.slice(start, end + 1) },
      });
      start = end;
    });
    return { type: 'FeatureCollection', features };
  }

  const twoLapCoords: LonLat[] = [P0, P1, E, C1, C2, C3, E, C1, C2, C3, E, P1, P0];

  it('구간이 순환 진입점에서 나뉘어도 진입점을 찾는다 (경계점 중복 제거)', () => {
    const entryIndex = 6; // 첫 바퀴가 끝나는 진입점에서 구간이 바뀜
    const info = analyzeCourseLaps(splitRoute(twoLapCoords, [entryIndex]), 2, 480);
    expect(info).not.toBeNull();
    expect(info!.entry).toEqual(E);
  });

  it('구간이 여러 번 나뉘어도 결과가 한 구간일 때와 같다', () => {
    const single = analyzeCourseLaps(routeOf(twoLapCoords), 2, 480);
    const split = analyzeCourseLaps(splitRoute(twoLapCoords, [2, 4, 6, 9]), 2, 480);
    expect(split).toEqual(single);
  });

  it('서버가 순환 진입점과 진입 거리를 주면 좌표로 추정하지 않고 그대로 쓴다', () => {
    const info = analyzeCourseLaps(splitRoute(twoLapCoords, [2, 6]), 2, 480, {
      loopEntryPoint: E,
      approachDistanceM: 222,
    });
    expect(info).not.toBeNull();
    expect(info!.entry).toEqual(E);
    expect(info!.approachMeters).toBe(222);
    expect(info!.lapCycleMeters).toBe(480);
  });

  it('서버 진입점이 있으면 좌표 모양으로 진입점을 못 찾는 경로에서도 핀을 만든다', () => {
    // 진입점이 바퀴 수 + 1번 나오지 않는 (예: 단순화로 점이 빠진) 경로
    const irregular: LonLat[] = [P0, P1, E, C1, C2, C3, C1, C2, C3, E, P1, P0];
    expect(analyzeCourseLaps(routeOf(irregular), 2, 480)).toBeNull();
    const info = analyzeCourseLaps(routeOf(irregular), 2, 480, { loopEntryPoint: E, approachDistanceM: null });
    expect(info?.entry).toEqual(E);
    expect(info!.approachMeters).toBeGreaterThan(150);
  });

  it('서버 진입점이 있어도 1바퀴 코스에는 핀을 만들지 않는다', () => {
    expect(analyzeCourseLaps(routeOf(twoLapCoords), 1, 480, { loopEntryPoint: E })).toBeNull();
  });
});
