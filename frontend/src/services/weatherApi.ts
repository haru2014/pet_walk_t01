/**
 * [편안하개 - PetWalk]
 * 기상청 지면열 추정 골든타임 클라이언트 서비스 (US-F1)
 *
 * - 백엔드 FastAPI `GET /api/v1/weather/heat-risk` 실시간 연동
 * - 1시간 TTL 메모리 캐싱 (1.1km 위경도 격자 기반 네트워크/배터리 절약)
 * - 네트워크 오류 / 서버 미실행 시 지면열 수지식 기반 0.1초 무중단 오프라인 폴백
 */

import { HeatRiskHourDTO, HeatRiskLevel, HeatRiskResponse, GoldenTimeWindowDay } from '../types/weather';
import { fetchWithServerFallback } from './apiClient';

export const API_TIMEOUT_MS = 15000; // Render 무료 티어 콜드 스타트 및 모바일 네트워크 환경 대응을 위해 15초로 현실화
export const LIVE_CACHE_TTL_MS = 60 * 60 * 1000; // 실서버 정상 응답: 1시간 TTL
export const FALLBACK_CACHE_TTL_MS = 10 * 1000; // 오프라인 폴백 응답: 서버 기상 시 즉각 갱신되도록 10초만 임시 유지
export const CACHE_TTL_MS = LIVE_CACHE_TTL_MS; // 하위 호환성 유지

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
 * (실서버 응답은 1시간 유지, 오프라인 폴백 데이터는 10초 후 자동 만료)
 */
export function getCachedWeather(lat: number, lon: number): HeatRiskResponse | null {
  const key = buildWeatherCacheKey(lat, lon);
  const entry = weatherMemoryCache.get(key);
  if (!entry) return null;

  const ttl = entry.data.isLiveServer ? LIVE_CACHE_TTL_MS : FALLBACK_CACHE_TTL_MS;
  if (Date.now() - entry.timestamp > ttl) {
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

export const SAFE_MAX_SURFACE_TEMP = 33.0; // Issue #153 나 안: 추정 33℃ 이하만 안전 (여유 두기)
export const CAUTION_MAX_SURFACE_TEMP = 45.0;
export const NO_SUN_SURFACE_OFFSET_C = 1.6; // Issue #153 다 안: 밤·흐릴 때 관측 지면이 기온보다 높은 평균 오차(1.6℃) 보정

/**
 * 안전 지면온도(<=33℃) 여부 및 위험도 판별 (Issue #153)
 */
function evaluateRisk(surfaceTemp: number): { riskLevel: HeatRiskLevel; isGolden: boolean } {
  if (surfaceTemp <= SAFE_MAX_SURFACE_TEMP) {
    return { riskLevel: 'SAFE', isGolden: true };
  }
  if (surfaceTemp <= CAUTION_MAX_SURFACE_TEMP) {
    return { riskLevel: 'CAUTION', isGolden: false };
  }
  return { riskLevel: 'DANGER', isGolden: false };
}

/**
 * 24시간 예보 중 현재 시각 기준 진행 중이거나 가장 가까운 안전 골든타임 윈도우(1.5~2시간 슬롯) 산출
 */
export function computeFocusedGoldenWindow(
  hourly: readonly HeatRiskHourDTO[],
  currentHour: number
): string {
  const safeBlocks: { start: number; end: number }[] = [];
  let blockStart: number | null = null;

  for (let h = 6; h <= 22; h++) {
    const isSafe = hourly[h]?.is_golden_time ?? false;
    if (isSafe) {
      blockStart ??= h;
    } else if (blockStart !== null) {
      safeBlocks.push({ start: blockStart, end: h });
      blockStart = null;
    }
  }
  if (blockStart !== null) {
    safeBlocks.push({ start: blockStart, end: 22 });
  }

  // 1) 현재 진행 중인 안전 블록 (현재 시각 기점 1.5~2시간 슬롯)
  const active = safeBlocks.find((b) => currentHour >= b.start && currentHour < b.end);
  if (active) {
    const end = Math.min(active.end, active.start + 2);
    return `${String(active.start).padStart(2, '0')}:00 ~ ${String(end).padStart(2, '0')}:00`;
  }

  // 2) 오늘 앞으로 다가올 가장 가까운 다음 안전 블록
  const next = safeBlocks.find((b) => b.start > currentHour);
  if (next) {
    const end = Math.min(next.end, next.start + 2);
    return `${String(next.start).padStart(2, '0')}:00 ~ ${String(end).padStart(2, '0')}:00`;
  }

  // 3) 오늘 안전 블록이 이미 모두 끝난 경우 (내일 아침 첫 골든타임)
  if (safeBlocks.length > 0) {
    const first = safeBlocks[0];
    const end = Math.min(first.end, first.start + 2);
    return `${String(first.start).padStart(2, '0')}:00 ~ ${String(end).padStart(2, '0')}:00`;
  }

  return '18:00 ~ 20:00';
}

/**
 * 24시간 예보 중 골든타임 구간의 해당 일자('today' | 'tomorrow' | null) 산출
 */
export function computeGoldenWindowDay(
  hourly: readonly HeatRiskHourDTO[],
  currentHour: number
): GoldenTimeWindowDay {
  const safeBlocks: { start: number; end: number }[] = [];
  let blockStart: number | null = null;

  for (let h = 6; h <= 22; h++) {
    const isSafe = hourly[h]?.is_golden_time ?? false;
    if (isSafe) {
      blockStart ??= h;
    } else if (blockStart !== null) {
      safeBlocks.push({ start: blockStart, end: h });
      blockStart = null;
    }
  }
  if (blockStart !== null) {
    safeBlocks.push({ start: blockStart, end: 22 });
  }

  // 1) 현재 진행 중인 안전 블록 -> today
  if (safeBlocks.some((b) => currentHour >= b.start && currentHour < b.end)) {
    return 'today';
  }

  // 2) 오늘 앞으로 다가올 가장 가까운 다음 안전 블록 -> today
  if (safeBlocks.some((b) => b.start > currentHour)) {
    return 'today';
  }

  // 3) 오늘 안전 블록이 이미 모두 끝난 경우 -> tomorrow
  if (safeBlocks.length > 0) return 'tomorrow';

  return null;
}

/**
 * 오프라인 / 장애 대응 지면열 추정 및 골든타임 폴백 데이터 생성
 */
export function generateFallbackHeatRisk(lat: number, lon: number): HeatRiskResponse {
  const now = new Date();
  const currentHour = now.getHours();
  const hourly: HeatRiskHourDTO[] = [];

  for (let h = 0; h < 24; h++) {
    const airTemp = getAirTempForHour(h);
    const weight = getInsolationWeightForHour(h);
    // Issue #153 다 안: 해 없을 때(밤·흐림) 관측 지면이 기온보다 평균 1.6℃ 높은 점 반영
    const surfaceTemp = Math.round((airTemp + NO_SUN_SURFACE_OFFSET_C * (1.0 - weight) + weight * 15.0) * 10) / 10;
    const { riskLevel, isGolden } = evaluateRisk(surfaceTemp);
    const solarRadiation = Math.round(weight * 1000 * 10) / 10;
    const surfaceTemps = {
      asphalt: Math.round((airTemp + NO_SUN_SURFACE_OFFSET_C * (1.0 - weight) + weight * 18.0) * 10) / 10,
      paved: Math.round((airTemp + NO_SUN_SURFACE_OFFSET_C * (1.0 - weight) + weight * 14.0) * 10) / 10,
      rubber: Math.round((airTemp + NO_SUN_SURFACE_OFFSET_C * (1.0 - weight) + weight * 12.0) * 10) / 10,
      dirt: Math.round((airTemp + NO_SUN_SURFACE_OFFSET_C * (1.0 - weight) + weight * 12.6) * 10) / 10, // 서버 SURFACE_HEAT_GAIN_MAP["dirt"] 와 같은 값 (ASOS 관측 적합)
      grass: Math.round((airTemp + NO_SUN_SURFACE_OFFSET_C * (1.0 - weight) + weight * 4.0) * 10) / 10,
      gravel: Math.round((airTemp + NO_SUN_SURFACE_OFFSET_C * (1.0 - weight) + weight * 10.0) * 10) / 10,
    };

    hourly.push({
      hour: h,
      air_temp_celsius: airTemp,
      estimated_surface_temp: surfaceTemp,
      risk_level: riskLevel,
      is_golden_time: isGolden,
      notice: '본 지수는 기상청 예보 모델 기반 추정치입니다.',
      solar_radiation_w_m2: solarRadiation,
      surface_temps: surfaceTemps,
    });
  }

  const currentDto = hourly[currentHour] || hourly[12];
  const goldenWindow = computeFocusedGoldenWindow(hourly, currentHour);
  const goldenWindowDay = computeGoldenWindowDay(hourly, currentHour);

  return {
    isLiveServer: false,
    current_hour: currentHour,
    current_air_temp: currentDto.air_temp_celsius,
    current_surface_temp: currentDto.estimated_surface_temp,
    current_risk_level: currentDto.risk_level,
    is_current_golden: currentDto.is_golden_time,
    golden_time_window: goldenWindow,
    golden_time_window_day: goldenWindowDay,
    pop: 10,
    solar_radiation_w_m2: currentDto.solar_radiation_w_m2,
    surface_temps: currentDto.surface_temps,
    air_quality: {
      pm10: 24.0,
      pm25: 12.0,
      grade_label: '좋음',
      station_name: '주변 측정소',
      data_source: 'estimated',
    },
    hourly_forecast: hourly,
    notice: '실시간 날씨를 불러오지 못해 예상 정보를 보여드려요.',
    attribution: null,
    insolation_source: 'sky_fallback',
    data_source: 'fallback_estimate',
    fetched_at: now.toISOString(),
  };
}

function resolveGoldenTimeWindowDay(
  serverDay?: GoldenTimeWindowDay,
  goldenWindow?: string
): GoldenTimeWindowDay {
  if (serverDay !== undefined) {
    return serverDay;
  }
  if (goldenWindow?.startsWith('내일')) {
    return 'tomorrow';
  }
  return 'today';
}

function resolveSolarRadiation(
  currentVal?: number,
  dataVal?: unknown,
  rawCurrentVal?: unknown
): number | undefined {
  if (typeof currentVal === 'number') return currentVal;
  if (typeof dataVal === 'number') return dataVal;
  if (typeof rawCurrentVal === 'number') return rawCurrentVal;
  return undefined;
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
    const res = await fetchWithServerFallback(
      `/api/v1/weather/heat-risk?lat=${lat}&lon=${lon}`,
      { signal: controller.signal },
      API_TIMEOUT_MS
    );
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const rawCurrent = data.current || {};
      const hourlyForecast: HeatRiskHourDTO[] = data.hourly_forecast ?? [];
      const deviceHour = new Date().getHours();

      // 시차(UTC vs KST) 또는 시간차 방어: 단말기 현재 시각에 일치하는 hourly 항목 매칭
      const matchedHourItem = hourlyForecast.find((h) => h.hour === deviceHour);
      const current = (rawCurrent.hour === deviceHour ? rawCurrent : matchedHourItem) || rawCurrent;

      const goldenWindow = data.golden_time_window ?? '18:00 ~ 20:00';
      const goldenWindowDay = resolveGoldenTimeWindowDay(data.golden_time_window_day, goldenWindow);

      let resolvedPty: number | undefined;
      if (typeof current.pty === 'number') {
        resolvedPty = current.pty;
      } else if (typeof data.pty === 'number') {
        resolvedPty = data.pty;
      }

      const response: HeatRiskResponse = {
        isLiveServer: true,
        current_hour: current.hour ?? deviceHour,
        current_air_temp: current.air_temp_celsius ?? 17.5,
        current_surface_temp: current.estimated_surface_temp ?? 17.5,
        current_risk_level: current.risk_level ?? 'SAFE',
        is_current_golden: current.is_golden_time ?? true,
        golden_time_window: goldenWindow,
        golden_time_window_day: goldenWindowDay,
        pop: typeof data.pop === 'number' ? data.pop : (current.pop ?? 0),
        pty: resolvedPty,
        condition: current.condition ?? data.condition,
        solar_radiation_w_m2: resolveSolarRadiation(
          current.solar_radiation_w_m2,
          data.solar_radiation_w_m2,
          rawCurrent.solar_radiation_w_m2
        ),
        surface_temps: current.surface_temps ?? rawCurrent.surface_temps ?? data.surface_temps,
        air_quality: data.air_quality ?? {
          pm10: 25.0,
          pm25: 14.0,
          grade_label: '좋음',
          station_name: '실시간 측정소',
          data_source: 'estimated',
        },
        hourly_forecast: data.hourly_forecast ?? [],
        notice: data.notice ?? '본 지수는 기상청 예보 모델 기반 추정치입니다.',
        attribution: data.attribution ?? null,
        insolation_source: data.insolation_source,
        data_source: data.data_source,
        fetched_at: new Date().toISOString(),
      };
      weatherMemoryCache.set(cacheKey, { timestamp: Date.now(), data: response });
      return response;
    }
  } catch (err) {
    console.warn('[weatherApi] 실시간 기상청 지면열 조회 실패, 오프라인 폴백으로 전환:', err);
  } finally {
    clearTimeout(timer);
  }

  const fallback = generateFallbackHeatRisk(lat, lon);
  weatherMemoryCache.set(cacheKey, { timestamp: Date.now(), data: fallback });
  return fallback;
}
