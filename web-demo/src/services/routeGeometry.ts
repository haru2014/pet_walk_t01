/**
 * [편안하개 - PetWalk]
 * 경로 기하 연산 서비스 (Phase 3, US-C1)
 *
 * - Haversine 거리 계산
 * - GeoJSON 기반 코스 요약 지표 산출
 * - 경위도 → SVG 뷰포트 투영 (지도 SDK 없이 경량 렌더링)
 */

import {
  CourseSummary,
  LonLat,
  RouteFeatureCollection,
} from '../types/route';

const EARTH_RADIUS_M = 6371000;

export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapViewport {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
}

/** 두 [lon, lat] 좌표 간 대원 거리(m) */
export function haversineMeters(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;

  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** 좌표열의 총 길이(m) */
export function polylineLengthMeters(coords: readonly LonLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += haversineMeters(coords[i - 1], coords[i]);
  }
  return total;
}

/**
 * GeoJSON 세그먼트로부터 코스 요약(거리/시간/최대 경사/그늘 비율)을 계산한다.
 * @param speedKmH 반려견 권장 속도 (km/h)
 */
export function buildCourseSummary(
  collection: RouteFeatureCollection,
  speedKmH: number,
): CourseSummary {
  if (collection.features.length === 0 || speedKmH <= 0) {
    return { totalDistanceKm: 0, estimatedMinutes: 0, maxSlopePercent: 0, shadeRatioPercent: 0 };
  }

  let totalM = 0;
  let shadedM = 0;
  let maxSlope = 0;

  for (const feature of collection.features) {
    const lengthM = polylineLengthMeters(feature.geometry.coordinates);
    totalM += lengthM;
    if (feature.properties.shaded) shadedM += lengthM;
    maxSlope = Math.max(maxSlope, feature.properties.maxSlopePercent);
  }

  const totalKm = totalM / 1000;
  return {
    totalDistanceKm: Math.round(totalKm * 100) / 100,
    estimatedMinutes: Math.max(1, Math.round((totalKm / speedKmH) * 60)),
    maxSlopePercent: Math.round(maxSlope * 10) / 10,
    shadeRatioPercent: totalM === 0 ? 0 : Math.round((shadedM / totalM) * 100),
  };
}

/** 전체 좌표 바운딩 박스를 기준으로 SVG 투영 함수를 생성한다. (x=lon, y=lat 반전) */
export function createProjector(
  coords: readonly LonLat[],
  viewport: MapViewport,
): (p: LonLat) => ProjectedPoint {
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // 위도에 따른 경도 길이 보정 (등장방형 근사)
  const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const lonSpan = Math.max((maxLon - minLon) * Math.cos(midLatRad), 1e-9);
  const latSpan = Math.max(maxLat - minLat, 1e-9);

  const innerW = viewport.width - viewport.padding * 2;
  const innerH = viewport.height - viewport.padding * 2;
  const scale = Math.min(innerW / lonSpan, innerH / latSpan);

  const offsetX = viewport.padding + (innerW - lonSpan * scale) / 2;
  const offsetY = viewport.padding + (innerH - latSpan * scale) / 2;

  return ([lon, lat]) => ({
    x: offsetX + (lon - minLon) * Math.cos(midLatRad) * scale,
    y: offsetY + (maxLat - lat) * scale,
  });
}
