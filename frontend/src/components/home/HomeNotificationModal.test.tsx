import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeNotificationModal } from './HomeNotificationModal';
import { DogProfile } from '../../types/dogProfile';
import { HeatRiskResponse } from '../../types/weather';
import { WeeklyWalkStats } from '../../services/walkStatisticsService';
import { NearbyHazardReport } from '../../services/hazardApi';

vi.mock('react-native', async () => {
  const actual = await vi.importActual<any>('react-native');
  return {
    ...actual,
    Modal: ({ visible, children }: any) => (visible ? React.createElement('div', { 'data-testid': 'mock-modal' }, children) : null),
  };
});

const mockDog: DogProfile = {
  id: 'dog_choco',
  name: '초코',
  breed: '푸들',
  weightKg: 5.5,
  ageYears: 4,
  jointCareLevel: 1,
  speedKmH: 3.5,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};

const mockSafeWeather: HeatRiskResponse = {
  isLiveServer: true,
  current_hour: 14,
  current_air_temp: 24,
  current_surface_temp: 27.5,
  current_risk_level: 'SAFE',
  is_current_golden: true,
  golden_time_window: '현재 산책 적합',
  hourly_forecast: [],
  notice: '',
  fetched_at: '2026-10-26T00:00:00.000Z',
};

const mockHotWeather: HeatRiskResponse = {
  isLiveServer: true,
  current_hour: 14,
  current_air_temp: 32,
  current_surface_temp: 41.2,
  current_risk_level: 'DANGER',
  is_current_golden: false,
  golden_time_window: '18시 이후 그늘길 산책을 권장합니다.',
  hourly_forecast: [],
  notice: '',
  fetched_at: '2026-10-26T00:00:00.000Z',
};

const mockWeeklyStatsNoWalk: WeeklyWalkStats = {
  weekRangeLabel: '10.20 ~ 10.26',
  completedDays: 0,
  targetDays: 5,
  completionRatePercent: 0,
  totalDistanceKm: 0,
  totalWalks: 0,
  safeSurfaceRatioPercent: 0,
  totalDurationMinutes: 0,
  totalPoopCount: 0,
  jointCareMessage: '',
  dailyStats: [
    {
      dateStr: '2026-10-26',
      dayLabel: '월',
      walkCount: 0,
      targetCount: 1,
      achievementRatePercent: 0,
      distanceKm: 0,
      durationMinutes: 0,
      hasWalked: false,
      isToday: true,
    },
  ],
};

const mockWeeklyStatsWithWalk: WeeklyWalkStats = {
  ...mockWeeklyStatsNoWalk,
  completedDays: 1,
  completionRatePercent: 20,
  totalWalks: 2,
  dailyStats: [
    {
      dateStr: '2026-10-26',
      dayLabel: '월',
      walkCount: 2,
      targetCount: 1,
      achievementRatePercent: 200,
      distanceKm: 2.5,
      durationMinutes: 30,
      hasWalked: true,
      isToday: true,
    },
  ],
};

const mockHazards: NearbyHazardReport[] = [
  {
    report_id: 'hz_1',
    lat: 36.363,
    lon: 127.36,
    distance_m: 85,
    hazard_type: 'broken_glass',
    severity: 'danger',
    description: '공원 입구 보도블록 깨진 유리 조각',
  },
];

describe('HomeNotificationModal (안심 산책 스마트 알림 센터 모달)', () => {
  it('visible이 false일 때는 내용이 렌더링되지 않는다', () => {
    const html = renderToStaticMarkup(
      <HomeNotificationModal
        visible={false}
        onClose={vi.fn()}
        weather={mockSafeWeather}
        dog={mockDog}
        weeklyStats={mockWeeklyStatsNoWalk}
      />
    );

    expect(html).not.toContain('안심 산책 스마트 알림');
  });

  it('안전 지면열, 산책 미완료, 위험 제보 없을 때의 알림 카드를 올바르게 렌더링한다', () => {
    const html = renderToStaticMarkup(
      <HomeNotificationModal
        visible={true}
        onClose={vi.fn()}
        weather={mockSafeWeather}
        dog={mockDog}
        weeklyStats={mockWeeklyStatsNoWalk}
        nearbyHazards={[]}
        onStartWalk={vi.fn()}
        onOpenWeatherModal={vi.fn()}
        onOpenPlanner={vi.fn()}
      />
    );

    expect(html).toContain('안심 산책 스마트 알림');
    expect(html).toContain('지면열 안전');
    expect(html).toContain('현재 지면 온도는 28℃로 안전해요');
    expect(html).toContain('오늘 초코와의 산책이 아직 없어요');
    expect(html).toContain('지금 바로 산책하기');
    expect(html).toContain('위험 제보 없음');
    expect(html).toContain('초코를 위한 계단·급경사 주의 안내');
    expect(html).toContain('안심 코스 찾기');
    expect(html).toContain('확인 완료');
  });

  it('위험 지면열 및 위험 제보 등록 시 경고 알림 카드가 표시된다', () => {
    const html = renderToStaticMarkup(
      <HomeNotificationModal
        visible={true}
        onClose={vi.fn()}
        weather={mockHotWeather}
        dog={mockDog}
        weeklyStats={mockWeeklyStatsWithWalk}
        nearbyHazards={mockHazards}
      />
    );

    expect(html).toContain('지면열 위험');
    expect(html).toContain('지면 온도가 41℃로 높습니다');
    expect(html).toContain('오늘 산책 2회 달성!');
    expect(html).toContain('주의보 1건');
    expect(html).toContain('유리 파편');
  });
});
