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
  it('renders title and 7 empty paw prints when stats is null (no walks yet)', () => {
    const html = renderToStaticMarkup(
      <TrailAccomplishmentWidget stats={null} />
    );

    expect(html).toContain('이번 주 산책 달성도');
    expect(html).toContain('0/7일 완료');
    // activeColor #58B273 0개, inactiveColor #E2E8F0 7개 포함 확인
    const activeOccurrences = (html.match(/#58B273/g) || []).length;
    const inactiveOccurrences = (html.match(/#E2E8F0/g) || []).length;
    expect(activeOccurrences).toBe(0);
    expect(inactiveOccurrences).toBe(7);
    // 일주일 7일(월~일) 라벨 렌더링 확인
    expect(html).toContain('월');
    expect(html).toContain('일');
  });

  it('renders exact 1:1 daily walked paws matching dailyStats.hasWalked', () => {
    const mockStats: WeeklyWalkStats = {
      weekRangeLabel: '10.12 ~ 10.18',
      totalDistanceKm: 8.5,
      totalWalks: 3,
      targetWalks: 7,
      completionRatePercent: 43,
      safeSurfaceRatioPercent: 75,
      totalDurationMinutes: 90,
      totalPoopCount: 3,
      dailyStats: [
        { dayLabel: '월', dateStr: '2026-10-12', distanceKm: 2.5, durationMinutes: 30, walkCount: 1, targetCount: 1, achievementRatePercent: 100, hasWalked: true, isToday: false },
        { dayLabel: '화', dateStr: '2026-10-13', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
        { dayLabel: '수', dateStr: '2026-10-14', distanceKm: 3.0, durationMinutes: 30, walkCount: 1, targetCount: 1, achievementRatePercent: 100, hasWalked: true, isToday: false },
        { dayLabel: '목', dateStr: '2026-10-15', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
        { dayLabel: '금', dateStr: '2026-10-16', distanceKm: 3.0, durationMinutes: 30, walkCount: 1, targetCount: 1, achievementRatePercent: 100, hasWalked: true, isToday: true },
        { dayLabel: '토', dateStr: '2026-10-17', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
        { dayLabel: '일', dateStr: '2026-10-18', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
      ],
      jointCareMessage: '관절 상태 양호',
    };

    const html = renderToStaticMarkup(
      <TrailAccomplishmentWidget stats={mockStats} />
    );

    expect(html).toContain('3/7일 완료');
    const activeOccurrences = (html.match(/#58B273/g) || []).length;
    const inactiveOccurrences = (html.match(/#E2E8F0/g) || []).length;
    // 월, 수, 금 3일 산책 완료
    expect(activeOccurrences).toBe(3);
    expect(inactiveOccurrences).toBe(4);
  });
});
