/**
 * [편안하개 - PetWalk]
 * 산책 통계 분석 및 데이터 익스포트 서비스 (walkStatisticsService.ts)
 *
 * 1. 이번 주 산책 달성도 & 관절 안심 통계 집계
 * 2. 기간별(주간, 월간, 전체) 산책 헬스케어 통계 집계
 * 3. 산책 기록 CSV / JSON 내보내기 (수술/진료 제출용 엑셀 호환 CSV)
 */

import { Platform } from 'react-native';
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
  targetWalks: number;    // 기본 권장 5회
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

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class WalkStatisticsService {
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
      totalSafeRatioSum += r.safeSurfaceRatio || 0.8;
      totalPoop += r.poopCount || (r.poopEvents ? r.poopEvents.length : 0);
    });

    const totalWalks = thisWeekRecords.length;
    const targetWalks = 5;
    const completionRatePercent = Math.min(100, Math.round((totalWalks / targetWalks) * 100));
    const safeSurfaceRatioPercent =
      totalWalks > 0 ? Math.round((totalSafeRatioSum / totalWalks) * 100) : 88;

    let jointCareMessage = '완만한 평지 위주로 관절에 무리 없이 안전하게 걸었어요!';
    if (safeSurfaceRatioPercent >= 85) {
      jointCareMessage = `완만 노면 ${safeSurfaceRatioPercent}% 달성! 다리와 관절 부담을 줄인 안심 산책이었어요 🐾`;
    } else if (safeSurfaceRatioPercent >= 70) {
      jointCareMessage = `완만 노면 ${safeSurfaceRatioPercent}% 유지! 조금 더 부드러운 길 위주 산책을 권장해요.`;
    }

    return {
      weekRangeLabel,
      totalDistanceKm: Math.round(totalDist * 10) / 10,
      totalWalks,
      targetWalks,
      completionRatePercent,
      safeSurfaceRatioPercent,
      totalDurationMinutes: totalDur,
      totalPoopCount: totalPoop,
      dailyStats,
      jointCareMessage,
    };
  }

  /**
   * 기간별(주간 7일, 월간 30일, 전체) 산책 헬스케어 통계 집계
   */
  static getPeriodStats(
    records: WalkRecord[],
    period: StatsPeriodType = '7days',
    now = new Date()
  ): PeriodWalkStats {
    let filtered = records;
    let periodLabel = '전체 기간';

    if (period === '7days') {
      const sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = records.filter((r) => new Date(r.completedAt) >= sinceDate);
      periodLabel = '최근 7일';
    } else if (period === '30days') {
      const sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = records.filter((r) => new Date(r.completedAt) >= sinceDate);
      periodLabel = '최근 30일';
    }

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
      safeSum += r.safeSurfaceRatio || 0.85;
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
      averageSpeedKmH: Math.round((speedSum / count) * 10) / 10,
      averageSafeRatioPercent: Math.round((safeSum / count) * 100),
      totalPoopCount: poopSum,
      averageComfortScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : 5.0,
    };
  }

  /**
   * 동물병원 진료 및 엑셀 확인용 CSV 문자열 생성 (한글 깨짐 방지 UTF-8 BOM 포함)
   */
  static exportWalkRecordsToCsv(records: WalkRecord[], dogName: string): string {
    const BOM = '\uFEFF';
    const headers = [
      '산책일시',
      '반려견이름',
      '소요시간(분)',
      '산책거리(km)',
      '평균속도(km/h)',
      '완만노면율(%)',
      '배변횟수',
      '만족도(5점만점)',
      '피드백태그',
      '보호자한줄평',
    ];

    const rows = records.map((r) => {
      const date = new Date(r.completedAt);
      const dateFormatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      const name = r.dogSummary?.name || dogName || '반려견';
      const duration = r.durationMinutes;
      const dist = (r.totalDistanceKm || 0).toFixed(2);
      const speed = (r.averageSpeedKmH || 0).toFixed(1);
      const safeRatio = Math.round((r.safeSurfaceRatio || 0) * 100);
      const poop = r.poopCount || (r.poopEvents ? r.poopEvents.length : 0);
      const score = r.feedback?.comfortScore ?? 5;
      const tags = (r.feedback?.tags || []).join('; ');
      const comment = (r.feedback?.comment || '').replace(/"/g, '""');

      return [
        `"${dateFormatted}"`,
        `"${name}"`,
        duration,
        dist,
        speed,
        `${safeRatio}%`,
        poop,
        score,
        `"${tags}"`,
        `"${comment}"`,
      ].join(',');
    });

    return BOM + [headers.join(','), ...rows].join('\r\n');
  }

  /**
   * 브라우저 환경에서 CSV 파일 다운로드 실행
   */
  static downloadCsvFile(records: WalkRecord[], dogName: string): boolean {
    if (typeof window === 'undefined' || Platform.OS !== 'web') {
      return false;
    }

    try {
      const csv = this.exportWalkRecordsToCsv(records, dogName);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.setAttribute('download', `편안하개_산책통계_${dogName}_${today}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      console.warn('[WalkStatisticsService] CSV 다운로드 실패:', e);
      return false;
    }
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
