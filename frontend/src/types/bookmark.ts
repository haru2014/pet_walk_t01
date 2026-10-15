/**
 * [편안하개 - PetWalk]
 * 안심 코스 즐겨찾기(Bookmark) 로컬 보관함 DTO (US-29)
 */

import { RouteFeatureCollection, RouteStepPin } from './route';
import { WalkDogSummary } from './dogProfile';

/** 코스 프리뷰/산책에 사용되는 경로 + 스텝 핀 묶음 */
export interface CoursePlan {
  readonly route: RouteFeatureCollection;
  readonly stepPins: readonly RouteStepPin[];
}

export interface BookmarkedRoute {
  id: string;
  title: string;
  dogName: string;
  dogSummary?: WalkDogSummary;
  totalDistanceKm: number;
  estimatedMinutes: number;
  maxSlopePercent: number;
  shadePercent: number;
  tags: string[];
  routeGeoJson: RouteFeatureCollection;
  stepPins: readonly RouteStepPin[];
  savedAt: string;
  landmarkCode?: string;
  landmarkName?: string;
  regionName?: string;
}
