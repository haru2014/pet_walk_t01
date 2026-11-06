import { DogProfile } from '../types/dogProfile';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { RecommendedCourse, WalkPreferences, CourseProfile } from '../types/walkSettings';
import { FeedbackSummaryPayload } from './feedbackContext';
import { fetchWithServerFallback } from './apiClient';
import { getPilotParkById } from '../types/pilotParks';
import { mergeCurrentLocationPin } from './locationPinHelper';
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
 * 출발 좌표를 정한다. 현재 위치 모드는 실측 GPS 좌표만 쓴다.
 * 좌표가 없을 때 특정 공원 좌표로 대신하면 다른 동네 길을 "현재 위치 코스"로 보여 주게 되므로 오류로 알린다.
 */
function resolveOrigin(preferences?: WalkPreferences) {
  const originMode = preferences?.originMode ?? 'park';
  const isCurrentLocation = originMode === 'current_location';
  const park = getPilotParkById(preferences?.pilotParkId);
  const center = isCurrentLocation ? preferences?.userCoordinates : park.center;

  if (!center) {
    throw new RoutePlanError('LOCATION_UNAVAILABLE', '현재 위치를 확인하지 못했어요. 위치 권한과 GPS를 확인한 뒤 다시 시도해 주세요.');
  }

  return {
    originMode,
    isCurrentLocation,
    park,
    originLat: center.lat,
    originLon: center.lon,
    parkZone: isCurrentLocation ? '현재 위치 주변' : park.name,
  };
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


function isValidParkResponse(data: any, parkId: string): boolean {
  if (data.validated_park_id !== parkId) return false;

  return data.courses.every((course: RecommendedCourse) =>
    data.route_validation?.[course.id]?.passed === true &&
    data.route_validation[course.id].park_id === parkId &&
    data.course_plans?.[course.id]?.route?.features?.length > 0
  );
}

/** 코스 목록과 지도에 그릴 경로가 있는 응답만 받아들인다. 공원 모드는 공원 경계 검증 결과도 확인한다. */
function isValidPlanResponse(data: any, origin: ReturnType<typeof resolveOrigin>): boolean {
  if (!Array.isArray(data.courses) || data.courses.length === 0) return false;
  if (!data.geojson?.features?.length) return false;
  return origin.isCurrentLocation || isValidParkResponse(data, origin.park.id);
}

async function buildPlanError(response: Response, isCurrentLocation: boolean): Promise<RoutePlanError> {
  const error = await response.json().catch(() => ({}));
  const fallbackMessage = isCurrentLocation
    ? '현재 위치 주변의 산책 경로를 생성하지 못했습니다.'
    : '선택한 공원 안의 산책 경로를 생성하지 못했습니다.';
  return new RoutePlanError(
    error.code ?? 'NO_VALID_LOOP',
    typeof error.detail === 'string' ? error.detail : fallbackMessage,
    error.request_id
  );
}

function toPlanError(error: unknown, isCurrentLocation: boolean): RoutePlanError {
  if (error instanceof RoutePlanError) return error;
  return new RoutePlanError(
    'ROUTING_PROVIDER_TIMEOUT',
    isCurrentLocation
      ? '현재 위치 주변 경로를 확인할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.'
      : '공원 내부 경로를 확인할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.'
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
): RoutePlanResult {
  const profiles: Record<string, CourseProfile> | undefined = data.course_profiles;
  const courses = parseLiveCourses(data.courses, profiles, data.score);
  const stepPins: readonly RouteStepPin[] = data.step_pins ?? [];

  return {
    isLiveServer: true,
    courses,
    route: data.geojson,
    stepPins: isCurrentLocation ? mergeCurrentLocationPin(stepPins, originLon, originLat) : stepPins,
    coursePlans: data.course_plans,
    courseProfiles: profiles,
    elevationAttribution: data.elevation_source?.attribution ?? null,
    briefingMessage: data.briefing ?? `${dog.name}를 위한 맞춤형 안심 코스가 생성되었습니다.`,
    safetyBriefingMessage: typeof data.safety_briefing === 'string' ? data.safety_briefing : '',
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

/**
 * 서버가 검증한 실제 보행로 코스만 돌려준다.
 * 서버 오류·시간 초과·좌표 없음은 RoutePlanError 로 알리며, 앱이 임의로 만든 경로로 대신하지 않는다 (GEMINI.md 원칙 8).
 */
export async function requestWalkPlan(
  dog: DogProfile,
  preferences?: WalkPreferences,
  feedback?: FeedbackSummaryPayload | null,
  options?: { regenerateNonce?: number; signal?: AbortSignal },
): Promise<RoutePlanResult> {
  const nonce = options?.regenerateNonce ?? 0;
  const prefetchHit = checkPrefetchCache(dog, preferences, feedback, nonce > 0);
  // 진행 중인 프리페치를 이어받을 때는 그 실패(RoutePlanError)도 그대로 전달한다. 결과를 null 로 받아 쓰지 않는다.
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

    if (!response.ok) {
      throw await buildPlanError(response, isCurrentLocation);
    }
    const data = await response.json();
    if (!isValidPlanResponse(data, origin)) {
      throw new RoutePlanError(
        'ROUTE_VALIDATION_FAILED',
        isCurrentLocation
          ? '현재 위치 주변의 검증된 경로를 확인할 수 없습니다. 다시 시도해 주세요.'
          : '선택한 공원 내부의 검증된 경로를 확인할 수 없습니다. 다시 시도해 주세요.',
        data.request_id
      );
    }
    return buildLivePlanResult(data, dog, isCurrentLocation, originLat, originLon);
  } catch (error) {
    throw toPlanError(error, isCurrentLocation);
  } finally {
    clearTimeout(timeoutId);
  }

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
