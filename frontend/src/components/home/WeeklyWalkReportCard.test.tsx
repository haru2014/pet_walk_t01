import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WalkStatisticsService } from '../../services/walkStatisticsService';
import { WeeklyWalkReportCard } from './WeeklyWalkReportCard';

vi.mock('../../theme/themeManager', () => ({
  useAppTheme: () => ({
    colors: new Proxy({}, { get: () => '#000000' }),
  }),
}));

vi.mock('../common/AppIcon', () => ({
  AppIcon: () => React.createElement('span'),
}));

describe('WeeklyWalkReportCard', () => {
  it('이번 주 달성 기준을 7일로 표시한다', () => {
    const stats = WalkStatisticsService.getWeeklyStats([], new Date('2026-10-14T12:00:00.000Z'));
    const html = renderToStaticMarkup(
      <WeeklyWalkReportCard stats={stats} />
    );

    expect(html).toContain('0/7일 완료 (0%)');
    expect(html).not.toContain('/5');
  });
});
