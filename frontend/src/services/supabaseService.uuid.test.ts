/**
 * [편안하개 - PetWalk] 앱↔DB 저장 약속 회귀 테스트 (이슈 #55)
 * - DB 로 보내는 id 는 UUID, 로그인 전(guest)·옛 id 는 DB 로 보내지 않음, DB 오류가 나도 앱이 죽지 않음
 * Supabase 클라이언트는 가짜로 바꿔서 "무엇을 DB 에 보냈는지"만 검사한다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isUuid } from '../utils/uuid';

const memoryStore = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => memoryStore.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void memoryStore.set(k, v)),
    removeItem: vi.fn(async (k: string) => void memoryStore.delete(k)),
    getAllKeys: vi.fn(async () => Array.from(memoryStore.keys())),
    multiRemove: vi.fn(async (ks: string[]) => ks.forEach((k) => memoryStore.delete(k))),
  },
}));

const USER_UUID = '11111111-2222-4333-8444-555555555555';
const upsert = vi.fn();
const insert = vi.fn();
const maybeSingle = vi.fn();
const queryBuilder = {
  select: vi.fn(() => queryBuilder),
  eq: vi.fn(() => queryBuilder),
  maybeSingle,
};
const from = vi.fn((table: string) => ({
  ...(table === 'dog_profiles' ? { upsert } : { insert }),
  select: queryBuilder.select,
  eq: queryBuilder.eq,
  maybeSingle,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from,
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: { user: { id: USER_UUID, email: 'a@example.com' }, session: { access_token: 'tok' } },
        error: null,
      })),
      signUp: vi.fn(),
      signOut: vi.fn(async () => ({})),
    },
    storage: { from: vi.fn() },
  }),
}));

async function loadService() {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_test');
  const mod = await import('./supabaseService');
  return mod.SupabaseService;
}

describe('이슈 #55: DB 로 보내는 id 약속', () => {
  beforeEach(() => {
    memoryStore.clear();
    upsert.mockReset().mockResolvedValue({ error: null });
    insert.mockReset().mockResolvedValue({ error: null });
    maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    queryBuilder.select.mockClear();
    queryBuilder.eq.mockClear();
    from.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('로그인 후 개 프로필 저장: id 는 UUID, user_id 는 로그인 계정 번호', async () => {
    const svc = await loadService();
    await svc.signIn('a@example.com', 'pw');
    const profile = await svc.saveDogProfile({ name: '코코' });

    expect(isUuid(profile.id)).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    const sent = upsert.mock.calls[0][0];
    expect(isUuid(sent.id)).toBe(true);
    expect(sent.user_id).toBe(USER_UUID);
    expect(sent.name).toBe('코코');
  });

  it('폰에서 정한 UUID id 는 DB 로 그대로 보낸다 (폰 id = DB id)', async () => {
    const svc = await loadService();
    await svc.signIn('a@example.com', 'pw');
    const myId = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
    const profile = await svc.saveDogProfile({ id: myId, name: '코코' });
    expect(profile.id).toBe(myId);
    expect(upsert.mock.calls[0][0].id).toBe(myId);
  });

  it('로그인 전(guest)에는 DB 로 보내지 않고 폰에만 둔다', async () => {
    const svc = await loadService();
    const profile = await svc.saveDogProfile({ name: '코코' });
    expect(profile.user_id).toBe('guest_user');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('옛 형식 id(dog_123)는 DB 로 보내지 않는다 (400 방지)', async () => {
    const svc = await loadService();
    await svc.signIn('a@example.com', 'pw');
    await svc.saveDogProfile({ id: 'dog_1760000000000', name: '옛강아지' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('DB 가 오류를 돌려줘도 앱은 죽지 않고 로컬 값을 돌려준다', async () => {
    upsert.mockResolvedValue({ error: { message: 'invalid input syntax for type uuid' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const svc = await loadService();
    await svc.signIn('a@example.com', 'pw');
    const profile = await svc.saveDogProfile({ name: '코코' });
    expect(profile.name).toBe('코코');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('저장 실패'));
    warn.mockRestore();
  });

  it('산책 기록: id 는 UUID, 옛 형식 dog_id 는 연결 없이 저장', async () => {
    const svc = await loadService();
    await svc.signIn('a@example.com', 'pw');
    const rec = await svc.createWalkRecord({ distance_m: 1200, duration_min: 20, dog_id: 'dog_1760000000000' });

    expect(isUuid(rec.id)).toBe(true);
    const sent = insert.mock.calls[0][0];
    expect(isUuid(sent.id)).toBe(true);
    expect(sent.user_id).toBe(USER_UUID);
    expect(sent.dog_id).toBeUndefined();
  });

  it('산책 기록: DB 가 정하는 칸(is_public, public_route_coords, created_at)은 보내지 않는다 (이슈 #116)', async () => {
    // DB 는 공개 관련 칸을 앱이 쓰지 못하게 막는다. 값이 false 여도 칸 이름이 들어 있으면 권한 오류가 난다.
    const svc = await loadService();
    await svc.signIn('a@example.com', 'pw');
    await svc.createWalkRecord({ distance_m: 800, duration_min: 12, is_public: true });
    const sent = insert.mock.calls[0][0];
    expect(Object.keys(sent)).not.toContain('is_public');
    expect(Object.keys(sent)).not.toContain('public_route_coords');
    expect(Object.keys(sent)).not.toContain('created_at');
    // 앱이 쓸 수 있는 칸은 그대로 보낸다
    for (const column of ['id', 'user_id', 'started_at', 'ended_at', 'distance_m', 'duration_min', 'route_coords', 'photo_paths', 'note', 'rating']) {
      expect(Object.keys(sent)).toContain(column);
    }
  });

  it('산책 기록: UUID dog_id 는 그대로 연결한다', async () => {
    const svc = await loadService();
    await svc.signIn('a@example.com', 'pw');
    const dogId = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
    await svc.createWalkRecord({ distance_m: 1, duration_min: 1, dog_id: dogId });
    expect(insert.mock.calls[0][0].dog_id).toBe(dogId);
  });

  it('공유용 동기화는 UUID 형태여도 클라우드에 없는 로컬 dog_id를 삽입하지 않는다', async () => {
    const svc = await loadService();
    await svc.signIn('a@example.com', 'pw');
    const localDogId = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
    const record = {
      id: 'walk_local_1',
      dogId: localDogId,
      startedAt: '2026-10-23T01:00:00.000Z',
      completedAt: '2026-10-23T01:01:00.000Z',
      durationMinutes: 1,
      totalDistanceKm: 0,
      averageSpeedKmH: 0,
      safeSurfaceRatio: 1,
      gpsTrack: [],
    };

    await svc.ensureWalkRecordSynced(record);

    expect(insert.mock.calls[0][0]).not.toHaveProperty('dog_id');
  });
});
