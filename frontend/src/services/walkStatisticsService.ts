/**
 * [편안하개 - PetWalk]
 * 산책 통계 분석 및 데이터 익스포트 서비스 (walkStatisticsService.ts)
 *
 * 1. 이번 주 산책 달성도 & 관절 안심 통계 집계
 * 2. 기간별(주간, 월간, 전체) 산책 헬스케어 통계 집계
 * 3. 산책 기록 JSON 내보내기
 */

import { WalkRecord } from '../types/storage';

export interface DailyWalkStat {
  dayLabel: string; // '월', '화', '수', '목', '금', '토', '일'
  dateStr: string;  // 'YYYY-MM-DD'
  distanceKm: number;
  durationMinutes: number;
  walkCount: number;
  targetCount: number; // 일일 목표 (기본 1회)
  achievementRatePercent: number; // 일일 달성률 (0 ~ 100%+)
  hasWalked: boolean;
  isToday: boolean;
}

export interface WeeklyWalkStats {
  weekRangeLabel: string; // '10.08 ~ 10.14'
  totalDistanceKm: number;
  totalWalks: number;
  completedDays: number;
  targetDays: number;
  completionRatePercent: number; // 0 ~ 100%
  safeSurfaceRatioPercent: number; // 완만 노면율 (%)
  totalDurationMinutes: number;
  totalPoopCount: number;
  dailyStats: DailyWalkStat[];
  jointCareMessage: string;
}

export type StatsPeriodType = '7days' | '30days' | 'all';

export interface PeriodWalkStats {
  periodLabel: string;
  totalWalks: number;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  averageSpeedKmH: number;
  averageSafeRatioPercent: number;
  totalPoopCount: number;
  averageComfortScore: number;
}

export interface MonthlyWalkCalendarDay {
  readonly day: number;
  readonly dateStr: string;
  readonly walkCount: number;
  readonly hasWalked: boolean;
  readonly isToday: boolean;
  readonly isFuture: boolean;
}

export interface MonthlyWalkCalendarStats {
  readonly year: number;
  readonly month: number;
  readonly monthLabel: string;
  readonly firstDayOfWeek: number;
  readonly daysInMonth: number;
  readonly days: readonly MonthlyWalkCalendarDay[];
  readonly completedDays: number;
  readonly totalWalks: number;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class WalkStatisticsService {
  /** Calendar data from completed walk records, using the device's local calendar dates. */
  static getMonthlyWalkCalendar(
    records: readonly WalkRecord[],
    year: number,
    month: number,
    now = new Date(),
  ): MonthlyWalkCalendarStats {
    const monthStart = new Date(year, month - 1, 1);
    const calendarYear = monthStart.getFullYear();
    const calendarMonth = monthStart.getMonth() + 1;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStr = toLocalDateStr(today);
    const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
    const walksByDate = new Map<string, number>();

    records.forEach((record) => {
      const completedAt = new Date(record.completedAt);
      if (!Number.isFinite(completedAt.getTime())) return;
      const dateStr = toLocalDateStr(completedAt);
      if (
        completedAt.getFullYear() !== calendarYear ||
        completedAt.getMonth() + 1 !== calendarMonth ||
        dateStr > todayStr
      ) return;
      walksByDate.set(dateStr, (walksByDate.get(dateStr) ?? 0) + 1);
    });

    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const dateStr = toLocalDateStr(new Date(calendarYear, calendarMonth - 1, day));
      const isFuture = dateStr > todayStr;
      const walkCount = isFuture ? 0 : (walksByDate.get(dateStr) ?? 0);
      return {
        day,
        dateStr,
        walkCount,
        hasWalked: walkCount > 0,
        isToday: dateStr === todayStr,
        isFuture,
      };
    });

    return {
      year: calendarYear,
      month: calendarMonth,
      monthLabel: `${calendarYear}년 ${calendarMonth}월`,
      firstDayOfWeek: new Date(calendarYear, calendarMonth - 1, 1).getDay(),
      daysInMonth,
      days,
      completedDays: days.filter((day) => day.hasWalked).length,
      totalWalks: days.reduce((total, day) => total + day.walkCount, 0),
    };
  }

  /**
   * 이번 주(월~일 또는 최근 7일) 산책 달성도 및 관절 케어 통계 계산
   */
  static getWeeklyStats(records: WalkRecord[], now = new Date()): WeeklyWalkStats {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = (today.getDay() + 6) % 7; // 0: 월요일 ~ 6: 일요일

    // 이번 주 월요일 00:00:00 계산
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const mondayStr = toLocalDateStr(monday);
    const sundayStr = toLocalDateStr(sunday);
    const todayStr = toLocalDateStr(today);
    const weekRangeLabel = `${monday.getMonth() + 1}.${monday.getDate()} ~ ${sunday.getMonth() + 1}.${sunday.getDate()}`;

    // 이번 주에 속한 기록 필터링
    const thisWeekRecords = records.filter((r) => {
      const recDate = new Date(r.completedAt);
      const recDateStr = toLocalDateStr(recDate);
      return recDateStr >= mondayStr && recDateStr <= sundayStr;
    });

    const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
    const dailyStats: DailyWalkStat[] = [];

    let totalDist = 0;
    let totalDur = 0;
    let totalSafeRatioSum = 0;
    let totalPoop = 0;

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = toLocalDateStr(d);
      const dayRecs = thisWeekRecords.filter((r) => {
        return toLocalDateStr(new Date(r.completedAt)) === dateStr;
      });

      const dayDist = dayRecs.reduce((acc, r) => acc + (r.totalDistanceKm || 0), 0);
      const dayDur = dayRecs.reduce((acc, r) => acc + (r.durationMinutes || 0), 0);
      const isToday = dateStr === todayStr;
      const targetCount = 1; // 일일 기본 목표 1회
      const achievementRatePercent = Math.min(100, Math.round((dayRecs.length / targetCount) * 100));

      dailyStats.push({
        dayLabel: dayLabels[i],
        dateStr,
        distanceKm: Math.round(dayDist * 10) / 10,
        durationMinutes: dayDur,
        walkCount: dayRecs.length,
        targetCount,
        achievementRatePercent,
        hasWalked: dayRecs.length > 0,
        isToday,
      });
    }

    thisWeekRecords.forEach((r) => {
      totalDist += r.totalDistanceKm || 0;
      totalDur += r.durationMinutes || 0;
      totalSafeRatioSum += typeof r.safeSurfaceRatio === 'number' ? r.safeSurfaceRatio : 0;
      totalPoop += r.poopCount || (r.poopEvents ? r.poopEvents.length : 0);
    });

    const totalWalks = thisWeekRecords.length;
    const completedDays = dailyStats.filter((day) => day.hasWalked).length;
    const targetDays = dailyStats.length;
    const completionRatePercent = Math.min(100, Math.round((completedDays / targetDays) * 100));
    const safeSurfaceRatioPercent =
      totalWalks > 0 ? Math.round((totalSafeRatioSum / totalWalks) * 100) : 0;

    let jointCareMessage = '이번 주 첫 산책을 시작해 보세요! 다리와 관절 부담 없는 안심 산책로를 추천해 드려요 🐾';
    if (totalWalks > 0) {
      if (safeSurfaceRatioPercent >= 85) {
        jointCareMessage = `편안한 길 ${safeSurfaceRatioPercent}%로 걸었어요! 다리와 관절 부담을 줄인 산책이었어요 🐾`;
      } else if (safeSurfaceRatioPercent >= 70) {
        jointCareMessage = `편안한 길이 ${safeSurfaceRatioPercent}%였어요. 다음에는 조금 더 부드러운 길을 걸어보세요.`;
      } else {
        jointCareMessage = `편안한 길이 ${safeSurfaceRatioPercent}%였어요. 다음에는 오르막이 적은 코스를 이용해 보세요.`;
      }
    }

    return {
      weekRangeLabel,
      totalDistanceKm: Math.round(totalDist * 10) / 10,
      totalWalks,
      completedDays,
      targetDays,
      completionRatePercent,
      safeSurfaceRatioPercent,
      totalDurationMinutes: totalDur,
      totalPoopCount: totalPoop,
      dailyStats,
      jointCareMessage,
    };
  }

  /**
   * 기간별(최근 7일 '7days' | 'week', 최근 30일 '30days' | 'month', 전체 'all') 산책 기록 필터링 및 최신순 정렬 (Issue #130)
   */
  static filterRecordsByPeriod(
    records: WalkRecord[],
    period: StatsPeriodType | 'week' | 'month' = '7days',
    now = new Date()
  ): WalkRecord[] {
    const normalizedPeriod = period === 'week' ? '7days' : period === 'month' ? '30days' : period;
    let filtered = [...records];

    if (normalizedPeriod === '7days') {
      const sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((r) => new Date(r.completedAt) >= sinceDate);
    } else if (normalizedPeriod === '30days') {
      const sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((r) => new Date(r.completedAt) >= sinceDate);
    }

    return filtered.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }

  /**
   * 기간별(주간 7일, 월간 30일, 전체) 산책 헬스케어 통계 집계
   */
  static getPeriodStats(
    records: WalkRecord[],
    period: StatsPeriodType = '7days',
    now = new Date()
  ): PeriodWalkStats {
    const filtered = this.filterRecordsByPeriod(records, period, now);
    const periodLabel = period === '7days' ? '최근 7일' : period === '30days' ? '최근 30일' : '전체 기간';

    if (filtered.length === 0) {
      return {
        periodLabel,
        totalWalks: 0,
        totalDistanceKm: 0,
        totalDurationMinutes: 0,
        averageSpeedKmH: 0,
        averageSafeRatioPercent: 0,
        totalPoopCount: 0,
        averageComfortScore: 5,
      };
    }

    let distSum = 0;
    let durSum = 0;
    let speedSum = 0;
    let safeSum = 0;
    let poopSum = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    filtered.forEach((r) => {
      distSum += r.totalDistanceKm || 0;
      durSum += r.durationMinutes || 0;
      speedSum += r.averageSpeedKmH || 3.0;
      safeSum += typeof r.safeSurfaceRatio === 'number' ? r.safeSurfaceRatio : 0;
      poopSum += r.poopCount || (r.poopEvents ? r.poopEvents.length : 0);
      if (r.feedback?.comfortScore) {
        scoreSum += r.feedback.comfortScore;
        scoreCount += 1;
      }
    });

    const count = filtered.length;
    return {
      periodLabel,
      totalWalks: count,
      totalDistanceKm: Math.round(distSum * 10) / 10,
      totalDurationMinutes: durSum,
      averageSpeedKmH: count > 0 ? Math.round((speedSum / count) * 10) / 10 : 0,
      averageSafeRatioPercent: count > 0 ? Math.round((safeSum / count) * 100) : 0,
      totalPoopCount: poopSum,
      averageComfortScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : 5.0,
    };
  }

  /**
   * JSON 백업 데이터 생성
   */
  static exportWalkRecordsToJson(records: WalkRecord[], dogName: string): string {
    const payload = {
      dogName,
      exportedAt: new Date().toISOString(),
      version: '1.0',
      totalRecords: records.length,
      records,
    };
    return JSON.stringify(payload, null, 2);
  }
}
