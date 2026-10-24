/**
 * [편안하개 - PetWalk]
 * 모바일 react-native-webview 용 고속 인라인 MapLibre HTML5 템플릿 (T-OFM-3, T-OFM-4)
 *
 * 1. OpenFreeMap 벡터 타일 실시간 렌더링 (MapLibre GL JS)
 * 2. 3색 안심 보행로(세그먼트) 벡터 라인 레이어 (casing + core)
 * 3. 200m 안심 마스킹 원(Polygon) 및 스텝 핀/마커 심볼 레이어
 * 4. 양방향 postMessage 통신 브릿지 (핀 선택, 카메라 자동 fitBounds, 테마 실시간 전환)
 */

import { RouteFeatureCollection, RouteStepPin, LonLat } from '../../types/route';
import { MapRouteColors } from '../../constants/mapStyles';
import { STYLE_LOAD_TIMEOUT_MS } from '../../constants/mapFallback';

export interface BuildMapLibreHtmlOptions {
  readonly styleUrl: string;
  readonly route: RouteFeatureCollection;
  readonly stepPins?: readonly RouteStepPin[];
  readonly routeColors: MapRouteColors;
  readonly maskingCenter?: LonLat;
  readonly interactive?: boolean;
}

/**
 * 200m 마스킹 원 GeoJSON 다각형 좌표열 생성 헬퍼
 */
export function generateCirclePolygonCoordinates(
  center: LonLat,
  radiusMeters: number = 200,
  steps: number = 36,
): [number, number][] {
  const [centerLon, centerLat] = center;
  const coords: [number, number][] = [];
  const latRad = (centerLat * Math.PI) / 180;
  const radiusKm = radiusMeters / 1000;
  const lonRadius = radiusKm / (111.32 * Math.cos(latRad));
  const latRadius = radiusKm / 110.574;

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * (2 * Math.PI);
    const x = lonRadius * Math.cos(angle);
    const y = latRadius * Math.sin(angle);
    coords.push([centerLon + x, centerLat + y]);
  }
  return coords;
}

/**
 * 모바일 WebView에 주입할 완전한 단일 HTML5 문자열을 생성합니다.
 */
export function buildMapLibreHtml({
  styleUrl,
  route,
  stepPins = [],
  routeColors,
  maskingCenter,
  interactive = true,
}: BuildMapLibreHtmlOptions): string {
  // 마스킹 원 GeoJSON 생성
  const maskingFeature = maskingCenter
    ? {
        type: 'Feature',
        properties: { name: '200m_safe_mask' },
        geometry: {
          type: 'Polygon',
          coordinates: [generateCirclePolygonCoordinates(maskingCenter, 200)],
        },
      }
    : null;

  const initialDataPayload = JSON.stringify({
    styleUrl,
    route,
    stepPins,
    routeColors,
    maskingFeature,
    maskingCenter,
    interactive,
    styleLoadTimeoutMs: STYLE_LOAD_TIMEOUT_MS,
  });

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>PetWalk MapLibre Vector Map</title>
  <!-- MapLibre GL JS 공식 CDN (경량 무광고) -->
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.1.0/dist/maplibre-gl.css" />
  <script src="https://unpkg.com/maplibre-gl@5.1.0/dist/maplibre-gl.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; background-color: #E8F1EC; }
    .maplibregl-ctrl-bottom-left { transform: scale(0.85); transform-origin: bottom left; }
    .maplibregl-ctrl-attrib { font-size: 8px; line-height: 10px; opacity: 0.65; }
    .maplibregl-ctrl-attrib a { font-size: 8px; color: inherit; }
    
    /* 핀 및 마커 스타일 */
    .step-pin {
      width: 26px; height: 26px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #FFFFFF; font-weight: bold; font-size: 11px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3); border: 2px solid #FFFFFF;
      cursor: pointer; transition: transform 0.15s ease;
    }
    .step-pin:active { transform: scale(1.2); }
    .pin-turn { background-color: ${routeColors.normal}; }
    .pin-caution { background-color: ${routeColors.caution}; }
    .pin-safe { background-color: ${routeColors.safe}; }
    
    .start-marker {
      padding: 3px 8px; border-radius: 10px; background-color: ${routeColors.startMarker};
      color: #FFFFFF; font-weight: 800; font-size: 10px; border: 1.5px solid #FFFFFF;
      box-shadow: 0 2px 4px rgba(0,0,0,0.25); text-align: center;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script>
    (function() {
      const payload = ${initialDataPayload};
      let map = null;
      let markers = [];

      function postToReactNative(type, data) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data }));
        }
      }

      // 모든 좌표 수집 및 Bounding Box 계산
      function computeBounds(featureCollection) {
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        if (!featureCollection || !featureCollection.features) return null;
        
        featureCollection.features.forEach(function(f) {
          if (f.geometry && f.geometry.coordinates) {
            f.geometry.coordinates.forEach(function(pt) {
              const lon = pt[0], lat = pt[1];
              if (lon < minLon) minLon = lon;
              if (lon > maxLon) maxLon = lon;
              if (lat < minLat) minLat = lat;
              if (lat > maxLat) maxLat = lat;
            });
          }
        });
        if (minLon === Infinity) return null;
        return [[minLon, minLat], [maxLon, maxLat]];
      }

      // 지도 초기화
      const bounds = computeBounds(payload.route);
      const defaultCenter = bounds ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] : (payload.maskingCenter || [127.3805, 36.4315]);

      // 현재 표시 중인 데이터/스타일 상태 (스타일 교체 후 레이어 재등록에 사용)
      let currentRoute = payload.route;
      let currentPins = payload.stepPins;
      let currentStyleKey = JSON.stringify(payload.styleUrl);
      let mapLoaded = false;
      let failureReported = false;
      let watchdogId = null;

      map = new maplibregl.Map({
        container: 'map',
        style: payload.styleUrl,
        center: defaultCenter,
        zoom: 15,
        attributionControl: false,
        interactive: payload.interactive !== false,
      });

      // 출처 표기를 접지 않고 표시
      map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right');

      // 스타일 로드 실패/지연을 React Native에 알려 다음 폴백 단계로 전환 (T-OFM-7)
      function reportStyleFailure(type) {
        if (mapLoaded || failureReported) return;
        failureReported = true;
        postToReactNative(type, { ok: false });
      }

      function armStyleWatchdog() {
        failureReported = false;
        if (watchdogId) clearTimeout(watchdogId);
        watchdogId = setTimeout(function() { reportStyleFailure('STYLE_TIMEOUT'); }, payload.styleLoadTimeoutMs);
      }

      // 스타일이 (재)로드될 때마다 경로/마스킹/핀 레이어를 다시 등록
      function applyStyleLayers() {
        if (map.getSource('route-source')) return;
        initLayers(currentRoute, payload.routeColors, payload.maskingFeature);
        initMarkers(currentPins, currentRoute);
        if (watchdogId) clearTimeout(watchdogId);
        if (mapLoaded) return;
        mapLoaded = true;
        const loadedBounds = computeBounds(currentRoute);
        if (loadedBounds) {
          map.fitBounds(loadedBounds, { padding: 40, duration: 600 });
        }
        postToReactNative('MAP_LOADED', { ok: true });
      }

      map.on('load', applyStyleLayers);

      // 개별 타일/소스 오류와 스타일 파싱 이후의 글리프/스프라이트 오류는 무시하고,
      // style.load 이전의 스타일 로드 실패만 폴백 대상으로 처리
      let styleParsed = false;
      map.on('style.load', function() { styleParsed = true; });
      map.on('error', function(e) {
        if (styleParsed || !e || !e.error || e.sourceId || e.tile) return;
        reportStyleFailure('STYLE_ERROR');
      });
      armStyleWatchdog();

      // 벡터 소스 및 레이어 등록
      function initLayers(routeData, colors, maskData) {
        // 1. 200m 마스킹 원 소스 및 레이어 (있는 경우)
        if (maskData) {
          map.addSource('masking-source', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [maskData]
            }
          });
          map.addLayer({
            id: 'masking-fill',
            type: 'fill',
            source: 'masking-source',
            paint: {
              'fill-color': colors.maskCircle,
              'fill-opacity': 0.8
            }
          });
          map.addLayer({
            id: 'masking-line',
            type: 'line',
            source: 'masking-source',
            paint: {
              'line-color': colors.maskBorder,
              'line-width': 1.5,
              'line-dasharray': [2, 2]
            }
          });
        }

        // 2. 산책 경로 GeoJSON 소스
        map.addSource('route-source', {
          type: 'geojson',
          data: routeData
        });

        // 3. 경로 테두리 레이어 (Casing - 시인성 확보용 외곽선)
        map.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': colors.casing,
            'line-width': 8,
            'line-opacity': 0.95
          }
        });

        // 4. 경로 코어 레이어 (3색 세그먼트: safe, caution, normal)
        map.addLayer({
          id: 'route-core',
          type: 'line',
          source: 'route-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': [
              'match',
              ['get', 'segmentType'],
              'safe', colors.safe,
              'caution', colors.caution,
              colors.normal
            ],
            'line-width': 5
          }
        });
      }

      // 스텝 핀 및 마커 등록
      function initMarkers(pins, routeData) {
        markers.forEach(function(m) { m.remove(); });
        markers = [];

        // 출발/도착 마커
        if (routeData && routeData.features && routeData.features.length > 0) {
          const firstCoord = routeData.features[0].geometry.coordinates[0];
          if (firstCoord) {
            const startEl = document.createElement('div');
            startEl.className = 'start-marker';
            startEl.innerText = '출발/도착 🐾';
            // 출발점에 겹친 안내 핀이 출발/도착 배지에 가려지지 않게 위쪽으로 분리합니다.
            const m = new maplibregl.Marker({ element: startEl, anchor: 'bottom', offset: [0, -20] })
              .setLngLat(firstCoord)
              .addTo(map);
            markers.push(m);
          }
        }

        // 턴 바이 턴 스텝 핀
        if (pins && pins.length > 0) {
          pins.forEach(function(pin) {
            const el = document.createElement('div');
            el.className = 'step-pin pin-' + pin.kind;
            el.innerText = pin.icon || (pin.kind === 'caution' ? '!' : (pin.kind === 'safe' ? '🌿' : '➤'));
            if (pin.title) {
              el.innerText = '';
              el.style.width = 'auto';
              el.style.height = 'auto';
              el.style.padding = '4px 6px';
              el.style.borderRadius = '10px';
              el.style.backgroundColor = '#ffffffed';
              el.style.color = '#1f2937';
              el.style.whiteSpace = 'nowrap';
              el.style.display = 'grid';
              el.style.gap = '2px';
              const iconEl = document.createElement('span');
              iconEl.innerText = pin.icon || '';
              const titleEl = document.createElement('strong');
              titleEl.innerText = pin.title;
              el.appendChild(iconEl);
              el.appendChild(titleEl);
              if (pin.detail) {
                const detailEl = document.createElement('small');
                detailEl.innerText = pin.detail;
                el.appendChild(detailEl);
              }
            }
            el.onclick = function() {
              postToReactNative('PIN_SELECT', { id: pin.id, instruction: pin.instruction });
            };
            const m = new maplibregl.Marker({ element: el })
              .setLngLat(pin.position)
              .addTo(map);
            markers.push(m);
          });
        }
      }

      // 모바일(React Native)로부터의 동적 메시지 수신 처리
      // react-native-webview 는 iOS 에서는 window, 안드로이드에서는 document 로 message 이벤트를 보낸다.
      // window 에만 달면 안드로이드에서 코스를 바꿔도 지도가 첫 경로에 머문다 (#155). 둘 다 단다.
      function handleNativeMessage(event) {
        try {
          const msg = JSON.parse(event.data);
          if (msg.action === 'SET_STYLE' && msg.style) {
            const styleKey = JSON.stringify(msg.style);
            if (styleKey === currentStyleKey) return;
            currentStyleKey = styleKey;
            styleParsed = false;
            map.once('style.load', applyStyleLayers);
            // diff:false → 런타임 추가 소스/레이어까지 초기화하고 style.load를 확실히 발생시킴
            map.setStyle(msg.style, { diff: false });
            if (!mapLoaded) armStyleWatchdog();
          } else if (msg.action === 'UPDATE_ROUTE' && msg.route) {
            currentRoute = msg.route;
            currentPins = msg.stepPins || [];
            const src = map.getSource('route-source');
            if (src) {
              src.setData(msg.route);
            } else if (map.isStyleLoaded()) {
              initLayers(msg.route, payload.routeColors, payload.maskingFeature);
            }
            initMarkers(msg.stepPins || [], msg.route);
            const b = computeBounds(msg.route);
            if (b) map.fitBounds(b, { padding: 40, duration: 600 });
          }
        } catch(e) {}
      }
      window.addEventListener('message', handleNativeMessage);
      document.addEventListener('message', handleNativeMessage);
    })();
  </script>
</body>
</html>`;
}
