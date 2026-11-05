/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 상단 방향 카드용 다음 회전(기동) 계산
 *
 * 순수 함수: 현재 위치를 경로에 투영해 아직 지나지 않은 다음 회전 핀까지의
 * 남은 거리와 방향(좌/우/직진/유턴)을 구한다. 핀 문구에 방향 단어가 없으면
 * 핀 전후 경로의 진행 방위 차이로 방향을 추정한다.
 */

import { LonLat, RouteFeatureCollection, RouteStepPin } from '../types/route';
import { haversineMeters } from './routeGeometry';

export type ManeuverDirection = 'straight' | 'slightLeft' | 'left' | 'slightRight' | 'right' | 'uturn' | 'arrive';

export interface ManeuverStep {
  readonly direction: ManeuverDirection;
  /** 현재 위치에서 해당 지점까지 경로상 남은 거리(m) */
  readonly distanceM: number;
  /** 카드 제목 (예: "우회전", "도착") */
  readonly title: string;
  /** 핀 원문 안내 (없으면 빈 문자열) */
  readonly detail: string;
  readonly pinId: string | null;
}

export interface PocketManeuver {
  readonly current: ManeuverStep;
  readonly following: ManeuverStep | null;
  /** 직전 기동 지점(또는 출발점)부터 현재 기동 지점까지 진행률 0~1 */
  readonly progressRatio: number;
}

/** 이 거리 이내면 "곧 회전" 상태로 강조한다. */
export const MANEUVER_IMMINENT_DISTANCE_M = 30;
/** 회전 지점을 이만큼 지나면 다음 회전으로 넘어간다. */
const PASSED_TOLERANCE_M = 6;
/** 방위 추정에 사용할 핀 전후 샘플 거리 */
const BEARING_SAMPLE_M = 12;

interface RoutePath {
  readonly coords: readonly LonLat[];
  readonly cumulativeM: readonly number[];
  readonly totalM: number;
}

const METERS_PER_DEG_LAT = 110540;
const METERS_PER_DEG_LON = 111320;

function buildPath(route: RouteFeatureCollection): RoutePath {
  const coords: LonLat[] = [];
  for (const feature of route.features) {
    for (const point of feature.geometry.coordinates) {
      const last = coords[coords.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) coords.push(point);
    }
  }
  const cumulativeM: number[] = [0];
  for (let i = 1; i < coords.length; i += 1) {
    cumulativeM.push(cumulativeM[i - 1] + haversineMeters(coords[i - 1], coords[i]));
  }
  return { coords, cumulativeM, totalM: cumulativeM[cumulativeM.length - 1] ?? 0 };
}

/** 점을 경로에 투영해 출발점 기준 진행 거리(m)를 반환한다. */
function projectProgress(point: LonLat, path: RoutePath): number | null {
  if (path.coords.length < 2) return null;
  const cosLat = Math.cos((point[1] * Math.PI) / 180);
  let best: { progress: number; distSq: number } | null = null;
  for (let i = 1; i < path.coords.length; i += 1) {
    const a = path.coords[i - 1];
    const b = path.coords[i];
    const ax = (a[0] - point[0]) * METERS_PER_DEG_LON * cosLat;
    const ay = (a[1] - point[1]) * METERS_PER_DEG_LAT;
    const dx = (b[0] - a[0]) * METERS_PER_DEG_LON * cosLat;
    const dy = (b[1] - a[1]) * METERS_PER_DEG_LAT;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const distSq = px * px + py * py;
    if (!best || distSq < best.distSq) {
      const segmentM = path.cumulativeM[i] - path.cumulativeM[i - 1];
      best = { progress: path.cumulativeM[i - 1] + t * segmentM, distSq };
    }
  }
  return best?.progress ?? null;
}

function pointAtProgress(path: RoutePath, progressM: number): LonLat {
  const clamped = Math.max(0, Math.min(path.totalM, progressM));
  for (let i = 1; i < path.coords.length; i += 1) {
    if (path.cumulativeM[i] >= clamped) {
      const segmentM = path.cumulativeM[i] - path.cumulativeM[i - 1];
      const t = segmentM === 0 ? 0 : (clamped - path.cumulativeM[i - 1]) / segmentM;
      const a = path.coords[i - 1];
      const b = path.coords[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return path.coords[path.coords.length - 1];
}

function bearingDeg(from: LonLat, to: LonLat): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((to[0] - from[0]) * toRad) * Math.cos(to[1] * toRad);
  const x = Math.cos(from[1] * toRad) * Math.sin(to[1] * toRad)
    - Math.sin(from[1] * toRad) * Math.cos(to[1] * toRad) * Math.cos((to[0] - from[0]) * toRad);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** 진행 방위 변화량(-180~180, 양수=오른쪽)을 방향으로 분류한다. */
export function classifyTurnAngle(deltaDeg: number): ManeuverDirection {
  const delta = ((deltaDeg + 540) % 360) - 180;
  const magnitude = Math.abs(delta);
  if (magnitude < 20) return 'straight';
  if (magnitude >= 150) return 'uturn';
  if (magnitude < 45) return delta > 0 ? 'slightRight' : 'slightLeft';
  return delta > 0 ? 'right' : 'left';
}

/** 핀 문구에 명시된 방향 단어를 우선 사용한다. */
export function directionFromInstruction(instruction: string): ManeuverDirection | null {
  if (/유턴/.test(instruction)) return 'uturn';
  if (/좌회전/.test(instruction)) return 'left';
  if (/우회전/.test(instruction)) return 'right';
  if (/직진/.test(instruction)) return 'straight';
  return null;
}

const DIRECTION_TITLES: Record<ManeuverDirection, string> = {
  straight: '직진',
  slightLeft: '왼쪽 방향',
  left: '좌회전',
  slightRight: '오른쪽 방향',
  right: '우회전',
  uturn: '유턴',
  arrive: '도착',
};

export function maneuverTitle(direction: ManeuverDirection): string {
  return DIRECTION_TITLES[direction];
}

function geometricDirection(path: RoutePath, pinProgressM: number): ManeuverDirection {
  const before = pointAtProgress(path, pinProgressM - BEARING_SAMPLE_M);
  const at = pointAtProgress(path, pinProgressM);
  const after = pointAtProgress(path, pinProgressM + BEARING_SAMPLE_M);
  if (haversineMeters(before, at) < 1 || haversineMeters(at, after) < 1) return 'straight';
  return classifyTurnAngle(bearingDeg(at, after) - bearingDeg(before, at));
}

/** 표시용 거리: 50m 미만 5m 단위, 1km 미만 10m 단위, 그 이상 0.1km 단위 */
export function formatManeuverDistance(distanceM: number): { value: string; unit: string } {
  const meters = Math.max(0, distanceM);
  if (meters >= 1000) return { value: (Math.round(meters / 100) / 10).toFixed(1), unit: 'km' };
  if (meters < 50) return { value: String(Math.round(meters / 5) * 5), unit: 'm' };
  return { value: String(Math.round(meters / 10) * 10), unit: 'm' };
}

interface TurnCandidate {
  readonly pin: RouteStepPin;
  readonly progressM: number;
}

/** 현재 위치에서 경로 진행 방향(앞쪽 lookAheadM 지점까지의 방위). 경로가 없으면 null */
export function routeBearingAt(
  position: LonLat | null | undefined,
  route: RouteFeatureCollection,
  lookAheadM = 15,
): number | null {
  if (!position) return null;
  const path = buildPath(route);
  const progress = projectProgress(position, path);
  if (progress == null) return null;
  const from = pointAtProgress(path, Math.min(progress, Math.max(0, path.totalM - lookAheadM)));
  const to = pointAtProgress(path, Math.min(path.totalM, progress + lookAheadM));
  if (haversineMeters(from, to) < 1) return null;
  return bearingDeg(from, to);
}

export function computePocketManeuver(
  position: LonLat | null | undefined,
  route: RouteFeatureCollection,
  pins: readonly RouteStepPin[],
): PocketManeuver | null {
  if (!position) return null;
  const path = buildPath(route);
  const progress = projectProgress(position, path);
  if (progress == null) return null;

  const turns: TurnCandidate[] = pins
    .filter((pin) => pin.kind === 'turn' && pin.id !== 'current-location-pin')
    .map((pin) => ({ pin, progressM: projectProgress(pin.position, path) ?? -1 }))
    .filter((candidate) => candidate.progressM >= 0)
    .sort((a, b) => a.progressM - b.progressM);

  const toStep = (candidate: TurnCandidate): ManeuverStep => {
    const direction = directionFromInstruction(candidate.pin.instruction)
      ?? geometricDirection(path, candidate.progressM);
    return {
      direction,
      distanceM: Math.max(0, candidate.progressM - progress),
      title: maneuverTitle(direction),
      detail: candidate.pin.title ?? candidate.pin.instruction,
      pinId: candidate.pin.id,
    };
  };
  const arrival: ManeuverStep = {
    direction: 'arrive',
    distanceM: Math.max(0, path.totalM - progress),
    title: maneuverTitle('arrive'),
    detail: '코스 끝 지점',
    pinId: null,
  };

  const upcomingIndex = turns.findIndex((turn) => turn.progressM > progress - PASSED_TOLERANCE_M);
  const upcoming = upcomingIndex >= 0 ? turns[upcomingIndex] : null;
  const following = upcomingIndex >= 0 ? turns[upcomingIndex + 1] ?? null : null;

  const segmentStartM = upcomingIndex > 0 ? turns[upcomingIndex - 1].progressM : 0;
  const segmentEndM = upcoming ? upcoming.progressM : path.totalM;
  const segmentM = segmentEndM - segmentStartM;
  const progressRatio = segmentM <= 0 ? 1 : Math.max(0, Math.min(1, (progress - segmentStartM) / segmentM));

  return {
    current: upcoming ? toStep(upcoming) : arrival,
    following: upcoming ? (following ? toStep(following) : arrival) : null,
    progressRatio,
  };
}
