/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 상단 방향 카드용 다음 회전(기동) 계산
 *
 * 30m 초과 직진 구간에서는 골 표시 타일에 직진 화살표(↑)와 함께
 * "N m 직진" 및 다음 회전/도착 지점까지 직진 안내를 제공한다.
 */

import { LonLat, RouteFeatureCollection, RouteStepPin } from '../types/route';
import { haversineMeters } from './routeGeometry';
import {
  buildRoutePath,
  calcBearingDeg,
  pointAtProgress,
  projectProgress,
  RoutePath,
} from './pocketGeometry';

export type ManeuverDirection = 'straight' | 'slightLeft' | 'left' | 'slightRight' | 'right' | 'uturn' | 'arrive';

export interface ManeuverStep {
  readonly direction: ManeuverDirection;
  readonly distanceM: number;
  readonly title: string;
  readonly detail: string;
  readonly pinId: string | null;
}

export interface PocketManeuver {
  readonly current: ManeuverStep;
  readonly following: ManeuverStep | null;
  readonly progressRatio: number;
}

export const MANEUVER_IMMINENT_DISTANCE_M = 30;
const PASSED_TOLERANCE_M = 6;
const BEARING_SAMPLE_M = 12;

export function classifyTurnAngle(deltaDeg: number): ManeuverDirection {
  const delta = ((deltaDeg + 540) % 360) - 180;
  const magnitude = Math.abs(delta);
  if (magnitude < 20) return 'straight';
  if (magnitude >= 150) return 'uturn';
  if (magnitude < 45) return delta > 0 ? 'slightRight' : 'slightLeft';
  return delta > 0 ? 'right' : 'left';
}

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
  return classifyTurnAngle(calcBearingDeg(at, after) - calcBearingDeg(before, at));
}

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

function collectTurns(path: RoutePath, pins: readonly RouteStepPin[]): TurnCandidate[] {
  return pins
    .filter((pin) => pin.kind === 'turn' && pin.id !== 'current-location-pin')
    .map((pin) => ({ pin, progressM: projectProgress(pin.position, path) ?? -1 }))
    .filter((candidate) => candidate.progressM >= 0)
    .sort((a, b) => a.progressM - b.progressM);
}

function toStep(path: RoutePath, progress: number, candidate: TurnCandidate): ManeuverStep {
  const direction = directionFromInstruction(candidate.pin.instruction)
    ?? geometricDirection(path, candidate.progressM);
  return {
    direction,
    distanceM: Math.max(0, candidate.progressM - progress),
    title: maneuverTitle(direction),
    detail: candidate.pin.title ?? candidate.pin.instruction,
    pinId: candidate.pin.id,
  };
}

function arrivalStep(path: RoutePath, progress: number): ManeuverStep {
  return {
    direction: 'arrive',
    distanceM: Math.max(0, path.totalM - progress),
    title: maneuverTitle('arrive'),
    detail: '코스 끝 지점',
    pinId: null,
  };
}

function segmentRatio(progress: number, startM: number, endM: number): number {
  const lengthM = endM - startM;
  if (lengthM <= 0) return 1;
  return Math.max(0, Math.min(1, (progress - startM) / lengthM));
}

export function routeBearingAt(
  position: LonLat | null | undefined,
  route: RouteFeatureCollection,
  lookAheadM = 15,
): number | null {
  if (!position) return null;
  const path = buildRoutePath(route);
  const progress = projectProgress(position, path);
  if (progress == null) return null;
  const from = pointAtProgress(path, Math.min(progress, Math.max(0, path.totalM - lookAheadM)));
  const to = pointAtProgress(path, Math.min(path.totalM, progress + lookAheadM));
  if (haversineMeters(from, to) < 1) return null;
  return calcBearingDeg(from, to);
}

export interface PocketManeuverOptions {
  readonly walkedMeters?: number;
  readonly currentBearing?: number | null;
}

export function computePocketManeuver(
  position: LonLat | null | undefined,
  route: RouteFeatureCollection,
  pins: readonly RouteStepPin[],
  options?: PocketManeuverOptions,
): PocketManeuver | null {
  if (!position) return null;
  const path = buildRoutePath(route);
  const progress = projectProgress(position, path, options);
  if (progress == null) return null;

  const turns = collectTurns(path, pins);
  const arrival = arrivalStep(path, progress);
  const upcomingIndex = turns.findIndex((turn) => turn.progressM > progress - PASSED_TOLERANCE_M);

  if (upcomingIndex < 0) {
    const remainingToGoal = Math.max(0, path.totalM - progress);
    const lastTurnM = turns.at(-1)?.progressM ?? 0;
    const progressRatio = segmentRatio(progress, lastTurnM, path.totalM);

    if (remainingToGoal > MANEUVER_IMMINENT_DISTANCE_M) {
      const straightToGoal: ManeuverStep = {
        direction: 'straight',
        distanceM: remainingToGoal,
        title: '직진',
        detail: '도착 지점까지 직진',
        pinId: null,
      };
      return { current: straightToGoal, following: arrival, progressRatio };
    }
    return { current: arrival, following: null, progressRatio };
  }

  const upcoming = turns[upcomingIndex];
  const following = turns[upcomingIndex + 1];
  const previousTurnM = upcomingIndex > 0 ? turns[upcomingIndex - 1].progressM : 0;
  const turnStep = toStep(path, progress, upcoming);

  if (turnStep.distanceM > MANEUVER_IMMINENT_DISTANCE_M) {
    const straightStep: ManeuverStep = {
      direction: 'straight',
      distanceM: turnStep.distanceM,
      title: '직진',
      detail: `${turnStep.title} 지점까지 직진`,
      pinId: null,
    };
    return {
      current: straightStep,
      following: turnStep,
      progressRatio: segmentRatio(progress, previousTurnM, upcoming.progressM),
    };
  }

  return {
    current: turnStep,
    following: following ? toStep(path, progress, following) : arrival,
    progressRatio: segmentRatio(progress, previousTurnM, upcoming.progressM),
  };
}
