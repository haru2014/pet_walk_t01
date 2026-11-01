/**
 * [편안하개 - PetWalk]
 * SupabaseService 단위 테스트 (US-G2, PR #42)
 *
 * - 이메일 회원가입 및 로그인 세션 영속화
 * - pet-photos 보관함 본인 폴더 (<user_id>/...) 경로 생성
 * - dog_profiles 및 walk_records 생성 및 is_public 후기 공개 토글 검증
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseService } from './supabaseService';

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
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const k of keys) {
        memoryStore.delete(k);
      }
    }),
  },
}));

describe('US-G2 SupabaseService - 클라우드 인증 및 DB 연동', () => {
  beforeEach(async () => {
    memoryStore.clear();
    await SupabaseService.signOut();
  });

  it('회원가입(signUp) 시 사용자 및 액세스 토큰 세션이 생성되어야 한다', async () => {
    const res = await SupabaseService.signUp('test@example.com', 'password123');
    expect(res.user).toBeTruthy();
    expect(res.user?.email).toBe('test@example.com');

    const currentUser = SupabaseService.getCurrentUser();
    expect(currentUser?.email).toBe('test@example.com');

    const token = SupabaseService.getAccessToken();
    expect(token).toBeTruthy();
  });

  it('로그인(signIn) 후 세션이 정상 복원되어야 한다', async () => {
    await SupabaseService.signIn('member4@petwalk.com', 'secretpass');
    expect(SupabaseService.getCurrentUser()?.email).toBe('member4@petwalk.com');

    await SupabaseService.signOut();
    expect(SupabaseService.getCurrentUser()).toBeNull();
    expect(SupabaseService.getAccessToken()).toBeNull();
  });

  it('pet-photos 업로드 시 본인 user_id 폴더 경로가 올바르게 포맷되어야 한다', async () => {
    await SupabaseService.signIn('dogowner@example.com', 'pass123');
    const user = SupabaseService.getCurrentUser();
    expect(user).toBeTruthy();

    const result = await SupabaseService.uploadPetPhoto(user!.id, 'choco photo!.jpg', 'sample_blob');
    expect(result.photoPath).toMatch(new RegExp(`^${user!.id}/choco_photo_\\.jpg$`));
  });

  it('반려견 프로필(saveDogProfile)이 정상 동기화되어야 한다', async () => {
    await SupabaseService.signIn('tester@example.com', 'pass123');
    const profile = await SupabaseService.saveDogProfile({
      name: '초코',
      breed: '푸들',
      weight_kg: 5.2,
      joint_care_level: 1,
    });

    expect(profile.name).toBe('초코');
    expect(profile.breed).toBe('푸들');
    expect(profile.weight_kg).toBe(5.2);
    expect(profile.user_id).toBeTruthy();
  });

  it('산책 기록 생성이 정상 작동해야 한다', async () => {
    await SupabaseService.signIn('walker@example.com', 'pass123');
    const record = await SupabaseService.createWalkRecord({
      distance_m: 2300,
      duration_min: 35,
      note: '시원한 호수공원 산책',
      rating: 5,
    });

    expect(record.distance_m).toBe(2300);
    expect(record.duration_min).toBe(35);
    expect(record.is_public).toBe(false);

    // 후기 공개/해제는 서버 API 로 한다 (자세한 동작은 supabaseService.walkShare.test.ts)
    expect(typeof SupabaseService.setWalkRecordPublic).toBe('function');
  });
});
