/**
 * [편안하개 - PetWalk]
 * 산책 경로 낙관적 프리페치(Optimistic Pre-fetch) 및 요청 중복 제거(Deduplication) 서비스
 *
 * 1. 설정 화면 체류 중 디바운스(600~800ms) 후 백그라운드 사전 요청
 * 2. 동일 조건 요청 중복 제거 (진행 중인 Promise 편승)
 * 3. 캐시 TTL(120초) 관리로 추천 화면 진입 시 0ms 즉시 렌더링
 */

import { DogProfile } from '../types/dogProfile';
import { WalkPreferences } from '../types/walkSettings';
import { FeedbackSummaryPayload } from './feedbackContext';
import { RoutePlanResult } from './api';

interface CacheEntry {
  readonly result: RoutePlanResult;
  readonly expiresAt: number;
}

const CACHE_TTL_MS = 120_000; // 2분 유효
const MAX_CACHE_ENTRIES = 8;

export function buildPrefetchKey(
  dog: DogProfile,
  preferences?: WalkPreferences,
  feedback?: FeedbackSummaryPayload | null,
): string {
  const originMode = preferences?.originMode ?? 'park';
  const parkId = preferences?.pilotParkId ?? 'yurim';
  const duration = preferences?.durationMinutes ?? 30;
  const isFreeWalk = Boolean(preferences?.isFreeWalk);
  const envs = [...(preferences?.environments ?? [])].sort().join(',');
  const reqText = (preferences?.requestText ?? '').trim();

  // GPS 좌표는 약 100m 단위 반올림(소수점 3자리)하여 미세한 오차로 인한 캐시 미스 방어
  let coordsKey = 'none';
  if (originMode === 'current_location' && preferences?.userCoordinates) {
    const lat = preferences.userCoordinates.lat.toFixed(3);
    const lon = preferences.userCoordinates.lon.toFixed(3);
    coordsKey = `${lat},${lon}`;
  }

  const feedbackCount = feedback?.slope_dissatisfaction_count ?? 0;

  return [
    dog.id,
    dog.jointCareLevel,
    originMode,
    originMode === 'current_location' ? coordsKey : parkId,
    duration,
    isFreeWalk ? 'free' : 'planned',
    envs,
    reqText,
    feedbackCount,
  ].join('|');
}

export class WalkPlanPrefetchService {
  private static cache = new Map<string, CacheEntry>();
  private static pendingRequests = new Map<string, Promise<RoutePlanResult>>();
  private static activeAbortController: AbortController | null = null;
  private static activeKey: string | null = null;

  /**
   * 프리페치된 결과가 있으면 1회성 소비(소비 후 버퍼에서 제거)하고 반환한다.
   * 추천 화면 진입 시 단 한 번 즉시 전환 용도로 사용된다.
   */
  static consume(
    dog: DogProfile,
    preferences?: WalkPreferences,
    feedback?: FeedbackSummaryPayload | null,
  ): RoutePlanResult | null {
    const key = buildPrefetchKey(dog, preferences, feedback);
    const entry = this.cache.get(key);
    if (!entry) return null;
    this.cache.delete(key);
    if (Date.now() > entry.expiresAt) {
      return null;
    }
    return entry.result;
  }

  /**
   * 동일 조건의 유효한 캐시가 있는지 조회한다 (소비하지 않음).
   */
  static get(
    dog: DogProfile,
    preferences?: WalkPreferences,
    feedback?: FeedbackSummaryPayload | null,
  ): RoutePlanResult | null {
    const key = buildPrefetchKey(dog, preferences, feedback);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  /**
   * 현재 동일 조건으로 진행 중인 프로미스가 있다면 반환한다.
   */
  static getPending(
    dog: DogProfile,
    preferences?: WalkPreferences,
    feedback?: FeedbackSummaryPayload | null,
  ): Promise<RoutePlanResult> | null {
    const key = buildPrefetchKey(dog, preferences, feedback);
    return this.pendingRequests.get(key) ?? null;
  }

  /**
   * 산책 설정 체류 중 백그라운드 프리페치를 트리거한다.
   * - 이전 조건의 진행 중인 요청은 abort
   * - 동일 조건이 이미 캐시되어 있거나 진행 중이면 재호출 방지
   */
  static prefetch(
    dog: DogProfile,
    preferences: WalkPreferences | undefined,
    feedback: FeedbackSummaryPayload | null | undefined,
    executor: (signal?: AbortSignal) => Promise<RoutePlanResult>,
  ): Promise<RoutePlanResult | null> {
    const key = buildPrefetchKey(dog, preferences, feedback);

    // 1. 이미 유효한 캐시가 있다면 즉시 반환
    const existing = this.get(dog, preferences, feedback);
    if (existing) {
      return Promise.resolve(existing);
    }

    // 2. 이미 동일 키로 진행 중인 요청이 있다면 해당 Promise 재사용
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    // 3. 조건이 변경되었으면 이전 진행 중 요청 취소
    if (this.activeAbortController && this.activeKey !== key) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      this.activeKey = null;
    }

    const controller = new AbortController();
    this.activeAbortController = controller;
    this.activeKey = key;

    const promise = executor(controller.signal)
      .then((result) => {
        this.set(key, result);
        return result;
      })
      .catch((err) => {
        // 취소된 경우는 조용히 무시
        return null;
      })
      .finally(() => {
        this.pendingRequests.delete(key);
        if (this.activeKey === key) {
          this.activeAbortController = null;
          this.activeKey = null;
        }
      });

    this.pendingRequests.set(key, promise as Promise<RoutePlanResult>);
    return promise;
  }

  /**
   * 결과 캐시 수동 적재
   */
  static set(key: string, result: RoutePlanResult): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  /**
   * 캐시 및 대기열 전체 초기화
   */
  static clear(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.activeKey = null;
    this.cache.clear();
    this.pendingRequests.clear();
  }
}
