/**
 * [편안하개 - PetWalk]
 * 시선 해방(Eyes-Free) 음성 안내 판정 엔진 (US-C2, US-D2, Phase 4)
 *
 * 순수 함수 모음: GPS 좌표와 경로/스텝 핀을 비교해 발화 이벤트를 결정한다.
 * - 회전 핀은 5m 전, 일반 스텝 핀은 30m 전 사전 브리핑
 *   (직전 GPS 점과 현재 점을 잇는 선분 기준이라 측정이 듬성듬성해도 놓치지 않음)
 * - 첫 GPS 수신 시 출발지에서 멀면 "출발지로 이동" 안내
 * - 경로 40m 이상 이탈 경고 (재진입 시 해제)
 * - 핀이 적어도 일정 걸음 거리마다 "경로를 잘 따라가고 있어요" 주기 안내
 * - 코스 끝 지점 도착 안내
 * - 우회 경로 수신 시 우회 안내 문구
 */

import { LonLat, RouteFeatureCollection, RouteStepPin } from '../types/route';
import { haversineMeters, polylineLengthMeters } from './routeGeometry';

export const PRE_BRIEF_DISTANCE_M = 30;
export const TURN_PRE_BRIEF_DISTANCE_M = 5;
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
  readonly pinIds?: readonly string[];
  readonly category?: 'turn';
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
  const last = route.features.at(-1);
  const coords = last?.geometry.coordinates;
  return coords && coords.length > 0 ? (coords.at(-1) ?? null) : null;
}

function routeLengthMeters(route: RouteFeatureCollection): number {
  return route.features.reduce((sum, f) => sum + polylineLengthMeters(f.geometry.coordinates), 0);
}

/** 직전 점→현재 점 선분이 대상 지점 반경 안을 지났는지 (직전 점이 없으면 현재 점만 검사) */
function passedWithin(target: LonLat, prev: LonLat | null, current: LonLat, radiusM: number): boolean {
  return distanceToSegmentMeters(target, prev ?? current, current) <= radiusM;
}

interface RouteProjection {
  readonly progressM: number;
  readonly distanceM: number;
}

/** 경로 전체에서 가장 가까운 점과 출발점부터의 진행 거리를 계산한다. */
function projectOntoRoute(position: LonLat, route: RouteFeatureCollection): RouteProjection | null {
  let traversedM = 0;
  let closest: RouteProjection | null = null;

  for (const feature of route.features) {
    const coords = feature.geometry.coordinates;
    for (let index = 1; index < coords.length; index += 1) {
      const start = coords[index - 1];
      const end = coords[index];
      const [ax, ay] = toLocalMeters(position, start);
      const [bx, by] = toLocalMeters(position, end);
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      const ratio = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
      const segmentLengthM = haversineMeters(start, end);
      const projection = {
        progressM: traversedM + ratio * segmentLengthM,
        distanceM: Math.hypot(ax + ratio * dx, ay + ratio * dy),
      };
      if (!closest || projection.distanceM < closest.distanceM) closest = projection;
      traversedM += segmentLengthM;
    }
  }

  return closest;
}

function turnInstruction(instruction: string): string | null {
  const match = instruction.match(/유턴|(?:크게\s*)?(?:좌회전|우회전)/);
  return match?.[0] ?? null;
}

function formatTurnBriefing(turns: readonly string[]): string {
  const [first, ...following] = turns;
  const firstInstruction = `${first}하십시오.`;
  if (following.length === 0) return `${TURN_PRE_BRIEF_DISTANCE_M}미터 전방에서 ${firstInstruction}`;
  return `${TURN_PRE_BRIEF_DISTANCE_M}미터 전방에서 ${firstInstruction} 이어서 ${following.map((turn) => `${turn}하십시오.`).join(' ')}`;
}

interface CollectedPreBriefs {
  readonly events: GuidanceEvent[];
  readonly consumedPinIds: string[];
}

function collectPreBriefEvents(
  position: LonLat,
  prev: LonLat | null,
  route: RouteFeatureCollection,
  pins: readonly RouteStepPin[],
  announced: readonly string[],
): CollectedPreBriefs {
  const events: GuidanceEvent[] = [];
  const consumedPinIds: string[] = [];
  const routeProgress = projectOntoRoute(position, route)?.progressM;
  const turnPins = pins.flatMap((pin) => {
    const turn = turnInstruction(pin.instruction);
    if (!turn || announced.includes(pin.id)) return [];
    const projection = projectOntoRoute(pin.position, route);
    return projection ? [{ pin, turn, progressM: projection.progressM }] : [];
  }).sort((left, right) => left.progressM - right.progressM);

  // 지난 회전 핀은 소비 처리해 GPS가 흔들려도 뒤늦게 다시 안내하지 않는다.
  if (routeProgress != null) {
    turnPins.forEach(({ pin, progressM }) => {
      if (routeProgress - progressM > TURN_PRE_BRIEF_DISTANCE_M) consumedPinIds.push(pin.id);
    });
  }

  const nextTurnIndex = turnPins.findIndex(({ pin, progressM }) =>
    !consumedPinIds.includes(pin.id) && (routeProgress == null || progressM >= routeProgress - TURN_PRE_BRIEF_DISTANCE_M));
  if (nextTurnIndex >= 0) {
    const nextTurns = [turnPins[nextTurnIndex]];
    for (let index = nextTurnIndex + 1; index < turnPins.length; index += 1) {
      if (turnPins[index].progressM - nextTurns[0].progressM > TURN_PRE_BRIEF_DISTANCE_M) break;
      nextTurns.push(turnPins[index]);
    }

    const firstTurn = nextTurns[0];
    const distanceToTurnM = routeProgress == null
      ? haversineMeters(position, firstTurn.pin.position)
      : firstTurn.progressM - routeProgress;
    const crossedTurnSincePreviousFix = routeProgress != null && prev != null
      ? (projectOntoRoute(prev, route)?.progressM ?? routeProgress) < firstTurn.progressM
        && routeProgress >= firstTurn.progressM - TURN_PRE_BRIEF_DISTANCE_M
      : false;
    const closeToTurn = passedWithin(firstTurn.pin.position, prev, position, TURN_PRE_BRIEF_DISTANCE_M);
    if (distanceToTurnM <= TURN_PRE_BRIEF_DISTANCE_M
      && distanceToTurnM >= -TURN_PRE_BRIEF_DISTANCE_M
      && (distanceToTurnM >= 0 || crossedTurnSincePreviousFix || closeToTurn)) {
      const groupedIds = nextTurns.map(({ pin }) => pin.id);
      consumedPinIds.push(...groupedIds);
      events.push({
        kind: 'pre_brief',
        category: 'turn',
        message: formatTurnBriefing(nextTurns.map(({ turn }) => turn)),
        pinId: firstTurn.pin.id,
        pinIds: groupedIds,
      });
    }
  }

  pins.forEach((pin) => {
    if (announced.includes(pin.id) || consumedPinIds.includes(pin.id) || turnInstruction(pin.instruction)) return;
    if (passedWithin(pin.position, prev, position, PRE_BRIEF_DISTANCE_M)) {
      events.push({ kind: 'pre_brief', message: pin.instruction, pinId: pin.id });
      consumedPinIds.push(pin.id);
    }
  });

  return { events, consumedPinIds };
}

function formatWalked(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}킬로미터`;
  return `${Math.round(meters / 10) * 10}미터`;
}

function checkStartFarDeparture(
  position: LonLat,
  route: RouteFeatureCollection,
  startChecked: boolean,
): { event?: GuidanceEvent; toStartAnnounced: boolean } {
  if (startChecked) return { toStartAnnounced: false };
  const start = routeStart(route);
  if (!start) return { toStartAnnounced: false };

  const toStartM = haversineMeters(position, start);
  if (toStartM <= START_FAR_DISTANCE_M) return { toStartAnnounced: false };

  return {
    event: {
      kind: 'to_start',
      message: `출발지까지 약 ${Math.round(toStartM / 10) * 10}미터 떨어져 있어요. 출발지로 이동해 주세요.`,
    },
    toStartAnnounced: true,
  };
}

function checkCourseArrival(
  position: LonLat,
  prev: LonLat | null,
  route: RouteFeatureCollection,
  walkedM: number,
  alreadyArrived: boolean,
  isOffRoute: boolean,
): { event?: GuidanceEvent; arrived: boolean } {
  if (alreadyArrived || isOffRoute) return { arrived: alreadyArrived };
  const end = routeEnd(route);
  if (!end) return { arrived: false };

  const minWalked = Math.max(ARRIVAL_MIN_WALKED_M, routeLengthMeters(route) * ARRIVAL_MIN_PROGRESS_RATIO);
  if (walkedM >= minWalked && passedWithin(end, prev, position, ARRIVAL_DISTANCE_M)) {
    return {
      arrived: true,
      event: { kind: 'arrival', message: ARRIVAL_MESSAGE },
    };
  }
  return { arrived: false };
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

  const preBriefs = collectPreBriefEvents(position, prev, route, pins, state.announcedPinIds);
  const events: GuidanceEvent[] = [...preBriefs.events];
  const announcedPinIds = [
    ...state.announcedPinIds,
    ...preBriefs.consumedPinIds,
  ];

  const distance = distanceToRouteMeters(position, route);
  const isOffRoute = Number.isFinite(distance) && distance > OFF_ROUTE_DISTANCE_M;

  const startCheck = checkStartFarDeparture(position, route, state.startChecked);
  if (startCheck.event) {
    events.push(startCheck.event);
  }

  if (isOffRoute && !state.offRouteActive && !startCheck.toStartAnnounced) {
    events.push({ kind: 'off_route', message: OFF_ROUTE_MESSAGE });
  }

  const arrivalCheck = checkCourseArrival(position, prev, route, walkedM, state.arrived, isOffRoute);
  if (arrivalCheck.event) {
    events.push(arrivalCheck.event);
  }

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
      arrived: arrivalCheck.arrived,
    },
  };
}
