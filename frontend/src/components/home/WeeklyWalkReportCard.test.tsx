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

  it('그래프 아래 관절 케어 안내 문구를 한 줄로 자르지 않고 전체 표시한다', () => {
    const stats = WalkStatisticsService.getWeeklyStats([], new Date('2026-10-14T12:00:00.000Z'));
    stats.jointCareMessage = '발바닥이 편안한 길에서 여유롭게 산책하고 필요하면 시원한 곳에서 충분히 쉬어 주세요.';
    const html = renderToStaticMarkup(<WeeklyWalkReportCard stats={stats} />);

    expect(html).toContain(stats.jointCareMessage);
  });
});
