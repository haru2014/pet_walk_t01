/**
 * [편안하개 - PetWalk]
 * Local-First 영속성 스토리지 키 및 DTO (US-A2, US-E1)
 */

import { WalkDogSummary } from './dogProfile';

export const STORAGE_PREFIX = '@편안하개:';

export const STORAGE_KEYS = {
  DOG_PROFILES: '@편안하개:dog_profiles',
  DOG_PROFILE: '@편안하개:dog_profile',
  WALK_HISTORY: '@편안하개:walk_history',
  APP_SETTINGS: '@편안하개:app_settings',
  BOOKMARKED_ROUTES: '@편안하개:bookmarked_routes',
  LOCATION_CONSENT: '@편안하개:location_consent',
  HAS_SEEN_ONBOARDING: '@편안하개:has_seen_onboarding',
  SOUND_SETTINGS: '@편안하개:sound_settings',
  APP_THEME: '@편안하개:app_theme',
} as const;

export type SlopeFeedbackLevel = 'gentle' | 'moderate' | 'steep';

export interface WalkFeedback {
  comfortScore: number;
  slopeRating?: SlopeFeedbackLevel; // 경사도 세부 체감 평가 (완만 / 보통 / 가파름)
  tags: string[];
  comment?: string;
}

export interface PoopEvent {
  id: string;
  timestamp: number;
  type: 'poop' | 'pee';
  lat?: number;
  lon?: number;
}

export interface WalkRecord {
  id: string;
  /** Supabase walk_records.id. Legacy local records may not have a UUID in id. */
  remoteId?: string;
  dogId: string;
  dogSummary?: WalkDogSummary;
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  totalDistanceKm: number;
  averageSpeedKmH: number;
  safeSurfaceRatio: number;
  gpsTrack: { lat: number; lon: number; timestamp: number }[];
  feedback?: WalkFeedback;
  poopCount?: number;
  poopEvents?: PoopEvent[];
}
