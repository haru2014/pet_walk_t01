/**
 * [편안하개 - PetWalk]
 * 출발 거점 연계 공영주차장(P&R) 클라이언트 서비스 (US-G1)
 *
 * - 대전 3대 공원(유림공원, 송강근린공원, 도안호수공원) & 세종호수공원 4대 파일럿 실증 거점 실데이터
 * - 백엔드 FastAPI `GET /api/v1/parking/nearby` 실시간 연동
 * - 서버 미가동 / 오프라인 시 100% 실측 출입구 좌표 기반 무중단 폴백
 */

import { ParkingLotDTO, NearbyParkingResponse, ParkingSearchOptions } from '../types/parking';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const API_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간 TTL

/**
 * 대전 3대 공원 & 세종호수공원 4대 파일럿 거점 실제 공영주차장 정밀 데이터셋
 */
export const PILOT_PARKING_LOTS_DATA: readonly Omit<ParkingLotDTO, 'distance_m'>[] = [
  // 🌿 대전 유림공원 (어은동/봉명동)
  {
    parking_id: 'pkg_yurim_01',
    name: '유림공원 부설 공영주차장',
    entrance_lat: 36.3628,
    entrance_lon: 127.3592,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (상시 개방)',
    capacity: 60,
    park_zone: '유림공원',
    address: '대전광역시 유성구 어은로 27',
  },
  {
    parking_id: 'pkg_yurim_02',
    name: '유성구청 공영주차장',
    entrance_lat: 36.3615,
    entrance_lon: 127.3598,
    is_public: true,
    fee_type: 'paid',
    fee_info: '최초 1시간 무료 / 10분당 200원',
    capacity: 220,
    park_zone: '유림공원',
    address: '대전광역시 유성구 대학로 211',
  },
  {
    parking_id: 'pkg_yurim_03',
    name: '어은교 갑천변 노상 공영주차장',
    entrance_lat: 36.3640,
    entrance_lon: 127.3575,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (갑천 둔치길 직결)',
    capacity: 45,
    park_zone: '유림공원',
    address: '대전광역시 유성구 어은동 갑천변',
  },

  // 🌲 대전 송강근린공원 (송강동)
  {
    parking_id: 'pkg_songgang_01',
    name: '송강근린공원 공영주차장',
    entrance_lat: 36.4320,
    entrance_lon: 127.3810,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (공원 산책로 직결)',
    capacity: 35,
    park_zone: '송강근린공원',
    address: '대전광역시 유성구 송강동 22',
  },
  {
    parking_id: 'pkg_songgang_02',
    name: '송강동 공영노상주차장',
    entrance_lat: 36.4305,
    entrance_lon: 127.3790,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료',
    capacity: 50,
    park_zone: '송강근린공원',
    address: '대전광역시 유성구 송강로 42',
  },

  // 🌊 대전 도안호수공원 / 갑천생태공원 (도안동/원신흥동)
  {
    parking_id: 'pkg_doan_01',
    name: '도안호수공원 임시 공영주차장',
    entrance_lat: 36.3458,
    entrance_lon: 127.3428,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (수변 데크 산책로 직결)',
    capacity: 80,
    park_zone: '도안호수공원',
    address: '대전광역시 서구 도안동 1500',
  },
  {
    parking_id: 'pkg_doan_02',
    name: '갑천생태공원 둔치 주차장',
    entrance_lat: 36.3435,
    entrance_lon: 127.3455,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (갑천 흙길 산책로 직결)',
    capacity: 100,
    park_zone: '도안호수공원',
    address: '대전광역시 유성구 원신흥동 갑천변',
  },

  // 🏞️ 세종호수공원 (세종특별자치시)
  {
    parking_id: 'pkg_sejong_01',
    name: '세종호수공원 제1주차장',
    entrance_lat: 36.5065,
    entrance_lon: 127.2655,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (은빛해변·중앙보행교 직결)',
    capacity: 350,
    park_zone: '세종호수공원',
    address: '세종특별자치시 연기면 세종리 1201',
  },
  {
    parking_id: 'pkg_sejong_02',
    name: '세종호수공원 제2주차장',
    entrance_lat: 36.5015,
    entrance_lon: 127.2695,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (푸른들판·물놀이섬 직결)',
    capacity: 280,
    park_zone: '세종호수공원',
    address: '세종특별자치시 연기면 세종리 1205',
  },
  {
    parking_id: 'pkg_sejong_03',
    name: '세종호수공원 제3주차장 (수목원 방면)',
    entrance_lat: 36.4980,
    entrance_lon: 127.2730,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (국립세종수목원 연계 보행로)',
    capacity: 420,
    park_zone: '세종호수공원',
    address: '세종특별자치시 수목원로 136',
  },
  {
    parking_id: 'pkg_sejong_04',
    name: '세종호수공원 제4주차장 (대통령기록관)',
    entrance_lat: 36.5085,
    entrance_lon: 127.2630,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (대통령기록관 및 북측 숲길)',
    capacity: 200,
    park_zone: '세종호수공원',
    address: '세종특별자치시 다솜로 250',
  },
];

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
  radiusM: number = 1500
): NearbyParkingResponse {
  const lotsWithDistance: ParkingLotDTO[] = PILOT_PARKING_LOTS_DATA.map((p) => {
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
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}_${radius}`;

  if (!options?.forceRefresh) {
    const cached = parkingMemoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp <= CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const url = `${API_BASE_URL}/api/v1/parking/nearby?lat=${lat}&lon=${lon}&radius_m=${radius}`;
    const res = await fetch(url, { signal: controller.signal });
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
  } catch (_e) {
    // 서버 장애 시 오프라인 안전 폴백
  } finally {
    clearTimeout(timer);
  }

  const fallback = generateFallbackNearbyParking(lat, lon, radius);
  parkingMemoryCache.set(cacheKey, { timestamp: Date.now(), data: fallback });
  return fallback;
}
