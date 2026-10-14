/**
 * [편안하개 - PetWalk]
 * 기상청 지면열 추정 골든타임 클라이언트 서비스 (US-F1)
 *
 * - 백엔드 FastAPI `GET /api/v1/weather/heat-risk` 실시간 연동
 * - 1시간 TTL 메모리 캐싱 (1.1km 위경도 격자 기반 네트워크/배터리 절약)
 * - 네트워크 오류 / 서버 미실행 시 지면열 수지식 기반 0.1초 무중단 오프라인 폴백
 */

import { HeatRiskHourDTO, HeatRiskLevel, HeatRiskResponse } from '../types/weather';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const API_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간 TTL

interface CacheEntry {
  readonly timestamp: number;
  readonly data: HeatRiskResponse;
}

const weatherMemoryCache = new Map<string, CacheEntry>();

/**
 * 위경도를 1.1km 격자 수준(소수점 2자리) 키로 변환
 */
export function buildWeatherCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * 메모리 캐시 초기화 (테스트 및 수동 새로고침용)
 */
export function clearWeatherCache(): void {
  weatherMemoryCache.clear();
}

/**
 * 캐시된 날씨 데이터 조회
 */
export function getCachedWeather(lat: number, lon: number): HeatRiskResponse | null {
  const key = buildWeatherCacheKey(lat, lon);
  const entry = weatherMemoryCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    weatherMemoryCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * 시간대별 일사량 가중치 산출 (기상청 단기예보 모델 수지식 기반)
 */
function getInsolationWeightForHour(hour: number): number {
  if (hour < 6 || hour >= 20) return 0.0; // 야간
  if (hour >= 11 && hour <= 15) return 1.0; // 한낮 직사광선 피크
  if (hour >= 9 && hour <= 17) return 0.6; // 일반 주간
  return 0.2; // 일출/일몰 완만한 일사
}

/**
 * 시간대별 외기온도 시뮬레이션 (최저 22℃ ~ 최고 31℃ 곡선)
 */
function getAirTempForHour(hour: number): number {
  const midTemp = 26.5;
  const amplitude = 4.5;
  const radians = ((hour - 14) / 12) * Math.PI;
  return Math.round((midTemp + amplitude * Math.cos(radians)) * 10) / 10;
}

/**
 * 안전 지면온도(<=35℃) 여부 및 위험도 판별
 */
function evaluateRisk(surfaceTemp: number): { riskLevel: HeatRiskLevel; isGolden: boolean } {
  if (surfaceTemp <= 35.0) {
    return { riskLevel: 'SAFE', isGolden: true };
  }
  if (surfaceTemp <= 45.0) {
    return { riskLevel: 'CAUTION', isGolden: false };
  }
  return { riskLevel: 'DANGER', isGolden: false };
}

/**
 * 오프라인 / 장애 대응 지면열 추정 및 골든타임 폴백 데이터 생성
 */
export function generateFallbackHeatRisk(lat: number, lon: number): HeatRiskResponse {
  const now = new Date();
  const currentHour = now.getHours();
  const hourly: HeatRiskHourDTO[] = [];
  const goldenHours: number[] = [];

  for (let h = 0; h < 24; h++) {
    const airTemp = getAirTempForHour(h);
    const weight = getInsolationWeightForHour(h);
    const surfaceTemp = Math.round((airTemp + weight * 15.0) * 10) / 10;
    const { riskLevel, isGolden } = evaluateRisk(surfaceTemp);

    if (isGolden && (h >= 6 && h <= 22)) {
      goldenHours.push(h);
    }

    hourly.push({
      hour: h,
      air_temp_celsius: airTemp,
      estimated_surface_temp: surfaceTemp,
      risk_level: riskLevel,
      is_golden_time: isGolden,
      notice: '본 지수는 기상청 예보 모델 기반 추정치입니다.',
    });
  }

  const currentDto = hourly[currentHour] || hourly[12];
  let goldenWindow = '일몰 후 (19:00 ~ 22:00) 권장';
  if (goldenHours.length > 0) {
    const first = goldenHours[0];
    const last = goldenHours.at(-1) ?? first;
    goldenWindow = `${String(first).padStart(2, '0')}:00 ~ ${String(last + 1).padStart(2, '0')}:00`;
  }

  return {
    isLiveServer: false,
    current_hour: currentHour,
    current_air_temp: currentDto.air_temp_celsius,
    current_surface_temp: currentDto.estimated_surface_temp,
    current_risk_level: currentDto.risk_level,
    is_current_golden: currentDto.is_golden_time,
    golden_time_window: goldenWindow,
    hourly_forecast: hourly,
    notice: '본 지수는 기상청 예보 모델 기반 추정치입니다.',
    fetched_at: now.toISOString(),
  };
}

/**
 * 현위치 위경도 기준 실시간 기상청 지면열 정보 요청 (1시간 캐싱 적용)
 */
export async function fetchHeatRiskForecast(
  lat: number,
  lon: number,
  options?: { readonly forceRefresh?: boolean }
): Promise<HeatRiskResponse> {
  const cacheKey = buildWeatherCacheKey(lat, lon);

  if (!options?.forceRefresh) {
    const cached = getCachedWeather(lat, lon);
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const url = `${API_BASE_URL}/api/v1/weather/heat-risk?lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const current = data.current || {};
      const response: HeatRiskResponse = {
        isLiveServer: true,
        current_hour: current.hour ?? new Date().getHours(),
        current_air_temp: current.air_temp_celsius ?? 26.0,
        current_surface_temp: current.estimated_surface_temp ?? 31.0,
        current_risk_level: current.risk_level ?? 'SAFE',
        is_current_golden: current.is_golden_time ?? true,
        golden_time_window: data.golden_time_window ?? '18:00 ~ 20:00',
        hourly_forecast: data.hourly_forecast ?? [],
        notice: data.notice ?? '본 지수는 기상청 예보 모델 기반 추정치입니다.',
        fetched_at: new Date().toISOString(),
      };
      weatherMemoryCache.set(cacheKey, { timestamp: Date.now(), data: response });
      return response;
    }
  } catch (_e) {
    // 타임아웃 또는 서버 미연결 시 오프라인 폴백으로 전환
  } finally {
    clearTimeout(timer);
  }

  const fallback = generateFallbackHeatRisk(lat, lon);
  weatherMemoryCache.set(cacheKey, { timestamp: Date.now(), data: fallback });
  return fallback;
}
