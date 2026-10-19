/**
 * [편안하개 - PetWalk]
 * 시선 해방(Eyes-Free) 음성 안내 판정 엔진 (US-C2, US-D2, Phase 4)
 *
 * 순수 함수 모음: GPS 좌표와 경로/스텝 핀을 비교해 발화 이벤트를 결정한다.
 * - 스텝 핀 30m 전 사전 브리핑 (직전 GPS 점과 현재 점을 잇는 선분 기준이라 측정이 듬성듬성해도 놓치지 않음)
 * - 첫 GPS 수신 시 출발지에서 멀면 "출발지로 이동" 안내
 * - 경로 40m 이상 이탈 경고 (재진입 시 해제)
 * - 핀이 적어도 일정 걸음 거리마다 "경로를 잘 따라가고 있어요" 주기 안내
 * - 코스 끝 지점 도착 안내
 * - 우회 경로 수신 시 우회 안내 문구
 */

import { LonLat, RouteFeatureCollection, RouteStepPin } from '../types/route';
import { haversineMeters, polylineLengthMeters } from './routeGeometry';

export const PRE_BRIEF_DISTANCE_M = 30;
export const OFF_ROUTE_DISTANCE_M = 40;
/** 첫 GPS 수신 시 경로 시작점에서 이 거리보다 멀면 출발지 이동을 안내한다. */
export const START_FAR_DISTANCE_M = 30;
/** 코스 끝 지점 반경 안에 들어오면 도착으로 판정한다. */
export const ARRIVAL_DISTANCE_M = 25;
/** 도착 판정에 필요한 최소 걸음 거리 비율 (출발지=도착지인 순환 코스의 시작 직후 오판정 방지) */
export const ARRIVAL_MIN_PROGRESS_RATIO = 0.7;
export const ARRIVAL_MIN_WALKED_M = 50;
/** 핀 안내가 없어도 이 거리를 걸을 때마다 진행 안내를 한다. */
export const PROGRESS_INTERVAL_M = 200;
/** GPS 제자리 떨림으로 걸음 거리가 부풀려지지 않도록 이보다 짧은 이동은 무시한다. */
export const MIN_STEP_M = 3;

export const OFF_ROUTE_MESSAGE = '경로를 이탈했습니다. 안전하게 안내를 재탐색합니다.';
export const REROUTE_MESSAGE = '전방 턱 구간을 우회하여 새로운 완만길로 안내합니다.';
export const ARRIVAL_MESSAGE = '코스 끝 지점에 도착했습니다. 수고하셨어요! 산책을 마치려면 화면의 종료 버튼을 밀어 주세요.';

export type GuidanceEventKind = 'pre_brief' | 'off_route' | 'to_start' | 'progress' | 'arrival';

export interface GuidanceEvent {
  readonly kind: GuidanceEventKind;
  readonly message: string;
  readonly pinId?: string;
}

export interface GuidanceState {
  readonly announcedPinIds: readonly string[];
  readonly offRouteActive: boolean;
  /** 직전 GPS 점 (선분 판정·걸음 거리 누적용) */
  readonly prevPosition: LonLat | null;
  /** 지금까지 걸은 누적 거리(m) */
  readonly walkedM: number;
  /** 마지막 안내 이후 걸은 거리(m) */
  readonly sinceCueM: number;
  /** 첫 GPS 수신 시 출발지 거리 점검을 이미 마쳤는지 */
  readonly startChecked: boolean;
  readonly arrived: boolean;
}

export const INITIAL_GUIDANCE_STATE: GuidanceState = {
  announcedPinIds: [],
  offRouteActive: false,
  prevPosition: null,
  walkedM: 0,
  sinceCueM: 0,
  startChecked: false,
  arrived: false,
};

/**
 * 우회 경로로 교체할 때의 상태: 핀·이탈·도착 상태는 새로 시작하되
 * 걸은 거리와 직전 위치는 유지하고, 출발지 이동 안내는 다시 하지 않는다.
 */
export function resetGuidanceForNewRoute(state: GuidanceState): GuidanceState {
  return {
    ...INITIAL_GUIDANCE_STATE,
    prevPosition: state.prevPosition,
    walkedM: state.walkedM,
    startChecked: true,
  };
}

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

export function routeStart(route: RouteFeatureCollection): LonLat | null {
  return route.features[0]?.geometry.coordinates[0] ?? null;
}

export function routeEnd(route: RouteFeatureCollection): LonLat | null {
  const last = route.features[route.features.length - 1];
  const coords = last?.geometry.coordinates;
  return coords && coords.length > 0 ? coords[coords.length - 1] : null;
}

function routeLengthMeters(route: RouteFeatureCollection): number {
  return route.features.reduce((sum, f) => sum + polylineLengthMeters(f.geometry.coordinates), 0);
}

/** 직전 점→현재 점 선분이 대상 지점 반경 안을 지났는지 (직전 점이 없으면 현재 점만 검사) */
function passedWithin(target: LonLat, prev: LonLat | null, current: LonLat, radiusM: number): boolean {
  return distanceToSegmentMeters(target, prev ?? current, current) <= radiusM;
}

function collectPreBriefEvents(
  position: LonLat,
  prev: LonLat | null,
  pins: readonly RouteStepPin[],
  announced: readonly string[],
): GuidanceEvent[] {
  return pins
    .filter((pin) => !announced.includes(pin.id))
    .filter((pin) => passedWithin(pin.position, prev, position, PRE_BRIEF_DISTANCE_M))
    .map((pin) => ({ kind: 'pre_brief', message: pin.instruction, pinId: pin.id }));
}

function formatWalked(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}킬로미터`;
  return `${Math.round(meters / 10) * 10}미터`;
}

/**
 * 현재 위치를 평가해 발화할 안내 이벤트와 다음 상태를 반환한다.
 * 경로 좌표가 없으면 이탈·출발지·도착 판정을 하지 않는다.
 */
export function evaluateGuidance(
  position: LonLat,
  route: RouteFeatureCollection,
  pins: readonly RouteStepPin[],
  state: GuidanceState,
): GuidanceResult {
  const prev = state.prevPosition;
  const stepM = prev ? haversineMeters(prev, position) : 0;
  const movedM = stepM >= MIN_STEP_M ? stepM : 0;
  const walkedM = state.walkedM + movedM;

  const events: GuidanceEvent[] = collectPreBriefEvents(position, prev, pins, state.announcedPinIds);
  const announcedPinIds = [
    ...state.announcedPinIds,
    ...events.map((event) => event.pinId as string),
  ];

  const distance = distanceToRouteMeters(position, route);
  const isOffRoute = Number.isFinite(distance) && distance > OFF_ROUTE_DISTANCE_M;

  // 첫 GPS 수신: 출발지에서 멀면 먼저 출발지로 이동하도록 안내 (이 경우 이탈 경고는 중복하지 않음)
  let toStartAnnounced = false;
  if (!state.startChecked) {
    const start = routeStart(route);
    if (start) {
      const toStartM = haversineMeters(position, start);
      if (toStartM > START_FAR_DISTANCE_M) {
        events.push({
          kind: 'to_start',
          message: `출발지까지 약 ${Math.round(toStartM / 10) * 10}미터 떨어져 있어요. 출발지로 이동해 주세요.`,
        });
        toStartAnnounced = true;
      }
    }
  }

  if (isOffRoute && !state.offRouteActive && !toStartAnnounced) {
    events.push({ kind: 'off_route', message: OFF_ROUTE_MESSAGE });
  }

  // 코스 끝 도착 판정 (충분히 걸은 뒤, 경로 위에서만)
  let arrived = state.arrived;
  const end = routeEnd(route);
  if (!arrived && end && !isOffRoute) {
    const minWalked = Math.max(ARRIVAL_MIN_WALKED_M, routeLengthMeters(route) * ARRIVAL_MIN_PROGRESS_RATIO);
    if (walkedM >= minWalked && passedWithin(end, prev, position, ARRIVAL_DISTANCE_M)) {
      arrived = true;
      events.push({ kind: 'arrival', message: ARRIVAL_MESSAGE });
    }
  }

  // 핀이 적어도 일정 걸음 거리마다 진행 안내
  let sinceCueM = state.sinceCueM + movedM;
  if (events.length > 0) {
    sinceCueM = 0;
  } else if (!isOffRoute && sinceCueM >= PROGRESS_INTERVAL_M) {
    events.push({
      kind: 'progress',
      message: `경로를 잘 따라가고 있어요. 지금까지 ${formatWalked(walkedM)} 걸었어요.`,
    });
    sinceCueM = 0;
  }

  return {
    events,
    nextState: {
      announcedPinIds,
      offRouteActive: isOffRoute,
      prevPosition: position,
      walkedM,
      sinceCueM,
      startChecked: true,
      arrived,
    },
  };
}
