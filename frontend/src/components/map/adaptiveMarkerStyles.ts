/**
 * [편안하개 - PetWalk]
 * 적응형(Adaptive) 하이브리드 방향 마커 스타일 및 줌 제어 (T-OFM-3, T-OFM-4, #315, 4bb313e, #319)
 *
 * 1. 원거리(축소) 뷰: 10.5px 미니멀 점 마커로 지도 및 경로 가림 방지
 * 2. 상세/보행 안내 뷰: 28px 볼드 벡터 화살표 마커로 명확한 길안내 제공
 *
 * #319: 고정 줌(14.5)만으로 전환하면 방향 마커 간격(최소 32m)보다 28px 마커가 훨씬 커서
 * (줌 14.5에서 28px ≈ 150m) 마커가 겹친 상태에서도 상세 마커로 바뀌었습니다.
 * 이제 줌 하한(14.5)을 넘고, 화면상 방향 마커끼리의 최소 간격이 28px 마커가
 * 겹치지 않는 거리(마커 지름 + 여백) 이상일 때만 상세 마커로 전환합니다.
 *
 * Web(MapLibre WebGL)과 Mobile(react-native-webview) 모두 동일한 CSS 규칙과 임계치를 공유합니다.
 */

/** 상세 마커로 전환할 수 있는 최소 줌(하한). 이 값 이상이어도 마커가 겹치면 원거리 마커를 유지합니다. */
export const ZOOM_THRESHOLD_DETAIL = 14.5;

/** 상세(확대) 방향 마커 지름(px) */
export const DETAIL_MARKER_SIZE_PX = 28;

/** 상세 마커끼리 확보할 최소 여백(px) */
export const DETAIL_MARKER_GAP_PX = 4;

/** 상세 마커로 전환하기 위한 화면상 마커 중심 간 최소 거리(px) */
export const MIN_DETAIL_SEPARATION_PX = DETAIL_MARKER_SIZE_PX + DETAIL_MARKER_GAP_PX;

/** 이 거리(m) 이내의 마커는 같은 지점(순환 코스 중복 등)으로 보고 겹침 판정에서 제외합니다. */
export const SAME_SPOT_METERS = 2;

/** 방향 마커 화살표 색상 (원거리/상세 마커 공통) */
export const DIRECTION_MARKER_COLOR = '#26352B';

export const ADAPTIVE_MARKER_CSS = `
  /* 적응형 방향 마커 (상세/보행 뷰: 28px 볼드 마커) */
  .direction-marker {
    width: ${DETAIL_MARKER_SIZE_PX}px !important;
    height: ${DETAIL_MARKER_SIZE_PX}px !important;
    background-color: #FFFFFF !important;
    border: 1px solid #718276 !important;
    border-radius: 50% !important;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.22) !important;
    color: #596B5C !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 0 !important;
    transition: width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease;
  }
  .direction-marker .arrow-svg-large { display: block !important; }
  .direction-marker .arrow-svg-mini { display: none !important; }

  /* 원거리 뷰 (전체 코스 조망 또는 마커가 겹치는 줌): 10.5px 미니멀 점 마커 (kululu81 4bb313e 반영) */
  .zoom-compact-markers .direction-marker {
    width: 10.5px !important;
    height: 10.5px !important;
    box-shadow: 0 0.5px 1px rgba(34, 48, 38, 0.12) !important;
  }
  .zoom-compact-markers .direction-marker .arrow-svg-large { display: none !important; }
  .zoom-compact-markers .direction-marker .arrow-svg-mini { display: block !important; }
`;

export type MarkerLngLat = readonly [number, number];

interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

function approxMeters(a: MarkerLngLat, b: MarkerLngLat): number {
  const meanLat = ((a[1] + b[1]) / 2) * Math.PI / 180;
  const dx = (b[0] - a[0]) * Math.cos(meanLat) * 111320;
  const dy = (b[1] - a[1]) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

function toScreenPoint(projected: unknown): ScreenPoint | null {
  if (!projected) return null;
  if (Array.isArray(projected)) {
    const [x, y] = projected as number[];
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  const { x, y } = projected as { x?: number; y?: number };
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * 화면에 투영된 방향 마커들 중 가장 가까운 두 마커의 중심 간 거리(px)를 반환합니다.
 * 같은 지점(SAME_SPOT_METERS 이내)에 놓인 마커 쌍은 서로 완전히 포개져 하나로 보이므로 제외합니다.
 * 비교할 쌍이 없으면 Infinity를 반환합니다.
 */
export function minMarkerSeparationPx(
  positions: readonly MarkerLngLat[],
  project: (lngLat: [number, number]) => unknown,
): number {
  const points: { lngLat: MarkerLngLat; screen: ScreenPoint }[] = [];
  positions.forEach((lngLat) => {
    const screen = toScreenPoint(project([lngLat[0], lngLat[1]]));
    if (screen) points.push({ lngLat, screen });
  });

  let min = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[i].screen.x - points[j].screen.x;
      const dy = points[i].screen.y - points[j].screen.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance >= min) continue;
      if (approxMeters(points[i].lngLat, points[j].lngLat) <= SAME_SPOT_METERS) continue;
      min = distance;
    }
  }
  return min;
}

/**
 * 현재 지도 상태에서 상세(28px) 방향 마커를 써도 되는지 판단합니다.
 * - 줌이 하한(ZOOM_THRESHOLD_DETAIL) 미만이면 항상 원거리 마커
 * - 줌 하한 이상이어도 화면상 마커 간격이 MIN_DETAIL_SEPARATION_PX 미만이면 원거리 마커
 */
export function shouldUseDetailMarkers(map: any, positions: readonly MarkerLngLat[] = []): boolean {
  const currentZoom = typeof map?.getZoom === 'function' ? map.getZoom() : 15;
  if (currentZoom < ZOOM_THRESHOLD_DETAIL) return false;
  if (positions.length < 2 || typeof map?.project !== 'function') return true;
  const separation = minMarkerSeparationPx(positions, (lngLat) => map.project(lngLat));
  return separation >= MIN_DETAIL_SEPARATION_PX;
}

/**
 * 웹 환경(Expo Web) 브라우저 DOM head에 적응형 마커 CSS를 주입합니다.
 */
export function ensureAdaptiveMarkerStyles(): void {
  if (typeof document === 'undefined') return;
  const styleId = 'petwalk-adaptive-marker-styles';
  if (document.getElementById(styleId)) return;
  const styleEl = document.createElement('style');
  styleEl.id = styleId;
  styleEl.textContent = ADAPTIVE_MARKER_CSS;
  document.head.appendChild(styleEl);
}

/**
 * 지도의 줌 레벨과 방향 마커 간 화면 거리에 따라 컨테이너 요소의 zoom-compact-markers 클래스를 토글합니다.
 * @param positions 방향 마커(directionMarker) 좌표 목록. 생략하면 줌 하한만으로 판단합니다.
 */
export function updateMarkerZoomMode(
  map: any,
  container?: HTMLElement | null,
  positions: readonly MarkerLngLat[] = [],
): void {
  if (!map) return;
  const target = container ?? (typeof map.getContainer === 'function' ? map.getContainer() : null);
  if (!target || !target.classList) return;

  if (shouldUseDetailMarkers(map, positions)) {
    target.classList.remove('zoom-compact-markers');
  } else {
    target.classList.add('zoom-compact-markers');
  }
}

/** 핀 목록에서 적응형 방향 마커 좌표만 추립니다. */
export function getDirectionMarkerPositions(
  pins: readonly { readonly position: MarkerLngLat; readonly directionMarker?: boolean }[] | null | undefined,
): MarkerLngLat[] {
  return (pins ?? []).filter((pin) => pin.directionMarker).map((pin) => pin.position);
}
