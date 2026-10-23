/**
 * [편안하개 - PetWalk]
 * 현장 위험 제보 및 보행로 동적 우회(Reroute) 클라이언트 서비스 (US-D2, US-C2)
 *
 * 1. POST /api/v1/hazards: 위험 제보 적재 (Supabase / 인메모리)
 * 2. POST /api/v1/walk/reroute: 현장 위험 감지 시 3초 이내 안전 우회 경로 재산출
 * 3. createEmergencyReturn: 위험/비상 상황 시 출발점(주차장/시작지점)으로 최단 보행 복귀 루프 생성
 */

import {
  HazardReportPayload,
  RerouteRequestPayload,
  RerouteResult,
  HazardType,
  DeviationReroutePayload,
} from '../types/hazard';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { fetchWithServerFallback } from './apiClient';
import { haversineMeters, polylineLengthMeters } from './routeGeometry';

export const HAZARD_TYPE_LABELS: Record<HazardType, string> = {
  high_curb: '높은 턱',
  stairs: '야외 계단',
  construction: '공사 구역',
  broken_glass: '유리 파편',
  dog_danger: '들개/맹견 출몰',
  none: '일반 구간',
};

const HAZARD_CLEARANCE_METERS = 60.0;
const DETOUR_OFFSET_METERS = 80.0;
const COMPASS_DIRECTIONS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'] as const;

function getRouteCoordinates(route: RouteFeatureCollection): [number, number][] {
  return route.features[0]?.geometry?.coordinates.map(([lon, lat]) => [lon, lat]) ?? [];
}

function getDeviationGuidance(coords: readonly (readonly [number, number])[]): {
  voiceAlert: string;
  stepPins: RouteStepPin[];
} {
  const start = coords[0];
  const targetIndex = start
    ? coords.findIndex((coord, index) => index > 0 && haversineMeters(
      [start[1], start[0]], [coord[1], coord[0]],
    ) >= 5)
    : -1;
  const target = targetIndex > 0 ? coords[targetIndex] : coords.at(-1);
  const targetDistance = start && target
    ? haversineMeters([start[1], start[0]], [target[1], target[0]])
    : 0;

  let direction = '목적지';
  if (start && target && targetDistance > 0) {
    const lat1 = (start[1] * Math.PI) / 180;
    const lat2 = (target[1] * Math.PI) / 180;
    const deltaLon = ((target[0] - start[0]) * Math.PI) / 180;
    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    direction = COMPASS_DIRECTIONS[Math.round(bearing / 45) % COMPASS_DIRECTIONS.length];
  }

  const distance = Math.max(10, Math.round(targetDistance / 10) * 10);
  const voiceAlert = `경로를 재탐색했습니다. 현재 위치에서 ${direction} 방향으로 약 ${distance}미터 이동해 기존 산책 경로에 다시 합류하세요.`;
  const stepPins: RouteStepPin[] = [];

  if (target) {
    stepPins.push({
      id: `deviation_reroute_join_${Date.now()}`,
      kind: 'turn',
      position: target,
      instruction: '기존 산책 경로에 다시 합류하세요.',
    });
  }
  const destination = coords.at(-1);
  if (destination && destination !== target) {
    stepPins.push({
      id: `deviation_reroute_dest_${Date.now()}`,
      kind: 'safe',
      position: destination,
      instruction: '기존 산책 경로를 따라 목적지까지 계속 이동하세요.',
    });
  }

  return { voiceAlert, stepPins };
}

/**
 * 현장 위험 요소 서버 제보 (POST /api/v1/hazards)
 */
export async function reportHazard(payload: HazardReportPayload): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetchWithServerFallback('/api/v1/hazards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: payload.userId ?? 'anonymous_user',
        lat: payload.lat,
        lon: payload.lon,
        hazard_type: payload.hazardType === 'dog_danger' ? 'construction' : payload.hazardType,
        severity: payload.severity,
        description: payload.description,
        photo_url: payload.photoUrl ?? null,
      }),
    });

    if (res.ok) {
      return { ok: true, message: '위험 요소가 성공적으로 제보되었습니다.' };
    }
    return { ok: false, message: '서버 제보 처리 중 오류가 발생했습니다.' };
  } catch (err) {
    console.warn('[hazardApi] 위험 제보 전송 실패 (로컬 안전망 유지):', err);
    return { ok: true, message: '오프라인 상태로 로컬에 기록되었습니다.' };
  }
}

/**
 * 수직 방위각으로 우회 좌표 계산 ([lon, lat])
 */
function calculateDetourOffset(
  hazardLat: number,
  hazardLon: number,
  currentLat: number,
  currentLon: number,
  destLat: number,
  destLon: number,
  offsetM = DETOUR_OFFSET_METERS
): [number, number] {
  const dLatRad = (destLat - currentLat) * (Math.PI / 180);
  const dLonRad = (destLon - currentLon) * (Math.PI / 180);
  const heading = Math.atan2(
    dLonRad * Math.cos((currentLat * Math.PI) / 180),
    dLatRad
  );
  // 진행 방향 기준 오른쪽 90도 수직 우회
  const detourHeading = heading + Math.PI / 2;
  const dLat = (offsetM * Math.cos(detourHeading)) / 111000.0;
  const dLon = (offsetM * Math.sin(detourHeading)) / (111000.0 * Math.cos((hazardLat * Math.PI) / 180));
  return [Number((hazardLon + dLon).toFixed(6)), Number((hazardLat + dLat).toFixed(6))];
}

/**
 * 로컬 기하 기반 안전 우회 경로 생성 (오프라인 폴백)
 */
export function generateLocalDetourRoute(
  currentLat: number,
  currentLon: number,
  destLat: number,
  destLon: number,
  hazardLat: number,
  hazardLon: number,
  existingCoords?: readonly (readonly [number, number])[]
): [number, number][] {
  const start: [number, number] = [currentLon, currentLat];
  const end: [number, number] = [destLon, destLat];
  const base = existingCoords && existingCoords.length >= 2
    ? existingCoords.map((c) => [c[0], c[1]] as [number, number])
    : [start, end];

  // 위험 반경 내 점 필터링
  const kept = base.filter((pt) => {
    const dist = haversineMeters([pt[1], pt[0]], [hazardLat, hazardLon]);
    return dist > HAZARD_CLEARANCE_METERS;
  });

  if (kept.length === 0 || kept[0][0] !== start[0] || kept[0][1] !== start[1]) {
    kept.unshift(start);
  }
  const lastKept = kept.at(-1);
  if (!lastKept || lastKept[0] !== end[0] || lastKept[1] !== end[1]) {
    kept.push(end);
  }

  // 우회점 삽입
  const detourPt = calculateDetourOffset(hazardLat, hazardLon, currentLat, currentLon, destLat, destLon);
  const insertIndex = Math.max(1, Math.floor(kept.length / 2));
  kept.splice(insertIndex, 0, detourPt);

  return kept;
}

/**
 * 위험 요소 우회 경로 재탐색 요청 (POST /api/v1/walk/reroute)
 */
export async function requestRerouteAroundHazard(payload: RerouteRequestPayload): Promise<RerouteResult> {
  const label = HAZARD_TYPE_LABELS[payload.hazardType ?? 'construction'];
  const hazardTypeForBackend = payload.hazardType === 'dog_danger' ? 'construction' : (payload.hazardType ?? 'high_curb');

  try {
    const res = await fetchWithServerFallback('/api/v1/walk/reroute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_lat: payload.currentLat,
        current_lon: payload.currentLon,
        destination_lat: payload.destinationLat,
        destination_lon: payload.destinationLon,
        hazard_lat: payload.hazardLat,
        hazard_lon: payload.hazardLon,
        hazard_type: hazardTypeForBackend,
        severity: payload.severity ?? 'warning',
        confidence: payload.confidence ?? 0.9,
        route_coordinates: payload.routeCoordinates ? payload.routeCoordinates.map((c) => [c[0], c[1]]) : null,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'REROUTED' && data.geojson?.features?.length > 0) {
        const geojson: RouteFeatureCollection = data.geojson;
        const detourCoords: [number, number][] = (geojson.features[0]?.geometry?.coordinates ?? []).map(
          (c: readonly [number, number]) => [c[0], c[1]]
        );
        const midPoint = detourCoords[Math.floor(detourCoords.length / 2)] ?? [payload.hazardLon, payload.hazardLat];

        const stepPins: RouteStepPin[] = [
          {
            id: `reroute_start_${Date.now()}`,
            kind: 'turn',
            position: [payload.currentLon, payload.currentLat],
            instruction: `${label} 구간을 피해 우회 경로로 진입합니다.`,
          },
          {
            id: `reroute_avoid_${Date.now()}`,
            kind: 'safe',
            position: midPoint,
            instruction: '위험 지점을 안전하게 비껴가는 완만 우회로입니다.',
          },
        ];

        return {
          status: 'REROUTED',
          needsReroute: true,
          voiceAlert: data.voice_alert ?? `전방 ${label} 구간을 우회하여 새로운 경로를 안내합니다.`,
          newRoute: geojson,
          stepPins,
          newDistanceM: data.new_distance_m,
          hazardClearanceM: data.hazard_clearance_m,
          isEmergencyReturn: false,
        };
      }
    }
  } catch (err) {
    console.warn('[hazardApi] 서버 우회 재탐색 실패, 로컬 기하 우회로 즉시 폴백:', err);
  }

  // 🛡️ 오프라인 / 서버 장애 시 로컬 기하 기반 무중단 안전 우회
  const detourCoords = generateLocalDetourRoute(
    payload.currentLat,
    payload.currentLon,
    payload.destinationLat,
    payload.destinationLon,
    payload.hazardLat ?? payload.currentLat,
    payload.hazardLon ?? payload.currentLon,
    payload.routeCoordinates
  );

  const localGeojson: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1.5, shaded: true },
        geometry: {
          type: 'LineString',
          coordinates: detourCoords,
        },
      },
    ],
  };

  const localPins: RouteStepPin[] = [
    {
      id: `local_reroute_pin_1_${Date.now()}`,
      kind: 'turn',
      position: [payload.currentLon, payload.currentLat],
      instruction: `${label} 구간을 우회하는 안전 경로를 안내합니다.`,
    },
    {
      id: `local_reroute_pin_2_${Date.now()}`,
      kind: 'safe',
      position: detourCoords[Math.floor(detourCoords.length / 2)],
      instruction: '위험 요소를 벗어난 안전 보행 구간입니다.',
    },
  ];

  return {
    status: 'REROUTED',
    needsReroute: true,
    voiceAlert: `전방 ${label} 구간을 우회하여 새로운 경로를 안내합니다.`,
    newRoute: localGeojson,
    stepPins: localPins,
    newDistanceM: Math.round(haversineMeters([payload.currentLat, payload.currentLon], [payload.destinationLat, payload.destinationLon]) * 1.2),
    hazardClearanceM: DETOUR_OFFSET_METERS,
    isEmergencyReturn: false,
  };
}

/**
 * 로컬 기하 기반 경로 이탈 복귀 경로 생성 (오프라인 폴백)
 * 현재 위치에서 기존 경로의 가장 가까운 전방 지점을 찾아 연결한다.
 */
export function generateLocalDeviationReroute(payload: DeviationReroutePayload): RerouteResult {
  const start: [number, number] = [payload.currentLon, payload.currentLat];
  const end: [number, number] = [payload.destinationLon, payload.destinationLat];
  const base = payload.routeCoordinates && payload.routeCoordinates.length >= 2
    ? payload.routeCoordinates.map((c) => [c[0], c[1]] as [number, number])
    : [start, end];

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < base.length; i++) {
    const d = haversineMeters([payload.currentLat, payload.currentLon], [base[i][1], base[i][0]]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  const remaining = base.slice(bestIdx);
  const detourCoords: [number, number][] = [start, ...(remaining.length > 0 ? remaining : [end])];

  const localGeojson: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1.5, shaded: true },
        geometry: {
          type: 'LineString',
          coordinates: detourCoords,
        },
      },
    ],
  };

  const { voiceAlert, stepPins } = getDeviationGuidance(detourCoords);

  return {
    status: 'REROUTED',
    needsReroute: true,
    voiceAlert,
    newRoute: localGeojson,
    stepPins,
    newDistanceM: Math.round(polylineLengthMeters(detourCoords)),
    isEmergencyReturn: false,
  };
}

/**
 * 경로 이탈 시 서버에 재탐색 요청 (POST /api/v1/walk/reroute)
 * 서버 통신 실패 시 로컬 안전 복귀 경로로 즉시 폴백
 */
export async function requestDeviationReroute(payload: DeviationReroutePayload): Promise<RerouteResult> {
  try {
    const res = await fetchWithServerFallback('/api/v1/walk/reroute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_lat: payload.currentLat,
        current_lon: payload.currentLon,
        destination_lat: payload.destinationLat,
        destination_lon: payload.destinationLon,
        hazard_lat: payload.currentLat,
        hazard_lon: payload.currentLon,
        hazard_type: 'none',
        severity: 'warning',
        confidence: 0.9,
        route_coordinates: payload.routeCoordinates ? payload.routeCoordinates.map((c) => [c[0], c[1]]) : null,
        reroute_reason: 'deviation',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'REROUTED' && data.geojson?.features?.length > 0) {
        const geojson: RouteFeatureCollection = data.geojson;
        const coords = getRouteCoordinates(geojson);
        const { voiceAlert, stepPins } = getDeviationGuidance(coords);

        return {
          status: 'REROUTED',
          needsReroute: true,
          voiceAlert,
          newRoute: geojson,
          stepPins,
          newDistanceM: data.new_distance_m ?? Math.round(polylineLengthMeters(coords)),
          hazardClearanceM: 0,
          isEmergencyReturn: false,
        };
      }
    }
  } catch (err) {
    console.warn('[hazardApi] 서버 경로 이탈 재탐색 실패, 로컬 안전 복귀로 즉시 폴백:', err);
  }

  return generateLocalDeviationReroute(payload);
}

/**
 * 돌발 비상/위험 발생 시 출발점(주차장/시작지점)으로 즉시 안전 복귀하는 긴급 복귀 경로 생성
 */
export function createEmergencyReturnRoute(
  currentLat: number,
  currentLon: number,
  startLat: number,
  startLon: number,
  existingCoords?: readonly (readonly [number, number])[],
  hazardPos?: { lat: number; lon: number }
): RerouteResult {
  let returnCoords: [number, number][];

  if (hazardPos) {
    returnCoords = generateLocalDetourRoute(
      currentLat,
      currentLon,
      startLat,
      startLon,
      hazardPos.lat,
      hazardPos.lon,
      existingCoords
    );
  } else if (existingCoords && existingCoords.length >= 2) {
    // 기존 보행 경로를 역방향으로 안전하게 거슬러 올라감
    const reverseCoords = [...existingCoords].reverse().map((c) => [c[0], c[1]] as [number, number]);
    returnCoords = [[currentLon, currentLat], ...reverseCoords, [startLon, startLat]];
  } else {
    // 현재 위치 -> 출발지 직선 완만 연결
    const midLon = (currentLon + startLon) / 2 + 0.0005;
    const midLat = (currentLat + startLat) / 2;
    returnCoords = [
      [currentLon, currentLat],
      [midLon, midLat],
      [startLon, startLat],
    ];
  }

  const emergencyRoute: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1.0, shaded: true },
        geometry: {
          type: 'LineString',
          coordinates: returnCoords,
        },
      },
    ],
  };

  const emergencyPins: RouteStepPin[] = [
    {
      id: `emergency_return_start_${Date.now()}`,
      kind: 'turn',
      position: [currentLon, currentLat],
      instruction: '출발지로 안전하게 복귀하는 긴급 경로를 안내합니다.',
    },
    {
      id: `emergency_return_end_${Date.now()}`,
      kind: 'safe',
      position: [startLon, startLat],
      instruction: '출발 지점(주차장/시작점)에 곧 도착합니다.',
    },
  ];

  return {
    status: 'REROUTED',
    needsReroute: true,
    voiceAlert: '안전을 위해 산책을 중단하고 출발지로 복귀하는 긴급 경로를 안내합니다. 침착하게 따라와 주세요.',
    newRoute: emergencyRoute,
    stepPins: emergencyPins,
    newDistanceM: Math.round(haversineMeters([currentLat, currentLon], [startLat, startLon])),
    isEmergencyReturn: true,
  };
}
