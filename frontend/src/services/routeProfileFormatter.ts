/**
 * [편안하개 - PetWalk]
 * 경로 경사도 및 노면 정보 포맷터 (US-B1, US-B2)
 *
 * 목적:
 * 경사도 또는 노면 정보가 없을 때 임의의 숫자(0% 또는 평탄함)나 유형(포장도로, 흙길)으로 대체하지 않고
 * 실제 측정값(DEM), 근사값(지형 모델), 미확인(알 수 없음) 상태를 정확히 구분하여 사용자 친화적인 한국어로 표시한다.
 * (docs/member4/편안하개_경사도_노면_알수없음_처리_Gemini_Code_Assist_지시서.md 준수)
 */

import { CourseProfile, RecommendedCourse } from '../types/walkSettings';

export type SlopeSource = 'dem' | 'approximation' | 'unknown';

export interface FormattedSlope {
  /** 카드 및 인라인 지표에 바로 노출할 수 있는 완전한 표현 (예: '최대 2.1%', '예상 약 2.8%', '경사도 정보 없음') */
  readonly text: string;
  /** 라벨 명칭 (예: '완만한 경사', '예상 경사도', '경사도') */
  readonly label: string;
  /** 값만 표시할 때 (예: '최대 2.1%', '약 2.8%', '정보 없음') */
  readonly valueText: string;
  /** 보조 설명 (예: 'DEM 지형 고도차 기준', '지형 모델 기반 근사 계산', '고도 데이터 확인 불가') */
  readonly subText: string;
  /** 고도 출처 분류 */
  readonly source: SlopeSource;
  /** 데이터 미확인 여부 */
  readonly isUnknown: boolean;
  /** 근사 계산 여부 */
  readonly isApproximation: boolean;
  /** 숫자 값 (미확인 시 null) */
  readonly numericValue: number | null;
}

export interface FormattedSurface {
  /** 카드 및 인라인 지표에 바로 노출할 수 있는 표현 (예: '78%', '50% (확인 70%)', '노면 정보 없음') */
  readonly text: string;
  /** 라벨 명칭 (예: '폭신한 노면', '노면 정보') */
  readonly label: string;
  /** 값만 표시할 때 (예: '78%', '정보 없음') */
  readonly valueText: string;
  /** 보조 설명 (예: '흙길·잔디로 발바닥 안심', '확인 구간(70%) 기준', '보행로 노면 태그 없음') */
  readonly subText: string;
  /** 데이터 미확인 여부 */
  readonly isUnknown: boolean;
  /** 일부 구간만 확인되었는지 여부 */
  readonly isPartial: boolean;
  /** 확인된 구간 비율 (0.0 ~ 1.0, 미확인 시 null) */
  readonly knownRatio: number | null;
  /** 부드러운 노면 비율 (0.0 ~ 1.0, 미확인 시 null) */
  readonly softRatio: number | null;
  /** 주요 노면 한국어 명칭 (예: '흙길', '잔디', '포장도로', 미확인 시 null) */
  readonly dominantSurfaceType: string | null;
}

/** OSM surface 태그 한국어 매핑 */
export const OSM_SURFACE_KOREAN_MAP: Record<string, string> = {
  dirt: '흙길',
  earth: '흙길',
  ground: '흙길',
  grass: '잔디',
  paved: '포장도로',
  asphalt: '아스팔트',
  concrete: '콘크리트',
  gravel: '자갈길',
  fine_gravel: '고운자갈',
  woodchips: '나무칩',
  wood: '목재 데크',
  sand: '모래',
  mud: '진흙',
  compacted: '마사토',
  rubber: '탄성포장',
  cobblestone: '돌길',
  sett: '돌길',
};

/**
 * OSM surface 태그명을 친근한 한국어로 변환한다.
 */
export function resolveSurfaceName(surfaceTag?: string | null): string {
  if (!surfaceTag || surfaceTag === 'unknown') {
    return '노면 정보 없음';
  }
  return OSM_SURFACE_KOREAN_MAP[surfaceTag.toLowerCase()] ?? surfaceTag;
}

/**
 * surface_breakdown 맵에서 가장 비율이 높은 확인된 노면 유형을 찾는다.
 */
export function getDominantSurfaceType(breakdown?: Record<string, number> | null): string | null {
  if (!breakdown || typeof breakdown !== 'object') {
    return null;
  }
  let bestType: string | null = null;
  let bestRatio = 0.0;
  for (const [key, ratio] of Object.entries(breakdown)) {
    if (key === 'unknown' || typeof ratio !== 'number') continue;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestType = key;
    }
  }
  return bestType ? resolveSurfaceName(bestType) : null;
}

export interface SlopeFormatOptions {
  /** 상세 문장형 표기 여부 (예: '예상 경사도 약 2.8%') */
  readonly verbose?: boolean;
  /** 접두사 (기본값: '최대 ') */
  readonly prefix?: string;
}

/**
 * 경사도 및 고도 출처를 판별하여 일관된 표시 정보를 생성한다.
 *
 * 규칙:
 * 1. null, undefined, NaN, 무한대, source가 'unknown'인 경우:
 *    -> 절대 0%나 평탄함으로 속이지 않고 '경사도 정보 없음'으로 표시한다.
 * 2. source가 'approximation'인 경우:
 *    -> 실제 측정값과 혼동되지 않도록 '예상 약 N%' 또는 '예상 경사도 약 N%'로 표시한다.
 * 3. source가 'dem'인 경우 (또는 실측 유효 수치):
 *    -> 기존 방식대로 '최대 N%'로 표시하되 DEM 기반임을 알 수 있게 한다.
 */
export function formatSlopeDisplay(
  slope?: number | null,
  source?: string | null,
  options?: SlopeFormatOptions
): FormattedSlope {
  const isInvalidNumeric = slope == null || Number.isNaN(slope) || !Number.isFinite(slope);
  const isExplicitUnknown = source === 'unknown';

  if (isInvalidNumeric || isExplicitUnknown) {
    return {
      text: '경사도 정보 없음',
      label: '경사도',
      valueText: '정보 없음',
      subText: '고도 데이터 확인 불가',
      source: 'unknown',
      isUnknown: true,
      isApproximation: false,
      numericValue: null,
    };
  }

  const rounded = Number(slope.toFixed(1));
  const isApprox = source === 'approximation';

  if (isApprox) {
    const text = options?.verbose
      ? `예상 경사도 약 ${rounded}%`
      : `예상 약 ${rounded}%`;
    return {
      text,
      label: '예상 경사도',
      valueText: `약 ${rounded}%`,
      subText: '지형 모델 기반 근사 계산',
      source: 'approximation',
      isUnknown: false,
      isApproximation: true,
      numericValue: rounded,
    };
  }

  const prefix = options?.prefix ?? '최대 ';
  const text = `${prefix}${rounded}%`;

  return {
    text,
    label: '완만한 경사',
    valueText: `최대 ${rounded}%`,
    subText: 'DEM 고도 데이터 기준',
    source: 'dem',
    isUnknown: false,
    isApproximation: false,
    numericValue: rounded,
  };
}

/**
 * 노면 정보(course_profiles 또는 softRatio 대체 문자열)를 판별하여 일관된 표시 정보를 생성한다.
 *
 * 규칙:
 * 1. 태그가 전혀 없거나(surface_known_ratio === 0), breakdown이 {"unknown": 1.0}이거나 null인 경우:
 *    -> 임의의 유형(포장도로, 흙길 등)이나 0%로 단정하지 않고 '노면 정보 없음'으로 표시한다.
 * 2. 일부 구간에만 태그가 존재하는 경우:
 *    -> 확인된 구간 비율(known_ratio)을 함께 표기하여 전체 노면이 확인된 것처럼 과장하지 않는다.
 * 3. 확인된 태그가 충분한 경우:
 *    -> 폭신한 노면 비율 및 대표 노면 유형을 정직하게 표시한다.
 */
export function formatSurfaceDisplay(
  profile?: CourseProfile | null,
  fallbackSoftRatioStr?: string | null
): FormattedSurface {
  // 1. 프로파일 정보가 있는 경우
  if (profile) {
    const knownRatio = profile.surface_known_ratio;
    const softRatio = profile.soft_surface_ratio;
    const breakdown = profile.surface_breakdown;

    const isFullyUnknown =
      knownRatio == null ||
      knownRatio === 0 ||
      breakdown?.unknown === 1.0 ||
      (breakdown && Object.keys(breakdown).length === 1 && breakdown.unknown !== undefined);

    if (isFullyUnknown) {
      return {
        text: '노면 정보 없음',
        label: '노면 정보',
        valueText: '정보 없음',
        subText: '보행로 노면 태그 없음',
        isUnknown: true,
        isPartial: false,
        knownRatio: 0,
        softRatio: null,
        dominantSurfaceType: null,
      };
    }

    const dominant = getDominantSurfaceType(breakdown);
    const softPercent = Math.round((softRatio ?? 0) * 100);
    const knownPercent = Math.round(knownRatio * 100);

    // 일부 구간만 확인된 경우 (10% 이상 90% 미만)
    if (knownRatio < 0.9) {
      return {
        text: `${softPercent}% (확인 ${knownPercent}%)`,
        label: '폭신한 노면',
        valueText: `${softPercent}%`,
        subText: `확인 구간(${knownPercent}%) 기준`,
        isUnknown: false,
        isPartial: true,
        knownRatio,
        softRatio: softRatio ?? 0,
        dominantSurfaceType: dominant,
      };
    }

    // 90% 이상 충분히 확인된 경우
    const subText = dominant ? `${dominant} 등 발바닥 안심` : '흙길·잔디로 발바닥 안심';
    return {
      text: `${softPercent}%`,
      label: '폭신한 노면',
      valueText: `${softPercent}%`,
      subText,
      isUnknown: false,
      isPartial: false,
      knownRatio,
      softRatio: softRatio ?? 0,
      dominantSurfaceType: dominant,
    };
  }

  // 2. 프로파일이 없고 fallback 문자열만 있는 경우
  const rawStr = fallbackSoftRatioStr?.trim();
  const isUnknownStr =
    !rawStr ||
    rawStr === '알 수 없음' ||
    rawStr === '정보 없음' ||
    rawStr === 'unknown' ||
    rawStr === 'null' ||
    rawStr === 'undefined';

  if (isUnknownStr) {
    return {
      text: '노면 정보 없음',
      label: '노면 정보',
      valueText: '정보 없음',
      subText: '보행로 노면 태그 없음',
      isUnknown: true,
      isPartial: false,
      knownRatio: null,
      softRatio: null,
      dominantSurfaceType: null,
    };
  }

  return {
    text: rawStr,
    label: '폭신한 노면',
    valueText: rawStr,
    subText: '흙길·잔디로 발바닥 안심',
    isUnknown: false,
    isPartial: false,
    knownRatio: null,
    softRatio: null,
    dominantSurfaceType: null,
  };
}

/**
 * RecommendedCourse 객체에서 경사도 표시 정보를 일괄 추출한다.
 */
export function formatCourseSlope(course?: RecommendedCourse | null, options?: SlopeFormatOptions): FormattedSlope {
  if (!course) {
    return formatSlopeDisplay(null, 'unknown', options);
  }
  const slope = course.profile?.max_slope_percent ?? course.maxSlopePercent;
  const source = course.profile?.slope_source ?? course.slopeSource;
  return formatSlopeDisplay(slope, source, options);
}

/**
 * RecommendedCourse 객체에서 노면 표시 정보를 일괄 추출한다.
 */
export function formatCourseSurface(course?: RecommendedCourse | null): FormattedSurface {
  if (!course) {
    return formatSurfaceDisplay(null, null);
  }
  return formatSurfaceDisplay(course.profile, course.softRatio);
}
