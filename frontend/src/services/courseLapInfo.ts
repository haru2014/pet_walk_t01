/**
 * [편안하개 - PetWalk]
 * 같은 순환로를 여러 바퀴 도는 코스의 구조 분석 (몇 바퀴 / 어디부터 어디까지 반복인지)
 *
 * 공원 순환 코스는 `진입로 → (순환로 × N바퀴) → 진입로 복귀` 모양이다.
 * 좌표열에서 순환 진입점(N+1번 지나는 점)을 찾아 진입 거리·순환 길이·복귀 거리를 구하고,
 * 지도 핀과 카드 문구에 쓸 정보를 만든다.
 */

import { LonLat, RouteFeatureCollection, RouteStepPin } from '../types/route';
import { polylineLengthMeters } from './routeGeometry';

export const LOOP_START_PIN_ID = 'course-loop-start';

export interface CourseLapInfo {
  readonly lapCount: number;
  /** 순환로 한 바퀴 길이(m) */
  readonly lapCycleMeters: number;
  /** 출발점에서 순환 진입점까지 거리(m). 진입로가 없으면 0 */
  readonly approachMeters: number;
  /** 순환이 시작되고 끝나는 지점 [lon, lat] */
  readonly entry: LonLat;
  /** 전체 코스 길이(m) */
  readonly totalMeters: number;
}

function coordKey(coord: LonLat): string {
  return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
}

function flattenCoordinates(route: RouteFeatureCollection): LonLat[] {
  return route.features.flatMap((feature) => feature.geometry.coordinates.map((c) => [c[0], c[1]] as LonLat));
}

/**
 * 코스 좌표열에서 순환 구조를 분석한다.
 * 한 바퀴(또는 정보 없음)이거나 진입점을 확실히 찾지 못하면 null.
 */
export function analyzeCourseLaps(
  route: RouteFeatureCollection,
  lapCount?: number,
  lapCycleMeters?: number | null,
): CourseLapInfo | null {
  if (!lapCount || lapCount < 2) return null;
  const coords = flattenCoordinates(route);
  if (coords.length < 3) return null;

  const counts = new Map<string, number>();
  coords.forEach((coord) => {
    const key = coordKey(coord);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  // 진입점은 진입로 끝에서 한 번, 각 바퀴 끝에서 한 번씩 지나므로 lapCount + 1번 나온다.
  const entryIndexes: number[] = [];
  coords.forEach((coord, index) => {
    if (counts.get(coordKey(coord)) === lapCount + 1) entryIndexes.push(index);
  });
  if (entryIndexes.length < 2) return null;

  const firstIndex = entryIndexes[0];
  const secondIndex = entryIndexes[1];
  const measuredCycle = polylineLengthMeters(coords.slice(firstIndex, secondIndex + 1));
  const cycle = lapCycleMeters && lapCycleMeters > 0 ? lapCycleMeters : measuredCycle;

  return {
    lapCount,
    lapCycleMeters: cycle,
    approachMeters: polylineLengthMeters(coords.slice(0, firstIndex + 1)),
    entry: coords[firstIndex],
    totalMeters: polylineLengthMeters(coords),
  };
}

function roundTo10(meters: number): number {
  return Math.max(10, Math.round(meters / 10) * 10);
}

/** 카드에 보여 줄 한 줄 요약. 예) 출발 → 순환 진입 120m → 순환로 520m × 3바퀴 → 출발점 복귀 */
export function formatCourseLapSummary(info: CourseLapInfo): string {
  const approachPart = info.approachMeters >= 10 ? [`순환 진입 ${roundTo10(info.approachMeters)}m`] : [];
  const parts = [
    '출발',
    ...approachPart,
    `순환로 ${roundTo10(info.lapCycleMeters)}m × ${info.lapCount}바퀴`,
    info.approachMeters >= 10 ? '출발점 복귀' : '도착',
  ];
  return parts.join(' → ');
}

/** 지도·음성 안내용 순환 시작/끝 지점 핀 */
export function createLoopStartPin(info: CourseLapInfo): RouteStepPin {
  return {
    id: LOOP_START_PIN_ID,
    kind: 'safe',
    position: info.entry,
    instruction: `여기서부터 순환로입니다. 약 ${roundTo10(info.lapCycleMeters)}미터 순환로를 ${info.lapCount}바퀴 돕니다.`,
    icon: '🔄',
    title: `순환 ${info.lapCount}바퀴`,
    detail: `한 바퀴 약 ${roundTo10(info.lapCycleMeters)}m · 이 지점에서 시작하고 끝나요`,
  };
}

/** 기존 핀 목록에 순환 시작 핀을 한 번만 병합한다. */
export function mergeLoopStartPin(
  pins: readonly RouteStepPin[],
  info: CourseLapInfo | null,
): readonly RouteStepPin[] {
  if (!info) return pins;
  return [...pins.filter((pin) => pin.id !== LOOP_START_PIN_ID), createLoopStartPin(info)];
}
