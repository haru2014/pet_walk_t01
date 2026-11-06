import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCurrentLocationFallbackPlan,
  fetchCurrentLocationFootRoute,
  clearOsrmCache,
} from './roadFallbackService';

describe('roadFallbackService (인도 추종 실제 보행로 및 도로망 격자 가상 폴백)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearOsrmCache();
  });

  describe('createCurrentLocationFallbackPlan (오프라인 격자형 인도 가상 경로)', () => {
    it('출발지와 정확히 일치하여 닫히는 완전 폐합 순환 루프를 생성해야 한다', () => {
      const lat = 36.3628;
      const lon = 127.3592;
      const result = createCurrentLocationFallbackPlan(lat, lon, 0, 30);

      expect(result.route.type).toBe('FeatureCollection');
      expect(result.route.features).toHaveLength(3);

      const firstSeg = result.route.features[0].geometry.coordinates;
      const lastSeg = result.route.features[2].geometry.coordinates;
      const startPoint = firstSeg[0];
      const endPoint = lastSeg[lastSeg.length - 1];

      expect(startPoint[0]).toBeCloseTo(lon, 4);
      expect(startPoint[1]).toBeCloseTo(lat, 4);
      expect(endPoint[0]).toBeCloseTo(startPoint[0], 4);
      expect(endPoint[1]).toBeCloseTo(startPoint[1], 4);
    });

    it('인위적인 7각형이 아닌 30개 이상의 고밀도 도로망 보간 좌표열을 가져야 한다', () => {
      const result = createCurrentLocationFallbackPlan(36.3628, 127.3592, 0, 30);
      const totalCoords = result.route.features.reduce(
        (sum, f) => sum + f.geometry.coordinates.length,
        0,
      );
      expect(totalCoords).toBeGreaterThanOrEqual(30);
    });

    it('안심보도(safe), 교차로/횡단주의(caution), 귀환안심(safe) 3색 세그먼트를 포함해야 한다', () => {
      const result = createCurrentLocationFallbackPlan(36.3628, 127.3592, 0, 30);
      const types = result.route.features.map((f) => f.properties.segmentType);
      expect(types).toEqual(['safe', 'caution', 'safe']);
    });

    it('출발 핀과 3개의 코너 턴 스텝 핀을 제공해야 한다', () => {
      const result = createCurrentLocationFallbackPlan(36.3628, 127.3592, 0, 30);
      expect(result.stepPins).toHaveLength(4);
      expect(result.stepPins[0].detail).toContain('현재 위치 출발');
      expect(result.stepPins[1].kind).toBe('turn');
      expect(result.stepPins[2].kind).toBe('caution');
      expect(result.stepPins[3].kind).toBe('turn');
    });

    it('nonce에 따라 서로 다른 방향의 블록 순환 경로를 생성해야 한다', () => {
      const res0 = createCurrentLocationFallbackPlan(36.3628, 127.3592, 0, 30);
      const res1 = createCurrentLocationFallbackPlan(36.3628, 127.3592, 1, 30);
      const pin0 = res0.stepPins[1].position;
      const pin1 = res1.stepPins[1].position;
      expect(pin0[0]).not.toEqual(pin1[0]);
    });
  });

  describe('fetchCurrentLocationFootRoute (OSRM 공개 보행 라우팅 연동)', () => {
    it('OSRM 서버 성공 시 실제 인도 좌표열과 isLiveOsm: true를 반환해야 한다', async () => {
      const mockOsmCoords = [
        [127.3592, 36.3628],
        [127.3595, 36.3630],
        [127.3600, 36.3635],
        [127.3605, 36.3640],
        [127.3608, 36.3645],
        [127.3600, 36.3648],
        [127.3595, 36.3640],
        [127.3592, 36.3628],
      ];

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [{ geometry: { coordinates: mockOsmCoords }, distance: 1100, duration: 850 }],
        }),
      } as Response);

      const result = await fetchCurrentLocationFootRoute(36.3628, 127.3592, 0, 30);

      expect(result.isLiveOsm).toBe(true);
      expect(result.route.features).toHaveLength(3);
      expect(result.route.features[0].geometry.coordinates[0][0]).toBeCloseTo(127.3592, 4);
      expect(result.stepPins[0].detail).toContain('실제 인도 안심 코스');
    });

    it('OSRM 서버 오류 또는 타임아웃 발생 시 오프라인 격자형 가상 경로로 무중단 자동 폴백해야 한다', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('OSRM network timeout'));

      const result = await fetchCurrentLocationFootRoute(36.3628, 127.3592, 0, 30);

      expect(result.isLiveOsm).toBe(false);
      expect(result.route.features).toHaveLength(3);
      expect(result.stepPins).toHaveLength(4);
      expect(result.stepPins[0].detail).toContain('현재 위치 출발');
    });
  });
});
