import { DogProfile } from '../types/dogProfile';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { RecommendedCourse, WalkPreferences, DEFAULT_RECOMMENDED_COURSES, CourseProfile } from '../types/walkSettings';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS, getCoursePlanByParkId } from './sampleRoute';
import { FeedbackSummaryPayload } from './feedbackContext';
import { generateAdaptiveCourses, generateAdaptiveBriefing } from './courseAdaptivePlanner';
import { fetchWithServerFallback } from './apiClient';
import { getPilotParkById } from '../types/pilotParks';
import { mergeCurrentLocationPin, createCurrentLocationPin } from './locationPinHelper';
import { WalkPlanPrefetchService } from './walkPlanPrefetchService';

export class RoutePlanError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId?: string) {
    super(message);
    this.name = 'RoutePlanError';
  }
}

export interface RoutePlanResult {
  readonly isLiveServer: boolean;
  readonly courses: readonly RecommendedCourse[];
  readonly route: RouteFeatureCollection;
  readonly stepPins: readonly RouteStepPin[];
  readonly briefingMessage: string;
  readonly safetyBriefingMessage: string;
  readonly coursePlans?: Record<string, { route: RouteFeatureCollection; stepPins: readonly RouteStepPin[] }>;
  readonly courseProfiles?: Record<string, CourseProfile>;
  readonly elevationAttribution?: string | null;
}

const API_TIMEOUT_MS = 20000;

/**
 * [근본 해결] 현재 위치 중심의 자연스러운 순환 보행 코스를 생성한다.
 * 8각형 기하 도형 대신 36개 곡선 좌표와 3개 세그먼트(초입 그늘, 중간 흙길, 복귀 안심로)를 적용.
 */
export function createCurrentLocationWalkPlan(
  lat: number,
  lon: number,
  courseIndex = 0,
  durationMinutes = 30,
): { route: RouteFeatureCollection; stepPins: RouteStepPin[] } {
  const radiusKm = Math.min(0.45, Math.max(0.18, (2.8 * (durationMinutes / 60)) / (2 * Math.PI)));
  const radiusLat = radiusKm / 111.0;
  const radiusLon = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));

  const baseBearings = [Math.PI / 4, (3 * Math.PI) / 4, (7 * Math.PI) / 4];
  const centerAngle = baseBearings[courseIndex % 3];
  const centerLat = lat + radiusLat * Math.sin(centerAngle) * 0.75;
  const centerLon = lon + radiusLon * Math.cos(centerAngle) * 0.75;

  const totalPoints = 36;
  const coords: [number, number][] = [];
  coords.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);

  for (let i = 1; i < totalPoints; i++) {
    const t = (i / totalPoints) * 2 * Math.PI;
    const wobble = 1.0 + 0.08 * Math.sin(3 * t) + 0.05 * Math.cos(2 * t);
    const pLon = centerLon + radiusLon * wobble * Math.cos(t);
    const pLat = centerLat + radiusLat * wobble * Math.sin(t);
    coords.push([Number(pLon.toFixed(6)), Number(pLat.toFixed(6))]);
  }
  coords.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);

  const p1 = Math.floor(coords.length / 3);
  const p2 = Math.floor((coords.length * 2) / 3);

  const route: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1.5, shaded: true },
        geometry: { type: 'LineString', coordinates: coords.slice(0, p1 + 1) },
      },
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1.2, shaded: true },
        geometry: { type: 'LineString', coordinates: coords.slice(p1, p2 + 1) },
      },
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1.8, shaded: false },
        geometry: { type: 'LineString', coordinates: coords.slice(p2) },
      },
    ],
  };

  const courseNames = ['맞춤 안심 순환', '근린공원 안심 순환', '조용한 주택가 산책'];
  const stepPins: RouteStepPin[] = [
    createCurrentLocationPin(lon, lat, `현재 위치 출발 · ${courseNames[courseIndex % 3]}로`),
    {
      id: `turn-mid-${courseIndex}`,
      position: coords[p1],
      kind: 'turn',
      instruction: '녹지 그늘 구간 진입',
      detail: '흙길 및 완만 구간',
    },
    {
      id: `turn-return-${courseIndex}`,
      position: coords[p2],
      kind: 'turn',
      instruction: '출발지 복귀 방향 전환',
      detail: '평탄 안심 보행로',
    },
  ];

  return { route, stepPins };
}

export const createCurrentLocationFallbackPlan = createCurrentLocationWalkPlan;

function resolveOrigin(preferences?: WalkPreferences) {
  const originMode = preferences?.originMode ?? 'park';
  const isCurrentLocation = originMode === 'current_location';
  const park = getPilotParkById(preferences?.pilotParkId);
  const userCoords = preferences?.userCoordinates;

  const originLat = isCurrentLocation ? (userCoords?.lat ?? 36.3628) : park.center.lat;
  const originLon = isCurrentLocation ? (userCoords?.lon ?? 127.3592) : park.center.lon;
  const parkZone = isCurrentLocation ? '현재 위치 주변' : park.name;

  return { originMode, isCurrentLocation, park, originLat, originLon, parkZone };
}

function buildPlanPayload(
  dog: DogProfile,
  preferences: WalkPreferences | undefined,
  feedback: FeedbackSummaryPayload | null | undefined,
  origin: ReturnType<typeof resolveOrigin>,
  options?: { regenerateNonce?: number },
) {
  const envs = preferences?.environments ?? [];
  return {
    dog_id: dog.id,
    dog_name: dog.name,
    speed_kmh: dog.speedKmH,
    joint_care_level: dog.jointCareLevel,
    target_duration_minutes: preferences?.durationMinutes ?? 30,
    environments: envs,
    avoid_stairs: envs.includes('stairs'),
    prefer_shade: envs.includes('shade'),
    prefer_cushion: envs.includes('soft'),
    avoid_traffic: envs.includes('traffic'),
    prefer_quiet: envs.includes('quiet'),
    prefer_rest: envs.includes('rest'),
    request_text: preferences?.requestText ?? '',
    recent_feedback: feedback ?? null,
    origin_mode: origin.originMode,
    origin_lat: origin.originLat,
    origin_lon: origin.originLon,
    pilot_park_id: !origin.isCurrentLocation ? origin.park.id : undefined,
    park_zone: origin.parkZone,
    regenerate_nonce: options?.regenerateNonce ?? 0,
  };
}

function resolveDefaultPlan(
  isCurrentLocation: boolean,
  originLat: number,
  originLon: number,
  preferences?: WalkPreferences,
  nonce = 0,
): { route: RouteFeatureCollection; stepPins: readonly RouteStepPin[] } {
  if (isCurrentLocation) {
    if (preferences?.userCoordinates) {
      return createCurrentLocationWalkPlan(originLat, originLon, nonce, preferences.durationMinutes ?? 30);
    }
    return { route: SAMPLE_ROUTE, stepPins: SAMPLE_STEP_PINS };
  }
  return getCoursePlanByParkId(preferences?.pilotParkId, nonce % 3);
}

function isValidParkResponse(data: any, parkId: string): boolean {
  if (data.validated_park_id !== parkId) return false;
  if (!Array.isArray(data.courses) || data.courses.length === 0) return false;
  if (!data.geojson?.features?.length) return false;

  return data.courses.every((course: RecommendedCourse) =>
    data.route_validation?.[course.id]?.passed === true &&
    data.route_validation[course.id].park_id === parkId &&
    data.course_plans?.[course.id]?.route?.features?.length > 0
  );
}

async function throwParkError(response: Response): Promise<never> {
  const error = await response.json().catch(() => ({}));
  throw new RoutePlanError(
    error.code ?? 'NO_VALID_LOOP',
    typeof error.detail === 'string' ? error.detail : '선택한 공원 안의 산책 경로를 생성하지 못했습니다.',
    error.request_id
  );
}

function handlePlanError(error: unknown, isCurrentLocation: boolean): void {
  if (isCurrentLocation) return;
  if (error instanceof RoutePlanError) throw error;
  throw new RoutePlanError(
    'ROUTING_PROVIDER_TIMEOUT',
    '공원 내부 경로를 확인할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.'
  );
}

function parseLiveCourses(
  rawCourses: readonly RecommendedCourse[],
  profiles?: Record<string, CourseProfile>,
  serverScore?: number | null,
): RecommendedCourse[] {
  return rawCourses.map((c, idx) => {
    const profile = profiles?.[c.id] ?? null;
    let score = c.score;
    if (score == null && c.reason) {
      const match = /맞춤 점수\s*(\d+)점/.exec(c.reason);
      if (match) score = Number.parseInt(match[1], 10);
    }
    if (score == null && idx === 0 && typeof serverScore === 'number') {
      score = Math.round(serverScore);
    }
    return {
      ...c,
      lapCount: c.lapCount ?? (c as any).lap_count,
      lapCycleMeters: c.lapCycleMeters ?? (c as any).lap_cycle_meters,
      loopEntryPoint: c.loopEntryPoint ?? (c as any).loop_entry_point ?? null,
      approachDistanceM: c.approachDistanceM ?? (c as any).approach_distance_m ?? null,
      notice: c.notice,
      score,
      profile,
      slopeSource: profile?.slope_source ?? c.slopeSource,
      maxSlopePercent: profile?.max_slope_percent !== undefined ? profile.max_slope_percent : c.maxSlopePercent,
    };
  });
}

function buildLivePlanResult(
  data: any,
  dog: DogProfile,
  isCurrentLocation: boolean,
  originLat: number,
  originLon: number,
  defaultPlan: { route: RouteFeatureCollection; stepPins: readonly RouteStepPin[] },
): RoutePlanResult {
  const rawCourses: RecommendedCourse[] = data.courses ?? DEFAULT_RECOMMENDED_COURSES;
  const profiles: Record<string, CourseProfile> | undefined = data.course_profiles;
  const courses = parseLiveCourses(rawCourses, profiles, data.score);

  const resolvedStepPins = isCurrentLocation
    ? mergeCurrentLocationPin(data.step_pins ?? defaultPlan.stepPins, originLon, originLat)
    : (data.step_pins ?? defaultPlan.stepPins);

  return {
    isLiveServer: true,
    courses,
    route: data.geojson ?? defaultPlan.route,
    stepPins: resolvedStepPins,
    coursePlans: data.course_plans,
    courseProfiles: profiles,
    elevationAttribution: data.elevation_source?.attribution ?? null,
    briefingMessage: data.briefing ?? `${dog.name}를 위한 맞춤형 안심 코스가 생성되었습니다.`,
    safetyBriefingMessage: typeof data.safety_briefing === 'string' ? data.safety_briefing : '',
  };
}

/**
 * [근본 해결] 현재 위치 오프라인 폴백 시 코스 1, 2, 3 각각의 현재 위치 경로를 coursePlans에 100% 매핑한다.
 */
function buildFallbackPlanResult(
  dog: DogProfile,
  preferences: WalkPreferences | undefined,
  feedback: FeedbackSummaryPayload | null | undefined,
  origin: ReturnType<typeof resolveOrigin>,
  nonce = 0,
): RoutePlanResult {
  const { isCurrentLocation, originLat, originLon } = origin;
  const fallbackCourses = generateAdaptiveCourses(dog, preferences, feedback, nonce);
  const fallbackBriefing = generateAdaptiveBriefing(dog, preferences, feedback);
  const durationMinutes = preferences?.durationMinutes ?? 30;

  const fallbackCoursePlans: Record<string, { route: RouteFeatureCollection; stepPins: readonly RouteStepPin[] }> = {};
  if (isCurrentLocation) {
    fallbackCourses.forEach((c, idx) => {
      fallbackCoursePlans[c.id] = createCurrentLocationWalkPlan(
        originLat,
        originLon,
        idx,
        durationMinutes,
      );
    });
  }

  const defaultPlan = isCurrentLocation
    ? (fallbackCoursePlans[fallbackCourses[0]?.id] ?? createCurrentLocationWalkPlan(originLat, originLon, 0, durationMinutes))
    : resolveDefaultPlan(isCurrentLocation, originLat, originLon, preferences, nonce);

  return {
    isLiveServer: false,
    courses: fallbackCourses,
    route: defaultPlan.route,
    stepPins: defaultPlan.stepPins,
    coursePlans: Object.keys(fallbackCoursePlans).length > 0 ? fallbackCoursePlans : undefined,
    briefingMessage: fallbackBriefing,
    safetyBriefingMessage: '',
  };
}

function checkPrefetchCache(
  dog: DogProfile,
  preferences?: WalkPreferences,
  feedback?: FeedbackSummaryPayload | null,
  isRegenerate = false,
): RoutePlanResult | Promise<RoutePlanResult> | null {
  if (isRegenerate) return null;
  return (
    WalkPlanPrefetchService.consume(dog, preferences, feedback) ??
    WalkPlanPrefetchService.getPending(dog, preferences, feedback) ??
    null
  );
}

export async function requestWalkPlan(
  dog: DogProfile,
  preferences?: WalkPreferences,
  feedback?: FeedbackSummaryPayload | null,
  options?: { regenerateNonce?: number; signal?: AbortSignal },
): Promise<RoutePlanResult> {
  const nonce = options?.regenerateNonce ?? 0;
  const prefetchHit = checkPrefetchCache(dog, preferences, feedback, nonce > 0);
  if (prefetchHit) return prefetchHit;

  const origin = resolveOrigin(preferences);
  const { isCurrentLocation, park, originLat, originLon } = origin;

  if (!isCurrentLocation && preferences?.pilotParkId && preferences.pilotParkId !== park.id) {
    throw new RoutePlanError('BOUNDARY_DATA_UNAVAILABLE', '선택한 공원의 경계 데이터를 확인할 수 없습니다. 다른 공원을 선택해 주세요.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    const payload = buildPlanPayload(dog, preferences, feedback, origin, options);
    const response = await fetchWithServerFallback(
      '/api/v1/walk/plan',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
      API_TIMEOUT_MS
    );

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (!isCurrentLocation && !isValidParkResponse(data, park.id)) {
        throw new RoutePlanError('ROUTE_VALIDATION_FAILED', '선택한 공원 내부의 검증된 경로를 확인할 수 없습니다. 다시 시도해 주세요.', data.request_id);
      }
      const defaultPlan = resolveDefaultPlan(isCurrentLocation, originLat, originLon, preferences, nonce);
      return buildLivePlanResult(data, dog, isCurrentLocation, originLat, originLon, defaultPlan);
    }
    if (!isCurrentLocation) {
      await throwParkError(response);
    }
  } catch (error) {
    handlePlanError(error, isCurrentLocation);
  } finally {
    clearTimeout(timeoutId);
  }

  return buildFallbackPlanResult(dog, preferences, feedback, origin, nonce);
}

export function prefetchWalkPlan(
  dog: DogProfile,
  preferences?: WalkPreferences,
  feedback?: FeedbackSummaryPayload | null,
): Promise<RoutePlanResult | null> {
  return WalkPlanPrefetchService.prefetch(dog, preferences, feedback, (signal) =>
    requestWalkPlan(dog, preferences, feedback, { signal }),
  );
}
