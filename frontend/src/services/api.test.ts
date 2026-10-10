import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestWalkPlan } from './api';
import { DogProfile } from '../types/dogProfile';

const dummyDog: DogProfile = {
  id: 'dog_test',
  name: '코코',
  breed: '말티즈',
  ageYears: 5,
  weightKg: 4.5,
  jointCareLevel: 1,
  speedKmH: 2.5,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
};

describe('apiService (Live API 및 오프라인 폴백 듀얼 모드)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('서버가 오프라인이거나 응답하지 않을 때 즉시 로컬 Mock 데이터로 안전하게 폴백해야 한다', async () => {
    // fetch가 에러를 던지도록 모킹
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await requestWalkPlan(dummyDog, { durationMinutes: 30, environments: ['soft'], requestText: '' });

    expect(result.isLiveServer).toBe(false);
    expect(result.courses.length).toBeGreaterThan(0);
    expect(result.route.type).toBe('FeatureCollection');
    expect(result.stepPins.length).toBeGreaterThan(0);
    expect(result.briefingMessage).toContain('코코');
  });

  it('서버가 정상 응답할 경우 Live 데이터 결과를 반환해야 한다', async () => {
    const mockApiResponse = {
      courses: [{ id: 'live_1', name: '실시간 생성 코스', durationMinutes: 25, distanceKm: 1.5, safeRatio: 90, slopePercent: 2.0, shadowPercent: 80, tags: ['안심'] }],
      briefing: '실시간 AI 코스가 생성되었습니다.',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse,
    } as Response);

    const result = await requestWalkPlan(dummyDog, { durationMinutes: 25, environments: ['shade'], requestText: '' });

    expect(result.isLiveServer).toBe(true);
    expect(result.courses[0].name).toBe('실시간 생성 코스');
    expect(result.briefingMessage).toBe('실시간 AI 코스가 생성되었습니다.');
  });
});
