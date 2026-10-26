/**
 * [RouteMapView 컴포넌트 렌더링 및 MapLibre 웹 호환성 테스트]
 *
 * Web 환경에서 MapLibre 지도 캔버스와 코스 범례가 렌더링되는지 검증합니다.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RouteFeatureCollection, RouteStepPin } from '../../types/route';
import { RouteMapView } from './RouteMapView';

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Polyline: (props: any) => React.createElement('polyline', props),
  Circle: (props: any) => React.createElement('circle', props),
  G: (props: any) => React.createElement('g', props),
  Text: (props: any) => React.createElement('text', props),
}));
vi.mock('react-native-webview', () => ({
  WebView: (props: any) => React.createElement('div', { 'data-testid': 'mock-webview', ...props }),
  default: (props: any) => React.createElement('div', { 'data-testid': 'mock-webview', ...props }),
}));
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      fitBounds: vi.fn(),
      remove: vi.fn(),
      setStyle: vi.fn(),
    })),
  },
}));

describe('RouteMapView - MapLibre 렌더링 및 스타일 호환성', () => {
  const mockRoute: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 2.1, shaded: true },
        geometry: {
          type: 'LineString',
          coordinates: [
            [126.9780, 37.5665],
            [126.9785, 37.5670],
            [126.9790, 37.5665],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { segmentType: 'caution', maxSlopePercent: 8.5, shaded: false },
        geometry: {
          type: 'LineString',
          coordinates: [
            [126.9790, 37.5665],
            [126.9780, 37.5665],
          ],
        },
      },
    ],
  };

  const mockPins: RouteStepPin[] = [
    {
      id: 'pin_1',
      kind: 'caution',
      position: [126.9785, 37.5670],
      instruction: '급경사 주의',
    },
  ];

  it('MapLibre 캔버스와 플로팅 범례 버튼을 렌더링한다', () => {
    // React DOM 서버 렌더러(renderToStaticMarkup)를 통해 브라우저 HTML SVG 렌더링 파이프라인 검증
    expect(() => {
      const html = renderToStaticMarkup(
        <RouteMapView
          route={mockRoute}
          stepPins={mockPins}
          speedKmH={2.8}
        />
      );
      expect(html).toContain('width:100%;height:100%');
      expect(html).toContain('범례');
      expect(html).toContain('지도 범례 안내 보기');
    }).not.toThrow();
  });

  it('범례 팝업이 활성화되었을 때 상세 범례 항목(노면 온도, 경사도)을 렌더링한다', () => {
    const html = renderToStaticMarkup(
      <RouteMapView
        route={mockRoute}
        stepPins={mockPins}
        speedKmH={2.8}
        defaultLegendOpen
      />
    );
    expect(html).toContain('width:100%;height:100%');
    expect(html).toContain('지도 안내 범례');
    expect(html).toContain('노면 온도');
    expect(html).toContain('경사도');
    expect(html).toContain('아직 정보가 없어요');
  });
});
