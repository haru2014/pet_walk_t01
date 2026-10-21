import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MyWalkHistoryView } from './MyWalkHistoryView';
import { WalkStatisticsService } from '../../services/walkStatisticsService';
import { WalkRecord } from '../../types/storage';

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

vi.mock('../common/DogAvatar', () => ({
  DogAvatar: () => React.createElement('div', { 'data-testid': 'mock-dog-avatar' }),
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

vi.mock('../walk/WalkRecordDetailModal', () => ({
  WalkRecordDetailModal: ({ visible, record }: any) =>
    visible ? React.createElement('div', { 'data-testid': 'mock-walk-record-detail-modal' }, record?.id) : null,
  buildWalkRecordMapData: vi.fn(() => ({
    route: { type: 'FeatureCollection', features: [] },
    stepPins: [],
    poopCount: 0,
    peeCount: 0,
  })),
}));

const mockRecords: WalkRecord[] = [
  {
    id: 'walk-1',
    dogId: 'dog-1',
    startedAt: '2026-10-18T10:00:00.000Z',
    completedAt: '2026-10-18T10:30:00.000Z',
    durationMinutes: 30,
    totalDistanceKm: 1.8,
    averageSpeedKmH: 3.6,
    safeSurfaceRatio: 0.9,
    poopCount: 2,
    gpsTrack: [
      { lat: 36.48, lon: 127.28, timestamp: 1729245600000 },
      { lat: 36.49, lon: 127.29, timestamp: 1729247400000 },
    ],
    feedback: {
      comfortScore: 5,
      tags: ['완만해요', '그늘많아요'],
      comment: '아주 편안했어요',
    },
  },
];

describe('MyWalkHistoryView (Issue #128 접근성 개선)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('기록이 없을 때 빈 화면 안내 문구를 표시한다', () => {
    const html = renderToStaticMarkup(
      <MyWalkHistoryView dogName="초코" initialRecords={[]} />
    );

    expect(html).toContain('아직 완주한 산책 기록이 없습니다');
    expect(html).toContain('초코와 첫 안심 산책을 시작해보세요!');
  });

  it('기록이 있을 때 산책 성과 지표와 기록 목록을 우선 표시한다', () => {
    const html = renderToStaticMarkup(
      <MyWalkHistoryView dogName="초코" initialRecords={mockRecords} />
    );

    // 1. 산책 성과 지표 카드 확인
    expect(html).toContain('산책 통계 및 기록');
    expect(html).toContain('산책 횟수');
    expect(html).toContain('총 거리');
    expect(html).toContain('총 시간');
    expect(html).toContain('완만 노면율');
    expect(html).toContain('총 배변');

    // 2. 누적 산책 기록 목록이 커뮤니티 피드와 일관된 형태로 렌더링되는지 확인
    expect(html).toContain('1.8km · ⏱️ 30분 · 🌿 완만 90%');
    expect(html).toContain('⭐ 5.0');
    expect(html).toContain('아주 편안했어요');
    expect(html).toContain('🗺️ 경로 지도 보기');
    expect(html).toContain('🏅 완주 인증');
  });


  it('WalkStatisticsService의 JSON 내보내기 기능이 온전하게 동작한다', () => {
    const jsonStr = WalkStatisticsService.exportWalkRecordsToJson(mockRecords, '초코');
    const parsed = JSON.parse(jsonStr);
    expect(parsed.dogName).toBe('초코');
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].id).toBe('walk-1');
  });

  describe('Issue #130 목록 관리 및 페이징 (최근 1주일 우선/더보기)', () => {
    it('다수의 산책 기록(7건)이 주어졌을 때 기본 5건만 노출되고 과거 기록 더보기 버튼이 표시된다', () => {
      const now = new Date();
      const manyRecords: WalkRecord[] = Array.from({ length: 7 }, (_, i) => ({
        id: `walk-multi-${i}`,
        dogId: 'dog-1',
        startedAt: new Date(now.getTime() - i * 3600000).toISOString(),
        completedAt: new Date(now.getTime() - i * 3600000 + 1800000).toISOString(),
        durationMinutes: 30,
        totalDistanceKm: 1.5 + i * 0.1,
        averageSpeedKmH: 3.5,
        safeSurfaceRatio: 0.9,
        gpsTrack: [],
      }));

      const html = renderToStaticMarkup(
        <MyWalkHistoryView dogName="초코" initialRecords={manyRecords} />
      );

      // 상단 타이틀에 필터링된 건수 및 누적 건수 표시 확인
      expect(html).toContain('최근 7일 7회');
      expect(html).toContain('누적 7회');

      // 더보기 버튼 노출 확인
      expect(html).toContain('과거 기록 더보기 ▾ (+2건 남음)');
    });

    it('선택한 기간에 산책 기록이 없을 때 빈 기간 안내 문구를 표시한다', () => {
      // 60일 전 과거 기록 1건만 있는 경우
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600000).toISOString();
      const oldOnlyRecords: WalkRecord[] = [
        {
          id: 'walk-old',
          dogId: 'dog-1',
          startedAt: sixtyDaysAgo,
          completedAt: sixtyDaysAgo,
          durationMinutes: 20,
          totalDistanceKm: 1.0,
          averageSpeedKmH: 3.0,
          safeSurfaceRatio: 0.9,
          gpsTrack: [],
        },
      ];

      const html = renderToStaticMarkup(
        <MyWalkHistoryView dogName="초코" initialRecords={oldOnlyRecords} />
      );

      // 기본이 최근 7일이므로 60일 전 기록은 필터링되어 emptyPeriodBox 안내가 노출됨
      expect(html).toContain('최근 7일 동안의 산책 기록이 없습니다');
      expect(html).toContain('상단 필터를 [전체 기록]으로 변경하거나 새로운 산책을 시작해보세요!');
    });
  });
});
