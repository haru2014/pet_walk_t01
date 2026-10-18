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
  computeFocusedGoldenWindow,
  computeGoldenWindowDay,
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
      expect(fallback.notice).toContain('[가상 시뮬레이션 추정치]');
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

    it('일사량 수치(solar_radiation_w_m2)와 노면별 체감 지면온도(surface_temps)가 정확히 산출되어야 한다', () => {
      const fallback = generateFallbackHeatRisk(SEOUL_LAT, SEOUL_LON);
      const noon = fallback.hourly_forecast[13];

      expect(noon.solar_radiation_w_m2).toBe(1000);
      expect(noon.surface_temps).toBeDefined();
      expect(noon.surface_temps?.asphalt).toBeCloseTo(noon.air_temp_celsius + 18.0, 1);
      expect(noon.surface_temps?.grass).toBeCloseTo(noon.air_temp_celsius + 4.0, 1);
      expect(fallback.surface_temps).toBeDefined();
      expect(fallback.data_source).toBe('fallback_estimate');
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

    it('Open-Meteo 실시간 연동 시 일사량 및 노면별 지면온도를 정확히 파싱해야 한다', async () => {
      const mockOpenMeteoPayload = {
        data_source: 'open_meteo_live',
        insolation_source: 'open_meteo',
        current: {
          hour: 14,
          air_temp_celsius: 28.0,
          estimated_surface_temp: 38.8,
          solar_radiation_w_m2: 720.0,
          surface_temps: {
            asphalt: 41.0,
            paved: 38.1,
            dirt: 33.8,
            grass: 30.9,
          },
          risk_level: 'CAUTION',
          is_golden_time: false,
        },
        golden_time_window: '18:00 ~ 20:00',
        golden_time_window_day: 'today',
        hourly_forecast: [],
        notice: '기상청 예보 모델 기반 추정치',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOpenMeteoPayload,
      } as Response);

      const result = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON);

      expect(result.isLiveServer).toBe(true);
      expect(result.data_source).toBe('open_meteo_live');
      expect(result.solar_radiation_w_m2).toBe(720.0);
      expect(result.surface_temps?.asphalt).toBe(41.0);
      expect(result.surface_temps?.grass).toBe(30.9);
    });

    it('서버 통신 실패/에러 발생 시에도 예외 없이 안전한 폴백을 반환해야 한다', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON);

      expect(result.isLiveServer).toBe(false);
      expect(result.hourly_forecast).toHaveLength(24);
      expect(result.notice).toContain('[가상 시뮬레이션 추정치]');
    });

    it('1시간 TTL 메모리 캐싱으로 동일 위치 재호출 시 네트워크를 중복 요청하지 않아야 한다', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));

      // 첫 번째 호출: fetch 시도 후 폴백 캐싱
      const first = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON);
      const callsAfterFirst = fetchSpy.mock.calls.length;
      expect(callsAfterFirst).toBeGreaterThanOrEqual(1);

      // 두 번째 호출: 캐시 히트로 fetch 추가 호출 안 함
      const second = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON);
      expect(fetchSpy).toHaveBeenCalledTimes(callsAfterFirst);
      expect(second.fetched_at).toBe(first.fetched_at);

      // forceRefresh 옵션 전달 시 캐시를 무시하고 재요청
      await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON, { forceRefresh: true });
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });
  });

  describe('computeFocusedGoldenWindow (1.5~2시간 슬롯 압축)', () => {
    it.each([
      [13, '18:00 ~ 20:00', '한낮(13시)에는 다가올 저녁 골든타임 슬롯 반환'],
      [18, '18:00 ~ 20:00', '골든타임 시간대(18시)에는 현재 진행 중인 슬롯 반환'],
      [7, '06:00 ~ 08:00', '아침 시간대(7시)에는 아침 안심 슬롯 반환'],
    ])('%s시 테스트: %s (%s)', (hour, expected) => {
      const fallback = generateFallbackHeatRisk(SEOUL_LAT, SEOUL_LON);
      const windowStr = computeFocusedGoldenWindow(fallback.hourly_forecast, hour);
      expect(windowStr).toBe(expected);
    });
  });

  describe('computeGoldenWindowDay (오늘/내일 구분 표시 - Issue #50)', () => {
    it('낮 또는 초저녁(13시, 18시)에는 당일 골든타임(today)을 반환해야 한다', () => {
      const fallback = generateFallbackHeatRisk(SEOUL_LAT, SEOUL_LON);
      const day13 = computeGoldenWindowDay(fallback.hourly_forecast, 13);
      const day18 = computeGoldenWindowDay(fallback.hourly_forecast, 18);
      expect(day13).toBe('today');
      expect(day18).toBe('today');
    });

    it('오늘 모든 안전 구간이 종료된 심야(23시)에는 내일(tomorrow)을 반환해야 한다', () => {
      const fallback = generateFallbackHeatRisk(SEOUL_LAT, SEOUL_LON);
      const day23 = computeGoldenWindowDay(fallback.hourly_forecast, 23);
      expect(day23).toBe('tomorrow');
    });

    it('서버 응답에 golden_time_window_day가 전달되면 그대로 보존해야 한다', async () => {
      const mockPayload = {
        current: { hour: 20, air_temp_celsius: 13.2, estimated_surface_temp: 13.2, risk_level: 'SAFE', is_golden_time: true },
        golden_time_window: '20:00 ~ 23:00',
        golden_time_window_day: 'today',
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockPayload,
      } as Response);

      const res = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON, { forceRefresh: true });
      expect(res.golden_time_window_day).toBe('today');
    });
  });

  describe('Issue #57 - Open-Meteo 일사량 출처 표기 (attribution, CC BY 4.0)', () => {
    it('서버 응답에 attribution과 insolation_source가 제공되면 그대로 보존해야 한다', async () => {
      const mockPayload = {
        current: {
          hour: 15,
          air_temp_celsius: 27.5,
          estimated_surface_temp: 32.0,
          risk_level: 'SAFE',
          is_golden_time: true,
        },
        golden_time_window: '17:00 ~ 20:00',
        attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
        insolation_source: 'open_meteo',
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockPayload,
      } as Response);

      const res = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON, { forceRefresh: true });
      expect(res.attribution).toBe('Weather data by Open-Meteo.com (CC BY 4.0)');
      expect(res.insolation_source).toBe('open_meteo');
    });

    it('서버 응답에 attribution이 누락되거나 null이어도 깨지지 않고 attribution=null로 처리되어야 한다', async () => {
      const mockPayload = {
        current: {
          hour: 15,
          air_temp_celsius: 27.5,
          estimated_surface_temp: 32.0,
          risk_level: 'SAFE',
          is_golden_time: true,
        },
        golden_time_window: '17:00 ~ 20:00',
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockPayload,
      } as Response);

      const res = await fetchHeatRiskForecast(SEOUL_LAT, SEOUL_LON, { forceRefresh: true });
      expect(res.attribution).toBeNull();
      expect(res.insolation_source).toBeUndefined();
    });

    it('오프라인 폴백 데이터 생성 시 attribution은 null, insolation_source는 sky_fallback이어야 한다', () => {
      const fallback = generateFallbackHeatRisk(SEOUL_LAT, SEOUL_LON);
      expect(fallback.attribution).toBeNull();
      expect(fallback.insolation_source).toBe('sky_fallback');
    });
  });
});
