/**
 * [편안하개 - PetWalk]
 * FastAPI 백엔드 라우팅 API 통신 클라이언트 및 오프라인 Mock 폴백 서비스
 *
 * - Live 서버 (FastAPI POST /api/v1/walk/plan) 연결 시 실시간 도로망 경로 수신
 * - 서버 미실행/네트워크 단절 시 0.1초 내 안전한 로컬 목업 데이터로 무중단 자동 폴백
 */

import { DogProfile } from '../types/dogProfile';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { RecommendedCourse, WalkPreferences, DEFAULT_RECOMMENDED_COURSES } from '../types/walkSettings';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS, getCoursePlanByParkId } from './sampleRoute';
import { FeedbackSummaryPayload } from './feedbackContext';
import { generateAdaptiveCourses, generateAdaptiveBriefing } from './courseAdaptivePlanner';

export interface RoutePlanResult {
  readonly isLiveServer: boolean;
  readonly courses: readonly RecommendedCourse[];
  readonly route: RouteFeatureCollection;
  readonly stepPins: readonly RouteStepPin[];
  readonly briefingMessage: string;
  readonly coursePlans?: Record<string, { route: RouteFeatureCollection; stepPins: readonly RouteStepPin[] }>;
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const API_TIMEOUT_MS = 3500;

/**
 * 반려견 조건과 피드백을 기반으로 안심 산책 코스를 요청한다.
 * 백엔드 서버가 활성화되어 있지 않아도 오프라인 안전 데이터로 즉시 폴백한다.
 */
import { getPilotParkById } from '../types/pilotParks';

export async function requestWalkPlan(
  dog: DogProfile,
  preferences?: WalkPreferences,
  feedback?: FeedbackSummaryPayload | null,
): Promise<RoutePlanResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const originMode = preferences?.originMode ?? 'park';
  const isCurrentLocation = originMode === 'current_location';
  const park = getPilotParkById(preferences?.pilotParkId);

  // 1. 현재 위치 기반 vs 2. 지정한 공원 주변 좌표 및 구역 설정
  const originLat = isCurrentLocation ? 36.3628 : park.center.lat;
  const originLon = isCurrentLocation ? 127.3592 : park.center.lon;
  const parkZone = isCurrentLocation ? '현재 위치 주변' : park.name;

  try {
    const envs = preferences?.environments ?? [];
    const payload = {
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
      origin_mode: originMode,
      origin_lat: originLat,
      origin_lon: originLon,
      park_zone: parkZone,
    };

    const response = await fetch(`${API_BASE_URL}/api/v1/walk/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const defaultPlan = isCurrentLocation
        ? { route: SAMPLE_ROUTE, stepPins: SAMPLE_STEP_PINS }
        : getCoursePlanByParkId(preferences?.pilotParkId);
      return {
        isLiveServer: true,
        courses: data.courses ?? DEFAULT_RECOMMENDED_COURSES,
        route: data.geojson ?? defaultPlan.route,
        stepPins: data.step_pins ?? defaultPlan.stepPins,
        coursePlans: data.course_plans,
        briefingMessage: data.briefing ?? `${dog.name}를 위한 맞춤형 안심 코스가 생성되었습니다.`,
      };
    }
  } catch (_err) {
    // 서버 미응답 또는 타임아웃 시 안전하게 폴백
  } finally {
    clearTimeout(timeoutId);
  }

  // 🛡️ 오프라인 / 데모용 무중단 자동 폴백
  const fallbackCourses = generateAdaptiveCourses(dog, preferences, feedback);
  const fallbackBriefing = generateAdaptiveBriefing(dog, preferences, feedback);
  const defaultPlan = isCurrentLocation
    ? { route: SAMPLE_ROUTE, stepPins: SAMPLE_STEP_PINS }
    : getCoursePlanByParkId(preferences?.pilotParkId);

  return {
    isLiveServer: false,
    courses: fallbackCourses,
    route: defaultPlan.route,
    stepPins: defaultPlan.stepPins,
    briefingMessage: fallbackBriefing,
  };
}
