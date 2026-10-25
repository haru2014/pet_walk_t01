/**
 * [편안하개 - PetWalk]
 * 출발 거점 연계 공영주차장(P&R) 클라이언트 서비스 (US-G1)
 *
 * - 대전 3대 공원(유림공원, 송강근린공원, 도안호수공원) & 세종호수공원 4대 파일럿 실증 거점 실데이터
 * - 백엔드 FastAPI `GET /api/v1/parking/nearby` 실시간 연동
 * - 서버 미가동 / 오프라인 시 100% 실측 출입구 좌표 기반 무중단 폴백
 */

import { ParkingLotDTO, NearbyParkingResponse, ParkingSearchOptions } from '../types/parking';
import parkingLotsPilot from '../data/parkingLotsPilot.json';
import { fetchWithServerFallback } from './apiClient';

const API_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간 TTL

/** 서버 fixture에서 생성한 앱 오프라인 폴백용 주차장 데이터. */
export const PILOT_PARKING_LOTS_DATA: readonly Omit<ParkingLotDTO, 'distance_m'>[] =
  parkingLotsPilot.parking_lots as unknown as readonly Omit<ParkingLotDTO, 'distance_m'>[];

interface CacheEntry {
  readonly timestamp: number;
  readonly data: NearbyParkingResponse;
}

const parkingMemoryCache = new Map<string, CacheEntry>();

export function clearParkingCache(): void {
  parkingMemoryCache.clear();
}

/**
 * 두 위경도 좌표 간의 구면 거리(미터) 연산 (Haversine 공식)
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusM = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusM * c);
}

/**
 * 오프라인 안전 폴백: 현위치 기준 반경 내 대전/세종 실제 주차장 필터링 및 거리순 정렬
 */
export function generateFallbackNearbyParking(
  lat: number,
  lon: number,
  radiusM: number = 1500,
  verifiedOnly: boolean = false
): NearbyParkingResponse {
  const sourceList = verifiedOnly
    ? PILOT_PARKING_LOTS_DATA.filter((p) => p.verified === true)
    : PILOT_PARKING_LOTS_DATA;

  const lotsWithDistance: ParkingLotDTO[] = sourceList
    .map((p) => {
      const dist = calculateDistanceMeters(lat, lon, p.entrance_lat, p.entrance_lon);
      return { ...p, distance_m: dist };
    })
    .filter((p) => p.distance_m <= radiusM)
    .sort((a, b) => a.distance_m - b.distance_m);

  return {
    isLiveServer: false,
    total_count: lotsWithDistance.length,
    parking_lots: lotsWithDistance,
    search_radius_m: radiusM,
    query_center: { lat, lon },
    fetched_at: new Date().toISOString(),
  };
}

/**
 * 현위치 반경 내 실제 공영주차장 목록 비동기 조회 (1시간 TTL 캐싱)
 */
export async function fetchNearbyParkingLots(
  lat: number,
  lon: number,
  options?: ParkingSearchOptions
): Promise<NearbyParkingResponse> {
  const radius = options?.radius_m ?? 1500;
  const verifiedOnly = options?.verified_only ?? false;
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}_${radius}_v${verifiedOnly}`;

  if (!options?.forceRefresh) {
    const cached = parkingMemoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp <= CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const query = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radius_m: String(radius),
    });
    if (verifiedOnly) {
      query.set('verified_only', 'true');
    }

    const res = await fetchWithServerFallback(
      `/api/v1/parking/nearby?${query.toString()}`,
      { signal: controller.signal },
      API_TIMEOUT_MS
    );
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const response: NearbyParkingResponse = {
        isLiveServer: true,
        total_count: data.total_count ?? (data.parking_lots?.length || 0),
        parking_lots: data.parking_lots ?? [],
        search_radius_m: data.search_radius_m ?? radius,
        query_center: data.query_center ?? { lat, lon },
        fetched_at: new Date().toISOString(),
      };
      parkingMemoryCache.set(cacheKey, { timestamp: Date.now(), data: response });
      return response;
    }
  } catch {
    // 서버 장애 시 오프라인 안전 폴백
  } finally {
    clearTimeout(timer);
  }

  const fallback = generateFallbackNearbyParking(lat, lon, radius, verifiedOnly);
  parkingMemoryCache.set(cacheKey, { timestamp: Date.now(), data: fallback });
  return fallback;
}
