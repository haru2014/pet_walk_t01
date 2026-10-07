/**
 * [편안하개 - PetWalk]
 * Local-First 스토리지 타입 정의
 * 
 * 개인정보 보호 원칙:
 * - 반려견 프로필, GPS 보행 궤적, 최근 피드백은 모바일 로컬에만 영속화
 */

export const STORAGE_KEYS = {
  DOG_PROFILE: '@편안하개:dog_profile',
  WALK_HISTORY: '@편안하개:walk_history',
  FEEDBACK_SUMMARY: '@편안하개:feedback_summary',
  BOOKMARKED_ROUTES: '@편안하개:bookmarked_routes',
  APP_SETTINGS: '@편안하개:app_settings',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

/** 반려견 프로필 DTO (US-A2) */
export interface DogProfile {
  id: string;
  name: string;                    // 예: '초코'
  breed: string;                   // 예: '말티즈'
  ageYears: number;                // 예: 9
  weightKg: number;                // 예: 4.2
  jointCareLevel: 0 | 1 | 2;       // 관절 안심 케어 (0: 일반, 1: 주의, 2: 적극보호)
  speedKmH: number;                // 체급/연령 환산 속도 (예: 2.2 km/h)
  photoUri?: string;
  createdAt: string;
  updatedAt: string;
}

/** GPS 좌표 포인트 (US-E1) */
export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  timestamp: number;
}

/** 산책 종료 기록 DTO (US-E1, US-E2) */
export interface WalkRecord {
  id: string;
  dogId: string;
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  totalDistanceKm: number;
  averageSpeedKmH: number;
  safeSurfaceRatio: number;        // 완만/그늘/부드러운 길 비율 (0~1)
  gpsTrack: GpsPoint[];            // 상세 GPS 이동 궤적 (로컬 보관)
  feedback?: {
    comfortScore: number;          // 1~5점
    tags: string[];                // ['완만해요', '그늘많아요', '발이편해요']
    comment?: string;
  };
}

/** 최근 산책 피드백 요약 DTO (US-E3, Stateless AI 보정용) */
export interface FeedbackSummary {
  recentWalkCount: number;
  slopeDissatisfiedCount: number;
  prefersShade: boolean;
  averageComfortScore: number;
  lastUpdated: string;
}
