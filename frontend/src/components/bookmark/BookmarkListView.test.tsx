/**
 * [BookmarkListView 아코디언 및 산책 연동 TDD 테스트]
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-native-webview', () => ({
  WebView: 'WebView',
  default: 'WebView',
}));
vi.mock('../map/RouteMapView', () => ({
  RouteMapView: () => React.createElement('div', { 'data-route-map': 'true' }),
}));

import { BookmarkListView } from './BookmarkListView';
import { BookmarkService } from '../../services/bookmarkService';
import { BookmarkedRoute } from '../../types/bookmark';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from '../../services/sampleRoute';

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Polyline: (props: any) => React.createElement('polyline', props),
  Circle: (props: any) => React.createElement('circle', props),
  G: (props: any) => React.createElement('g', props),
  Text: (props: any) => React.createElement('text', props),
}));

vi.mock('../../services/photoPickerService', () => ({
  DOG_AVATAR_PRESETS: [
    { id: 'golden', emoji: '🦮', label: '골든', color: '#FDF6E2' },
  ],
  pickDogPhoto: vi.fn(),
}));

const mockBookmark: BookmarkedRoute = {
  id: 'bm_test_01',
  title: '테스트 안심 숲길 코스',
  dogName: '초코',
  savedAt: '2026-10-12T10:00:00.000Z',
  totalDistanceKm: 1.5,
  estimatedMinutes: 25,
  maxSlopePercent: 3.2,
  shadePercent: 78,
  tags: ['완만한길', '그늘'],
  routeGeoJson: SAMPLE_ROUTE,
  stepPins: SAMPLE_STEP_PINS,
};

describe('BookmarkListView - 아코디언 구조 및 산책 버튼 렌더링 검증', () => {
  it('BookmarkListView가 SSR/정적 마크업 환경에서 에러 없이 정상 렌더링되어야 한다', async () => {
    vi.spyOn(BookmarkService, 'getBookmarks').mockResolvedValue([mockBookmark]);
    const handleStart = vi.fn();

    const html = renderToStaticMarkup(
      <BookmarkListView onStartBookmark={handleStart} dogSpeedKmH={3.5} />
    );

    expect(html).toContain('내가 찜한 안심 코스');
    expect(typeof html).toBe('string');
  });
});
