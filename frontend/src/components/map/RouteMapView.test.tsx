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
  Polygon: (props: any) => React.createElement('polygon', props),
}));

import { renderToStaticMarkup } from 'react-dom/server';
import { RouteMapView } from './RouteMapView';
import { RouteMapLegend } from './RouteMapLegend';
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

  it('사용자 조작 최소화: 토글 버튼(switch) 없이 지면온도와 경사도 범례가 항상 렌더링된다', () => {
    const html = renderToStaticMarkup(
      <RouteMapView
        route={mockRoute}
        stepPins={mockPins}
        speedKmH={2.8}
      />
    );
    // 토글 스위치 칩이 제거되어 switch role이 존재하지 않음
    expect(html).not.toContain('role="switch"');
    // 지도 하단 범례에 코스 보행로, 지면온도, 경사도가 모두 항상 표시됨
    expect(html).toContain('코스 보행로');
    expect(html).toContain('지면온도');
    expect(html).toContain('경사도');
    expect(html).toContain('출발/도착');
  });

  it('온도 및 경사도 실제 데이터 부재 시 가짜 마커나 온도 색상으로 오인되지 않도록 처리된다', () => {
    const html = renderToStaticMarkup(
      <RouteMapView
        route={mockRoute}
        stepPins={mockPins}
        speedKmH={2.8}
      />
    );
    // 실측 데이터가 없으므로 지면온도 및 경사도에 '확인 불가' 상태가 안내됨
    expect(html).toContain('데이터 없음 (확인 불가)');
    // 코스 보행로(안심 구간, 주의 구간) 색상 설명이 함께 제공되어 온도 색상과 오인되지 않음
    expect(html).toContain('경로 선 색상');
    expect(html).toContain('안심 구간');
    // 실제 경사 데이터가 없으므로 지도 경로 위에 화살표 마커(strokeWidth 0.8)가 렌더링되지 않음
    expect(html).not.toContain('stroke-width="0.8"');
  });

  describe('RouteMapLegend - 상시 표시 및 실측치 유무에 따른 안내 검증', () => {
    it('1. 데이터 부재 시: 지면온도와 경사도에 데이터 없음(확인 불가) 배지와 항목이 안내된다', () => {
      const html = renderToStaticMarkup(
        <RouteMapLegend mode="course" hasTempData={false} hasSlopeData={false} />
      );
      expect(html).toContain('코스 보행로');
      expect(html).toContain('안심 구간');
      expect(html).toContain('지면온도');
      expect(html).toContain('경사도');
      expect(html).toContain('데이터 없음 (확인 불가)');
      expect(html).toContain('확인 불가');
    });

    it('2. 실측 데이터 존재 시: 데이터 없음 배지 없이 상세 단계 범례가 정상 표시된다', () => {
      const html = renderToStaticMarkup(
        <RouteMapLegend mode="course" hasTempData={true} hasSlopeData={true} />
      );
      expect(html).toContain('지면온도');
      expect(html).toContain('안전');
      expect(html).toContain('주의(낮음)');
      expect(html).toContain('위험');
      expect(html).toContain('경사도');
      expect(html).toContain('평지');
      expect(html).toContain('완만한 오르막');
      expect(html).not.toContain('데이터 없음 (확인 불가)');
    });
  });
});
