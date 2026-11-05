/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 경로 기하 및 방위 계산 보조 모듈
 */

import { LonLat, RouteFeatureCollection } from '../types/route';
import { haversineMeters } from './routeGeometry';

export { haversineMeters };

export interface RoutePath {
  readonly coords: readonly LonLat[];
  readonly cumulativeM: readonly number[];
  readonly totalM: number;
}

const METERS_PER_DEG_LAT = 110540;
const METERS_PER_DEG_LON = 111320;

export function buildRoutePath(route: RouteFeatureCollection): RoutePath {
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

export function calcBearingDeg(from: LonLat, to: LonLat): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((to[0] - from[0]) * toRad) * Math.cos(to[1] * toRad);
  const x = Math.cos(from[1] * toRad) * Math.sin(to[1] * toRad)
    - Math.sin(from[1] * toRad) * Math.cos(to[1] * toRad) * Math.cos((to[0] - from[0]) * toRad);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function pointAtProgress(path: RoutePath, progressM: number): LonLat {
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

/** 점을 경로에 투영해 출발점 기준 진행 거리(m)를 반환한다. 루프 코스 끝점 튐 및 역방향 방지 */
export function projectProgress(
  point: LonLat,
  path: RoutePath,
  options?: { walkedMeters?: number; currentBearing?: number | null },
): number | null {
  if (path.coords.length < 2) return null;
  const cosLat = Math.cos((point[1] * Math.PI) / 180);
  const walkedM = options?.walkedMeters;
  const currentBearing = options?.currentBearing;

  let best: { progress: number; score: number } | null = null;
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

    const segmentM = path.cumulativeM[i] - path.cumulativeM[i - 1];
    const candidateProgress = path.cumulativeM[i - 1] + t * segmentM;

    let penalty = 0;
    if (currentBearing != null && segmentM > 1) {
      const segBearing = calcBearingDeg(a, b);
      const angleDiff = Math.abs(((currentBearing - segBearing + 540) % 360) - 180);
      if (angleDiff > 90) penalty += 100 * 100;
    }

    if (walkedM != null && path.totalM > 200) {
      if (walkedM < 500 && candidateProgress > path.totalM * 0.75) {
        penalty += 250 * 250;
      }
      const progressDiff = Math.abs(candidateProgress - walkedM);
      penalty += Math.min(60 * 60, (progressDiff * 0.1) ** 2);
    }

    const score = distSq + penalty;
    if (!best || score < best.score) {
      best = { progress: candidateProgress, score };
    }
  }
  return best?.progress ?? null;
}
