import { describe, it, expect, vi } from 'vitest';
import { fetchCommunityFeeds, shareCommunityCourse } from './communityApi';

describe('communityApi (커뮤니티 피드 연동 및 오프라인 폴백)', () => {
  it('네트워크 오류 시 안전하게 기본 피드를 반환해야 한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
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
          title: '유림 흙길',
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
    expect(res.feeds[0].title).toBe('유림 흙길');
    expect(res.is_supabase).toBe(true);
  });

  it('오래된 잘못된 서울 메타데이터를 경로 좌표 기준 대전으로 교정해야 한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        feeds: [{
          course_id: 'daejeon_road',
          title: '이웃 산책 기록',
          masked_polyline: [[127.5, 36.4], [127.501, 36.401]],
          distance_m: 1000,
          duration_min: 16,
          rating: 5,
          is_origin_masked: true,
          landmark_code: 'LM_OTHER',
          landmark_name: '동네 안심 보행로',
          region_name: '서울시',
        }],
        is_supabase: true,
      }),
    } as Response);

    const result = await fetchCommunityFeeds();

    expect(result.feeds[0].landmark_name).toBe('동네 안심 보행로');
    expect(result.feeds[0].region_name).toBe('대전광역시');
  });

  it('코스 공유 요청 실패 시 success: false와 안내 메시지를 반환해야 한다 (이슈 #117)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Timeout'));
    const result = await shareCommunityCourse('테스트 코스', [[127.0, 37.5], [127.01, 37.51]]);
    expect(result.success).toBe(false);
    expect(result.is_supabase).toBe(false);
    expect(result.errorMessage).toBe('지금은 공유할 수 없어요. 잠시 후 다시 시도해 주세요.');
  });
});
