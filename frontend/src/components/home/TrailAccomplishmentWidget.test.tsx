import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrailAccomplishmentWidget } from './TrailAccomplishmentWidget';
import { WeeklyWalkStats } from '../../services/walkStatisticsService';

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

describe('TrailAccomplishmentWidget (docs/reference/trail_ accomplishment.png)', () => {
  it('renders title and 7 paw prints with default 4 filled when stats is null', () => {
    const html = renderToStaticMarkup(
      <TrailAccomplishmentWidget stats={null} />
    );

    expect(html).toContain('이번 주 산책 달성도');
    expect(html).toContain('이번 주 산책 달성도: 7회 중 4회 달성');
    // activeColor #58B273 4회, inactiveColor #E2E8F0 3회 포함 확인
    const activeOccurrences = (html.match(/#58B273/g) || []).length;
    const inactiveOccurrences = (html.match(/#E2E8F0/g) || []).length;
    expect(activeOccurrences).toBe(4);
    expect(inactiveOccurrences).toBe(3);
    // 일주일 7일(월~일) 라벨 렌더링 확인
    expect(html).toContain('월');
    expect(html).toContain('일');
  });

  it('renders exact completed count according to weeklyStats.totalWalks', () => {
    const mockStats: WeeklyWalkStats = {
      weekRangeLabel: '10.12 ~ 10.18',
      totalDistanceKm: 8.5,
      totalWalks: 5,
      targetWalks: 7,
      completionRatePercent: 71,
      safeSurfaceRatioPercent: 75,
      totalDurationMinutes: 120,
      totalPoopCount: 4,
      dailyStats: [],
      jointCareMessage: '관절 상태 양호',
    };

    const html = renderToStaticMarkup(
      <TrailAccomplishmentWidget stats={mockStats} />
    );

    expect(html).toContain('이번 주 산책 달성도: 7회 중 5회 달성');
    const activeOccurrences = (html.match(/#58B273/g) || []).length;
    const inactiveOccurrences = (html.match(/#E2E8F0/g) || []).length;
    expect(activeOccurrences).toBe(5);
    expect(inactiveOccurrences).toBe(2);
  });
});
