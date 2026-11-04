/**
 * [편안하개 - PetWalk]
 * 적응형(Adaptive) 하이브리드 방향 마커 스타일 및 줌 제어 (T-OFM-3, T-OFM-4, #315, 4bb313e)
 *
 * 1. 전체 코스 축소 뷰 (줌 < 14.5): 10.5px 미니멀 점 마커로 지도 및 경로 가림 방지
 * 2. 상세/보행 안내 뷰 (줌 >= 14.5): 28px 고시인성 볼드 벡터 화살표 마커로 명확한 길안내 제공
 *
 * Web(MapLibre WebGL)과 Mobile(react-native-webview) 모두 동일한 CSS 규칙과 줌 임계치를 공유합니다.
 */

export const ZOOM_THRESHOLD_DETAIL = 14.5;

export const ADAPTIVE_MARKER_CSS = `
  /* 적응형 방향 마커 (줌 >= 14.5 상세/보행 뷰: 28px 볼드 마커) */
  .direction-marker {
    width: 28px !important;
    height: 28px !important;
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

  /* 줌 < 14.5 축소 뷰 (전체 코스 조망): 10.5px 미니멀 점 마커 (kululu81 4bb313e 반영) */
  .zoom-compact-markers .direction-marker {
    width: 10.5px !important;
    height: 10.5px !important;
    box-shadow: 0 0.5px 1px rgba(34, 48, 38, 0.12) !important;
  }
  .zoom-compact-markers .direction-marker .arrow-svg-large { display: none !important; }
  .zoom-compact-markers .direction-marker .arrow-svg-mini { display: block !important; }
`;

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
 * 지도의 현재 줌 레벨에 따라 컨테이너 요소의 zoom-compact-markers 클래스를 토글합니다.
 */
export function updateMarkerZoomMode(map: any, container?: HTMLElement | null): void {
  if (!map) return;
  const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 15;
  const target = container ?? (typeof map.getContainer === 'function' ? map.getContainer() : null);
  if (!target || !target.classList) return;

  if (currentZoom < ZOOM_THRESHOLD_DETAIL) {
    target.classList.add('zoom-compact-markers');
  } else {
    target.classList.remove('zoom-compact-markers');
  }
}

