/**
 * [RouteMapView 컴포넌트 렌더링 및 웹 SVG 호환성 TDD 테스트]
 *
 * 1. Web 환경(Platform.OS === 'web')에서 Svg 컴포넌트에 React Native 스타일 배열([style1, style2])이
 *    전달될 때 CSSStyleDeclaration Indexed Property Setter 오류 없이 안전하게 렌더링되는지 검증.
 * 2. 3색 Polyline 세그먼트, 출발/도착 마커, 스텝 핀 요소가 정상 마운트되는지 검증.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Polyline: (props: any) => React.createElement('polyline', props),
  Circle: (props: any) => React.createElement('circle', props),
  G: (props: any) => React.createElement('g', props),
  Text: (props: any) => React.createElement('text', props),
}));

import { renderToStaticMarkup } from 'react-dom/server';
import { RouteMapView } from './RouteMapView';
import { RouteFeatureCollection, RouteStepPin } from '../../types/route';

describe('RouteMapView - Web SVG 렌더링 및 스타일 호환성 TDD', () => {
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

  it('웹 환경에서 Svg에 배열 스타일([StyleSheet.absoluteFill, { zIndex: 2 }])이 주어져도 CSSStyleDeclaration 에러 없이 렌더링된다', () => {
    // React DOM 서버 렌더러(renderToStaticMarkup)를 통해 브라우저 HTML SVG 렌더링 파이프라인 검증
    expect(() => {
      const html = renderToStaticMarkup(
        <RouteMapView
          route={mockRoute}
          stepPins={mockPins}
          speedKmH={2.8}
        />
      );
      // HTML 결과물에 svg 태그와 polyline, circle이 포함되어 있는지 확인
      expect(html).toContain('<svg');
      expect(html).toContain('<polyline');
      expect(html).toContain('<circle');
    }).not.toThrow();
  });

  it('SVG 엘리먼트에 React Native 전용 속성(accessible 등)이 DOM으로 누출되지 않고 평탄화된 style 객체가 적용된다', () => {
    const html = renderToStaticMarkup(
      <RouteMapView
        route={mockRoute}
        stepPins={mockPins}
        speedKmH={2.8}
      />
    );
    // accessible 속성이 누출되지 않음
    expect(html).not.toContain('accessible=');
    // z-index: 2 및 position: absolute 스타일이 정상 반영됨
    expect(html).toContain('z-index:2');
  });
});
