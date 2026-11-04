/**
 * 공유 시 개인정보 보호 기준점 = 실제 산책 시작·완료 지점
 * (경로 이탈 후 재탐색해도 재탐색 지점이 아니라 처음 출발한 지점 반경 200m 를 가린다)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSharePrivacyAnchors, shareCommunityCourse } from './communityApi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('communityApi - 산책 시작·완료 지점 기준 200m 보호', () => {
  const track = [
    { lat: 36.36, lon: 127.38, timestamp: 1 },
    { lat: 36.361, lon: 127.381, timestamp: 2 },
    { lat: 36.365, lon: 127.39, timestamp: 3 },
  ];

  it('기록된 산책 시작·완료 지점을 우선 사용한다', () => {
    expect(resolveSharePrivacyAnchors({
      gpsTrack: track,
      walkStartPoint: [127.3799, 36.3599],
      walkEndPoint: [127.3901, 36.3651],
    })).toEqual({ start: [127.3799, 36.3599], end: [127.3901, 36.3651] });
  });

  it('이전 기록처럼 시작·완료 지점이 없으면 GPS 궤적의 첫·끝 점을 쓴다', () => {
    expect(resolveSharePrivacyAnchors({ gpsTrack: track })).toEqual({
      start: [127.38, 36.36],
      end: [127.39, 36.365],
    });
  });

  it('공유 요청에 산책 시작·완료 지점을 함께 보낸다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ is_supabase: true }),
    } as Response);

    await shareCommunityCourse('유림 산책', [[127.38, 36.36], [127.39, 36.365]], 5, 'user-1', {
      start: [127.38, 36.36],
      end: [127.39, 36.365],
    });

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.walk_start_point).toEqual([127.38, 36.36]);
    expect(body.walk_end_point).toEqual([127.39, 36.365]);
  });
});
