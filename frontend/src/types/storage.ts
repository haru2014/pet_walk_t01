/**
 * [편안하개 - PetWalk]
 * Local-First 영속성 스토리지 키 및 DTO (US-A2, US-E1)
 */

export const STORAGE_KEYS = {
  DOG_PROFILE: '@편안하개:dog_profile',
  WALK_HISTORY: '@편안하개:walk_history',
  APP_SETTINGS: '@편안하개:app_settings',
} as const;

export type SlopeFeedbackLevel = 'gentle' | 'moderate' | 'steep';

export interface WalkFeedback {
  comfortScore: number;
  slopeRating?: SlopeFeedbackLevel; // 경사도 세부 체감 평가 (완만 / 보통 / 가파름)
  tags: string[];
  comment?: string;
}

export interface WalkRecord {
  id: string;
  dogId: string;
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  totalDistanceKm: number;
  averageSpeedKmH: number;
  safeSurfaceRatio: number;
  gpsTrack: Array<{ lat: number; lon: number; timestamp: number }>;
  feedback?: WalkFeedback;
}
