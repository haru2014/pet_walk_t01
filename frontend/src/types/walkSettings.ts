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
  icon: string;
}

export const WALK_ENVIRONMENTS: readonly WalkEnvironmentOption[] = [
  { id: 'soft', label: '폭신한 길', detail: '잔디·흙길 등', icon: '🌿' },
  { id: 'shade', label: '그늘이 많은 길', detail: '햇빛을 피해 걷기', icon: '🌳' },
  { id: 'stairs', label: '계단 피하기', detail: '계단이 적은 경로', icon: '🚶' },
  { id: 'traffic', label: '차가 적은 길', detail: '차량 통행이 적은 경로', icon: '🚗' },
  { id: 'quiet', label: '조용한 길', detail: '복잡하지 않은 경로', icon: '🍃' },
  { id: 'rest', label: '쉬어가기 좋은 길', detail: '휴식 공간이 있는 경로', icon: '🪑' },
];

export interface WalkPreferences {
  durationMinutes: number | null;
  environments: EnvironmentId[];
  requestText: string;
}

export interface RecommendedCourse {
  id: string;
  name: string;
  distanceKm: string;
  estimatedMinutes: number;
  softRatio: string;
  shadeLevel: string;
  stairsCount: string;
  maxSlopePercent: number;
  shadePercent: number;
  softSurfacePercent: number;
  reason: string;
}

export const DEFAULT_RECOMMENDED_COURSES: readonly RecommendedCourse[] = [
  {
    id: 'course_1',
    name: '편안한 숲길 코스',
    distanceKm: '2.8 km',
    estimatedMinutes: 38,
    softRatio: '72%',
    shadeLevel: '많음',
    stairsCount: '0회',
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
    stairsCount: '0회',
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
    stairsCount: '0회',
    maxSlopePercent: 3.2,
    shadePercent: 42,
    softSurfacePercent: 62,
    reason: '차량 통행이 적고 비교적 조용한 골목길을 따라 평온하게 걸을 수 있어요.',
  },
];
