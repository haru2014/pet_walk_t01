import { describe, expect, it } from 'vitest';
import { buildMapLibreHtml } from './maplibreWebTemplate';
import { buildOfflineGeoJsonStyle, buildOsmRasterStyle, STYLE_LOAD_TIMEOUT_MS } from '../../constants/mapFallback';
import { THEME_MAP_ROUTE_COLORS } from '../../constants/mapStyles';
import { RouteFeatureCollection, RouteStepPin } from '../../types/route';

const PRIMARY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const route: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { segmentType: 'safe', maxSlopePercent: 1, shaded: true },
    geometry: { type: 'LineString', coordinates: [[127.38, 36.43], [127.39, 36.44]] },
  }],
};
const pin: RouteStepPin = { id: 'p1', kind: 'turn', position: [127.385, 36.435], instruction: '우회전하세요' };

type Handler = (arg?: unknown) => void;

/**
 * 생성된 WebView 스크립트를 가짜 MapLibre 맵과 함께 실행해 폴백 브릿지를 검증한다.
 * (실제 WebGL/네트워크 없이 이벤트 순서와 postMessage 결과만 확인)
 */
function bootTemplate() {
  const html = buildMapLibreHtml({
    styleUrl: PRIMARY_STYLE, route, stepPins: [pin], routeColors: THEME_MAP_ROUTE_COLORS.forest,
    maskingCenter: [127.38, 36.43],
  });
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

  const posted: { type: string }[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const handlers: Record<string, Handler[]> = {};
  const sources: Record<string, unknown> = {};
  const setStyleCalls: { style: unknown; options: unknown }[] = [];
  const messageListeners: ((event: { data: string }) => void)[] = [];
  const documentMessageListeners: ((event: { data: string }) => void)[] = [];
  const setDataCalls: unknown[] = [];
  const markers: { element: any; remove: () => void }[] = [];

  const map = {
    on(name: string, fn: Handler) { (handlers[name] ??= []).push(fn); },
    once(name: string, fn: Handler) {
      const wrapped: Handler = (arg) => {
        handlers[name] = handlers[name].filter((item) => item !== wrapped);
        fn(arg);
      };
      (handlers[name] ??= []).push(wrapped);
    },
    emit(name: string, arg?: unknown) { [...(handlers[name] ?? [])].forEach((fn) => fn(arg)); },
    addControl() {},
    addSource(id: string, source: unknown) {
      if (sources[id]) throw new Error(`duplicate source ${id}`);
      sources[id] = source;
    },
    addLayer() {},
    getSource(id: string) {
      return sources[id] ? { setData(data: unknown) { setDataCalls.push(data); } } : undefined;
    },
    getLayer() { return true; },
    setPaintProperty() {},
    fitBounds() {},
    setStyle(style: unknown, options: unknown) {
      setStyleCalls.push({ style, options });
      Object.keys(sources).forEach((id) => { delete sources[id]; });
    },
  };

  const fakeWindow = {
    ReactNativeWebView: { postMessage: (message: string) => posted.push(JSON.parse(message)) },
    addEventListener: (name: string, listener: (event: { data: string }) => void) => {
      if (name === 'message') messageListeners.push(listener);
    },
  };
  const fakeDocument = {
    createElement: () => ({ style: {}, appendChild() {} }),
    addEventListener: (name: string, listener: (event: { data: string }) => void) => {
      if (name === 'message') documentMessageListeners.push(listener);
    },
  };
  const fakeMapLibre = {
    Map: function FakeMap() { return map; },
    Marker: function FakeMarker(this: object, options: { element: any }) {
      const marker = { element: options.element, setLngLat() { return this; }, addTo() { return this; }, remove() {} };
      markers.push(marker);
      return marker;
    },
    AttributionControl: function FakeControl() {},
  };
  const fakeSetTimeout = (fn: () => void, ms: number) => timers.push({ fn, ms });

  new Function('window', 'document', 'maplibregl', 'setTimeout', 'clearTimeout', script)(
    fakeWindow, fakeDocument, fakeMapLibre, fakeSetTimeout, () => undefined,
  );

  return {
    map,
    sources,
    timers,
    setStyleCalls,
    messageTypes: () => posted.map((message) => message.type),
    setDataCalls,
    markers,
    // iOS: react-native-webview 가 window 로 message 이벤트를 보낸다
    send: (message: object) => messageListeners.forEach((listener) => listener({ data: JSON.stringify(message) })),
    // 안드로이드: document 로 보낸다 (react-native-webview RNCWebViewManagerImpl.kt postMessage)
    sendFromAndroid: (message: object) =>
      documentMessageListeners.forEach((listener) => listener({ data: JSON.stringify(message) })),
  };
}

describe('MapLibre WebView 템플릿 폴백 브릿지 동작 (T-OFM-7)', () => {
  it('현재 위치 텍스트 안내는 투명 배경·무테두리로 표시하고 글자 halo로 가독성을 유지한다', () => {
    const html = buildMapLibreHtml({
      styleUrl: PRIMARY_STYLE,
      route,
      stepPins: [{
        ...pin,
        id: 'current-location-pin',
        title: '현재 위치',
        detail: '현재 위치 (자유 산책 출발)',
      }],
      routeColors: THEME_MAP_ROUTE_COLORS.forest,
      maskingCenter: [127.38, 36.43],
    });

    expect(html).toContain('background-color: transparent');
    expect(html).toContain("el.style.backgroundColor = 'transparent'");
    expect(html).toContain("el.style.border = 'none'");
    expect(html).toContain("el.style.boxShadow = 'none'");
    expect(html).toContain("const pinColor = isCurrentLocation ? colors.startMarker");
    expect(html).toContain("startEl.style.color = colors.startMarker");
    expect(html).toContain("el.style.textShadow = textHalo");
    expect(html).toContain("0 0 2px ' + colors.casing + ', 0 0 5px ' + colors.casing");
    expect(html).not.toContain('#ffffffed');
    expect(html).toContain("postToReactNative('PIN_SELECT'");
  });

  it('WebView map markers update to the selected theme palette without opaque backgrounds', () => {
    const view = bootTemplate();
    view.map.emit('style.load');
    view.map.emit('load');

    view.send({
      action: 'SET_STYLE',
      style: PRIMARY_STYLE,
      routeColors: THEME_MAP_ROUTE_COLORS.ocean,
    });

    const [startMarker, turnMarker] = view.markers.slice(-2);
    expect(startMarker.element.style.color).toBe(THEME_MAP_ROUTE_COLORS.ocean.startMarker);
    expect(startMarker.element.style.backgroundColor).toBeUndefined();
    expect(startMarker.element.style.textShadow).toContain(THEME_MAP_ROUTE_COLORS.ocean.casing);
    expect(turnMarker.element.style.color).toBe(THEME_MAP_ROUTE_COLORS.ocean.normal);
    expect(turnMarker.element.style.backgroundColor).toBe('transparent');
    expect(turnMarker.element.style.textShadow).toContain(THEME_MAP_ROUTE_COLORS.ocean.casing);
  });

  it('정상 로드 시 MAP_LOADED를 1회 보내고 경로/마스킹 소스를 등록한다', () => {
    const view = bootTemplate();
    view.map.emit('style.load');
    view.map.emit('load');

    expect(view.messageTypes()).toEqual(['MAP_LOADED']);
    expect(view.sources['route-source']).toBeDefined();
    expect(view.sources['masking-source']).toBeDefined();
    expect(buildMapLibreHtml({ styleUrl: PRIMARY_STYLE, route, routeColors: THEME_MAP_ROUTE_COLORS.forest })).toContain('route-slope-symbols');
    expect(view.timers[0].ms).toBe(STYLE_LOAD_TIMEOUT_MS);
  });

  it('스타일 로드 실패는 STYLE_ERROR를 1회만 보내고, 정적 스타일 전환 후 레이어와 MAP_LOADED를 복구한다', () => {
    const view = bootTemplate();
    const failure = { error: new Error('Failed to fetch') };
    view.map.emit('error', failure);
    view.map.emit('error', failure);
    expect(view.messageTypes()).toEqual(['STYLE_ERROR']);

    view.send({ action: 'SET_STYLE', style: buildOfflineGeoJsonStyle('#F8FAF9') });
    expect(view.setStyleCalls).toHaveLength(1);
    expect(view.setStyleCalls[0].options).toEqual({ diff: false });

    // 최초 load 이벤트는 발생하지 않았지만 style.load만으로 레이어가 복구되어야 한다.
    view.map.emit('style.load');
    expect(view.messageTypes()).toEqual(['STYLE_ERROR', 'MAP_LOADED']);
    expect(view.sources['route-source']).toBeDefined();
  });

  it('스타일 파싱 이후의 글리프/스프라이트 오류와 개별 타일 오류는 폴백하지 않는다', () => {
    const parsed = bootTemplate();
    parsed.map.emit('style.load');
    parsed.map.emit('error', { error: new Error('glyph 404') });

    const tileError = bootTemplate();
    tileError.map.emit('error', { error: new Error('404'), sourceId: 'openmaptiles' });
    tileError.map.emit('error', { error: new Error('404'), tile: {} });

    expect(parsed.messageTypes()).toEqual([]);
    expect(tileError.messageTypes()).toEqual([]);
  });

  it('응답 지연은 STYLE_TIMEOUT을 1회만 보내고, 로드 완료 후 타임아웃은 무시한다', () => {
    const slow = bootTemplate();
    slow.timers[0].fn();
    slow.timers[0].fn();

    const loaded = bootTemplate();
    loaded.map.emit('style.load');
    loaded.map.emit('load');
    loaded.timers[0].fn();

    expect(slow.messageTypes()).toEqual(['STYLE_TIMEOUT']);
    expect(loaded.messageTypes()).toEqual(['MAP_LOADED']);
  });

  it('초기와 동일한 스타일 재전송은 무시하고, 로드 후 테마 전환은 레이어만 재등록한다', () => {
    const view = bootTemplate();
    view.send({ action: 'SET_STYLE', style: PRIMARY_STYLE });
    expect(view.setStyleCalls).toHaveLength(0);

    view.map.emit('style.load');
    view.map.emit('load');
    view.send({ action: 'SET_STYLE', style: 'https://tiles.openfreemap.org/styles/dark' });
    view.map.emit('style.load');

    expect(view.setStyleCalls).toHaveLength(1);
    expect(view.messageTypes()).toEqual(['MAP_LOADED']);
    expect(view.sources['route-source']).toBeDefined();
  });

  it('정적 → OSM 래스터까지 연속 전환해도 레이어 등록과 경로 갱신이 유지된다', () => {
    const view = bootTemplate();
    view.map.emit('error', { error: new Error('offline') });
    view.send({ action: 'SET_STYLE', style: buildOfflineGeoJsonStyle('#fff') });
    view.send({ action: 'SET_STYLE', style: buildOsmRasterStyle() });
    view.map.emit('style.load');
    view.send({ action: 'UPDATE_ROUTE', route, stepPins: [pin] });

    expect(view.setStyleCalls).toHaveLength(2);
    expect(view.messageTypes()).toEqual(['STYLE_ERROR', 'MAP_LOADED']);
    expect(view.sources['route-source']).toBeDefined();
  });

  it('안드로이드(document 로 오는 메시지)에서도 코스를 바꾸면 지도 경로가 바뀐다 (#155)', () => {
    const view = bootTemplate();
    view.map.emit('style.load');
    view.map.emit('load');
    const secondCourse: RouteFeatureCollection = {
      ...route,
      features: [{ ...route.features[0], geometry: { type: 'LineString', coordinates: [[127.40, 36.45], [127.41, 36.46]] } }],
    };

    view.sendFromAndroid({ action: 'UPDATE_ROUTE', route: secondCourse, stepPins: [] });
    expect(view.setDataCalls).toEqual([secondCourse]);

    view.send({ action: 'UPDATE_ROUTE', route, stepPins: [] });  // iOS 경로도 그대로 동작
    expect(view.setDataCalls).toEqual([secondCourse, route]);
  });
});
