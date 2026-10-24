import { DogProfile } from '../types/dogProfile';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { RecommendedCourse, WalkPreferences, DEFAULT_RECOMMENDED_COURSES, CourseProfile } from '../types/walkSettings';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS, getCoursePlanByParkId } from './sampleRoute';
import { FeedbackSummaryPayload } from './feedbackContext';
import { generateAdaptiveCourses, generateAdaptiveBriefing } from './courseAdaptivePlanner';
import { fetchWithServerFallback } from './apiClient';
import { getPilotParkById } from '../types/pilotParks';
import { mergeCurrentLocationPin, createCurrentLocationPin } from './locationPinHelper';

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

function createCurrentLocationFallbackPlan(
  lat: number,
  lon: number,
  nonce = 0,
): { route: RouteFeatureCollection; stepPins: RouteStepPin[] } {
  const count = 8;
  const radiusDeg = 0.0018; // 약 200m 완만 순환
  const rotationAngle = (nonce * (Math.PI / 2)) % (2 * Math.PI); // 재생성마다 90도씩 회전
  const offsetLon = (radiusDeg * 0.7) * Math.cos(rotationAngle) * 1.2;
  const offsetLat = (radiusDeg * 0.7) * Math.sin(rotationAngle);
  const centerLon = lon + offsetLon;
  const centerLat = lat + offsetLat;

  const coords: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const angle = rotationAngle + (i * 2 * Math.PI) / count;
    const pLon = centerLon + radiusDeg * Math.cos(angle) * 1.2;
    const pLat = centerLat + radiusDeg * Math.sin(angle);
    coords.push([Number(pLon.toFixed(6)), Number(pLat.toFixed(6))]);
  }
  coords.push(coords[0]);

  const route: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 2.0, shaded: true },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      },
    ],
  };

  const directionNames = ['동쪽', '북쪽', '서쪽', '남쪽'];
  const dirName = directionNames[nonce % directionNames.length];
  const stepPins: RouteStepPin[] = [
    createCurrentLocationPin(lon, lat, `현재 위치 기반 ${dirName} 완만 순환 코스`),
  ];

  return { route, stepPins };
}

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
    avoid_stairs: envs.includes('stairs'),
    prefer_shade: envs.includes('shade'),
    prefer_cushion: envs.includes('soft'),
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
      return createCurrentLocationFallbackPlan(originLat, originLon, nonce);
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
  if (isCurrentLocation) {
    return;
  }
  if (error instanceof RoutePlanError) {
    throw error;
  }
  throw new RoutePlanError(
    'ROUTING_PROVIDER_TIMEOUT',
    '공원 내부 경로를 확인할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.'
  );
}

export async function requestWalkPlan(
  dog: DogProfile,
  preferences?: WalkPreferences,
  feedback?: FeedbackSummaryPayload | null,
  options?: { regenerateNonce?: number },
): Promise<RoutePlanResult> {
  const origin = resolveOrigin(preferences);
  const { isCurrentLocation, park, originLat, originLon } = origin;

  if (!isCurrentLocation && preferences?.pilotParkId && preferences.pilotParkId !== park.id) {
    throw new RoutePlanError('BOUNDARY_DATA_UNAVAILABLE', '선택한 공원의 경계 데이터를 확인할 수 없습니다. 다른 공원을 선택해 주세요.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

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
      const defaultPlan = resolveDefaultPlan(isCurrentLocation, originLat, originLon, preferences, options?.regenerateNonce ?? 0);
      const rawCourses: RecommendedCourse[] = data.courses ?? DEFAULT_RECOMMENDED_COURSES;
      const profiles: Record<string, CourseProfile> | undefined = data.course_profiles;
      const courses: RecommendedCourse[] = rawCourses.map((c, idx) => {
        const profile = profiles?.[c.id] ?? null;
        let score = c.score;
        if (score == null && c.reason) {
          const match = c.reason.match(/맞춤 점수\s*(\d+)점/);
          if (match) score = parseInt(match[1], 10);
        }
        if (score == null && idx === 0 && typeof data.score === 'number') {
          score = Math.round(data.score);
        }
        return {
          ...c,
          score,
          profile,
          slopeSource: profile?.slope_source ?? c.slopeSource,
          maxSlopePercent: profile?.max_slope_percent !== undefined ? profile.max_slope_percent : c.maxSlopePercent,
        };
      });

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
    if (!isCurrentLocation) {
      await throwParkError(response);
    }
  } catch (error) {
    handlePlanError(error, isCurrentLocation);
  } finally {
    clearTimeout(timeoutId);
  }

  // 🛡️ 오프라인 / 데모용 무중단 자동 폴백
  const fallbackCourses = generateAdaptiveCourses(dog, preferences, feedback, options?.regenerateNonce);
  const fallbackBriefing = generateAdaptiveBriefing(dog, preferences, feedback);
  const defaultPlan = resolveDefaultPlan(isCurrentLocation, originLat, originLon, preferences, options?.regenerateNonce ?? 0);
  const fallbackStepPins = isCurrentLocation
    ? mergeCurrentLocationPin(defaultPlan.stepPins, originLon, originLat)
    : defaultPlan.stepPins;

  return {
    isLiveServer: false,
    courses: fallbackCourses,
    route: defaultPlan.route,
    stepPins: fallbackStepPins,
    briefingMessage: fallbackBriefing,
    safetyBriefingMessage: '',
  };
}
