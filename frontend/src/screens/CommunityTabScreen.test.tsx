/**
 * [편안하개 - PetWalk]
 * 커뮤니티 탭 화면 단위 테스트 (기간 필터링 + 북마크 복원)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommunityTabScreen } from './CommunityTabScreen';
import * as communityApi from '../services/communityApi';

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Polyline: (props: any) => React.createElement('polyline', props),
  Circle: (props: any) => React.createElement('circle', props),
  Ellipse: (props: any) => React.createElement('ellipse', props),
  Line: (props: any) => React.createElement('line', props),
  Path: (props: any) => React.createElement('path', props),
  Polygon: (props: any) => React.createElement('polygon', props),
  Rect: (props: any) => React.createElement('rect', props),
  G: (props: any) => React.createElement('g', props),
  Text: (props: any) => React.createElement('text', props),
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

vi.mock('../components/map/RouteMapView', () => ({
  RouteMapView: () => React.createElement('div', { 'data-testid': 'mock-route-map' }),
}));

const mockFeeds: communityApi.CommunityFeedItem[] = [
  {
    course_id: 'feed-recent-2days',
    title: '성산공원 둘레길 코스',
    distance_m: 1800,
    duration_min: 25,
    rating: 4.8,
    landmark_code: 'LM_SEONGSAN',
    landmark_name: '성산근린공원',
    region_name: '서울 마포구',
    masked_polyline: [
      [126.905, 37.568],
      [126.908, 37.571],
    ],
    is_origin_masked: true,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['마포안심길', '숲길산책'],
  },
  {
    course_id: 'feed-mid-15days',
    title: '서울숲 벚꽃 은행나무길',
    distance_m: 2100,
    duration_min: 35,
    rating: 4.9,
    landmark_code: 'LM_SEOUL_FOREST',
    landmark_name: '서울숲',
    region_name: '서울 성동구',
    masked_polyline: [
      [127.038, 37.544],
      [127.042, 37.548],
    ],
    is_origin_masked: true,
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['서울숲명소', '평지보행'],
  },
  {
    course_id: 'feed-old-45days',
    title: '서울시청 잔디광장 산책로',
    distance_m: 1200,
    duration_min: 18,
    rating: 4.5,
    landmark_code: 'LM_CITY_HALL',
    landmark_name: '서울시청 잔디광장',
    region_name: '서울 중구',
    masked_polyline: [
      [126.978, 37.566],
      [126.981, 37.569],
    ],
    is_origin_masked: false,
    created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['도심산책', '포장도로'],
  },
];

describe('CommunityTabScreen (기간 필터 및 안심 코스 찜 기능)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('기본 화면 렌더링 시 랜드마크 필터 칩과 기간 필터 칩(전체 기간/최근 7일/최근 30일)이 노출된다', () => {
    const html = renderToStaticMarkup(<CommunityTabScreen initialFeeds={mockFeeds} />);

    // 1. 헤더 및 섹션 타이틀
    expect(html).toContain('커뮤니티 코스 피드');
    expect(html).toContain('동네 이웃 안심 산책로 공유');

    // 2. 랜드마크 필터 칩 바
    expect(html).toContain('전체');
    expect(html).toContain('🏞️ 세종호수');
    expect(html).toContain('🌿 유림공원 · 대전');
    expect(html).toContain('🌲 성산공원 · 마포');

    // 3. 신규 기간 필터 칩 바 (#130 병합)
    expect(html).toContain('전체 기간');
    expect(html).toContain('최근 7일');
    expect(html).toContain('최근 30일');

    // 4. 자택 위치 안심 보호 안내 문구
    expect(html).toContain('자택 위치 안심 보호 (출발·도착지 200m)');
  });

  it('커뮤니티 피드 아이템에 북마크(찜하기) 버튼과 랜드마크/보호 뱃지가 복원되어 표시된다', () => {
    const html = renderToStaticMarkup(<CommunityTabScreen initialFeeds={mockFeeds} />);

    // 찜하기 버튼(BookmarkToggleButton - '즐겨찾기 추가' / '즐겨찾기' accessibilityLabel)
    expect(html).toContain('즐겨찾기');
    expect(html).toContain('성산공원 둘레길 코스');
    expect(html).toContain('1.8km · ⏱️ 약 25분');
    expect(html).toContain('⭐ 4.8');
    expect(html).toContain('🔒 200m 보호');
  });

  it('기간 필터가 최근 7일일 때 7일 이내 코스만 선별하여 목록에 표시한다', () => {
    const html = renderToStaticMarkup(
      <CommunityTabScreen initialFeeds={mockFeeds} initialPeriod="7days" />
    );

    // 2일 전 코스 포함
    expect(html).toContain('성산공원 둘레길 코스');
    // 15일 전 코스 미포함
    expect(html).not.toContain('서울숲 벚꽃 은행나무길');
    // 45일 전 코스 미포함
    expect(html).not.toContain('서울시청 잔디광장 산책로');
    expect(html).toContain('이웃들이 공유한 안심 산책로 (1개)');
  });

  it('기간 필터가 최근 30일일 때 30일 이내 코스 2개만 선별하여 목록에 표시한다', () => {
    const html = renderToStaticMarkup(
      <CommunityTabScreen initialFeeds={mockFeeds} initialPeriod="30days" />
    );

    // 2일 전 코스 포함
    expect(html).toContain('성산공원 둘레길 코스');
    // 15일 전 코스 포함
    expect(html).toContain('서울숲 벚꽃 은행나무길');
    // 45일 전 코스 미포함
    expect(html).not.toContain('서울시청 잔디광장 산책로');
    expect(html).toContain('이웃들이 공유한 안심 산책로 (2개)');
  });

  it('랜드마크 필터와 기간 필터가 복합(AND) 적용되어 올바르게 필터링된다', () => {
    const html = renderToStaticMarkup(
      <CommunityTabScreen
        initialFeeds={mockFeeds}
        initialCategory="LM_SEOUL_FOREST"
        initialPeriod="7days"
      />
    );

    // 서울숲 코스는 15일 전이므로 최근 7일 필터에서는 0개
    expect(html).toContain('이웃들이 공유한 안심 산책로 (0개)');
    expect(html).not.toContain('서울숲 벚꽃 은행나무길');
  });

  it('API 코스 조회 시 각 피드에 기간(created_at) 속성과 태그가 정상 부여되어 있다', async () => {
    const res = await communityApi.fetchCommunityFeeds();
    expect(res.feeds.length).toBeGreaterThanOrEqual(4);

    for (const feed of res.feeds) {
      expect(feed.created_at).toBeDefined();
      expect(new Date(feed.created_at!).getTime()).toBeGreaterThan(0);
      expect(Array.isArray(feed.tags)).toBe(true);
      expect(feed.tags!.length).toBeGreaterThan(0);
    }
  });
});
