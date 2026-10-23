import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseService } from './supabaseService';

/**
 * [이슈 #116] 후기 공개/해제는 서버(POST /api/v1/walks/{id}/share|unshare)가 한다.
 * 서버가 출발·도착 200m 를 가린 좌표만 공개하고, 앱은 DB 의 is_public 을 직접 바꾸지 않는다.
 * 예전에는 DB 에 없는 기록이어도 오류 없이 "성공"을 돌려줬다(조용한 실패). 이제 실패 이유를 알려 준다.
 */
const WALK_ID = '3f2b8c1e-6a4d-4e0b-9d57-1a2b3c4d5e6f';

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('후기 공개 서버 호출 (이슈 #116)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await SupabaseService.signIn('walker@example.com', 'pass123');
  });

  it('공개: 로그인 토큰을 Authorization 으로 붙여 /share 를 호출한다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { walk_id: WALK_ID, is_public: true }));
    const result = await SupabaseService.setWalkRecordPublic(WALK_ID, true);
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/api/v1/walks/${WALK_ID}/share`);
    expect((init as RequestInit).method).toBe('POST');
    const auth = ((init as RequestInit).headers as Record<string, string>).Authorization;
    expect(auth).toMatch(/^Bearer .+/);
    expect(auth).toContain(SupabaseService.getSession()!.accessToken);
  });

  it('해제: /unshare 를 호출한다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { walk_id: WALK_ID, is_public: false }));
    expect(await SupabaseService.setWalkRecordPublic(WALK_ID, false)).toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/api/v1/walks/${WALK_ID}/unshare`);
  });

  it('DB 에 없는 기록(404)은 성공처럼 보이지 않고 이유를 알려 준다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(404, { detail: { code: 'WALK_NOT_FOUND', message: 'x' } }));
    const result = await SupabaseService.setWalkRecordPublic(WALK_ID, true);
    expect(result).toMatchObject({ ok: false, code: 'WALK_NOT_FOUND' });
    expect((result as { message: string }).message).toContain('클라우드');
  });

  it('경로가 너무 짧아 가릴 수 없으면(422) 공개하지 않고 이유를 알려 준다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(422, { detail: { code: 'ROUTE_TOO_SHORT_TO_MASK', message: 'x' } }));
    const result = await SupabaseService.setWalkRecordPublic(WALK_ID, true);
    expect(result).toMatchObject({ ok: false, code: 'ROUTE_TOO_SHORT_TO_MASK' });
    expect((result as { message: string }).message).toContain('200m');
  });

  it('로그인 만료(401)를 알려 준다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(401, { detail: { code: 'AUTH_INVALID', message: 'x' } }));
    expect(await SupabaseService.setWalkRecordPublic(WALK_ID, true)).toMatchObject({ ok: false, code: 'AUTH_INVALID' });
  });

  it('서버에 연결하지 못하면 NETWORK 로 알려 준다 (성공으로 속이지 않는다)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const result = await SupabaseService.setWalkRecordPublic(WALK_ID, true);
    expect(result).toMatchObject({ ok: false, code: 'NETWORK' });
  });

  it('알 수 없는 서버 오류도 실패로 알린다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(500, {}));
    expect(await SupabaseService.setWalkRecordPublic(WALK_ID, true)).toMatchObject({ ok: false, code: 'HTTP_500' });
  });

  it('로그인하지 않았으면 서버를 부르지 않고 로그인이 필요하다고 알린다', async () => {
    await SupabaseService.signOut();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await SupabaseService.setWalkRecordPublic(WALK_ID, true);
    expect(result).toMatchObject({ ok: false, code: 'AUTH_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
