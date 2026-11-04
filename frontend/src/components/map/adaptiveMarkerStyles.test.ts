import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADAPTIVE_MARKER_CSS,
  ZOOM_THRESHOLD_DETAIL,
  ensureAdaptiveMarkerStyles,
  updateMarkerZoomMode,
} from './adaptiveMarkerStyles';

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
});

