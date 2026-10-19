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

vi.mock('../walk/WalkRecordDetailModal', () => ({
  WalkRecordDetailModal: ({ visible, record }: any) =>
    visible ? React.createElement('div', { 'data-testid': 'mock-walk-record-detail-modal' }, record?.id) : null,
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

    // 2. 누적 산책 기록 목록이 렌더링되는지 확인
    expect(html).toContain('1.8km · 30분 · 평균 3.6km/h');
    expect(html).toContain('만족도 5점');
    expect(html).toContain('아주 편안했어요');
    expect(html).toContain('🗺️ 지도 보기');
  });

  it('기본 상태(접힘)에서는 기술적 내보내기 버튼(CSV/JSON)이 숨겨져 있고, 안내 헤더만 노출된다', () => {
    const html = renderToStaticMarkup(
      <MyWalkHistoryView dogName="초코" initialRecords={mockRecords} defaultExportExpanded={false} />
    );

    // 헤더는 보이지만
    expect(html).toContain('동물병원 제출 및 데이터 백업');
    expect(html).toContain('슬개골 진료 상담 표 / 기기 변경 백업 열기');

    // 버튼과 상세 안내는 숨겨져 있어야 함
    expect(html).not.toContain('📥 엑셀(CSV) 저장');
    expect(html).not.toContain('📋 JSON 백업');
    expect(html).not.toContain('병원 진료·보험 제출용');
  });

  it('펼침 상태(defaultExportExpanded=true)에서는 병원 제출용 엑셀 및 기기 백업 JSON 버튼과 친절한 설명이 노출된다', () => {
    const html = renderToStaticMarkup(
      <MyWalkHistoryView dogName="초코" initialRecords={mockRecords} defaultExportExpanded={true} />
    );

    expect(html).toContain('동물병원 제출 및 데이터 백업');
    expect(html).toContain('수의사 진료 시 누적 보행 데이터를 확인하거나');
    expect(html).toContain('📥 엑셀(CSV) 저장');
    expect(html).toContain('병원 진료·보험 제출용');
    expect(html).toContain('📋 JSON 백업');
    expect(html).toContain('기기 이전·원본 보관용');
  });

  it('WalkStatisticsService의 CSV/JSON 내보내기 기능이 온전하게 동작한다', () => {
    const csv = WalkStatisticsService.exportWalkRecordsToCsv(mockRecords, '초코');
    expect(csv).toContain('산책일시,반려견이름,소요시간(분),산책거리(km)');
    expect(csv).toContain('"초코"');
    expect(csv).toContain('1.80');

    const jsonStr = WalkStatisticsService.exportWalkRecordsToJson(mockRecords, '초코');
    const parsed = JSON.parse(jsonStr);
    expect(parsed.dogName).toBe('초코');
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].id).toBe('walk-1');
  });
});
