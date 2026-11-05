/**
 * [편안하개 - PetWalk]
 * 지도 따라가기(헤딩업) 카메라용 진행 방향 계산
 *
 * GPS 점은 걸음 속도에서 흔들리므로
 * 1) 최근 이동 경로에서 일정 거리 이상 떨어진 두 점으로 방향을 잡고
 * 2) 작은 변화는 무시(데드밴드)한 뒤 일부만 반영(지수 평활)해
 * 3) 거의 멈춰 있을 때는 마지막 방향을 유지한다.
 */

import { LonLat } from '../types/route';
import { haversineMeters } from './routeGeometry';

/** 방향 계산에 쓸 최소 이동 거리(m). 이보다 가까운 두 점은 GPS 잡음이 방향을 좌우한다. */
export const HEADING_MIN_SPAN_M = 8;
/** 이 각도 미만의 변화는 무시해 지도가 떨리지 않게 한다. */
export const HEADING_DEADBAND_DEG = 12;
/** 새 방향을 반영하는 비율 (0~1) */
export const HEADING_SMOOTHING = 0.4;
/** 이 속도 미만이면 정지로 보고 방향을 유지한다. */
export const HEADING_MIN_SPEED_KMH = 1.0;

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** a→b 회전 최단 각도 (-180~180, 양수=시계 방향) */
export function shortestDeltaDeg(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function bearingBetween(from: LonLat, to: LonLat): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((to[0] - from[0]) * toRad) * Math.cos(to[1] * toRad);
  const x = Math.cos(from[1] * toRad) * Math.sin(to[1] * toRad)
    - Math.sin(from[1] * toRad) * Math.cos(to[1] * toRad) * Math.cos((to[0] - from[0]) * toRad);
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

/** 최근 이동 경로의 마지막 점과, 그로부터 minSpanM 이상 떨어진 이전 점으로 진행 방위를 구한다. */
export function bearingFromRecentPath(
  coords: readonly (readonly [number, number])[] | undefined,
  minSpanM = HEADING_MIN_SPAN_M,
): number | null {
  if (!coords || coords.length < 2) return null;
  const last = coords[coords.length - 1];
  for (let i = coords.length - 2; i >= 0; i -= 1) {
    if (haversineMeters(coords[i], last) >= minSpanM) return bearingBetween(coords[i], last);
  }
  return null;
}

/**
 * 이전 카메라 방향에 새 목표 방향을 부드럽게 반영한다.
 * - previous 가 없으면 목표를 그대로 쓴다.
 * - target 이 없거나 데드밴드 이내면 이전 값을 유지한다.
 */
export function smoothHeading(
  previous: number | null,
  target: number | null,
  options: { deadbandDeg?: number; smoothing?: number } = {},
): number | null {
  if (target == null) return previous;
  if (previous == null) return normalizeDeg(target);
  const deadband = options.deadbandDeg ?? HEADING_DEADBAND_DEG;
  const smoothing = options.smoothing ?? HEADING_SMOOTHING;
  const delta = shortestDeltaDeg(previous, target);
  if (Math.abs(delta) < deadband) return previous;
  return normalizeDeg(previous + delta * smoothing);
}

/**
 * 따라가기 카메라가 향할 목표 방향.
 * 걷는 중이면 실제 이동 방향, 멈춰 있거나 이동 이력이 부족하면 경로 진행 방향을 쓴다.
 */
export function resolveFollowTargetHeading(options: {
  walkedCoords?: readonly (readonly [number, number])[];
  speedKmH: number;
  routeBearing: number | null;
  hasHeading: boolean;
}): number | null {
  const moving = options.speedKmH >= HEADING_MIN_SPEED_KMH;
  const walkBearing = bearingFromRecentPath(options.walkedCoords);
  if (moving && walkBearing != null) return walkBearing;
  // 아직 방향이 없을 때만 경로 방향으로 시작한다 (정지 중 방향이 바뀌지 않도록)
  if (!options.hasHeading) return walkBearing ?? options.routeBearing;
  return null;
}
