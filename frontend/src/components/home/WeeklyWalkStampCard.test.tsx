import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyWalkStampCard } from './WeeklyWalkStampCard';
import { WeeklyWalkStats } from '../../services/walkStatisticsService';

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Circle: (props: any) => React.createElement('circle', props),
  Path: (props: any) => React.createElement('path', props),
}));

describe('WeeklyWalkStampCard - 7일 발자국 스탬프 위젯', () => {
  const mockWeeklyStats: WeeklyWalkStats = {
    weekRangeLabel: '10.15 ~ 10.21',
    totalDistanceKm: 4.2,
    totalWalks: 2,
    completedDays: 2,
    targetDays: 7,
    completionRatePercent: 29,
    safeSurfaceRatioPercent: 85,
    totalDurationMinutes: 60,
    totalPoopCount: 3,
    jointCareMessage: '안심 산책',
    dailyStats: [
      { dayLabel: '월', dateStr: '2026-10-15', distanceKm: 2.1, durationMinutes: 30, walkCount: 1, targetCount: 1, achievementRatePercent: 100, hasWalked: true, isToday: false },
      { dayLabel: '화', dateStr: '2026-10-16', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
      { dayLabel: '수', dateStr: '2026-10-17', distanceKm: 2.1, durationMinutes: 30, walkCount: 1, targetCount: 1, achievementRatePercent: 100, hasWalked: true, isToday: false },
      { dayLabel: '목', dateStr: '2026-10-18', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
      { dayLabel: '금', dateStr: '2026-10-19', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
      { dayLabel: '토', dateStr: '2026-10-20', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
      { dayLabel: '일', dateStr: '2026-10-21', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: true },
    ],
  };

  it('이번 주 산책 달성도 타이틀과 N/7일 완료 뱃지가 정상 렌더링된다', () => {
    const html = renderToStaticMarkup(
      <WeeklyWalkStampCard weeklyStats={mockWeeklyStats} onPress={vi.fn()} />
    );

    expect(html).toContain('이번 주 산책 달성도');
    expect(html).toContain('2/7일 완료');
  });

  it('월~일 7개 요일 라벨이 모두 노출된다', () => {
    const html = renderToStaticMarkup(
      <WeeklyWalkStampCard weeklyStats={mockWeeklyStats} onPress={vi.fn()} />
    );

    ['월', '화', '수', '목', '금', '토', '일'].forEach((day) => {
      expect(html).toContain(day);
    });
  });

  it('통계 데이터가 null일 때도 기본 0/7일 완료와 7일 템플릿이 안전하게 렌더링된다', () => {
    const html = renderToStaticMarkup(
      <WeeklyWalkStampCard weeklyStats={null} onPress={vi.fn()} />
    );

    expect(html).toContain('이번 주 산책 달성도');
    expect(html).toContain('0/7일 완료');
  });
});
