/**
 * [편안하개 - PetWalk]
 * 안심 코스 즐겨찾기(Bookmark) 로컬 보관함 서비스 (US-29)
 *
 * Local-First: 코스 GeoJSON 전체를 AsyncStorage에만 보관하며 서버 통신이 없다.
 */

import { LocalStorageService } from './storage';
import { STORAGE_KEYS } from '../types/storage';
import { BookmarkedRoute, CoursePlan } from '../types/bookmark';
import { RecommendedCourse } from '../types/walkSettings';
import { RouteFeatureCollection } from '../types/route';
import { WalkDogSummary } from '../types/dogProfile';

import { detectLandmarkCategory } from './landmarkTagger';

export const MAX_BOOKMARKS = 30;

/** 경로를 식별하는 가벼운 지문 (좌표 개수 + 시작/끝 좌표) */
export function routeFingerprint(route: RouteFeatureCollection): string {
  const coords = route.features.flatMap((f) => f.geometry.coordinates);
  if (coords.length === 0) return 'empty';
  const first = coords[0];
  const last = coords.at(-1) ?? first;
  return [coords.length, first[0].toFixed(5), first[1].toFixed(5), last[0].toFixed(5), last[1].toFixed(5)].join('_');
}

/** 추천 코스 + 경로 플랜으로부터 북마크 DTO를 만든다. 같은 코스/경로는 항상 같은 id를 갖는다. */
export function createBookmark(
  course: RecommendedCourse,
  plan: CoursePlan,
  dogSummaryOrName: WalkDogSummary | string,
  now: Date = new Date(),
): BookmarkedRoute {
  const distance = Number.parseFloat(course.distanceKm);
  const landmarkInfo = detectLandmarkCategory(plan.route, course.name);
  const isString = typeof dogSummaryOrName === 'string';
  const dogName = isString ? dogSummaryOrName : dogSummaryOrName.name;
  const dogSummary = isString ? undefined : dogSummaryOrName;

  return {
    id: `bm_${course.id}_${routeFingerprint(plan.route)}`,
    title: course.name,
    dogName,
    dogSummary,
    totalDistanceKm: Number.isFinite(distance) ? distance : 0,
    estimatedMinutes: course.estimatedMinutes,
    maxSlopePercent: course.maxSlopePercent ?? 0,
    shadePercent: course.shadePercent,
    tags: [
      course.softSurfacePercent != null ? `폭신 ${course.softSurfacePercent}%` : '폭신 노면 정보없음',
      `그늘 ${course.shadeLevel}`,
      course.stairsCount.includes('계단') ? course.stairsCount : `계단 ${course.stairsCount}`,
    ],
    routeGeoJson: plan.route,
    stepPins: plan.stepPins,
    savedAt: now.toISOString(),
    landmarkCode: landmarkInfo.landmarkCode,
    landmarkName: landmarkInfo.landmarkName,
    regionName: landmarkInfo.regionName,
  };
}

export class BookmarkService {
  static async getBookmarks(): Promise<BookmarkedRoute[]> {
    const list = await LocalStorageService.getItem<BookmarkedRoute[]>(STORAGE_KEYS.BOOKMARKED_ROUTES);
    return Array.isArray(list) ? list : [];
  }

  /** 중복 id는 최신으로 갱신하고, 최대 30개까지 최신순으로 보관한다. */
  static async addBookmark(route: BookmarkedRoute): Promise<boolean> {
    const current = await this.getBookmarks();
    const next = [route, ...current.filter((b) => b.id !== route.id)].slice(0, MAX_BOOKMARKS);
    return LocalStorageService.setItem(STORAGE_KEYS.BOOKMARKED_ROUTES, next);
  }

  static async removeBookmark(routeId: string): Promise<boolean> {
    const current = await this.getBookmarks();
    return LocalStorageService.setItem(
      STORAGE_KEYS.BOOKMARKED_ROUTES,
      current.filter((b) => b.id !== routeId),
    );
  }

  static async isBookmarked(routeId: string): Promise<boolean> {
    const current = await this.getBookmarks();
    return current.some((b) => b.id === routeId);
  }

  /** 즐겨찾기를 토글하고 변경 후 저장 여부를 반환한다. */
  static async toggleBookmark(route: BookmarkedRoute): Promise<boolean> {
    if (await this.isBookmarked(route.id)) {
      await this.removeBookmark(route.id);
      return false;
    }
    return this.addBookmark(route);
  }
}
