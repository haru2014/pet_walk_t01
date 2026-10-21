/**
 * [편안하개 - PetWalk]
 * US-29 안심 코스 즐겨찾기 로컬 보관함 단위 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BookmarkService, createBookmark, MAX_BOOKMARKS } from './bookmarkService';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from './sampleRoute';
import { DEFAULT_RECOMMENDED_COURSES } from '../types/walkSettings';
import { BookmarkedRoute, CoursePlan } from '../types/bookmark';
import { WalkDogSummary } from '../types/dogProfile';

const memoryStore = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => memoryStore.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      memoryStore.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      memoryStore.delete(key);
    }),
  },
}));

const PLAN: CoursePlan = { route: SAMPLE_ROUTE, stepPins: SAMPLE_STEP_PINS };

function makeBookmark(id: string): BookmarkedRoute {
  return { ...createBookmark(DEFAULT_RECOMMENDED_COURSES[0], PLAN, '초코'), id };
}

describe('US-29 createBookmark', () => {
  it('추천 코스와 경로로 북마크 DTO를 생성하고 경로 전체를 보관한다', () => {
    const bm = createBookmark(DEFAULT_RECOMMENDED_COURSES[0], PLAN, '초코');
    expect(bm.title).toBe('편안한 숲길 코스');
    expect(bm.dogName).toBe('초코');
    expect(bm.totalDistanceKm).toBe(2.8);
    expect(bm.estimatedMinutes).toBe(38);
    expect(bm.tags).toContain('확인된 계단 0회');
    expect(bm.routeGeoJson.features).toHaveLength(SAMPLE_ROUTE.features.length);
    expect(bm.stepPins).toHaveLength(SAMPLE_STEP_PINS.length);
  });

  it('같은 코스/경로는 항상 같은 id, 다른 코스는 다른 id를 갖는다', () => {
    const a1 = createBookmark(DEFAULT_RECOMMENDED_COURSES[0], PLAN, '초코');
    const a2 = createBookmark(DEFAULT_RECOMMENDED_COURSES[0], PLAN, '콩이');
    const b = createBookmark(DEFAULT_RECOMMENDED_COURSES[1], PLAN, '초코');
    expect(a1.id).toBe(a2.id);
    expect(a1.id).not.toBe(b.id);
  });

  it('WalkDogSummary 객체를 전달하면 dogName과 dogSummary 객체가 함께 보관된다', () => {
    const summary: WalkDogSummary = {
      id: 'dog_123',
      name: '보리',
      breed: '포메라니안',
      ageYears: 2,
      weightKg: 3.2,
      jointCareLevel: 2,
      photoUri: 'preset:pomeranian',
    };
    const bm = createBookmark(DEFAULT_RECOMMENDED_COURSES[0], PLAN, summary);
    expect(bm.dogName).toBe('보리');
    expect(bm.dogSummary).toEqual(summary);
  });
});

describe('US-29 BookmarkService CRUD 및 영속성', () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it('초기 상태에서는 빈 배열이어야 한다', async () => {
    expect(await BookmarkService.getBookmarks()).toEqual([]);
  });

  it('북마크를 추가하면 최신순으로 조회되고 isBookmarked가 true가 된다', async () => {
    await BookmarkService.addBookmark(makeBookmark('a'));
    await BookmarkService.addBookmark(makeBookmark('b'));
    const list = await BookmarkService.getBookmarks();
    expect(list.map((b) => b.id)).toEqual(['b', 'a']);
    expect(await BookmarkService.isBookmarked('a')).toBe(true);
    expect(await BookmarkService.isBookmarked('zzz')).toBe(false);
  });

  it('같은 id를 다시 추가해도 중복 저장되지 않는다', async () => {
    await BookmarkService.addBookmark(makeBookmark('a'));
    await BookmarkService.addBookmark(makeBookmark('a'));
    expect(await BookmarkService.getBookmarks()).toHaveLength(1);
  });

  it('북마크를 삭제하면 목록에서 사라진다', async () => {
    await BookmarkService.addBookmark(makeBookmark('a'));
    await BookmarkService.addBookmark(makeBookmark('b'));
    await BookmarkService.removeBookmark('a');
    const list = await BookmarkService.getBookmarks();
    expect(list.map((b) => b.id)).toEqual(['b']);
  });

  it('toggleBookmark는 저장/해제를 번갈아 수행하고 결과 상태를 반환한다', async () => {
    const bm = makeBookmark('t');
    expect(await BookmarkService.toggleBookmark(bm)).toBe(true);
    expect(await BookmarkService.isBookmarked('t')).toBe(true);
    expect(await BookmarkService.toggleBookmark(bm)).toBe(false);
    expect(await BookmarkService.isBookmarked('t')).toBe(false);
  });

  it(`최대 ${MAX_BOOKMARKS}개까지만 보관하고 가장 오래된 항목부터 제거한다`, async () => {
    for (let i = 1; i <= MAX_BOOKMARKS + 3; i += 1) {
      await BookmarkService.addBookmark(makeBookmark(`bm_${i}`));
    }
    const list = await BookmarkService.getBookmarks();
    expect(list).toHaveLength(MAX_BOOKMARKS);
    expect(list[0].id).toBe(`bm_${MAX_BOOKMARKS + 3}`);
    expect(list.map((b) => b.id)).not.toContain('bm_1');
  });

  it('저장된 GeoJSON/스텝 핀이 재조회 시 그대로 복원된다 (오프라인 재산책 근거)', async () => {
    await BookmarkService.addBookmark(makeBookmark('r'));
    const [restored] = await BookmarkService.getBookmarks();
    expect(restored.routeGeoJson).toEqual(SAMPLE_ROUTE);
    expect(restored.stepPins).toEqual(SAMPLE_STEP_PINS);
  });
});
