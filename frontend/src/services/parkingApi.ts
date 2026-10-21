/**
 * [편안하개 - PetWalk]
 * 출발 거점 연계 공영주차장(P&R) 클라이언트 서비스 (US-G1)
 *
 * - 대전 3대 공원(유림공원, 송강근린공원, 도안호수공원) & 세종호수공원 4대 파일럿 실증 거점 실데이터
 * - 백엔드 FastAPI `GET /api/v1/parking/nearby` 실시간 연동
 * - 서버 미가동 / 오프라인 시 100% 실측 출입구 좌표 기반 무중단 폴백
 */

import { ParkingLotDTO, NearbyParkingResponse, ParkingSearchOptions } from '../types/parking';
import { fetchWithServerFallback } from './apiClient';

const API_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간 TTL

/**
 * 대전 3대 공원 & 세종호수공원 4대 파일럿 거점 실제 공영주차장 정밀 데이터셋
 * (전국주차장정보표준데이터 및 대전시 공식 안내 기준 9곳 + 기존 레거시 11곳)
 */
export const PILOT_PARKING_LOTS_DATA: readonly Omit<ParkingLotDTO, 'distance_m'>[] = [
  // ── [공식 인증 1] 대전 유림공원 ──
  {
    parking_id: 'std_186-1-000005',
    name: '유림공원주차장',
    entrance_lat: 36.36038081,
    entrance_lon: 127.3551748,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (상시 개방)',
    capacity: 49,
    park_zone: '유림공원',
    address: '대전광역시 유성구 봉명동 496-1',
    verified: true,
    status: 'official',
    official_id: '186-1-000005',
    park_link_verified: true,
    source: '전국주차장정보표준데이터 (공공데이터포털 15012896)',
  },

  // ── [공식 인증 2] 대전 송강근린공원 ──
  {
    parking_id: 'std_186-2-000002',
    name: '송강동(프라자옆)공영',
    entrance_lat: 36.4358228,
    entrance_lon: 127.3860096,
    is_public: true,
    fee_type: 'paid',
    fee_info: '혼합 / 최초 60분 0원 / 이후 10분당 100원',
    capacity: 86,
    park_zone: '송강근린공원',
    address: '대전광역시 유성구 송강동 16-1',
    verified: true,
    status: 'official',
    official_id: '186-2-000002',
    park_link_verified: true,
    source: '전국주차장정보표준데이터 (공공데이터포털 15012896)',
  },
  {
    parking_id: 'std_186-2-000003',
    name: '송강동(GS마트앞)공영',
    entrance_lat: 36.43441777,
    entrance_lon: 127.3865088,
    is_public: true,
    fee_type: 'paid',
    fee_info: '혼합 / 최초 60분 0원 / 이후 10분당 100원',
    capacity: 53,
    park_zone: '송강근린공원',
    address: '대전광역시 유성구 송강동 36-2',
    verified: true,
    status: 'official',
    official_id: '186-2-000003',
    park_link_verified: true,
    source: '전국주차장정보표준데이터 (공공데이터포털 15012896)',
  },

  // ── [공식 인증 3] 대전 도안호수공원 (갑천생태호수공원) ──
  {
    parking_id: 'opr_doan_a',
    name: '갑천생태호수공원 주차장A',
    entrance_lat: 36.336316,
    entrance_lon: 127.351153,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (공원 북측 진입)',
    capacity: 108,
    park_zone: '도안호수공원',
    address: '대전광역시 유성구 원신흥동 130-6',
    verified: true,
    status: 'park_operator',
    park_link_verified: true,
    source: '대전광역시 갑천생태호수공원 누리집 공식 안내',
  },
  {
    parking_id: 'opr_doan_b',
    name: '갑천생태호수공원 주차장B',
    entrance_lat: 36.333671,
    entrance_lon: 127.349336,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (공원 북측 서편 도로변)',
    capacity: 168,
    park_zone: '도안호수공원',
    address: '대전광역시 유성구 원신흥동 105-2',
    verified: true,
    status: 'park_operator',
    park_link_verified: true,
    source: '대전광역시 갑천생태호수공원 누리집 공식 안내',
  },
  {
    parking_id: 'opr_doan_c',
    name: '갑천생태호수공원 주차장C',
    entrance_lat: 36.327485,
    entrance_lon: 127.349489,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료 (공원 남측)',
    capacity: 196,
    park_zone: '도안호수공원',
    address: '대전광역시 서구 도안동 382-2',
    verified: true,
    status: 'park_operator',
    park_link_verified: true,
    source: '대전광역시 갑천생태호수공원 누리집 공식 안내',
  },
  {
    parking_id: 'std_185-2-000045',
    name: '도안제2공한지무료주차장',
    entrance_lat: 36.3241096,
    entrance_lon: 127.3474932,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료',
    capacity: 10,
    park_zone: '도안호수공원',
    address: '대전광역시 서구 도안동 1088',
    verified: true,
    status: 'official',
    official_id: '185-2-000045',
    park_link_verified: false,
    source: '전국주차장정보표준데이터 (공공데이터포털 15012896)',
  },
  {
    parking_id: 'std_185-2-000076',
    name: '도안동 제5공한지유료주차장',
    entrance_lat: 36.30511638,
    entrance_lon: 127.3493764,
    is_public: true,
    fee_type: 'paid',
    fee_info: '유료 / 최초 30분 200원 / 이후 10분당 200원',
    capacity: 49,
    park_zone: '도안호수공원',
    address: '대전광역시 서구 도안동 1777',
    verified: true,
    status: 'official',
    official_id: '185-2-000076',
    park_link_verified: false,
    source: '전국주차장정보표준데이터 (공공데이터포털 15012896)',
  },

  // ── [공식 인증 4] 세종호수공원 ──
  {
    parking_id: 'std_413-2-000001',
    name: '어진동(C47)',
    entrance_lat: 36.49734559,
    entrance_lon: 127.2674606,
    is_public: true,
    fee_type: 'free',
    fee_info: '무료',
    capacity: 208,
    park_zone: '세종호수공원',
    address: '세종특별자치시 어진동 645',
    verified: true,
    status: 'official',
    official_id: '413-2-000001',
    park_link_verified: false,
    source: '전국주차장정보표준데이터 (공공데이터포털 15012896)',
  },

  // ── [레거시 주차장 목록 11곳] ──
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '공식 주차장(유림공원주차장)과 449m 차이, 보행망 이격 118m',
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '공식 주차장과 433m 차이, 공원 경계 내부 지정',
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '공식 주차장과 451m 차이, 보행망 이격 311m',
  },
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '공식 주차장과 561m 차이, 보행망 이격 449m',
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '공식 주차장과 800m 차이, 보행망 이격 693m',
  },
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '좌표가 도안동 공식 주차장보다 2.4km 북쪽으로 이격',
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '좌표가 도안동 공식 주차장보다 2.1km 북쪽으로 이격',
  },
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '공식 공원 도로명 주소(다솜로 216)와 다름',
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '공식 공원 도로명 주소와 다름',
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '공식 공원 도로명 주소와 다름',
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
    verified: false,
    status: 'legacy_unverified',
    data_issue: '공식 공원 도로명 주소와 다름',
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
