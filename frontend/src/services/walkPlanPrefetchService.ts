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
/**
 * 사전 요청을 다시 보낼 때까지의 최소 간격.
 * 비싼 서버 작업(날씨·주변 길 조회)은 출발 좌표에만 달려 있어 한 번만 받아 두면 캐시에 남는다.
 * 조건을 바꿀 때마다 요청을 더 보내면 서버의 OSRM 전역 대기열(1초 1회)만 채운다.
 */
const MIN_PREFETCH_INTERVAL_MS = 5_000;

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
  private static lastPrefetchStartedAt = 0;

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
   * 산책 설정 체류 중 백그라운드 사전 요청을 트리거한다.
   * - 동일 조건이 이미 캐시되어 있거나 진행 중이면 재호출 방지
   * - 조건이 변경되면 이전 진행 중 요청은 abort
   * - 직전 사전 요청에서 MIN_PREFETCH_INTERVAL_MS 가 지나지 않았으면 보내지 않는다
   *   (서버의 OSRM 호출은 전역 1초 1회 제한이라, 조건을 바꿀 때마다 보내면 대기열이 차서
   *    정작 사용자가 버튼을 눌러 보낸 요청이 앱 제한 20초를 넘긴다)
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

    // 4. 사전 요청 간격 제한: 조건을 연달아 바꿀 때 서버에 요청이 쌓이지 않게 한다
    const now = Date.now();
    if (now - this.lastPrefetchStartedAt < MIN_PREFETCH_INTERVAL_MS) {
      return Promise.resolve(null);
    }
    this.lastPrefetchStartedAt = now;

    const controller = new AbortController();
    this.activeAbortController = controller;
    this.activeKey = key;

    // 진행 중 요청(pendingRequests)은 실패를 그대로 전달한다. 추천 화면이 같은 요청을 이어받을 때
    // null 이 아니라 실제 오류(RoutePlanError)를 받아 안내할 수 있어야 하기 때문이다.
    const request = executor(controller.signal)
      .then((result) => {
        this.set(key, result);
        return result;
      })
      .finally(() => {
        this.pendingRequests.delete(key);
        if (this.activeKey === key) {
          this.activeAbortController = null;
          this.activeKey = null;
        }
      });

    this.pendingRequests.set(key, request);
    // 백그라운드 프리페치 호출자는 실패해도 화면에 알리지 않으므로 null 로 삼킨다 (취소 포함)
    return request.catch(() => null);
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
    this.lastPrefetchStartedAt = 0;
    this.cache.clear();
    this.pendingRequests.clear();
  }
}
