import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WalkRecord } from '../../types/storage';
import { WalkStatisticsService } from '../../services/walkStatisticsService';
import { MonthlyWalkStampCalendar } from './MonthlyWalkStampCalendar';

vi.mock('../../theme/themeManager', () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: (_target, key) => String(key) }) }),
}));

vi.mock('../common/AppIcon', () => ({
  AppIcon: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name }, name),
}));

const makeRecord = (id: string, completedAt: string): WalkRecord => ({
  id,
  dogId: 'dog_1',
  startedAt: completedAt,
  completedAt,
  durationMinutes: 20,
  totalDistanceKm: 1,
  averageSpeedKmH: 3,
  safeSurfaceRatio: 0.9,
  gpsTrack: [],
});

describe('MonthlyWalkStampCalendar', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');

  it('shows the month title, Sunday-first grid, actual completion stamps and concise weekly summary', () => {
    const records = [
      makeRecord('walk-1', '2026-10-12T10:00:00.000Z'),
      makeRecord('walk-2', '2026-10-12T12:00:00.000Z'),
      makeRecord('walk-3', '2026-10-14T08:00:00.000Z'),
      makeRecord('future', '2026-10-20T08:00:00.000Z'),
    ];
    const weeklyStats = WalkStatisticsService.getWeeklyStats(records, now);
    const html = renderToStaticMarkup(
      <MonthlyWalkStampCalendar records={records} weeklyStats={weeklyStats} now={now} />,
    );

    expect(html).toContain('이번 달 산책 스탬프');
    expect(html).toContain('2026년 10월');
    expect(html).toContain('이번 달 2일 산책 완료');
    expect(html).toContain('이번 주');
    expect(html).toContain('일');
    expect(html).toContain('토');
    expect(html).toContain('data-icon="paw"');
    expect(html).toContain('aria-label="2026년 10월 12일 산책 완료 2회"');
    expect(html).toContain('aria-label="2026년 10월 20일 예정"');
    expect(html).toContain('aria-label="이전 달"');
    expect(html).toContain('aria-label="다음 달"');
  });

  it('shows an empty month without inventing any completed dates', () => {
    const weeklyStats = WalkStatisticsService.getWeeklyStats([], now);
    const html = renderToStaticMarkup(
      <MonthlyWalkStampCalendar records={[]} weeklyStats={weeklyStats} now={now} />,
    );

    expect(html).toContain('이번 달 0일 산책 완료');
    expect(html).toContain('이 달에는 아직 산책 기록이 없어요.');
    expect(html).not.toMatch(/aria-label="2026년 10월 \d+일 산책 완료/);
  });
});
