/**
 * [편안하개 - PetWalk]
 * 출발 거점 연계 공영주차장(P&R) 클라이언트 단위 테스트 (US-G1)
 * 대전 3대 공원(유림, 송강, 도안) & 세종호수공원 4대 파일럿 실증 거점 검증
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchNearbyParkingLots,
  generateFallbackNearbyParking,
  clearParkingCache,
  calculateDistanceMeters,
  PILOT_PARKING_LOTS_DATA,
} from './parkingApi';

describe('parkingApi - US-G1 대전/세종 4대 거점 공영주차장 P&R 서비스', () => {
  // 🌿 대전 유림공원 중심 좌표
  const YURIM_LAT = 36.3622;
  const YURIM_LON = 127.3585;

  // 🏞️ 세종호수공원 중심 좌표
  const SEJONG_LAT = 36.5042;
  const SEJONG_LON = 127.2680;

  beforeEach(() => {
    clearParkingCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearParkingCache();
    vi.restoreAllMocks();
  });

  describe('PILOT_PARKING_LOTS_DATA 데이터셋 정밀도', () => {
    it('생성된 JSON의 주차장 20곳을 사용해야 한다 (검증 12곳 + 미검증 8곳)', () => {
      expect(PILOT_PARKING_LOTS_DATA.length).toBe(20);
      const verified = PILOT_PARKING_LOTS_DATA.filter((p) => p.verified === true);
      const legacy = PILOT_PARKING_LOTS_DATA.filter((p) => p.verified === false);
      expect(verified.length).toBe(12);
      expect(legacy.length).toBe(8);
    });

    it('세종호수공원 1~3주차장은 생성된 서버 JSON의 좌표를 사용해야 한다', () => {
      const sejongLots = PILOT_PARKING_LOTS_DATA.filter((lot) =>
        ['pkg_sejong_01', 'pkg_sejong_02', 'pkg_sejong_03'].includes(lot.parking_id),
      );

      expect(sejongLots.map(({ entrance_lat, entrance_lon }) => [entrance_lat, entrance_lon])).toEqual([
        [36.492486, 127.268722],
        [36.500506, 127.269823],
        [36.500309, 127.268138],
      ]);
    });

    it('공식 인증 주차장(status=official)은 official_id가 명시되어야 한다', () => {
      const officials = PILOT_PARKING_LOTS_DATA.filter((p) => p.status === 'official');
      expect(officials.length).toBe(6);
      for (const lot of officials) {
        expect(lot.official_id).toBeTruthy();
        expect(lot.verified).toBe(true);
      }
    });

    it('모든 주차장은 유효한 보행 출입구 위경도와 무료/유료 요금 정보를 지녀야 한다', () => {
      for (const lot of PILOT_PARKING_LOTS_DATA) {
        expect(lot.entrance_lat).toBeGreaterThan(36.0);
        expect(lot.entrance_lat).toBeLessThan(37.0);
        expect(lot.entrance_lon).toBeGreaterThan(127.0);
        expect(lot.entrance_lon).toBeLessThan(128.0);
        expect(['free', 'paid']).toContain(lot.fee_type);
        expect(lot.park_zone).toBeTruthy();
      }
    });
  });

  describe('calculateDistanceMeters (Haversine)', () => {
    it('동일 좌표 간의 거리는 0m이어야 한다', () => {
      const dist = calculateDistanceMeters(YURIM_LAT, YURIM_LON, YURIM_LAT, YURIM_LON);
      expect(dist).toBe(0);
    });

    it('유림공원에서 유성구청 주차장까지 약 150m 내외 거리가 산출되어야 한다', () => {
      const dist = calculateDistanceMeters(YURIM_LAT, YURIM_LON, 36.3615, 127.3598);
      expect(dist).toBeGreaterThan(50);
      expect(dist).toBeLessThan(300);
    });
  });

  describe('generateFallbackNearbyParking (오프라인 폴백)', () => {
    it('유림공원 반경 1.5km 조회 시 유림공원 및 구청 주차장이 거리순으로 반환되어야 한다', () => {
      const res = generateFallbackNearbyParking(YURIM_LAT, YURIM_LON, 1500);

      expect(res.isLiveServer).toBe(false);
      expect(res.total_count).toBeGreaterThanOrEqual(3);
      expect(res.parking_lots[0].name).toContain('유림공원');
      expect(res.parking_lots[0].distance_m).toBeLessThan(res.parking_lots[1].distance_m);
    });

    it('세종호수공원 반경 1.5km 조회 시 세종호수공원 제1~제4 주차장이 반환되어야 한다', () => {
      const res = generateFallbackNearbyParking(SEJONG_LAT, SEJONG_LON, 1500);

      expect(res.isLiveServer).toBe(false);
      expect(res.total_count).toBeGreaterThanOrEqual(4);
      for (const lot of res.parking_lots) {
        expect(lot.park_zone).toBe('세종호수공원');
        expect(lot.distance_m).toBeLessThanOrEqual(1500);
      }
    });

    it('verifiedOnly=true 설정 시 검증된 공식 주차장만 반환되어야 한다', () => {
      const res = generateFallbackNearbyParking(YURIM_LAT, YURIM_LON, 1500, true);
      expect(res.parking_lots.length).toBeGreaterThanOrEqual(1);
      for (const lot of res.parking_lots) {
        expect(lot.verified).toBe(true);
      }
    });

    it('원거리(서울 시청 좌표) 조회 시 대전/세종 거점 주차장은 0건이어야 한다', () => {
      const res = generateFallbackNearbyParking(37.5665, 126.9780, 1500);
      expect(res.total_count).toBe(0);
      expect(res.parking_lots).toHaveLength(0);
    });
  });

  describe('fetchNearbyParkingLots (실서버 통신 및 캐싱)', () => {
    it('서버 200 OK 응답 시 isLiveServer=true와 주차장 목록을 정상 파싱해야 한다', async () => {
      const mockPayload = {
        total_count: 2,
        search_radius_m: 1500,
        parking_lots: [
          {
            parking_id: 'pkg_live_01',
            name: '유림공원 라이브 주차장',
            distance_m: 110,
            entrance_lat: 36.3628,
            entrance_lon: 127.3592,
            is_public: true,
            fee_type: 'free',
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockPayload,
      } as Response);

      const res = await fetchNearbyParkingLots(YURIM_LAT, YURIM_LON);

      expect(res.isLiveServer).toBe(true);
      expect(res.total_count).toBe(2);
      expect(res.parking_lots[0].name).toBe('유림공원 라이브 주차장');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('서버 미연결 시 안전하게 오프라인 대전/세종 실데이터로 폴백해야 한다', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

      const res = await fetchNearbyParkingLots(SEJONG_LAT, SEJONG_LON);

      expect(res.isLiveServer).toBe(false);
      expect(res.total_count).toBeGreaterThanOrEqual(4);
      expect(res.parking_lots[0].name).toContain('세종호수공원');
    });

    it('1시간 TTL 메모리 캐싱으로 동일 위치 재호출 시 네트워크를 중복 요청하지 않아야 한다', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const first = await fetchNearbyParkingLots(YURIM_LAT, YURIM_LON);
      const callsAfterFirst = fetchSpy.mock.calls.length;
      expect(callsAfterFirst).toBeGreaterThanOrEqual(1);

      const second = await fetchNearbyParkingLots(YURIM_LAT, YURIM_LON);
      expect(fetchSpy).toHaveBeenCalledTimes(callsAfterFirst);
      expect(second.fetched_at).toBe(first.fetched_at);

      await fetchNearbyParkingLots(YURIM_LAT, YURIM_LON, { forceRefresh: true });
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    it('verified_only=true 옵션 시 서버 요청 URL에 query parameter가 포함되어야 한다', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total_count: 0, parking_lots: [] }),
      } as Response);

      await fetchNearbyParkingLots(YURIM_LAT, YURIM_LON, { verified_only: true });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('verified_only=true'),
        expect.anything()
      );
    });
  });
});
