/**
 * [편안하개 - PetWalk]
 * WalkStatisticsService 단위 테스트
 */

import { describe, it, expect } from 'vitest';
import { WalkStatisticsService } from './walkStatisticsService';
import { WalkRecord } from '../types/storage';

const mockRecords: WalkRecord[] = [
  {
    id: 'walk_1',
    dogId: 'dog_1',
    startedAt: '2026-10-12T10:00:00.000Z',
    completedAt: '2026-10-12T10:30:00.000Z',
    durationMinutes: 30,
    totalDistanceKm: 2.0,
    averageSpeedKmH: 4.0,
    safeSurfaceRatio: 0.9,
    gpsTrack: [],
    poopCount: 1,
    feedback: { comfortScore: 5, tags: ['완만해요'], comment: '좋았어요' },
  },
  {
    id: 'walk_2',
    dogId: 'dog_1',
    startedAt: '2026-10-14T08:00:00.000Z',
    completedAt: '2026-10-14T08:25:00.000Z',
    durationMinutes: 25,
    totalDistanceKm: 1.5,
    averageSpeedKmH: 3.6,
    safeSurfaceRatio: 0.85,
    gpsTrack: [],
    poopCount: 2,
    feedback: { comfortScore: 4, tags: ['그늘많아요'], comment: '쾌적함' },
  },
];

describe('WalkStatisticsService', () => {
  it('주간 산책 달성도 및 요일별 통계를 정확히 계산한다', () => {
    // 2026-10-14 (수요일) 기준
    const refDate = new Date('2026-10-14T12:00:00.000Z');
    const stats = WalkStatisticsService.getWeeklyStats(mockRecords, refDate);

    expect(stats.totalWalks).toBe(2);
    expect(stats.totalDistanceKm).toBe(3.5);
    expect(stats.totalDurationMinutes).toBe(55);
    expect(stats.totalPoopCount).toBe(3);
    expect(stats.dailyStats).toHaveLength(7);
    expect(stats.dailyStats[0].dayLabel).toBe('월');
    expect(stats.dailyStats[0].walkCount).toBe(1);
    expect(stats.dailyStats[0].durationMinutes).toBe(30);
    expect(stats.dailyStats[0].achievementRatePercent).toBe(100);
    expect(stats.completionRatePercent).toBe(40); // 2 / 5 = 40%
    expect(stats.safeSurfaceRatioPercent).toBe(88); // (0.9 + 0.85) / 2 = 87.5 -> 88%
    expect(stats.jointCareMessage).toContain('완만 노면');
  });

  it('기간별(7일, 30일, 전체) 산책 헬스케어 통계를 집계한다', () => {
    const refDate = new Date('2026-10-14T12:00:00.000Z');
    const stats7 = WalkStatisticsService.getPeriodStats(mockRecords, '7days', refDate);
    expect(stats7.totalWalks).toBe(2);
    expect(stats7.totalDistanceKm).toBe(3.5);
    expect(stats7.averageSpeedKmH).toBe(3.8);
    expect(stats7.averageComfortScore).toBe(4.5);

    const emptyStats = WalkStatisticsService.getPeriodStats([], '7days', refDate);
    expect(emptyStats.totalWalks).toBe(0);
    expect(emptyStats.totalDistanceKm).toBe(0);
    expect(emptyStats.averageSafeRatioPercent).toBe(0);
  });

  it('filterRecordsByPeriod: 기간별(최근 7일/30일/전체) 필터링 및 최신순 정렬을 정확히 수행한다', () => {
    const oldRecord: WalkRecord = {
      id: 'walk_old',
      dogId: 'dog_1',
      startedAt: '2026-09-01T10:00:00.000Z',
      completedAt: '2026-09-01T10:30:00.000Z',
      durationMinutes: 30,
      totalDistanceKm: 2.0,
      averageSpeedKmH: 4.0,
      safeSurfaceRatio: 0.9,
      gpsTrack: [],
    };
    const records = [...mockRecords, oldRecord];
    const refDate = new Date('2026-10-14T12:00:00.000Z');

    // 1. 최근 7일 (7days / week)
    const weekRecords = WalkStatisticsService.filterRecordsByPeriod(records, '7days', refDate);
    expect(weekRecords).toHaveLength(2);
    expect(weekRecords[0].id).toBe('walk_2'); // 최신순 10/14가 먼저
    expect(weekRecords[1].id).toBe('walk_1'); // 10/12

    // 2. 전체 기간 (all)
    const allRecords = WalkStatisticsService.filterRecordsByPeriod(records, 'all', refDate);
    expect(allRecords).toHaveLength(3);
    expect(allRecords[0].id).toBe('walk_2');
  });

  it('기록이 JSON 포맷으로 직렬화된다', () => {
    const jsonStr = WalkStatisticsService.exportWalkRecordsToJson(mockRecords, '초코');
    const parsed = JSON.parse(jsonStr);
    expect(parsed.dogName).toBe('초코');
    expect(parsed.totalRecords).toBe(2);
    expect(parsed.records).toHaveLength(2);
  });

  it('웰니스 카피라이팅 원칙 준수: 임상 질병 용어(슬개골, 탈구, 관절염 등)가 포함되지 않는다', () => {
    const refDate = new Date('2026-10-14T12:00:00.000Z');
    const stats = WalkStatisticsService.getWeeklyStats(mockRecords, refDate);
    const forbidden = ['슬개골', '탈구', '관절염', '디스크', '질환', '환견'];
    for (const term of forbidden) {
      expect(stats.jointCareMessage).not.toContain(term);
    }
  });
});
