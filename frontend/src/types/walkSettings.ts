/**
 * [편안하개 - PetWalk]
 * 산책 조건 설정 및 추천 코스 데이터 모델 (US-A1, US-A3, US-C1)
 * 목업 Screen-03, Screen-04 기반
 */

export type EnvironmentId = 'soft' | 'shade' | 'stairs' | 'traffic' | 'quiet' | 'rest';

export interface WalkEnvironmentOption {
  id: EnvironmentId;
  label: string;
  detail: string;
  icon: EnvironmentId;
}

export const WALK_ENVIRONMENTS: readonly WalkEnvironmentOption[] = [
  { id: 'soft', label: '폭신한 길', detail: '잔디·흙길 등', icon: 'soft' },
  { id: 'shade', label: '그늘이 많은 길', detail: '햇빛을 피해 걷기', icon: 'shade' },
  { id: 'stairs', label: '계단 피하기', detail: '계단이 적은 경로', icon: 'stairs' },
  { id: 'traffic', label: '차가 적은 길', detail: '차량 통행이 적은 경로', icon: 'traffic' },
  { id: 'quiet', label: '조용한 길', detail: '복잡하지 않은 경로', icon: 'quiet' },
  { id: 'rest', label: '쉬어가기 좋은 길', detail: '휴식 공간이 있는 경로', icon: 'rest' },
];

export type WalkOriginMode = 'current_location' | 'park';

export interface WalkPreferences {
  originMode?: WalkOriginMode; // 1. 현재 위치 기반 ('current_location') | 2. 지정한 공원 주변 ('park')
  durationMinutes: number | null;
  environments: EnvironmentId[];
  requestText: string;
  isFreeWalk?: boolean;
  pilotParkId?: string; // 대전/세종 4대 거점 공원 식별자 ('yurim', 'sejong', 'songgang', 'doan')
  userCoordinates?: { lat: number; lon: number }; // 단말기 실측 GPS 좌표 (위도, 경도)
}

/** 15분 단위 세분화 산책 시간 옵션 (US-A3) */
export const DURATION_OPTIONS_15MIN: readonly number[] = [15, 30, 45, 60, 75, 90, 105, 120];

/** 견종/체급별 산책 시간 가이드 */
export interface DogBreedDurationGuide {
  readonly id: 'small' | 'large' | 'trekking';
  readonly label: string;
  readonly recommendedMinutes: number;
  readonly minMinutes: number;
  readonly maxMinutes: number;
  readonly description: string;
}

export const BREED_DURATION_GUIDES: readonly DogBreedDurationGuide[] = [
  {
    id: 'small',
    label: '소형견 맞춤',
    recommendedMinutes: 25,
    minMinutes: 20,
    maxMinutes: 30,
    description: '말티즈·푸들 등 (1회 20~30분, 일 1~2회)',
  },
  {
    id: 'large',
    label: '중/대형견 맞춤',
    recommendedMinutes: 50,
    minMinutes: 40,
    maxMinutes: 60,
    description: '리트리버·진돗개 등 (1회 40분~1시간+)',
  },
  {
    id: 'trekking',
    label: '장거리/트레킹',
    recommendedMinutes: 90,
    minMinutes: 60,
    maxMinutes: 120,
    description: '주말 야외 활동 및 1시간 초과 트레킹',
  },
];

/** 산책 시간 레이블 포맷터 (예: 75분 -> '1시간 15분', 자유 산책 -> '자유 산책') */
export function formatDurationLabel(minutes: number | null, isFreeWalk?: boolean): string {
  if (isFreeWalk) return '자유 산책';
  if (minutes == null) return '시간 미설정';
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours}시간`;
  return `${hours}시간 ${remainingMinutes}분`;
}

export interface CourseProfile {
  readonly distance_m?: number;
  readonly max_slope_percent?: number | null;
  readonly avg_slope_percent?: number | null;
  readonly slope_source?: 'dem' | 'approximation' | 'unknown';
  readonly elevation_source?: string | null;
  readonly surface_breakdown?: Record<string, number> | null;
  readonly surface_known_ratio?: number | null;
  readonly soft_surface_ratio?: number | null;
  readonly stairs_count?: number | null;
  readonly shade_ratio?: number | null;
  readonly basis?: string;
}

export interface RecommendedCourse {
  id: string;
  name: string;
  distanceKm: string;
  estimatedMinutes: number;
  softRatio: string;
  shadeLevel: string;
  stairsCount: string;
  maxSlopePercent?: number | null;
  shadePercent: number;
  softSurfacePercent?: number | null;
  reason: string;
  score?: number | null;
  profile?: CourseProfile | null;
  slopeSource?: 'dem' | 'approximation' | 'unknown';
}

export const DEFAULT_RECOMMENDED_COURSES: readonly RecommendedCourse[] = [
  {
    id: 'course_1',
    name: '편안한 숲길 코스',
    distanceKm: '2.8 km',
    estimatedMinutes: 38,
    softRatio: '72%',
    shadeLevel: '많음',
    stairsCount: '확인된 계단 0회',
    maxSlopePercent: 2.1,
    shadePercent: 57,
    softSurfacePercent: 85,
    reason: '폭신한 길과 그늘 구간을 우선하고, 계단이 없는 완만한 경로로 구성했어요.',
  },
  {
    id: 'course_2',
    name: '공원 한바퀴 코스',
    distanceKm: '2.5 km',
    estimatedMinutes: 35,
    softRatio: '64%',
    shadeLevel: '많음',
    stairsCount: '확인된 계단 0회',
    maxSlopePercent: 2.8,
    shadePercent: 50,
    softSurfacePercent: 78,
    reason: '공원 산책로를 중심으로 그늘과 쉬어갈 벤치를 함께 고려했어요.',
  },
  {
    id: 'course_3',
    name: '조용한 주택가 코스',
    distanceKm: '2.9 km',
    estimatedMinutes: 40,
    softRatio: '48%',
    shadeLevel: '보통',
    stairsCount: '확인된 계단 0회',
    maxSlopePercent: 3.2,
    shadePercent: 42,
    softSurfacePercent: 62,
    reason: '차량 통행이 적고 비교적 조용한 골목길을 따라 평온하게 걸을 수 있어요.',
  },
];
