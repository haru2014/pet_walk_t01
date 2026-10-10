/**
 * [편안하개 - PetWalk]
 * 시선 해방(Eyes-Free) 음성 안내 판정 엔진 (US-C2, US-D2, Phase 4)
 *
 * 순수 함수 모음: GPS 좌표와 경로/스텝 핀을 비교해 발화 이벤트를 결정한다.
 * - 스텝 핀 30m 전 사전 브리핑
 * - 경로 40m 이상 이탈 경고 (재진입 시 해제)
 * - 우회 경로 수신 시 우회 안내 문구
 */

import { LonLat, RouteFeatureCollection, RouteStepPin } from '../types/route';
import { haversineMeters } from './routeGeometry';

export const PRE_BRIEF_DISTANCE_M = 30;
export const OFF_ROUTE_DISTANCE_M = 40;
export const OFF_ROUTE_MESSAGE = '경로를 이탈했습니다. 안전하게 안내를 재탐색합니다.';
export const REROUTE_MESSAGE = '전방 턱 구간을 우회하여 새로운 완만길로 안내합니다.';

export type GuidanceEventKind = 'pre_brief' | 'off_route';

export interface GuidanceEvent {
  readonly kind: GuidanceEventKind;
  readonly message: string;
  readonly pinId?: string;
}

export interface GuidanceState {
  readonly announcedPinIds: readonly string[];
  readonly offRouteActive: boolean;
}

export const INITIAL_GUIDANCE_STATE: GuidanceState = {
  announcedPinIds: [],
  offRouteActive: false,
};

export interface GuidanceResult {
  readonly events: readonly GuidanceEvent[];
  readonly nextState: GuidanceState;
}

const METERS_PER_DEG_LAT = 110540;
const METERS_PER_DEG_LON = 111320;

/** 기준점을 원점으로 하는 평면 근사 좌표(m)로 변환 */
function toLocalMeters(origin: LonLat, point: LonLat): readonly [number, number] {
  const cosLat = Math.cos((origin[1] * Math.PI) / 180);
  return [
    (point[0] - origin[0]) * METERS_PER_DEG_LON * cosLat,
    (point[1] - origin[1]) * METERS_PER_DEG_LAT,
  ];
}

function distanceToSegmentMeters(point: LonLat, a: LonLat, b: LonLat): number {
  const [ax, ay] = toLocalMeters(point, a);
  const [bx, by] = toLocalMeters(point, b);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** 점에서 경로 전체(모든 세그먼트)까지의 최단 거리(m) */
export function distanceToRouteMeters(point: LonLat, route: RouteFeatureCollection): number {
  let min = Number.POSITIVE_INFINITY;
  for (const feature of route.features) {
    const coords = feature.geometry.coordinates;
    for (let i = 1; i < coords.length; i += 1) {
      min = Math.min(min, distanceToSegmentMeters(point, coords[i - 1], coords[i]));
    }
  }
  return min;
}

function collectPreBriefEvents(
  position: LonLat,
  pins: readonly RouteStepPin[],
  announced: readonly string[],
): GuidanceEvent[] {
  return pins
    .filter((pin) => !announced.includes(pin.id))
    .filter((pin) => haversineMeters(position, pin.position) <= PRE_BRIEF_DISTANCE_M)
    .map((pin) => ({ kind: 'pre_brief', message: pin.instruction, pinId: pin.id }));
}

/**
 * 현재 위치를 평가해 발화할 안내 이벤트와 다음 상태를 반환한다.
 * 경로 좌표가 없으면 이탈 판정을 하지 않는다.
 */
export function evaluateGuidance(
  position: LonLat,
  route: RouteFeatureCollection,
  pins: readonly RouteStepPin[],
  state: GuidanceState,
): GuidanceResult {
  const events: GuidanceEvent[] = collectPreBriefEvents(position, pins, state.announcedPinIds);
  const announcedPinIds = [
    ...state.announcedPinIds,
    ...events.map((event) => event.pinId as string),
  ];

  const distance = distanceToRouteMeters(position, route);
  const isOffRoute = Number.isFinite(distance) && distance > OFF_ROUTE_DISTANCE_M;
  if (isOffRoute && !state.offRouteActive) {
    events.push({ kind: 'off_route', message: OFF_ROUTE_MESSAGE });
  }

  return { events, nextState: { announcedPinIds, offRouteActive: isOffRoute } };
}
