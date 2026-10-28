/**
 * [편안하개 - PetWalk]
 * 완주 리포트 코스 공유 연계 플로우 단위 테스트 (US-G2, T1-2)
 *
 * - 완주 기록(gpsTrack) 좌표 추출 및 [lon, lat] 튜플 변환
 * - gpsTrack 비어있을 때 대체 좌표 없이 공유 차단 (#281)
 * - shareCommunityCourse API 호출 및 200m 공간 보호 플로우 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasVisibleCommunityRoute, shareCommunityCourse, toShareCoordinates } from './communityApi';
import { WalkRecord } from '../types/storage';

describe('완주 리포트 코스 커뮤니티 공유 연계 플로우 (US-G2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('WalkRecord의 gpsTrack 좌표가 [lon, lat] 형태의 폴리라인으로 올바르게 변환되어 공유된다', async () => {
    const mockRecord: WalkRecord = {
      id: 'walk_test_01',
      dogId: 'dog_choco',
      startedAt: '2026-10-13T10:00:00Z',
      completedAt: '2026-10-13T10:30:00Z',
      durationMinutes: 30,
      totalDistanceKm: 1.5,
      averageSpeedKmH: 3.0,
      safeSurfaceRatio: 0.9,
      gpsTrack: [
        { lat: 37.544, lon: 127.038, timestamp: 1000 },
        { lat: 37.545, lon: 127.040, timestamp: 2000 },
        { lat: 37.543, lon: 127.039, timestamp: 3000 },
      ],
    };

    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
      if (init && init.body) {
        capturedBody = JSON.parse(init.body as string);
      }
      return {
        ok: true,
        json: async () => ({ status: 'success', course_id: 'shared_123', is_supabase: true }),
      } as Response;
    });

    const coords: [number, number][] = mockRecord.gpsTrack.map((p) => [p.lon, p.lat]);
    const res = await shareCommunityCourse('성산근린공원 안심 코스', coords, 5);

    expect(res.success).toBe(true);
    expect(res.is_supabase).toBe(true);
    expect(capturedBody).toBeDefined();
    expect(capturedBody.course_title).toBe('성산근린공원 안심 코스');
    expect(capturedBody.raw_coordinates).toEqual([
      [127.038, 37.544],
      [127.040, 37.545],
      [127.039, 37.543],
    ]);
    expect(capturedBody.satisfaction_rating).toBe(5);
  });

  it('gpsTrack이 비었거나 1점뿐이면 대체 좌표 없이 공유 좌표가 null이다 (#281)', () => {
    expect(toShareCoordinates([])).toBeNull();
    expect(toShareCoordinates(undefined)).toBeNull();
    expect(toShareCoordinates([{ lat: 36.362, lon: 127.36, timestamp: 1000 }])).toBeNull();
  });

  it('gpsTrack이 2점 이상이면 [lon, lat] 좌표열로 바꾼다 (#281)', () => {
    expect(
      toShareCoordinates([
        { lat: 36.362, lon: 127.36, timestamp: 1000 },
        { lat: 36.363, lon: 127.361, timestamp: 2000 },
      ]),
    ).toEqual([
      [127.36, 36.362],
      [127.361, 36.363],
    ]);
  });

  it('마스킹 후 경로가 2점 미만이면 커뮤니티 지도에 그릴 경로가 없다 (#281)', () => {
    expect(hasVisibleCommunityRoute({ masked_polyline: [] })).toBe(false);
    expect(hasVisibleCommunityRoute({ masked_polyline: [[127.36, 36.362]] })).toBe(false);
    expect(hasVisibleCommunityRoute({ masked_polyline: [[127.36, 36.362], [127.361, 36.363]] })).toBe(true);
  });

  it('서버 통신 실패 또는 타임아웃 발생 시 success: false 및 실패 안내 메시지를 반환한다 (이슈 #117)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));

    const res = await shareCommunityCourse('오프라인 산책 코스', [[127.0, 37.5]], 5);

    expect(res.success).toBe(false);
    expect(res.is_supabase).toBe(false);
    expect(res.errorMessage).toBe('지금은 공유할 수 없어요. 잠시 후 다시 시도해 주세요.');
  });
});
