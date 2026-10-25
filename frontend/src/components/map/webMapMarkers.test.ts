import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkerConstructor, renderWebMarkers } from './webMapMarkers';
import { removeHandles } from './webMapLifecycle';
import { RouteFeatureCollection, RouteStepPin } from '../../types/route';
import { MapRouteColors } from '../../constants/mapStyles';

/** vitest node 환경에는 DOM이 없으므로 마커 생성에 필요한 최소 요소만 흉내 낸다. */
class FakeElement {
  readonly style: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  readonly listeners: Record<string, (() => void)[]> = {};
  children: FakeElement[] = [];
  textContent = '';
  type?: string;

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  replaceChildren() { this.children = []; }
  append(...nodes: FakeElement[]) { this.children.push(...nodes); }
  appendChild(node: FakeElement) { this.children.push(node); return node; }
  addEventListener(name: string, listener: () => void) {
    (this.listeners[name] ??= []).push(listener);
  }
}

class FakeMarker {
  static created: FakeMarker[] = [];
  lngLat: [number, number] | null = null;
  map: unknown = null;
  removeCount = 0;

  constructor(readonly options: { element: FakeElement; anchor?: string }) {
    FakeMarker.created.push(this);
  }

  setLngLat(lngLat: [number, number]) { this.lngLat = lngLat; return this; }
  addTo(map: unknown) { this.map = map; return this; }
  remove() { this.removeCount += 1; }
}

const colors: MapRouteColors = {
  safe: '#10B981', normal: '#3B82F6', caution: '#F59E0B', casing: '#FFFFFF',
  maskCircle: 'rgba(16, 185, 129, 0.18)', maskBorder: '#059669', startMarker: '#059669',
};

const route: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { segmentType: 'safe', maxSlopePercent: 1, shaded: true },
    geometry: { type: 'LineString', coordinates: [[127.38, 36.43], [127.381, 36.431]] },
  }],
};

const pins: RouteStepPin[] = [
  { id: 'p1', kind: 'turn', position: [127.381, 36.43], instruction: '우회전하세요' },
  { id: 'p2', kind: 'caution', position: [127.382, 36.43], instruction: '급경사 주의' },
  { id: 'p3', kind: 'safe', position: [127.383, 36.43], instruction: '그늘 숲길', icon: '🌳', title: '숲길', detail: '그늘 80%' },
];

const MarkerClass = FakeMarker as unknown as MarkerConstructor;
const globalWithDocument = globalThis as unknown as { document?: unknown };

describe('웹 지도 마커 렌더링 (MapLibreMapView 분리 모듈)', () => {
  beforeEach(() => {
    FakeMarker.created = [];
    globalWithDocument.document = { createElement: (tag: string) => new FakeElement(tag) };
  });

  afterEach(() => {
    delete globalWithDocument.document;
  });

  it('출발/도착 마커와 핀을 주어진 map에 추가하고 마커 목록을 반환한다', () => {
    const map = { id: 'map' };
    const markers = renderWebMarkers(map, MarkerClass, route, pins, colors, vi.fn());

    expect(markers).toHaveLength(1 + pins.length);
    expect(FakeMarker.created.every((marker) => marker.map === map)).toBe(true);
    expect(FakeMarker.created[0].lngLat).toEqual([127.38, 36.43]);
    expect(FakeMarker.created[0].options.element.style.color).toBe(colors.startMarker);
    expect(FakeMarker.created[0].options.element.style.textShadow).toContain(colors.casing);
    expect(FakeMarker.created[1].lngLat).toEqual([127.381, 36.43]);
  });

  it('마커 배경을 투명하게 유지하고 아이콘과 제목 마커 앵커를 적용한다', () => {
    renderWebMarkers({}, MarkerClass, route, pins, colors, vi.fn());
    const [start, turn, caution, titled] = FakeMarker.created;

    expect(start.options.element.style.background).toBe('transparent');
    expect(turn.options.element.style.background).toBe('transparent');
    expect(turn.options.element.style.color).toBe(colors.normal);
    expect(turn.options.element.style.textShadow).toContain(colors.casing);
    expect(turn.options.element.textContent).toBe('↱');
    expect(turn.options.anchor).toBe('center');
    expect(turn.options.element.tagName).toBe('button');
    expect(turn.options.element.type).toBe('button');
    expect(caution.options.element.style.background).toBe('transparent');
    expect(caution.options.element.style.color).toBe(colors.caution);
    expect(caution.options.element.textContent).toBe('!');
    expect(titled.options.anchor).toBe('bottom');
    expect(titled.options.element.tagName).toBe('div');
    expect(titled.options.element.style.background).toBe('transparent');
    expect(titled.options.element.style.border).toBe('none');
    expect(titled.options.element.style.boxShadow).toBe('none');
    expect(titled.options.element.style.color).toBe(colors.safe);
    expect(titled.options.element.children.every((child) => child.style.textShadow?.includes(colors.casing))).toBe(true);
  });

  it('회전 핀은 안내 문구의 좌회전·우회전·유턴 방향에 맞는 아이콘을 사용한다', () => {
    const turnPins: RouteStepPin[] = [
      { id: 'left', kind: 'turn', position: [127.381, 36.43], instruction: '좌회전하세요' },
      { id: 'right', kind: 'turn', position: [127.382, 36.43], instruction: '우회전하세요' },
      { id: 'uturn', kind: 'turn', position: [127.383, 36.43], instruction: '유턴하여 반대 방향으로 이동하세요' },
      { id: 'unspecified', kind: 'turn', position: [127.384, 36.43], instruction: '다음 보행로로 이동하세요' },
    ];

    renderWebMarkers({}, MarkerClass, route, turnPins, colors, vi.fn());

    expect(FakeMarker.created.slice(1).map((marker) => marker.options.element.textContent))
      .toEqual(['↰', '↱', '↶', '➤']);
  });

  it('제목형 핀은 아이콘/제목/상세 문구를 자식 요소로 구성한다', () => {
    renderWebMarkers({}, MarkerClass, route, pins, colors, vi.fn());
    const titled = FakeMarker.created[3].options.element;

    expect(titled.children.map((child) => child.textContent)).toEqual(['🌳', '숲길', '그늘 80%']);
    expect(titled.attributes['aria-label']).toBe('그늘 숲길');
  });

  it('핀 클릭 시 해당 안내 문구로 onPinSelect를 호출한다', () => {
    const onPinSelect = vi.fn();
    renderWebMarkers({}, MarkerClass, route, pins, colors, onPinSelect);

    FakeMarker.created[2].options.element.listeners.click[0]();

    expect(onPinSelect).toHaveBeenCalledTimes(1);
    expect(onPinSelect.mock.calls[0][0]).toBe('급경사 주의');
  });

  it('그릴 경로가 없으면 출발/도착 마커 없이 핀만 추가한다', () => {
    const emptyRoute: RouteFeatureCollection = { type: 'FeatureCollection', features: [] };
    const markers = renderWebMarkers({}, MarkerClass, emptyRoute, pins, colors, vi.fn());

    expect(markers).toHaveLength(pins.length);
  });

  it('경로 갱신을 50회 반복해도 이전 마커가 모두 해제되어 누수되지 않는다', () => {
    let current = renderWebMarkers({}, MarkerClass, route, pins, colors, vi.fn());

    for (let update = 0; update < 50; update += 1) {
      removeHandles(current);
      current = renderWebMarkers({}, MarkerClass, route, pins, colors, vi.fn());
    }
    removeHandles(current);

    expect(FakeMarker.created.every((marker) => marker.removeCount === 1)).toBe(true);
  });
});
