/**
 * [편안하개 - PetWalk]
 * Web & Mobile 하이브리드 MapLibre 벡터 지도 뷰어 (T-OFM-3, T-OFM-4)
 * (docs/08_OpenFreeMap_MapLibre_배경지도_구현계획서.md)
 *
 * 1. Web: maplibre-gl WebGL 캔버스 직접 렌더링 (초고속, 제로 레이턴시)
 * 2. Mobile (Android / iOS): react-native-webview 기반 인라인 HTML5 브릿지
 * 3. 3색 안심 보행로(세그먼트) 벡터 라인 렌더링 (안심/일반/주의)
 * 4. 200m 안심 마스킹 원 및 스텝 핀/출발점 마커 심볼 렌더링
 * 5. 3대 앱 테마 실시간 동기화 지원 (useMapThemeStyle)
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, StyleSheet, Platform, StyleProp, ViewStyle } from 'react-native';
import WebView from 'react-native-webview';
import { RouteFeatureCollection, RouteStepPin, LonLat } from '../../types/route';
import { useMapThemeStyle } from '../../constants/mapStyles';
import { STYLE_LOAD_TIMEOUT_MS, isStyleLoadError, resolveFallbackStyle } from '../../constants/mapFallback';
import { useMapFallbackTier } from '../../hooks/useMapFallbackTier';
import { buildMapLibreHtml } from './maplibreWebTemplate';
import { disposeWebMap, removeHandles } from './webMapLifecycle';
import { MarkerConstructor, renderWebMarkers } from './webMapMarkers';
import { registerMissingStyleImageResolver } from './missingStyleImageResolver';
import { getRouteStepPinIcon } from './routeStepIcon';
import { routeConditionColorExpression, slopeSymbolColorExpression, slopeSymbolExpression } from './routeConditionLayers';

function getRouteBounds(routeData: RouteFeatureCollection): [[number, number], [number, number]] | null {
  const coordinates = routeData.features.flatMap((feature) => feature.geometry.coordinates);
  if (coordinates.length === 0) return null;
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

let mapLibreStylesheetPromise: Promise<void> | null = null;

function ensureMapLibreStylesheet(): Promise<void> {
  if (mapLibreStylesheetPromise) return mapLibreStylesheetPromise;

  const stylesheetId = 'petwalk-maplibre-stylesheet';
  const existing = document.getElementById(stylesheetId) as HTMLLinkElement | null;
  if (existing?.sheet) return Promise.resolve();

  mapLibreStylesheetPromise = new Promise((resolve) => {
    const stylesheet = existing ?? document.createElement('link');
    stylesheet.id = stylesheetId;
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/maplibre-gl.css';
    stylesheet.onload = () => resolve();
    stylesheet.onerror = () => resolve();
    if (!existing) document.head.appendChild(stylesheet);
  });
  return mapLibreStylesheetPromise;
}

export interface MapLibreMapViewProps {
  readonly route: RouteFeatureCollection;
  readonly stepPins?: readonly RouteStepPin[];
  readonly speedKmH?: number;
  readonly width?: number | string;
  readonly height?: number | string;
  readonly maskingCenter?: LonLat;
  readonly onPinSelect?: (instruction: string) => void;
  readonly onMapLoaded?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly interactive?: boolean;
}

export const MapLibreMapView: React.FC<MapLibreMapViewProps> = ({
  route,
  stepPins = [],
  width = '100%',
  height = 260,
  maskingCenter,
  onPinSelect,
  onMapLoaded,
  style,
  interactive = true,
}) => {
  const { mapStyleUrl, routeColors, appColors } = useMapThemeStyle();
  const isWeb = Platform.OS === 'web';
  const directionalPins = useMemo(
    () => stepPins.map((pin) => pin.icon ? pin : { ...pin, icon: getRouteStepPinIcon(pin) }),
    [stepPins],
  );

  // ============================================================================
  // 1. 웹 환경 (Expo Web) - maplibre-gl 직접 마운트
  // ============================================================================
  const webContainerRef = useRef<HTMLDivElement | null>(null);
  const webMapInstanceRef = useRef<any>(null);
  const webMapLoadedRef = useRef(false);
  const webMarkersRef = useRef<any[]>([]);
  const latestRouteRef = useRef(route);
  const latestPinsRef = useRef(directionalPins);
  const latestRouteColorsRef = useRef(routeColors);
  const latestMaskingCenterRef = useRef(maskingCenter);
  const latestOnMapLoadedRef = useRef(onMapLoaded);
  const latestOnPinSelectRef = useRef(onPinSelect);
  const userInteractedWithMapRef = useRef(false);
  useEffect(() => {
    latestRouteRef.current = route;
    latestPinsRef.current = directionalPins;
    latestRouteColorsRef.current = routeColors;
    latestMaskingCenterRef.current = maskingCenter;
    latestOnMapLoadedRef.current = onMapLoaded;
    latestOnPinSelectRef.current = onPinSelect;
  }, [route, directionalPins, routeColors, maskingCenter, onMapLoaded, onPinSelect]);

  // 모든 좌표 Bounding Box 계산
  const routeBounds = useMemo(() => getRouteBounds(route), [route]);

  // 3단계 안전 폴백 (T-OFM-7): OpenFreeMap → 정적 GeoJSON → OSM 래스터
  const { tier, degrade } = useMapFallbackTier(routeBounds !== null, mapStyleUrl);
  const activeStyle = useMemo(
    () => resolveFallbackStyle(tier, mapStyleUrl, appColors.background),
    [tier, mapStyleUrl, appColors.background],
  );

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;

    let mapInstance: any = null;
    let isDisposed = false;
    let degraded = false;
    let watchdogId: ReturnType<typeof setTimeout> | null = null;

    // 같은 단계에서 error 이벤트와 타임아웃이 겹쳐도 한 단계만 내려갑니다.
    function degradeOnce() {
      if (isDisposed || degraded || webMapLoadedRef.current) return;
      degraded = true;
      degrade();
    }

    async function initWebMap() {
      try {
        const maplibregl = await import('maplibre-gl');
        if (isDisposed || !webContainerRef.current) return;

        // DOM markers and controls need MapLibre's layout stylesheet.
        await ensureMapLibreStylesheet();
        if (isDisposed || !webContainerRef.current) return;

        // Expo Metro does not provide MapLibre v6's inferred worker URL. Serve the
        // version-matched worker as a static public asset instead of a Metro chunk.
        maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

        const initialBounds = getRouteBounds(latestRouteRef.current);
        const defaultCenter: [number, number] = initialBounds
          ? [(initialBounds[0][0] + initialBounds[1][0]) / 2, (initialBounds[0][1] + initialBounds[1][1]) / 2]
          : (latestMaskingCenterRef.current
            ? [latestMaskingCenterRef.current[0], latestMaskingCenterRef.current[1]]
            : [127.3805, 36.4315]);

        mapInstance = new maplibregl.Map({
          container: webContainerRef.current,
          // 폴백 스타일 객체는 StyleSpecification의 부분 구조이므로 타입 단언이 필요합니다.
          style: activeStyle as never,
          center: defaultCenter,
          zoom: 15,
          interactive,
          // Keep provider and data-source credits visible for the active style.
          attributionControl: { compact: false },
        });
        mapInstance.on('move', (event: { originalEvent?: unknown }) => {
          if (event?.originalEvent) userInteractedWithMapRef.current = true;
        });

        webMapInstanceRef.current = mapInstance;

        registerMissingStyleImageResolver(mapInstance);

        // 스타일 로드 실패(오프라인/서버 장애)는 즉시, 응답 지연은 타임아웃으로 다음 단계 전환.
        // 스타일 파싱 이후의 글리프/스프라이트 오류는 폴백 대상이 아니므로 style.load 이전만 처리합니다.
        let styleParsed = false;
        mapInstance.on('style.load', () => {
          styleParsed = true;
        });
        mapInstance.on('error', (event: unknown) => {
          if (styleParsed) return;
          if (isStyleLoadError(event as Parameters<typeof isStyleLoadError>[0])) degradeOnce();
        });
        watchdogId = setTimeout(degradeOnce, STYLE_LOAD_TIMEOUT_MS);

        mapInstance.on('load', () => {
          if (isDisposed) return;
          if (watchdogId !== null) clearTimeout(watchdogId);
          webMapLoadedRef.current = true;
          const currentRoute = latestRouteRef.current;
          const currentPins = latestPinsRef.current;
          const currentColors = latestRouteColorsRef.current;

          // 1. 산책 경로 GeoJSON 소스 등록
          mapInstance.addSource('route-source', {
            type: 'geojson',
            data: currentRoute,
          });

          // 2. 경로 외곽 테두리 (Casing)
          mapInstance.addLayer({
            id: 'route-casing',
            type: 'line',
            source: 'route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': currentColors.casing,
              'line-width': 8,
              'line-opacity': 0.95,
            },
          });

          // 3. 경로 코어 (3색 세그먼트: safe, caution, normal)
          mapInstance.addLayer({
            id: 'route-core',
            type: 'line',
            source: 'route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': routeConditionColorExpression(currentColors) as never,
              'line-width': 5,
            },
          });

          mapInstance.addLayer({
            id: 'route-slope-symbols',
            type: 'symbol',
            source: 'route-source',
            filter: ['all', ['has', 'slopeSignedPercent'], ['!=', ['get', 'slopeSignedPercent'], null]],
            layout: {
              'symbol-placement': 'line',
              'text-field': slopeSymbolExpression() as never,
              'text-font': ['Noto Sans Regular'],
              'text-size': 13,
              'text-keep-upright': false,
            },
            paint: {
              'text-color': slopeSymbolColorExpression() as never,
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 1.5,
            },
          });

          // 4. 카메라 Bounding Box 피팅
          const initialBounds = getRouteBounds(currentRoute);
          if (initialBounds) {
            mapInstance.fitBounds(initialBounds, { padding: 40, duration: 600 });
          }

          webMarkersRef.current = renderWebMarkers(
            mapInstance, maplibregl.Marker as MarkerConstructor, currentRoute, currentPins, currentColors,
            (instruction) => latestOnPinSelectRef.current?.(instruction),
          );

          latestOnMapLoadedRef.current?.();
        });
      } catch {
        // WebGL 미지원 또는 SSR 테스트 환경 에러 방어
      }
    }

    void initWebMap();

    return () => {
      isDisposed = true;
      disposeWebMap(webMapInstanceRef.current, webMarkersRef.current, watchdogId);
      webMapInstanceRef.current = null;
      webMapLoadedRef.current = false;
      webMarkersRef.current = [];
    };
  }, [isWeb, activeStyle, interactive, degrade]);

  useEffect(() => {
    if (!isWeb || !webMapLoadedRef.current || !webMapInstanceRef.current) return;
    const map = webMapInstanceRef.current;
    const source = map.getSource('route-source');
    if (!source) return;
    map.setPaintProperty?.('route-casing', 'line-color', routeColors.casing);
    map.setPaintProperty?.('route-core', 'line-color', routeConditionColorExpression(routeColors));
    map.setPaintProperty?.('masking-fill', 'fill-color', routeColors.maskCircle);
    map.setPaintProperty?.('masking-line', 'line-color', routeColors.maskBorder);
    source.setData(route);
    const updateMarkers = async () => {
      const maplibregl = await import('maplibre-gl');
      // 동적 import 대기 중 지도가 교체/해제되었다면 이전 인스턴스에 마커를 붙이지 않음 (누수 방지)
      if (webMapInstanceRef.current !== map || !webMapLoadedRef.current) return;
      removeHandles(webMarkersRef.current);
      webMarkersRef.current = renderWebMarkers(
        map, maplibregl.Marker as MarkerConstructor, route, directionalPins, routeColors,
        (instruction) => onPinSelect?.(instruction),
      );
    };
    void updateMarkers();
    if (routeBounds && !userInteractedWithMapRef.current) {
      map.fitBounds(routeBounds, { padding: 40, duration: 700 });
    } else if (maskingCenter) {
      map.setCenter(maskingCenter);
    }
  }, [isWeb, route, routeBounds, directionalPins, routeColors, maskingCenter, onPinSelect]);

  // ============================================================================
  // 2. 모바일 환경 (Android / iOS) - react-native-webview 브릿지
  // ============================================================================
  const webViewRef = useRef<any>(null);

  const [htmlSource] = useState(() => {
    if (isWeb) return '';
    return buildMapLibreHtml({
      styleUrl: mapStyleUrl, route, stepPins: directionalPins, routeColors, maskingCenter, interactive,
    });
  });
  const mobileMapLoadedRef = useRef(false);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent?.data || '{}');
      if (data.type === 'PIN_SELECT' && data.data?.instruction) {
        onPinSelect?.(data.data.instruction);
      } else if (data.type === 'MAP_LOADED') {
        mobileMapLoadedRef.current = true;
        onMapLoaded?.();
        webViewRef.current?.postMessage(JSON.stringify({
          action: 'UPDATE_ROUTE', route: latestRouteRef.current, stepPins: latestPinsRef.current,
          routeColors: latestRouteColorsRef.current,
          routeConditionColor: routeConditionColorExpression(latestRouteColorsRef.current),
        }));
      } else if (data.type === 'STYLE_ERROR' || data.type === 'STYLE_TIMEOUT') {
        degrade();
      }
    } catch {}
  };

  // 모바일 환경에서 테마 변경 또는 폴백 단계 전환 시 웹뷰로 새 스타일 전달
  useEffect(() => {
    if (!isWeb && webViewRef.current) {
      webViewRef.current.postMessage(
        JSON.stringify({
          action: 'SET_STYLE',
          style: activeStyle,
          routeColors,
          routeConditionColor: routeConditionColorExpression(routeColors),
        })
      );
    }
  }, [isWeb, activeStyle, routeColors]);

  useEffect(() => {
    if (!isWeb && mobileMapLoadedRef.current && webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        action: 'UPDATE_ROUTE', route, stepPins: directionalPins, routeColors,
        routeConditionColor: routeConditionColorExpression(routeColors),
      }));
    }
  }, [isWeb, route, directionalPins, routeColors]);

  // ============================================================================
  // 3. 렌더링
  // ============================================================================
  const containerStyle = [
    styles.container,
    { width: width as any, height: height as any },
    style,
  ];

  if (isWeb) {
    return (
      <View style={containerStyle}>
        <div
          ref={webContainerRef}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlSource }}
        style={styles.webView}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        onMessage={handleWebViewMessage}
        originWhitelist={['*']}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E8F1EC',
    borderWidth: 1,
    borderColor: '#D1E3D9',
  },
  webView: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});
