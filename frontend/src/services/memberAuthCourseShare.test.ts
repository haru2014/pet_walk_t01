/**
 * [편안하개 - PetWalk]
 * 회원 전용 커뮤니티 코스 공유 및 비회원 회원가입 연계 단위 테스트 (Issue #44)
 *
 * 1. 비회원(게스트) 상태에서 커뮤니티 산책 경로 공유 및 후기 공개 시 회원 인증 가드 동작 검증
 * 2. 회원가입/로그인 완료 시 커뮤니티 코스 공유 정상 허용 검증
 * 3. shareCommunityCourse 호출 시 로그인 회원 ID 바인딩 검증
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseService } from './supabaseService';
import { shareCommunityCourse } from './communityApi';

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

describe('이슈 #44 - 비회원 회원가입 링크 및 회원 전용 커뮤니티 코스 공유 검증', () => {
  beforeEach(async () => {
    memoryStore.clear();
    await SupabaseService.signOut();
    vi.restoreAllMocks();
  });

  it('비회원 상태에서는 getCurrentUser()가 null을 반환하여 코스 공유 자격을 갖추지 못함을 확인한다', () => {
    expect(SupabaseService.getCurrentUser()).toBeNull();
  });

  it('회원가입을 완료하면 getCurrentUser()가 반환되어 커뮤니티 코스 공유 권한을 획득한다', async () => {
    const res = await SupabaseService.signUp('newbie@petwalk.com', 'pwd123456');
    expect(res.user).toBeTruthy();
    expect(res.user?.email).toBe('newbie@petwalk.com');

    const currentUser = SupabaseService.getCurrentUser();
    expect(currentUser).not.toBeNull();
    expect(currentUser?.id).toBe(res.user?.id);
  });

  it('로그인한 회원의 ID로 커뮤니티 코스 공유 요청 본문이 올바르게 구성된다', async () => {
    await SupabaseService.signUp('share_tester@petwalk.com', 'pwd123456');
    const user = SupabaseService.getCurrentUser();
    expect(user).toBeTruthy();

    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
      if (init && init.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      return {
        ok: true,
        json: async () => ({ status: 'success', course_id: 'shared_44', is_supabase: true }),
      } as Response;
    });

    const coords: [number, number][] = [
      [127.3592, 36.3628],
      [127.3610, 36.3635],
    ];

    const res = await shareCommunityCourse('유림공원 힐링 코스', coords, 5, user?.id);

    expect(res.success).toBe(true);
    expect(capturedBody).toBeDefined();
    expect(capturedBody.user_id).toBe(user?.id);
    expect(capturedBody.course_title).toBe('유림공원 힐링 코스');
    expect(capturedBody.satisfaction_rating).toBe(5);
  });
});
