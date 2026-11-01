import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestWalkPlan } from './api';
import { DogProfile } from '../types/dogProfile';

/**
 * [이슈 #125] 서버가 느려도(운영 서버 평균 약 6초, 잠든 뒤 첫 요청은 10~15초) 앱이 먼저 포기하지 않는다.
 * 예전에는 3.5초 뒤 요청을 취소해서, 공원 모드는 경로가 안 나오고 현재 위치 모드는 샘플(유림)로 바뀌었다.
 */
const dog: DogProfile = {
  id: 'dog_test', name: '코코', breed: '말티즈', ageYears: 5, weightKg: 4.5, jointCareLevel: 1, speedKmH: 2.5,
  createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
};

const line = { type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[127, 36], [127.001, 36]] } }] };
const serverReply = {
  courses: [{ id: 'live_1', name: '서버가 만든 코스', durationMinutes: 25, distanceKm: 1.5, safeRatio: 90, slopePercent: 2.0, shadowPercent: 80, tags: ['안심'] }],
  briefing: '서버 응답',
  validated_park_id: 'yurim',
  route_validation: { live_1: { passed: true, park_id: 'yurim' } },
  geojson: line,
  course_plans: { live_1: { route: line, stepPins: [] } },
};

/** delayMs 뒤에 응답하는 가짜 서버. 앱이 요청을 취소(abort)하면 AbortError 로 끝난다. */
function slowFetch(delayMs: number) {
  const aborted = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
  return vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise<Response>((resolve, reject) => {
    if (init?.signal?.aborted) {
      reject(aborted()); // 진짜 fetch 처럼, 이미 취소된 요청은 바로 실패한다
      return;
    }
    const timer = setTimeout(() => resolve({ ok: true, json: async () => serverReply } as Response), delayMs);
    init?.signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(aborted());
    });
  }));
}

describe('코스 요청 대기 시간 (이슈 #125)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('공원 모드: 서버가 6초 늦게 응답해도 서버 코스를 받는다', async () => {
    slowFetch(6000);
    const pending = requestWalkPlan(dog, { originMode: 'park', pilotParkId: 'yurim', durationMinutes: 25, environments: [], requestText: '' });
    await vi.advanceTimersByTimeAsync(6100);
    const result = await pending;
    expect(result.isLiveServer).toBe(true);
    expect(result.courses[0].name).toBe('서버가 만든 코스');
  });

  it('현재 위치 모드: 서버가 6초 늦게 응답해도 샘플(유림) 경로로 바뀌지 않는다', async () => {
    slowFetch(6000);
    const pending = requestWalkPlan(dog, {
      originMode: 'current_location', userCoordinates: { lat: 36.35, lon: 127.38 }, durationMinutes: 25, environments: [], requestText: '',
    });
    await vi.advanceTimersByTimeAsync(6100);
    const result = await pending;
    expect(result.isLiveServer).toBe(true);
    expect(result.courses[0].name).toBe('서버가 만든 코스');
  });

  it('서버가 20초가 지나도 답이 없으면 공원 모드는 오류로 알린다 (검증 안 된 코스를 만들지 않는다)', async () => {
    slowFetch(60000);
    const pending = requestWalkPlan(dog, { originMode: 'park', pilotParkId: 'yurim', durationMinutes: 25, environments: [], requestText: '' });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'ROUTING_PROVIDER_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(21000);
    await assertion;
  });
});
