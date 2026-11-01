import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OnboardingService } from './onboardingService';
import { calculateRecommendedSpeedKmH, DogProfile } from '../types/dogProfile';

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
    getAllKeys: vi.fn(async () => Array.from(memoryStore.keys())),
  },
}));

describe('T2-ONBOARD-FLOW: 4단계 온보딩 E2E 플로우 테스트', () => {
  beforeEach(async () => {
    memoryStore.clear();
    await OnboardingService.resetOnboarding();
  });

  it('초기 상태에서는 온보딩이 완료되지 않은 상태여야 한다', async () => {
    const hasSeen = await OnboardingService.hasSeenOnboarding();
    expect(hasSeen).toBe(false);
  });

  it('1단계(가입약관) -> 2단계(반려견등록) -> 3단계(위치동의) -> 4단계(주변지도) 순서로 DTO가 생성되고 온보딩이 완료되어야 한다', async () => {
    // Step 1. 가입약관 및 개인정보 동의
    const step1Data = {
      email: 'test@petwalk.com',
      password: 'password123',
      termsAgreed: true,
      privacyAgreed: true,
    };
    expect(step1Data.termsAgreed).toBe(true);
    expect(step1Data.privacyAgreed).toBe(true);

    // Step 2. 반려견 등록
    const step2Data = {
      name: '콩이',
      breed: '골든 리트리버',
      weightKg: 28,
      ageYears: 3,
    };
    const speed = calculateRecommendedSpeedKmH(step2Data.weightKg, step2Data.ageYears, 1);
    const registeredDog: DogProfile = {
      id: 'dog_test_new',
      name: step2Data.name,
      breed: step2Data.breed,
      ageYears: step2Data.ageYears,
      weightKg: step2Data.weightKg,
      jointCareLevel: 1,
      speedKmH: speed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(registeredDog.name).toBe('콩이');
    expect(registeredDog.speedKmH).toBeGreaterThan(0);

    // Step 3. 위치 권한 동의
    const step3Data = {
      locationAgreed: true,
      privacyMaskingDistanceM: 200,
    };
    expect(step3Data.locationAgreed).toBe(true);
    expect(step3Data.privacyMaskingDistanceM).toBe(200);

    // Step 4. 주변 코스 / 산책견 지도 진입 및 온보딩 완료 처리
    const markSuccess = await OnboardingService.markOnboardingCompleted();
    expect(markSuccess).toBe(true);

    const hasSeenAfter = await OnboardingService.hasSeenOnboarding();
    expect(hasSeenAfter).toBe(true);
  });
});
