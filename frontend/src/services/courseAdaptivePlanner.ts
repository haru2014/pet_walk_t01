/**
 * [편안하개 - PetWalk]
 * 사용자 조건(목표 시간, 선호 환경, 반려견 속도) 기반 적응형 코스 생성기 (US-A1, US-A3, US-B1)
 *
 * 사용자가 산책 설정 화면에서 20분, 30분, 40분, 1시간 및 선호 환경을 변경했을 때,
 * 추천 코스 3종의 거리, 소요시간, 3대 안심 지표, 추천 사유를 실시간으로 맞춤 산출한다.
 */

import { DogProfile } from '../types/dogProfile';
import {
  EnvironmentId,
  RecommendedCourse,
  WALK_ENVIRONMENTS,
  WalkPreferences,
  formatDurationLabel,
} from '../types/walkSettings';
import { FeedbackSummaryPayload } from './feedbackContext';

import { getPilotParkById } from '../types/pilotParks';

interface CourseBuilderContext {
  readonly dog: DogProfile;
  readonly targetMinutes: number;
  readonly speed: number;
  readonly envs: readonly EnvironmentId[];
  readonly envSummary: string;
  readonly feedback?: FeedbackSummaryPayload | null;
  readonly pilotParkId?: string;
}

/** 환경 ID 목록을 친근한 한국어 요약 문구로 결합한다. */
function buildEnvironmentSummaryText(envs: readonly EnvironmentId[]): string {
  if (envs.length === 0) return '기본 안심 경로';
  const labelMap = new Map(WALK_ENVIRONMENTS.map((e) => [e.id, e.label]));
  const labels = envs.map((id) => labelMap.get(id)).filter(Boolean) as string[];
  if (labels.length <= 2) return labels.join('과 ');
  return `${labels.slice(0, 2).join(', ')} 등 ${labels.length}가지 조건`;
}

/** 목표 시간과 보행 속도로부터 거리를 계산하고 포맷팅한다. */
function calculateDistanceKm(speedKmH: number, minutes: number): string {
  const km = (speedKmH * (minutes / 60));
  return `${km.toFixed(1)} km`;
}

/** 코스 1: 최우선 선호 조건을 정밀 반영한 최적 안심 코스 (목표 시간 100%) */
function buildForestCourse(ctx: CourseBuilderContext): RecommendedCourse {
  const { dog, targetMinutes, speed, envs, envSummary, feedback, pilotParkId } = ctx;
  const hasSoft = envs.includes('soft');
  const hasShade = envs.includes('shade');
  const hasStairs = envs.includes('stairs');
  const slopeOffset = feedback?.recommended_max_slope_offset ?? 0;
  const baseSlope = dog.jointCareLevel >= 2 ? 1.8 : 2.4;
  const maxSlopePercent = slopeOffset < 0
    ? Math.max(1.0, +(baseSlope + slopeOffset * 0.2).toFixed(1))
    : baseSlope;
  const feedbackReason = slopeOffset < 0
    ? ` · 최근 경사도 피드백(${slopeOffset}%) 반영 완화 코스`
    : '';

  const park = getPilotParkById(pilotParkId);

  let courseId = 'course_1';
  let courseName = hasSoft ? '편안한 숲길 코스' : '맞춤 안심 순환 코스';
  let reason = `${dog.name}의 ${targetMinutes}분 산책 목표에 맞춰, ${envSummary}을 우선 반영한 최적 순환 경로예요.${feedbackReason}`;

  if (pilotParkId === 'yurim') {
    courseId = 'yurim_course_1';
    courseName = '유림공원 갑천변 흙길 루프';
    reason = `${park.defaultParkingName} 출발, 갑천 둔치 폭신한 흙길과 그늘을 우선 반영한 안심 순환로예요.${feedbackReason}`;
  } else if (pilotParkId === 'sejong') {
    courseId = 'sejong_course_1';
    courseName = '세종호수공원 은빛해변 완만길';
    reason = `${park.defaultParkingName} 출발, 수상무대섬과 광폭 보행데크 중심의 계단 0개 평지 코스예요.${feedbackReason}`;
  } else if (pilotParkId === 'songgang') {
    courseId = 'songgang_course_1';
    courseName = '송강근린공원 솔밭 숲길 루프';
    reason = `${park.defaultParkingName} 출발, 울창한 솔잎 그늘과 잔디마당을 잇는 평온한 흙길이에요.${feedbackReason}`;
  } else if (pilotParkId === 'doan') {
    courseId = 'doan_course_1';
    courseName = '도안호수공원 갑천 생태데크길';
    reason = `${park.defaultParkingName} 출발, 갑천 생태습지 수변 데크를 잇는 경사 1.1% 평탄길이에요.${feedbackReason}`;
  }

  return {
    id: courseId,
    name: courseName,
    distanceKm: calculateDistanceKm(speed, targetMinutes),
    estimatedMinutes: targetMinutes,
    softRatio: hasSoft ? '78%' : '55%',
    shadeLevel: hasShade ? '많음' : '보통',
    stairsCount: hasStairs ? '0회' : '1회',
    maxSlopePercent,
    shadePercent: hasShade ? 68 : 45,
    softSurfacePercent: hasSoft ? 84 : 60,
    reason,
  };
}

/** 코스 2: 공원 및 쉼터 중심의 가벼운 수변 코스 (목표 시간 약 90%) */
function buildParkCourse(ctx: CourseBuilderContext): RecommendedCourse {
  const { targetMinutes, speed, envs, feedback, pilotParkId } = ctx;
  const minutes = Math.max(10, Math.round(targetMinutes * 0.9));
  const features: string[] = [];
  if (envs.includes('rest')) features.push('쉬어갈 벤치');
  if (envs.includes('shade')) features.push('풍부한 그늘');
  if (envs.includes('traffic')) features.push('차량 통제 보행로');
  const detail = features.length > 0 ? features.join('와 ') : '완만한 공원 산책로';
  const slopeOffset = feedback?.recommended_max_slope_offset ?? 0;
  const maxSlopePercent = slopeOffset < 0
    ? Math.max(1.2, +(2.8 + slopeOffset * 0.2).toFixed(1))
    : 2.8;

  const park = getPilotParkById(pilotParkId);
  const parkCourseName = pilotParkId ? `${park.shortName} 둘레 한바퀴` : '공원 한바퀴 코스';
  const courseId = pilotParkId ? `${pilotParkId}_course_2` : 'course_2';

  return {
    id: courseId,
    name: parkCourseName,
    distanceKm: calculateDistanceKm(speed, minutes),
    estimatedMinutes: minutes,
    softRatio: '68%',
    shadeLevel: '많음',
    stairsCount: '0회',
    maxSlopePercent,
    shadePercent: 55,
    softSurfacePercent: 75,
    reason: `${detail}를 중심으로 ${park.shortName} 둘레를 여유롭게 산책할 수 있어요.`,
  };
}

/** 코스 3: 조용한 주택가 및 골목 안심 코스 (목표 시간 약 110%) */
function buildResidentialCourse(ctx: CourseBuilderContext): RecommendedCourse {
  const { targetMinutes, speed, envs, feedback, pilotParkId } = ctx;
  const minutes = Math.round(targetMinutes * 1.1);
  const hasQuiet = envs.includes('quiet');
  const features: string[] = [];
  if (envs.includes('traffic')) features.push('차량 통행이 적은 골목길');
  if (hasQuiet) features.push('소음이 적은 주택가');
  const detail = features.length > 0 ? features.join('과 ') : '한적한 이면도로';
  const slopeOffset = feedback?.recommended_max_slope_offset ?? 0;
  const maxSlopePercent = slopeOffset < 0
    ? Math.max(1.5, +(3.2 + slopeOffset * 0.2).toFixed(1))
    : 3.2;

  const park = getPilotParkById(pilotParkId);
  let residentialName = hasQuiet ? '조용한 주택가 코스' : '한적한 골목길 코스';
  if (pilotParkId) {
    residentialName = `${park.shortName} 외곽 안심길`;
  }
  const courseId = pilotParkId ? `${pilotParkId}_course_3` : 'course_3';

  return {
    id: courseId,
    name: residentialName,
    distanceKm: calculateDistanceKm(speed, minutes),
    estimatedMinutes: minutes,
    softRatio: envs.includes('soft') ? '58%' : '48%',
    shadeLevel: '보통',
    stairsCount: envs.includes('stairs') ? '0회' : '2회',
    maxSlopePercent,
    shadePercent: 42,
    softSurfacePercent: 62,
    reason: `${detail}를 따라 복잡하지 않고 평온하게 걸을 수 있어요.`,
  };
}

/**
 * 사용자가 선택한 시간과 환경 조건 및 피드백에 적응하여 추천 코스 3종을 생성한다.
 */
export function generateAdaptiveCourses(
  dog: DogProfile,
  preferences?: WalkPreferences,
  feedback?: FeedbackSummaryPayload | null,
): readonly RecommendedCourse[] {
  const targetMinutes = preferences?.durationMinutes ?? 30;
  const envs = preferences?.environments ?? ['soft', 'shade', 'stairs'];
  const speed = dog.speedKmH > 0 ? dog.speedKmH : 2.8;
  const envSummary = buildEnvironmentSummaryText(envs);
  const pilotParkId = preferences?.pilotParkId;

  const ctx: CourseBuilderContext = { dog, targetMinutes, speed, envs, envSummary, feedback, pilotParkId };

  return [
    buildForestCourse(ctx),
    buildParkCourse(ctx),
    buildResidentialCourse(ctx),
  ];
}

/** 사용자 조건에 맞춤형 브리핑 문구를 반환한다. */
export function generateAdaptiveBriefing(
  dog: DogProfile,
  preferences?: WalkPreferences,
  feedback?: FeedbackSummaryPayload | null,
): string {
  const isFree = preferences?.isFreeWalk;
  const targetMinutes = preferences?.durationMinutes ?? 30;
  const timeDesc = isFree ? '자유 산책' : `${formatDurationLabel(targetMinutes)}`;
  const envs = preferences?.environments ?? [];
  const envSummary = buildEnvironmentSummaryText(envs);
  const isCurrent = preferences?.originMode === 'current_location';
  const park = getPilotParkById(preferences?.pilotParkId);
  let parkNote = '[현재 위치 기반] ';
  if (!isCurrent && preferences?.pilotParkId) {
    parkNote = `[${park.shortName}] `;
  }
  let feedbackNote = '';
  if (feedback && feedback.recommended_max_slope_offset < 0) {
    feedbackNote = ` (최근 피드백: 경사도 ${Math.abs(feedback.recommended_max_slope_offset)}% 완화)`;
  }
  return `${parkNote}${dog.name}를 위한 ${timeDesc} 맞춤 코스예요. (${envSummary} 반영${feedbackNote})`;
}

/** 사용자 선택 조건을 상단 태그 칩 문구 배열로 동적 변환한다. */
export function buildAdaptiveConditionLabels(
  dog: DogProfile,
  preferences?: WalkPreferences,
): string[] {
  const isFree = preferences?.isFreeWalk;
  const minutes = preferences?.durationMinutes ?? 30;
  const durationLabel = formatDurationLabel(minutes, isFree);
  const envs = preferences?.environments ?? ['soft', 'shade', 'stairs'];

  const labelMap = new Map(WALK_ENVIRONMENTS.map((e) => [e.id, e.label]));
  const envLabels = envs.map((id) => labelMap.get(id)).filter(Boolean) as string[];

  const isCurrent = preferences?.originMode === 'current_location';
  let parkLabel = ['📍 현위치 기반'];
  if (!isCurrent && preferences?.pilotParkId) {
    parkLabel = [getPilotParkById(preferences.pilotParkId).badgeLabel];
  }
  const customTextLabel = preferences?.requestText?.trim() ? ['직접 요청 반영'] : [];

  return [dog.name, ...parkLabel, durationLabel, ...envLabels, ...customTextLabel];
}
