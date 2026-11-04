import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADAPTIVE_MARKER_CSS,
  DIRECTION_MARKER_COLOR,
  MIN_DETAIL_SEPARATION_PX,
  ZOOM_THRESHOLD_DETAIL,
  ensureAdaptiveMarkerStyles,
  getDirectionMarkerPositions,
  minMarkerSeparationPx,
  shouldUseDetailMarkers,
  updateMarkerZoomMode,
} from './adaptiveMarkerStyles';

/** 웹 메르카토르 투영을 흉내 내는 테스트용 지도 (줌에 따라 화면 거리 2배씩 증가) */
function createProjectingMap(zoom: number) {
  const worldSize = 512 * 2 ** zoom;
  return {
    getZoom: () => zoom,
    project: ([lng, lat]: [number, number]) => {
      const x = ((lng + 180) / 360) * worldSize;
      const sin = Math.sin((lat * Math.PI) / 180);
      const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize;
      return { x, y };
    },
  };
}

function createClassContainer(initial: string[] = []) {
  const classes = new Set<string>(initial);
  return {
    classes,
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
  };
}

// 세종 중앙공원 부근, 동서로 약 32m(방향 마커 최소 간격) 떨어진 두 마커
const LAT = 36.4315;
const METERS_PER_DEG_LNG = 111320 * Math.cos((LAT * Math.PI) / 180);
const MARKERS_32M_APART: [number, number][] = [
  [127.38, LAT],
  [127.38 + 32 / METERS_PER_DEG_LNG, LAT],
];

describe('적응형 하이브리드 방향 마커 스타일 및 줌 제어 (adaptiveMarkerStyles)', () => {
  const globalWithDoc = globalThis as unknown as { document?: any };

  beforeEach(() => {
    const headChildren: any[] = [];
    const elementsById: Record<string, any> = {};

    globalWithDoc.document = {
      getElementById: (id: string) => elementsById[id] ?? null,
      createElement: (tag: string) => {
        const el = {
          tagName: tag,
          id: '',
          textContent: '',
        };
        return el;
      },
      head: {
        appendChild: (el: any) => {
          headChildren.push(el);
          if (el.id) elementsById[el.id] = el;
        },
      },
    };
  });

  afterEach(() => {
    delete globalWithDoc.document;
  });

  it('임계값은 14.5로 설정되어 있다', () => {
    expect(ZOOM_THRESHOLD_DETAIL).toBe(14.5);
  });

  it('ADAPTIVE_MARKER_CSS에 28px 볼드 마커 및 10.5px 점 마커 클래스가 정의되어 있다', () => {
    expect(ADAPTIVE_MARKER_CSS).toContain('.direction-marker');
    expect(ADAPTIVE_MARKER_CSS).toContain('28px');
    expect(ADAPTIVE_MARKER_CSS).toContain('.zoom-compact-markers .direction-marker');
    expect(ADAPTIVE_MARKER_CSS).toContain('10.5px');
    expect(ADAPTIVE_MARKER_CSS).toContain('.arrow-svg-large');
    expect(ADAPTIVE_MARKER_CSS).toContain('.arrow-svg-mini');
  });

  it('ensureAdaptiveMarkerStyles 호출 시 head에 스타일 태그가 삽입되고 중복 생성되지 않는다', () => {
    ensureAdaptiveMarkerStyles();
    const styleEl = globalWithDoc.document.getElementById('petwalk-adaptive-marker-styles');
    expect(styleEl).not.toBeNull();
    expect(styleEl.textContent).toBe(ADAPTIVE_MARKER_CSS);

    // 2회 호출 시에도 중복 삽입 방지
    ensureAdaptiveMarkerStyles();
    expect(globalWithDoc.document.getElementById('petwalk-adaptive-marker-styles')).toBe(styleEl);
  });

  it('줌 < 14.5 일 때 zoom-compact-markers 클래스가 추가된다', () => {
    const classes = new Set<string>();
    const container = {
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
        contains: (c: string) => classes.has(c),
      },
    };
    const map = {
      getZoom: () => 13.5,
    };

    updateMarkerZoomMode(map, container as any);
    expect(classes.has('zoom-compact-markers')).toBe(true);
  });

  it('줌 >= 14.5 일 때 zoom-compact-markers 클래스가 제거된다', () => {
    const classes = new Set<string>(['zoom-compact-markers']);
    const container = {
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
        contains: (c: string) => classes.has(c),
      },
    };
    const map = {
      getZoom: () => 15.0,
    };

    updateMarkerZoomMode(map, container as any);
    expect(classes.has('zoom-compact-markers')).toBe(false);
  });

  describe('#319 겹침 기반 상세 마커 전환', () => {
    it('줌 >= 14.5 라도 32m 간격 마커가 화면에서 겹치면 원거리 마커를 유지한다', () => {
      const map = createProjectingMap(15);
      expect(minMarkerSeparationPx(MARKERS_32M_APART, map.project)).toBeLessThan(MIN_DETAIL_SEPARATION_PX);
      expect(shouldUseDetailMarkers(map, MARKERS_32M_APART)).toBe(false);

      const container = createClassContainer();
      updateMarkerZoomMode(map, container as any, MARKERS_32M_APART);
      expect(container.classes.has('zoom-compact-markers')).toBe(true);
    });

    it('마커가 겹치지 않을 만큼 확대되면 상세 마커로 전환된다', () => {
      const map = createProjectingMap(18);
      expect(minMarkerSeparationPx(MARKERS_32M_APART, map.project)).toBeGreaterThanOrEqual(MIN_DETAIL_SEPARATION_PX);
      expect(shouldUseDetailMarkers(map, MARKERS_32M_APART)).toBe(true);

      const container = createClassContainer(['zoom-compact-markers']);
      updateMarkerZoomMode(map, container as any, MARKERS_32M_APART);
      expect(container.classes.has('zoom-compact-markers')).toBe(false);
    });

    it('간격이 넉넉해도 줌 하한(14.5) 미만이면 원거리 마커를 유지한다', () => {
      const farApart: [number, number][] = [[127.30, LAT], [127.45, LAT]];
      expect(shouldUseDetailMarkers(createProjectingMap(14), farApart)).toBe(false);
    });

    it('같은 지점에 포개진 마커(순환 코스 중복)는 겹침 판정에서 제외한다', () => {
      const map = createProjectingMap(16);
      const stacked: [number, number][] = [[127.38, LAT], [127.38, LAT]];
      expect(minMarkerSeparationPx(stacked, map.project)).toBe(Infinity);
      expect(shouldUseDetailMarkers(map, stacked)).toBe(true);
    });

    it('방향 마커 핀의 좌표만 추린다', () => {
      const positions = getDirectionMarkerPositions([
        { position: [127.1, 36.1], directionMarker: true },
        { position: [127.2, 36.2] },
        { position: [127.3, 36.3], directionMarker: true },
      ]);
      expect(positions).toEqual([[127.1, 36.1], [127.3, 36.3]]);
    });

    it('방향 마커 공통 색상은 원거리 마커 색(#26352B)이다', () => {
      expect(DIRECTION_MARKER_COLOR).toBe('#26352B');
    });
  });
});
