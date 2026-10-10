import { describe, it, expect, vi } from 'vitest';
import { fetchCommunityFeeds, shareCommunityCourse } from './communityApi';

describe('communityApi (커뮤니티 피드 연동 및 오프라인 폴백)', () => {
  it('네트워크 오류 시 안전하게 기본 피드를 반환해야 한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const res = await fetchCommunityFeeds();
    expect(res.feeds.length).toBeGreaterThanOrEqual(2);
    expect(res.feeds[0].title).toContain('숲길');
    expect(res.is_supabase).toBe(false);
  });

  it('서버 응답 성공 시 피드 목록을 올바르게 파싱해야 한다', async () => {
    const mockData = {
      feeds: [
        {
          course_id: 'test_1',
          title: '보라매 흙길',
          masked_polyline: [[127.0, 37.5]],
          distance_m: 1200,
          duration_min: 20,
          rating: 4.8,
          is_origin_masked: true,
        },
      ],
      is_supabase: true,
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const res = await fetchCommunityFeeds();
    expect(res.feeds).toHaveLength(1);
    expect(res.feeds[0].title).toBe('보라매 흙길');
    expect(res.is_supabase).toBe(true);
  });

  it('코스 공유 요청 실패 시에도 에러를 던지지 않고 오프라인 완료 처리해야 한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Timeout'));
    const result = await shareCommunityCourse('테스트 코스', [[127.0, 37.5], [127.01, 37.51]]);
    expect(result.success).toBe(true);
  });
});
