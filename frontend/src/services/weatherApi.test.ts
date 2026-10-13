/**
 * [편안하개 - PetWalk]
 * 기상청 지면열 추정 골든타임 클라이언트 단위 테스트 (US-F1)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  fetchHeatRiskForecast,
  generateFallbackHeatRisk,
  clearWeatherCache,
  getCachedWeather,
  buildWeatherCacheKey,
} from './weatherApi';

describe('weatherApi - US-F1 지면열 추정 및 골든타임 서비스', () => {
  const SEOUL_LAT = 37.544;
  const SEOUL_LON = 127.038;

  beforeEach(() => {
    clearWeatherCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearWeatherCache();
    vi.restoreAllMocks();
  });

  describe('generateFallbackHeatRisk (오프라인 폴백)', () => {
    it('24시간 전체 시간대 예보 DTO를 정확히 생성해야 한다', () => {
      const fallback = generateFallbackHeatRisk(SEOUL_LAT, SEOUL_LON);

      expect(fallback.isLiveServer).toBe(false);
      expect(fallback.hourly_forecast).toHaveLength(24);
      expect(fallback.notice).toContain('기상청 예보 모델 기반 추정치');
      expect(fallback.golden_time_window).toBeTruthy();
    });

    it('한낮(12~14시)에는 일사량 가중치(1.0)가 반영되어 지면열이 기온보다 15도 높아야 한다', () => {
      const fallback = generateFallbackHeatRisk(SEOUL_LAT, SEOUL_LON);
      const noonForecast = fallback.hourly_forecast[13];

      expect(noonForecast.estimated_surface_temp).toBeCloseTo(
        noonForecast.air_temp_celsius + 15.0,
        1
      );
      expect(noonForecast.risk_level).not.toBe('SAFE');
    });

    it('심야(0~5시)에는 일사량 가중치(0.0)가 적용되어 지면열과 기온이 일치하고 SAFE여야 한다', () => {
      const fallback = generateFallbackHeatRisk(SEOUL_LAT, SEOUL_LON);
      const nightForecast = fallback.hourly_forecast[2];

      expect(nightForecast.estimated_surface_temp).toBe(nightForecast.air_temp_celsius);
      expect(nightForecast.is_golden_time).toBe(true);
      expect(nightForecast.risk_level).toBe('SAFE');
    });
  });

  describe('buildWeatherCacheKey 및 캐시 유틸리티', () => {
    it('위경도 소수점 2자리(약 1.1km 격자)로 캐시 키를 생성해야 한다', () => {
      const key1 = buildWeatherCacheKey(37.54412, 127.03815);
      const key2 = buildWeatherCacheKey(37.54499, 127.03844);
      expect(key1).toBe('37.54,127.04');
      expect(key2).toBe('37.54,127.04');
      expect(key1).toBe(key2);
    });

    it('캐시가 비어있을 때는 getCachedWeather가 null을 반환해야 한다', () => {
      expect(getCachedWeather(SEOUL_LAT, SEOUL_LON)).toBeNull();
    });
  });

  describe('fetchHeatRiskForecast 실서버 연동 및 폴백', () => {
    it('서버가 200 OK를 반환하면 isLiveServer=true 응답을 정상 파싱해야 한다', async () => {
      const mockLivePayload = {
        current: {
          hour: 18,
          air_temp_celsius: 25.5,
          estimated_surface_temp: 28.5,
          risk_level: 'SAFE',
          is_golden_time: true,
        },
        golden_time_window: '18:00 ~ 21:00',
        hourly_forecast: [
          {
            hour: 18,
            air_temp_celsius: 25.5,
            estimated_surface_temp: 28.5,
            risk_level: 'SAFE',
            is_golden_time: true,
            notice: '실시간 관측 기반',
          },
        ],
        notice: '기상청 단기예보 실시간 연동',
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockLivePayload,
      } as Response);

      const result = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON);

      expect(result.isLiveServer).toBe(true);
      expect(result.current_surface_temp).toBe(28.5);
      expect(result.is_current_golden).toBe(true);
      expect(result.golden_time_window).toBe('18:00 ~ 21:00');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('서버 통신 실패/에러 발생 시에도 예외 없이 안전한 폴백을 반환해야 한다', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON);

      expect(result.isLiveServer).toBe(false);
      expect(result.hourly_forecast).toHaveLength(24);
      expect(result.notice).toContain('기상청 예보 모델 기반 추정치');
    });

    it('1시간 TTL 메모리 캐싱으로 동일 위치 재호출 시 네트워크를 중복 요청하지 않아야 한다', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));

      // 첫 번째 호출: fetch 시도 후 폴백 캐싱
      const first = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // 두 번째 호출: 캐시 히트로 fetch 호출 안 함
      const second = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(second.fetched_at).toBe(first.fetched_at);

      // forceRefresh 옵션 전달 시 캐시를 무시하고 재요청
      await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON, { forceRefresh: true });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
