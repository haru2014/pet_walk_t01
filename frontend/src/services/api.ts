import { DogProfile } from '../types/dogProfile';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { RecommendedCourse, WalkPreferences, DEFAULT_RECOMMENDED_COURSES, CourseProfile } from '../types/walkSettings';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS, getCoursePlanByParkId } from './sampleRoute';
import { FeedbackSummaryPayload } from './feedbackContext';
import { generateAdaptiveCourses, generateAdaptiveBriefing } from './courseAdaptivePlanner';
import { fetchWithServerFallback } from './apiClient';
import { getPilotParkById } from '../types/pilotParks';
import { mergeCurrentLocationPin, createCurrentLocationPin } from './locationPinHelper';
import { WalkPlanPrefetchService, buildPrefetchKey } from './walkPlanPrefetchService';

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
 * [US-A3] 현재 위치 기반 산책로 오프라인 폴백 생성기.
 * 인위적인 단순 정8각형 기하 도형을 배제하고, 실제 주거/상업지 도로망 블록(Grid-aligned Loop)과
 * 교차로 코너 스무딩을 모방하여 건물 관통 느낌이 없는 자연스러운 보행 순환 경로를 생성합니다.
 */
export function createCurrentLocationFallbackPlan(
  lat: number,
  lon: number,
  nonce = 0,
): { route: RouteFeatureCollection; stepPins: RouteStepPin[] } {
  // 1. 방향별 블록 크기 (약 1.0 ~ 1.2km 순환 규모: 가로세로 약 250m~350m)
  // 위도 1도 ≈ 111,000m -> 0.0025도 ≈ 277m
  // 경도 1도 ≈ 88,000m (한국 위도 36도 기준) -> 0.0032도 ≈ 281m
  const dLat = 0.0022;
  const dLon = 0.0028;

  // nonce에 따른 4방향 순환 블록 (북동, 남동, 북서, 남서)
  const variants = [
    { name: '동측 골목 안심길', dx: 1, dy: 1, stepLabels: ['우측 보행로를 따라 직진하세요', '모퉁이에서 좌회전하세요', '이면도로 안심길을 따라 직진하세요', '출발지로 복귀하세요'] },
    { name: '북측 공원방면 순환로', dx: -1, dy: 1, stepLabels: ['골목 보행로를 따라 직진하세요', '교차로에서 우회전하세요', '완만한 내리막 보도를 따라 걸으세요', '출발지로 안전하게 돌아오세요'] },
    { name: '서측 주택가 산책로', dx: -1, dy: -1, stepLabels: ['보도를 따라 직진하세요', '모퉁이에서 좌회전하세요', '한적한 골목길로 진행하세요', '출발점으로 귀환하세요'] },
    { name: '남측 수변 연결로', dx: 1, dy: -1, stepLabels: ['안전 보행로를 따라 이동하세요', '모퉁이에서 우회전하세요', '직진 후 출발지 방면으로 회전하세요', '출발지에 도착합니다'] },
  ];
  const variant = variants[nonce % variants.length];
  const sx = variant.dx * dLon;
  const sy = variant.dy * dLat;

  // 도로 블록을 따라 4개의 주요 코너를 형성하고, 코너마다 3점씩 스무딩하여 자연스러운 도로 곡선 구현
  const waypoints: [number, number][] = [];
  
  // 출발점 (현위치)
  waypoints.push([lon, lat]);
  // 1구간: 출발지 -> 1차 교차로 (약 250m 보도 직진)
  waypoints.push([lon + sx * 0.45, lat + sy * 0.05]);
  waypoints.push([lon + sx * 0.85, lat + sy * 0.12]);
  // 코너 1 스무딩 (우회전/좌회전 모퉁이)
  waypoints.push([lon + sx * 0.98, lat + sy * 0.22]);
  waypoints.push([lon + sx * 1.00, lat + sy * 0.35]);

  // 2구간: 1차 교차로 -> 2차 교차로 (횡방향 보행로 직진)
  waypoints.push([lon + sx * 0.96, lat + sy * 0.70]);
  waypoints.push([lon + sx * 0.90, lat + sy * 0.92]);
  // 코너 2 스무딩
  waypoints.push([lon + sx * 0.82, lat + sy * 0.98]);
  waypoints.push([lon + sx * 0.68, lat + sy * 1.00]);

  // 3구간: 2차 교차로 -> 3차 교차로 (이면도로 안심길 직진)
  waypoints.push([lon + sx * 0.35, lat + sy * 0.94]);
  waypoints.push([lon + sx * 0.12, lat + sy * 0.88]);
  // 코너 3 스무딩
  waypoints.push([lon + sx * 0.04, lat + sy * 0.78]);
  waypoints.push([lon + sx * 0.00, lat + sy * 0.62]);

  // 4구간: 3차 교차로 -> 출발지로 안전 귀환
  waypoints.push([lon + sx * 0.02, lat + sy * 0.30]);
  waypoints.push([lon, lat]); // 완전 폐합 순환

  const coords: [number, number][] = waypoints.map(([wLon, wLat]) => [
    Number(wLon.toFixed(6)),
    Number(wLat.toFixed(6)),
  ]);

  const route: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 2.2, shaded: true },
        geometry: {
          type: 'LineString',
          coordinates: coords.slice(0, 7),
        },
      },
      {
        type: 'Feature',
        properties: { segmentType: 'caution', maxSlopePercent: 3.5, shaded: false },
        geometry: {
          type: 'LineString',
          coordinates: coords.slice(6, 11),
        },
      },
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1.8, shaded: true },
        geometry: {
          type: 'LineString',
          coordinates: coords.slice(10),
        },
      },
    ],
  };

  const stepPins: RouteStepPin[] = [
    createCurrentLocationPin(lon, lat, `현재 위치 출발 · ${variant.name}`),
    {
      id: `pin_corner_1_${nonce}`,
      kind: 'turn',
      position: coords[4],
      instruction: variant.stepLabels[0],
    },
    {
      id: `pin_corner_2_${nonce}`,
      kind: 'caution',
      position: coords[8],
      instruction: variant.stepLabels[1],
    },
    {
      id: `pin_corner_3_${nonce}`,
      kind: 'turn',
      position: coords[12],
      instruction: variant.stepLabels[2],
    },
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
    // 산책 설정 환경 조건 6종 (서버 대응표: backend/services/walk_preferences.py)
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
    if (originLat && originLon) {
      return createCurrentLocationFallbackPlan(originLat, originLon, nonce);
    }
    if (preferences?.userCoordinates) {
      return createCurrentLocationFallbackPlan(preferences.userCoordinates.lat, preferences.userCoordinates.lon, nonce);
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
  options?: { regenerateNonce?: number; signal?: AbortSignal },
): Promise<RoutePlanResult> {
  const isRegenerate = Boolean(options?.regenerateNonce && options.regenerateNonce > 0);

  // 1. 프리페치된 결과가 있으면 즉시 소비하여 반환 (Zero-Latency)
  if (!isRegenerate) {
    const cached = WalkPlanPrefetchService.consume(dog, preferences, feedback);
    if (cached) {
      return cached;
    }
    // 2. 현재 동일 조건으로 진행 중인 프리페치 Promise가 있다면 중복 요청 없이 편승 (Request Deduplication)
    const pending = WalkPlanPrefetchService.getPending(dog, preferences, feedback);
    if (pending) {
      return pending;
    }
  }

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
      const defaultPlan = resolveDefaultPlan(isCurrentLocation, originLat, originLon, preferences, options?.regenerateNonce ?? 0);
      const rawCourses: RecommendedCourse[] = data.courses ?? DEFAULT_RECOMMENDED_COURSES;
      const profiles: Record<string, CourseProfile> | undefined = data.course_profiles;
      const courses: RecommendedCourse[] = rawCourses.map((c, idx) => {
        const profile = profiles?.[c.id] ?? null;
        let score = c.score;
        if (score == null && c.reason) {
          const match = /맞춤 점수\s*(\d+)점/.exec(c.reason);
          if (match) score = Number.parseInt(match[1], 10);
        }
        if (score == null && idx === 0 && typeof data.score === 'number') {
          score = Math.round(data.score);
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

      const resolvedStepPins = isCurrentLocation
        ? mergeCurrentLocationPin(data.step_pins ?? defaultPlan.stepPins, originLon, originLat)
        : (data.step_pins ?? defaultPlan.stepPins);

      const resolvedResult: RoutePlanResult = {
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

      return resolvedResult;
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

/**
 * [US-A3, US-C1] 산책 조건 설정 화면에서 백그라운드로 경로를 사전 요청하는 프리페치 함수.
 */
export function prefetchWalkPlan(
  dog: DogProfile,
  preferences?: WalkPreferences,
  feedback?: FeedbackSummaryPayload | null,
): Promise<RoutePlanResult | null> {
  return WalkPlanPrefetchService.prefetch(dog, preferences, feedback, (signal) =>
    requestWalkPlan(dog, preferences, feedback, { signal }),
  );
}
