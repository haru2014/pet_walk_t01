import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WalkRecordDetailModal, buildWalkRecordMapData } from './WalkRecordDetailModal';
import { WalkRecord } from '../../types/storage';

vi.mock('react-native', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Modal: ({ visible, children }: any) =>
      visible ? React.createElement('div', { 'data-testid': 'mock-modal' }, children) : null,
  };
});

// react-native-svg 모킹 (Node Vitest 환경)
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

// react-native-webview 모킹
vi.mock('react-native-webview', () => ({
  default: (props: any) => React.createElement('div', { 'data-testid': 'mock-webview', ...props }),
}));

// DogAvatar 모킹 (expo-image 종속성 격리)
vi.mock('../common/DogAvatar', () => ({
  DogAvatar: () => React.createElement('div', { 'data-testid': 'mock-dog-avatar' }),
}));

const mockRecordWithPoopEvents: WalkRecord = {
  id: 'walk-101',
  dogId: 'dog-1',
  dogSummary: {
    id: 'dog-1',
    name: '보리',
    breed: '골든리트리버',
    weightKg: 28,
    ageYears: 4,
    jointCareLevel: 1,
  },
  startedAt: '2026-10-19T09:00:00.000Z',
  completedAt: '2026-10-19T09:40:00.000Z',
  durationMinutes: 40,
  totalDistanceKm: 2.45,
  averageSpeedKmH: 3.7,
  safeSurfaceRatio: 0.85,
  gpsTrack: [
    { lat: 36.498, lon: 127.288, timestamp: 1729328400000 },
    { lat: 36.499, lon: 127.289, timestamp: 1729329000000 },
    { lat: 36.501, lon: 127.291, timestamp: 1729330800000 },
  ],
  poopEvents: [
    { id: 'p1', type: 'poop', lat: 36.499, lon: 127.289, timestamp: 1729329000000 },
    { id: 'p2', type: 'pee', lat: 36.500, lon: 127.290, timestamp: 1729329600000 },
  ],
  feedback: {
    comfortScore: 5,
    tags: ['완만해요', '그늘많아요'],
    comment: '정말 시원하고 관절에 무리 없는 산책길이었어요!',
  },
};

describe('WalkRecordDetailModal & buildWalkRecordMapData (Issue #129)', () => {
  describe('buildWalkRecordMapData', () => {
    it('gpsTrack 좌표로부터 GeoJSON LineString 경로 및 출발/완주 핀을 생성한다', () => {
      const data = buildWalkRecordMapData(mockRecordWithPoopEvents);

      expect(data.route.type).toBe('FeatureCollection');
      expect(data.route.features).toHaveLength(1);
      expect(data.route.features[0].geometry.type).toBe('LineString');
      expect(data.route.features[0].geometry.coordinates).toHaveLength(3);
      expect(data.route.features[0].properties.segmentType).toBe('safe');

      // 출발지 핀과 도착지 핀 검증
      const startPin = data.stepPins.find((p) => p.icon === '🚩');
      const finishPin = data.stepPins.find((p) => p.icon === '🏁');
      expect(startPin).toBeDefined();
      expect(startPin?.title).toBe('출발');
      expect(finishPin).toBeDefined();
      expect(finishPin?.title).toBe('완주');
    });

    it('대변(💩) 및 소변(💧) 배변 마킹 핀을 좌표와 함께 정확히 추출한다', () => {
      const data = buildWalkRecordMapData(mockRecordWithPoopEvents);

      expect(data.poopCount).toBe(1);
      expect(data.peeCount).toBe(1);

      const poopPin = data.stepPins.find((p) => p.icon === '💩');
      const peePin = data.stepPins.find((p) => p.icon === '💧');

      expect(poopPin).toBeDefined();
      expect(poopPin?.title).toBe('대변');
      expect(poopPin?.position).toEqual([127.289, 36.499]);

      expect(peePin).toBeDefined();
      expect(peePin?.title).toBe('소변');
      expect(peePin?.position).toEqual([127.290, 36.500]);
    });

    it('레거시 poopCount만 있는 경우 중간 지점에 배변 핀을 배치한다', () => {
      const legacyRecord: WalkRecord = {
        id: 'legacy-1',
        dogId: 'dog-1',
        startedAt: '2026-10-18T10:00:00.000Z',
        completedAt: '2026-10-18T10:20:00.000Z',
        durationMinutes: 20,
        totalDistanceKm: 1.0,
        averageSpeedKmH: 3.0,
        safeSurfaceRatio: 0.6,
        poopCount: 2,
        gpsTrack: [
          { lat: 36.48, lon: 127.28, timestamp: 1729245600000 },
          { lat: 36.49, lon: 127.29, timestamp: 1729246800000 },
        ],
      };

      const data = buildWalkRecordMapData(legacyRecord);
      expect(data.poopCount).toBe(2);
      const poopPin = data.stepPins.find((p) => p.icon === '💩');
      expect(poopPin).toBeDefined();
      expect(poopPin?.instruction).toContain('배변 2회 기록');
    });
  });

  describe('WalkRecordDetailModal UI 렌더링', () => {
    it('visible이 false이거나 record가 null이면 렌더링하지 않는다', () => {
      const html1 = renderToStaticMarkup(
        <WalkRecordDetailModal visible={false} onClose={vi.fn()} record={mockRecordWithPoopEvents} />
      );
      expect(html1).toBe('');

      const html2 = renderToStaticMarkup(
        <WalkRecordDetailModal visible={true} onClose={vi.fn()} record={null} />
      );
      expect(html2).toBe('');
    });

    it('visible이 true일 때 지도 타이틀, 범례, 4대 보행 지표, 피드백을 모두 렌더링한다', () => {
      const html = renderToStaticMarkup(
        <WalkRecordDetailModal
          visible={true}
          onClose={vi.fn()}
          record={mockRecordWithPoopEvents}
          dogName="보리"
        />
      );

      // 헤더
      expect(html).toContain('산책 경로 및 배변 지도');

      // 마커 범례
      expect(html).toContain('🚩 출발지');
      expect(html).toContain('🏁 완주지');
      expect(html).toContain('💩 대변 1회');
      expect(html).toContain('💧 소변 1회');

      // 4대 보행 지표
      expect(html).toContain('2.45');
      expect(html).toContain('40');
      expect(html).toContain('3.7');
      expect(html).toContain('85');

      // 반려견 및 피드백
      expect(html).toContain('보리 (골든리트리버 · 28kg)');
      expect(html).toContain('완만해요');
      expect(html).toContain('정말 시원하고 관절에 무리 없는 산책길이었어요!');
      expect(html).toContain('확인 완료 ✓');
    });
  });
});
