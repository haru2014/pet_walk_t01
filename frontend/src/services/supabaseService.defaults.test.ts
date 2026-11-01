/**
 * 산책 기록 공유 불가 문제(10/25, 10/30)의 재발 방지.
 * 환경변수가 빠진 채 앱 업데이트(eas update)가 올라가도 Supabase 연결이 만들어져야 한다.
 * 연결이 없으면 앱이 "클라우드 연결을 확인해 주세요 / 지금은 산책 기록을 공유할 수 없어요"만 보여 준다.
 * Supabase 클라이언트와 저장소는 가짜로 바꿔서 어떤 주소·키로 만들어졌는지만 검사한다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import eas from '../../eas.json';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    getAllKeys: vi.fn(async () => []),
    multiRemove: vi.fn(async () => undefined),
  },
}));

const createClient = vi.fn(() => ({
  auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

async function loadService() {
  vi.resetModules();
  return import('./supabaseService');
}

describe('Supabase 연결 기본값', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    createClient.mockClear();
  });

  it('환경변수가 아예 없으면 기본 주소·공개 키로 연결을 만든다 (공유가 CLOUD_NOT_CONFIGURED 로 막히지 않는다)', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', undefined);
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', undefined);
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_KEY', undefined);
    const { SupabaseService, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_PUBLISHABLE_KEY } = await loadService();
    expect(createClient).toHaveBeenCalledWith(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_PUBLISHABLE_KEY, expect.anything());
    const access = SupabaseService.getWalkShareAccess();
    expect(access.ok === false && access.code).not.toBe('CLOUD_NOT_CONFIGURED');
  });

  it('환경변수를 빈 값으로 두면 클라우드 없는 로컬 모드를 유지한다 (테스트 기본값)', async () => {
    const { SupabaseService } = await loadService();
    expect(createClient).not.toHaveBeenCalled();
    const access = SupabaseService.getWalkShareAccess();
    expect(access.ok === false && access.code).toBe('CLOUD_NOT_CONFIGURED');
  });

  it('환경변수가 있으면 그 값을 우선한다', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_test');
    await loadService();
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'sb_publishable_test', expect.anything());
  });

  it('코드의 기본값이 eas.json 의 값과 같다 (한쪽만 바뀌어 어긋나지 않게)', async () => {
    const { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_PUBLISHABLE_KEY } = await loadService();
    for (const profile of ['preview', 'production'] as const) {
      expect(eas.build[profile].env.EXPO_PUBLIC_SUPABASE_URL).toBe(DEFAULT_SUPABASE_URL);
      expect(eas.build[profile].env.EXPO_PUBLIC_SUPABASE_ANON_KEY).toBe(DEFAULT_SUPABASE_PUBLISHABLE_KEY);
    }
  });
});
