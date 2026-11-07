/**
 * [편안하개 - PetWalk]
 * 경로 이탈 시 코스 합류 지점 계산 (정점이 아닌 선분 투영 기반)
 *
 * - 현재 위치를 코스의 모든 선분에 투영해 "합류 후보"를 모은다.
 * - 순환 코스(출발점=도착점, 여러 바퀴)는 같은 위치가 여러 번 나오므로,
 *   마지막으로 코스 위에 있던 진행 거리(progressHintM)보다 앞쪽 후보를 우선해
 *   "시작점으로 되돌아가는" 대신 코스를 이어서 안내한다.
 */

import { LonLat } from '../types/route';
import { haversineMeters } from './routeGeometry';

/** 진행 거리 힌트보다 이만큼 뒤쪽 후보까지는 전방으로 취급한다 (GPS 흔들림 허용). */
export const REJOIN_BACKTRACK_TOLERANCE_M = 30;
/** 전방 후보가 전체 최근접 후보보다 이 거리 이상 멀면 최근접 후보를 쓴다. */
export const REJOIN_FORWARD_SLACK_M = 60;
/** 전방 후보 중 최근접과 이 거리 이내로 비슷하면 가장 앞(진행 거리가 작은) 후보를 쓴다. */
const SAME_PLACE_TOLERANCE_M = 15;

const METERS_PER_DEG_LAT = 110540;
const METERS_PER_DEG_LON = 111320;

export interface RouteProjectionCandidate {
  /** 코스 선분 위의 투영점 */
  readonly point: LonLat;
  /** 투영점 다음에 이어지는 코스 정점의 인덱스 (이어 붙일 나머지 경로 시작점) */
  readonly nextIndex: number;
  /** 코스 시작부터 투영점까지의 누적 거리(m) */
  readonly progressM: number;
  /** 현재 위치에서 투영점까지의 거리(m) */
  readonly distanceM: number;
}

/** 현재 위치를 모든 선분에 투영한 후보 목록 (여러 선분 배열은 이어 붙여 누적 거리를 계산) */
export function collectRouteProjections(
  lines: readonly (readonly LonLat[])[],
  current: LonLat,
): RouteProjectionCandidate[] {
  const candidates: RouteProjectionCandidate[] = [];
  const cosLat = Math.cos((current[1] * Math.PI) / 180);
  let traversedM = 0;

  for (const coords of lines) {
    for (let index = 1; index < coords.length; index += 1) {
      const a = coords[index - 1];
      const b = coords[index];
      const ax = (a[0] - current[0]) * METERS_PER_DEG_LON * cosLat;
      const ay = (a[1] - current[1]) * METERS_PER_DEG_LAT;
      const bx = (b[0] - current[0]) * METERS_PER_DEG_LON * cosLat;
      const by = (b[1] - current[1]) * METERS_PER_DEG_LAT;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      const ratio = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
      const segmentM = haversineMeters(a, b);
      candidates.push({
        point: [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio],
        nextIndex: index,
        progressM: traversedM + ratio * segmentM,
        distanceM: Math.hypot(ax + ratio * dx, ay + ratio * dy),
      });
      traversedM += segmentM;
    }
  }
  return candidates;
}

function nearestCandidate(candidates: readonly RouteProjectionCandidate[]): RouteProjectionCandidate {
  return candidates.reduce((best, item) => (item.distanceM < best.distanceM ? item : best));
}

/**
 * 후보 중 합류 지점을 고른다.
 * 진행 거리 힌트가 있으면 "지금까지 온 곳보다 앞쪽에서 가장 가까운 지점"을 우선한다.
 */
export function selectRouteProjection(
  candidates: readonly RouteProjectionCandidate[],
  progressHintM?: number | null,
): RouteProjectionCandidate | null {
  if (candidates.length === 0) return null;
  const nearest = nearestCandidate(candidates);
  if (progressHintM == null || !Number.isFinite(progressHintM)) return nearest;

  const forward = candidates.filter((item) => item.progressM >= progressHintM - REJOIN_BACKTRACK_TOLERANCE_M);
  if (forward.length === 0) return nearest;

  const nearestForward = nearestCandidate(forward);
  if (nearestForward.distanceM > nearest.distanceM + REJOIN_FORWARD_SLACK_M) return nearest;

  // 순환 코스의 같은 자리(여러 바퀴)는 가장 먼저 만나는(앞쪽) 지점을 선택한다.
  const samePlace = forward.filter((item) => item.distanceM <= nearestForward.distanceM + SAME_PLACE_TOLERANCE_M);
  return samePlace.reduce((first, item) => (item.progressM < first.progressM ? item : first), samePlace[0]);
}

export interface RejoinPath {
  /** 현재 위치 → 합류 지점 → 코스의 남은 구간 */
  readonly coordinates: [number, number][];
  /** 합류 지점이 코스 시작에서 몇 m 지점인지 */
  readonly joinProgressM: number;
  /** 현재 위치에서 합류 지점까지 직선 거리(m) */
  readonly joinDistanceM: number;
}

/** 현재 위치에서 코스로 합류한 뒤 남은 코스를 이어 가는 경로를 만든다. */
export function buildRejoinPath(
  courseCoords: readonly LonLat[],
  current: LonLat,
  progressHintM?: number | null,
): RejoinPath | null {
  if (courseCoords.length < 2) return null;
  const join = selectRouteProjection(collectRouteProjections([courseCoords], current), progressHintM);
  if (!join) return null;

  const rest = courseCoords.slice(join.nextIndex).map((c) => [c[0], c[1]] as [number, number]);
  // 투영점이 다음 정점과 사실상 같으면 중복 점을 만들지 않는다.
  if (rest.length > 0 && haversineMeters(join.point, rest[0]) < 1) {
    rest.shift();
  }
  return {
    coordinates: [[current[0], current[1]], [join.point[0], join.point[1]], ...rest],
    joinProgressM: join.progressM,
    joinDistanceM: join.distanceM,
  };
}

const MIN_REMAINING_WALK_MINUTES = 5;
const MIN_REMAINING_DISTANCE_M = 180;
const DETOUR_FACTOR = 1.35;

/**
 * 목표 산책 시간과 경과 시간(또는 이미 걸은 거리)을 바탕으로 남은 목표 산책 거리(m)를 계산한다.
 */
export function calculateRemainingWalkDistanceM(params: {
  readonly targetMinutes?: number | null;
  readonly elapsedSec?: number;
  readonly speedKmH?: number;
  readonly routeLengthM?: number;
  readonly walkedM?: number;
}): number {
  const speed = params.speedKmH && params.speedKmH > 0 ? params.speedKmH : 2.8;
  if (params.targetMinutes && params.targetMinutes > 0) {
    const elapsedMin = Math.max(0, (params.elapsedSec ?? 0) / 60);
    const remainingMin = Math.max(MIN_REMAINING_WALK_MINUTES, params.targetMinutes - elapsedMin);
    return Math.max(MIN_REMAINING_DISTANCE_M, Math.round((remainingMin / 60) * speed * 1000));
  }
  if (params.routeLengthM && params.routeLengthM > 0) {
    return Math.max(MIN_REMAINING_DISTANCE_M, Math.round(params.routeLengthM - (params.walkedM ?? 0)));
  }
  return Math.round((15 / 60) * speed * 1000);
}

function offsetLonLat(origin: LonLat, bearingDeg: number, distanceM: number): [number, number] {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceM * Math.cos(rad)) / METERS_PER_DEG_LAT;
  const dLon = (distanceM * Math.sin(rad)) / (METERS_PER_DEG_LON * Math.cos((origin[1] * Math.PI) / 180));
  return [Number((origin[0] + dLon).toFixed(6)), Number((origin[1] + dLat).toFixed(6))];
}

/**
 * [방법 A 오프라인 폴백] 현위치 기반 산책 시 현재(벗어난) 위치에서 남은 거리를 소화하며
 * 원래 출발지(destination)로 돌아오는 순환 복귀 좌표열을 생성한다.
 */
export function buildLocalRegeneratedReturnPath(
  current: LonLat,
  destination: LonLat,
  remainingDistanceM?: number,
): [number, number][] {
  const start: [number, number] = [current[0], current[1]];
  const end: [number, number] = [destination[0], destination[1]];
  const directM = haversineMeters([start[1], start[0]], [end[1], end[0]]);
  const targetM = remainingDistanceM && remainingDistanceM > 0
    ? remainingDistanceM
    : Math.max(300, directM * 1.5);

  if (targetM <= Math.max(directM * DETOUR_FACTOR, MIN_REMAINING_DISTANCE_M)) {
    return [start, end];
  }

  const geomBudgetM = targetM / DETOUR_FACTOR;
  const dLat = end[1] - start[1];
  const dLon = (end[0] - start[0]) * Math.cos((start[1] * Math.PI) / 180);
  const bearingCd = directM > 1
    ? ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360
    : 45;
  const perpBearing = (bearingCd + 90) % 360;
  const lateralM = Math.min(Math.max(45, (geomBudgetM - directM * 0.6) / 1.8), 1000);

  const p1: LonLat = [start[0] + (end[0] - start[0]) / 3, start[1] + (end[1] - start[1]) / 3];
  const p2: LonLat = [start[0] + ((end[0] - start[0]) * 2) / 3, start[1] + ((end[1] - start[1]) * 2) / 3];
  const w1 = offsetLonLat(p1, perpBearing, lateralM);
  const w2 = offsetLonLat(p2, perpBearing, lateralM);
  return [start, w1, w2, end];
}
