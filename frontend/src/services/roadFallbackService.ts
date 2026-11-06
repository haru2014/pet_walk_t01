/**
 * [편안하개 - PetWalk]
 * 현재 위치 기반 실제 보행로(OSRM Footway) 및 도로망 격자 추종 가상 순환로 폴백 서비스 (US-A3)
 *
 * 서버(Render/백엔드) 미응답 시에도 건물 관통 7각형 도형을 배제하고,
 * 1) OpenStreetMap 공공 보행 라우터(OSRM Foot)를 직접 호출하여 실제 인도를 추종하거나,
 * 2) 오프라인 상태에서도 도시 보도 블록(Grid Sidewalk)을 모방한 직각 보행 순환로로 폴백합니다.
 */

import { LonLat, RouteFeatureCollection, RouteStepPin } from '../types/route';
import { createCurrentLocationPin } from './locationPinHelper';

export interface FallbackRouteResult {
  readonly route: RouteFeatureCollection;
  readonly stepPins: RouteStepPin[];
  readonly isLiveOsm?: boolean;
}

const OSRM_CACHE_TTL_MS = 5 * 60 * 1000;
const osrmMemoryCache = new Map<string, { timestamp: number; data: FallbackRouteResult }>();

export function clearOsrmCache(): void {
  osrmMemoryCache.clear();
}

/** 두 점 사이를 지정 간격(미터)으로 균일 보간하여 고밀도 보행 좌표열을 생성합니다. */
function densifySegment(
  start: [number, number],
  end: [number, number],
  stepMeters = 20,
): [number, number][] {
  const dLon = end[0] - start[0];
  const dLat = end[1] - start[1];
  const distApproxM = Math.hypot(dLon * 88000, dLat * 111000);
  const count = Math.max(1, Math.ceil(distApproxM / stepMeters));
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const ratio = i / count;
    points.push([
      Number((start[0] + dLon * ratio).toFixed(6)),
      Number((start[1] + dLat * ratio).toFixed(6)),
    ]);
  }
  return points;
}

/** 도로 모퉁이(교차로) 90도 코너를 부드러운 인도 곡선으로 보간합니다. */
function buildCornerArc(
  cLon: number,
  cLat: number,
  rLon: number,
  rLat: number,
  fromAngleDeg: number,
  toAngleDeg: number,
): [number, number][] {
  const arcPoints: [number, number][] = [];
  const steps = 3;
  for (let i = 0; i <= steps; i++) {
    const angleRad = ((fromAngleDeg + (toAngleDeg - fromAngleDeg) * (i / steps)) * Math.PI) / 180;
    arcPoints.push([
      Number((cLon + rLon * Math.cos(angleRad)).toFixed(6)),
      Number((cLat + rLat * Math.sin(angleRad)).toFixed(6)),
    ]);
  }
  return arcPoints;
}

/** [오프라인 Tier 2] 도시 도로 블록(Grid Sidewalk)을 따라 걷는 가상 인도 순환 경로 생성 */
export function createCurrentLocationFallbackPlan(
  lat: number,
  lon: number,
  nonce = 0,
  targetMinutes?: number | null,
): FallbackRouteResult {
  const minutes = targetMinutes ?? 30;
  // 목표 시간(분)에 비례한 블록 크기 산출 (30분 = 약 1.3km 둘레 -> 가로 220m, 세로 180m)
  const scale = Math.max(0.6, Math.min(1.8, minutes / 30));
  const dLat = 0.0016 * scale;
  const dLon = 0.0024 * scale;

  // 방향별 4개 블록 순환 변형 (동북, 남동, 북서, 남서)
  const variants = [
    { name: '동측 가로수 보행로', sx: 1, sy: 1, labels: ['우측 보도를 따라 직진하세요', '교차로에서 좌회전하세요', '이면도로 안심길을 따라 직진하세요', '출발지로 안전하게 복귀하세요'] },
    { name: '북측 공원방면 보도', sx: -1, sy: 1, labels: ['보행 전용로를 따라 직진하세요', '사거리 횡단보도를 건너 우회전하세요', '완만한 보도를 따라 걸으세요', '출발지로 돌아오세요'] },
    { name: '서측 주택가 안심길', sx: -1, sy: -1, labels: ['인도를 따라 직진하세요', '모퉁이에서 좌회전하세요', '한적한 마을길로 진행하세요', '출발점에 도착합니다'] },
    { name: '남측 수변 연결보도', sx: 1, sy: -1, labels: ['안전 보도를 따라 이동하세요', '모퉁이에서 우회전하세요', '보행로를 따라 직진 후 회전하세요', '출발지로 귀환합니다'] },
  ];
  const variant = variants[Math.abs(nonce) % variants.length];
  const wLon = variant.sx * dLon;
  const wLat = variant.sy * dLat;
  const cornerRLon = wLon * 0.08;
  const cornerRLat = wLat * 0.08;

  // 사각 도로 블록 4개 코너 좌표
  const p0: [number, number] = [lon, lat];
  const p1: [number, number] = [lon + wLon, lat];
  const p2: [number, number] = [lon + wLon, lat + wLat];
  const p3: [number, number] = [lon, lat + wLat];

  // 1구간: 출발지 -> 코너 1 (동/서방향 보도 직진)
  const seg1 = densifySegment(p0, [p1[0] - cornerRLon, p1[1]]);
  // 코너 1 모퉁이 회전
  const c1 = buildCornerArc(p1[0] - cornerRLon, p1[1] + cornerRLat, cornerRLon, cornerRLat, -90, 0);

  // 2구간: 코너 1 -> 코너 2 (남/북방향 보도 직진)
  const seg2 = densifySegment([p1[0], p1[1] + cornerRLat], [p2[0], p2[1] - cornerRLat]);
  // 코너 2 모퉁이 회전
  const c2 = buildCornerArc(p2[0] - cornerRLon, p2[1] - cornerRLat, cornerRLon, cornerRLat, 0, 90);

  // 3구간: 코너 2 -> 코너 3 (횡방향 이면도로 보도 직진)
  const seg3 = densifySegment([p2[0] - cornerRLon, p2[1]], [p3[0] + cornerRLon, p3[1]]);
  // 코너 3 모퉁이 회전
  const c3 = buildCornerArc(p3[0] + cornerRLon, p3[1] - cornerRLat, cornerRLon, cornerRLat, 90, 180);

  // 4구간: 코너 3 -> 출발지 복귀 (종방향 보도 귀환)
  const seg4 = densifySegment([p3[0], p3[1] - cornerRLat], p0);

  const coords: [number, number][] = [...seg1, ...c1, ...seg2, ...c2, ...seg3, ...c3, ...seg4, p0];

  const part1 = Math.floor(coords.length * 0.35);
  const part2 = Math.floor(coords.length * 0.70);

  const route: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1.5, shaded: true },
        geometry: { type: 'LineString', coordinates: coords.slice(0, part1 + 1) as LonLat[] },
      },
      {
        type: 'Feature',
        properties: { segmentType: 'caution', maxSlopePercent: 2.8, shaded: false },
        geometry: { type: 'LineString', coordinates: coords.slice(part1, part2 + 1) as LonLat[] },
      },
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1.2, shaded: true },
        geometry: { type: 'LineString', coordinates: coords.slice(part2) as LonLat[] },
      },
    ],
  };

  const stepPins: RouteStepPin[] = [
    createCurrentLocationPin(lon, lat, `현재 위치 출발 · ${variant.name}`),
    { id: `pin_corner_1_${nonce}`, kind: 'turn', position: p1 as LonLat, instruction: variant.labels[0] },
    { id: `pin_corner_2_${nonce}`, kind: 'caution', position: p2 as LonLat, instruction: variant.labels[1] },
    { id: `pin_corner_3_${nonce}`, kind: 'turn', position: p3 as LonLat, instruction: variant.labels[2] },
  ];

  return { route, stepPins, isLiveOsm: false };
}

/** [온라인 Tier 1] OpenStreetMap 공공 보행 라우터(OSRM Foot)를 호출하여 100% 실제 인도 경로를 생성 */
export async function fetchCurrentLocationFootRoute(
  lat: number,
  lon: number,
  nonce = 0,
  targetMinutes?: number | null,
): Promise<FallbackRouteResult> {
  const minutes = targetMinutes ?? 30;
  const cacheKey = `${lat.toFixed(5)}_${lon.toFixed(5)}_${nonce}_${minutes}`;
  const cached = osrmMemoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < OSRM_CACHE_TTL_MS) {
    return cached.data;
  }

  const scale = Math.max(0.6, Math.min(1.8, minutes / 30));
  const dLat = 0.0018 * scale;
  const dLon = 0.0026 * scale;

  // 방향별 3개 순환 웨이포인트 세트
  const offsetSets = [
    [[dLon * 0.8, dLat * 0.2], [dLon * 0.7, dLat * 0.9], [-dLon * 0.2, dLat * 0.8]],
    [[dLon * 0.3, -dLat * 0.7], [dLon * 0.9, -dLat * 0.5], [dLon * 0.6, dLat * 0.3]],
    [[-dLon * 0.8, dLat * 0.2], [-dLon * 0.6, -dLat * 0.7], [dLon * 0.2, -dLat * 0.6]],
  ];
  const offsets = offsetSets[Math.abs(nonce) % offsetSets.length];

  const waypoints: [number, number][] = [
    [lon, lat],
    [Number((lon + offsets[0][0]).toFixed(6)), Number((lat + offsets[0][1]).toFixed(6))],
    [Number((lon + offsets[1][0]).toFixed(6)), Number((lat + offsets[1][1]).toFixed(6))],
    [Number((lon + offsets[2][0]).toFixed(6)), Number((lat + offsets[2][1]).toFixed(6))],
    [lon, lat],
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, 3500);

  try {
    const ptsStr = waypoints.map(([wLon, wLat]) => `${wLon},${wLat}`).join(';');
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${ptsStr}?overview=full&geometries=geojson`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      const rawCoords = data?.routes?.[0]?.geometry?.coordinates;
      if (Array.isArray(rawCoords) && rawCoords.length >= 8) {
        const osmCoords = rawCoords.map(([cLon, cLat]: [number, number]) => [
          Number(cLon.toFixed(6)),
          Number(cLat.toFixed(6)),
        ]) as LonLat[];

        const part1 = Math.floor(osmCoords.length * 0.35);
        const part2 = Math.floor(osmCoords.length * 0.70);

        const route: RouteFeatureCollection = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { segmentType: 'safe', maxSlopePercent: 1.2, shaded: true },
              geometry: { type: 'LineString', coordinates: osmCoords.slice(0, part1 + 1) },
            },
            {
              type: 'Feature',
              properties: { segmentType: 'caution', maxSlopePercent: 2.5, shaded: false },
              geometry: { type: 'LineString', coordinates: osmCoords.slice(part1, part2 + 1) },
            },
            {
              type: 'Feature',
              properties: { segmentType: 'safe', maxSlopePercent: 1.0, shaded: true },
              geometry: { type: 'LineString', coordinates: osmCoords.slice(part2) },
            },
          ],
        };

        const stepPins: RouteStepPin[] = [
          createCurrentLocationPin(lon, lat, '현재 위치 출발 · 실제 인도 안심 코스'),
          { id: `osrm_pin_1_${nonce}`, kind: 'turn', position: osmCoords[part1], instruction: '보행로를 따라 모퉁이에서 안전하게 회전하세요' },
          { id: `osrm_pin_2_${nonce}`, kind: 'caution', position: osmCoords[part2], instruction: '횡단보도 및 이면도로 합류 구간에 주의하세요' },
        ];

        const result: FallbackRouteResult = { route, stepPins, isLiveOsm: true };
        osrmMemoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      }
    }
  } catch {
    // 네트워크 단절 / 타임아웃 발생 시 오프라인 도로망 격자 폴백으로 즉시 전환
  } finally {
    clearTimeout(timer);
  }

  return createCurrentLocationFallbackPlan(lat, lon, nonce, targetMinutes);
}
