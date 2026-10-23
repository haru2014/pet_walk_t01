import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapLibreMapView } from './MapLibreMapView';
import { buildMapLibreHtml, generateCirclePolygonCoordinates } from './maplibreWebTemplate';
import { RouteFeatureCollection, RouteStepPin } from '../../types/route';
import { THEME_MAP_ROUTE_COLORS } from '../../constants/mapStyles';

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

describe('MapLibreMapView 및 인라인 템플릿 TDD 검증 (T-OFM-3, T-OFM-4)', () => {
  const mockRoute: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 2.1, shaded: true },
        geometry: {
          type: 'LineString',
          coordinates: [
            [127.3805, 36.4315],
            [127.3820, 36.4325],
            [127.3840, 36.4330],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { segmentType: 'caution', maxSlopePercent: 7.8, shaded: false },
        geometry: {
          type: 'LineString',
          coordinates: [
            [127.3840, 36.4330],
            [127.3830, 36.4310],
            [127.3805, 36.4315],
          ],
        },
      },
    ],
  };

  const mockPins: RouteStepPin[] = [
    {
      id: 'pin_1',
      kind: 'safe',
      position: [127.3820, 36.4325],
      instruction: '울창한 그늘 숲길로 진입합니다',
    },
    {
      id: 'pin_2',
      kind: 'caution',
      position: [127.3840, 36.4330],
      instruction: '급경사 내리막길 주의',
    },
  ];

  it('200m 마스킹 원 다각형 좌표가 위경도 비율을 반영하여 폐쇄 루프로 생성되어야 한다', () => {
    const center: [number, number] = [127.3805, 36.4315];
    const coords = generateCirclePolygonCoordinates(center, 200, 36);

    expect(coords.length).toBe(37); // 36 분할 + 1 폐쇄점
    // 첫 점과 마지막 점이 동일해야 함 (GeoJSON Polygon 표준)
    expect(coords[0][0]).toBeCloseTo(coords[coords.length - 1][0], 5);
    expect(coords[0][1]).toBeCloseTo(coords[coords.length - 1][1], 5);
    // 중심점에서 약 200m 이내 범위인지 확인
    expect(Math.abs(coords[0][0] - center[0])).toBeLessThan(0.005);
  });

  it('buildMapLibreHtml이 3색 세그먼트, 핀, 마스킹 설정을 포함한 유효한 HTML5 문자열을 생성해야 한다', () => {
    const html = buildMapLibreHtml({
      styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
      route: mockRoute,
      stepPins: mockPins,
      routeColors: THEME_MAP_ROUTE_COLORS.forest,
      maskingCenter: [127.3805, 36.4315],
      interactive: true,
    });

    expect(html).toContain('maplibre-gl.js');
    expect(html).toContain('maplibre-gl.css');
    expect(html).toContain('https://tiles.openfreemap.org/styles/liberty');
    expect(html).toContain('route-core');
    expect(html).toContain('route-casing');
    expect(html).toContain('masking-source');
    expect(html).toContain('step-pin');
  });

  it('웹 환경에서 MapLibreMapView가 충돌 없이 마운트되고 컨테이너 DOM을 렌더링해야 한다', () => {
    expect(() => {
      const html = renderToStaticMarkup(
        <MapLibreMapView
          route={mockRoute}
          stepPins={mockPins}
          height={260}
        />
      );
      expect(html).toBeDefined();
    }).not.toThrow();
  });
});

describe('MapLibre WebView 템플릿 폴백/성능 검증 (T-OFM-7, T-OFM-8)', () => {
  const buildRoute = (pointCount: number): RouteFeatureCollection => ({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 1.5, shaded: true },
        geometry: {
          type: 'LineString',
          coordinates: Array.from({ length: pointCount }, (_, index): [number, number] => [
            127.38 + index * 0.00001,
            36.43 + index * 0.00001,
          ]),
        },
      },
    ],
  });

  const buildHtml = (route: RouteFeatureCollection) =>
    buildMapLibreHtml({
      styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
      route,
      routeColors: THEME_MAP_ROUTE_COLORS.forest,
      maskingCenter: [127.38, 36.43],
    });

  it('스타일 로드 실패/타임아웃을 React Native로 알리는 폴백 브릿지를 포함해야 한다', () => {
    const html = buildHtml(buildRoute(3));

    expect(html).toContain('STYLE_ERROR');
    expect(html).toContain('STYLE_TIMEOUT');
    expect(html).toContain('"styleLoadTimeoutMs":8000');
    // 스타일 파싱 이후의 글리프/스프라이트 오류로 폴백되지 않도록 style.load 플래그를 사용
    expect(html).toContain('styleParsed');
  });

  it('스타일 교체(SET_STYLE) 시 레이어를 재등록하고 동일 스타일 재전송은 무시해야 한다', () => {
    const html = buildHtml(buildRoute(3));

    expect(html).toContain("msg.action === 'SET_STYLE' && msg.style");
    expect(html).toContain('diff: false');
    expect(html).toContain("map.once('style.load', applyStyleLayers)");
    expect(html).toContain('styleKey === currentStyleKey');
  });

  it('생성된 인라인 스크립트가 문법적으로 유효해야 한다', () => {
    const html = buildHtml(buildRoute(3));
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];

    expect(script).toBeDefined();
    // Function 생성자는 코드를 실행하지 않고 구문만 검사한다.
    expect(() => new Function(script as string)).not.toThrow();
  });

  it('좌표 1만 개 경로의 HTML 생성이 1초 이내에 완료되어야 한다', () => {
    const route = buildRoute(10000);

    const startedAt = performance.now();
    const html = buildHtml(route);
    const elapsedMs = performance.now() - startedAt;

    expect(html).toContain('route-core');
    expect(elapsedMs).toBeLessThan(1000);
  });
});
