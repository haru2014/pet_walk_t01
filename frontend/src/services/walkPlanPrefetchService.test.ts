import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalkPlanPrefetchService, buildPrefetchKey } from './walkPlanPrefetchService';
import { DogProfile } from '../types/dogProfile';
import { WalkPreferences } from '../types/walkSettings';
import { RoutePlanResult } from './api';

const mockDog: DogProfile = {
  id: 'dog_choco',
  name: '초코',
  breed: '푸들',
  ageYears: 4,
  weightKg: 4.5,
  speedKmH: 3.0,
  jointCareLevel: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockPreferences: WalkPreferences = {
  originMode: 'park',
  pilotParkId: 'yurim',
  durationMinutes: 30,
  environments: ['soft', 'shade'],
  requestText: '',
};

const mockResult: RoutePlanResult = {
  isLiveServer: true,
  courses: [],
  route: { type: 'FeatureCollection', features: [] },
  stepPins: [],
  briefingMessage: '테스트 브리핑',
  safetyBriefingMessage: '',
};

describe('WalkPlanPrefetchService - 산책 경로 사전 요청 및 중복제거', () => {
  beforeEach(() => {
    WalkPlanPrefetchService.clear();
  });

  it('동일 조건에 대해 프리페치된 캐시가 있으면 즉시 반환한다', async () => {
    const key = buildPrefetchKey(mockDog, mockPreferences, null);
    WalkPlanPrefetchService.set(key, mockResult);

    const cached = WalkPlanPrefetchService.get(mockDog, mockPreferences, null);
    expect(cached).toEqual(mockResult);
  });

  it('만료된 캐시는 get 시 null을 반환하고 삭제된다', () => {
    const key = buildPrefetchKey(mockDog, mockPreferences, null);
    WalkPlanPrefetchService.set(key, mockResult);

    // Date.now를 3분 뒤로 조작
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 150_000);

    const cached = WalkPlanPrefetchService.get(mockDog, mockPreferences, null);
    expect(cached).toBeNull();
    vi.restoreAllMocks();
  });

  it('동일한 조건으로 prefetch 호출 시 중복 executor 실행 없이 진행 중인 Promise를 재활용한다', async () => {
    const executor = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return mockResult;
    });

    const promise1 = WalkPlanPrefetchService.prefetch(mockDog, mockPreferences, null, executor);
    const promise2 = WalkPlanPrefetchService.prefetch(mockDog, mockPreferences, null, executor);

    const [res1, res2] = await Promise.all([promise1, promise2]);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(res1).toEqual(mockResult);
    expect(res2).toEqual(mockResult);
  });

  it('조건이 변경되면 이전 진행 중인 요청의 signal이 abort된다', async () => {
    let aborted = false;
    const executor1 = vi.fn().mockImplementation(async (signal?: AbortSignal) => {
      signal?.addEventListener('abort', () => {
        aborted = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      return mockResult;
    });

    const executor2 = vi.fn().mockResolvedValue(mockResult);

    const p1 = WalkPlanPrefetchService.prefetch(mockDog, mockPreferences, null, executor1);

    // 조건 변경 (시간 45분으로 변경)
    const newPrefs: WalkPreferences = { ...mockPreferences, durationMinutes: 45 };
    const p2 = WalkPlanPrefetchService.prefetch(mockDog, newPrefs, null, executor2);

    await Promise.all([p1, p2]);

    expect(aborted).toBe(true);
    expect(executor2).toHaveBeenCalledTimes(1);
  });

  it('현위치 모드에서는 GPS 좌표(약 100m 단위 반올림)를 키에 반영한다', () => {
    const prefA: WalkPreferences = {
      originMode: 'current_location',
      durationMinutes: 30,
      environments: ['soft'],
      requestText: '',
      userCoordinates: { lat: 36.362811, lon: 127.359211 },
    };
    const prefB: WalkPreferences = {
      ...prefA,
      userCoordinates: { lat: 36.362844, lon: 127.359244 }, // 소수 3자리까지 일치
    };
    const prefC: WalkPreferences = {
      ...prefA,
      userCoordinates: { lat: 36.370000, lon: 127.359211 }, // 다른 위치
    };

    const keyA = buildPrefetchKey(mockDog, prefA, null);
    const keyB = buildPrefetchKey(mockDog, prefB, null);
    const keyC = buildPrefetchKey(mockDog, prefC, null);

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });
});
