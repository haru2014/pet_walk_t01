/**
 * [편안하개 - PetWalk]
 * 웹 MapLibre 출발/도착 마커 및 스텝 핀 렌더링 (MapLibreMapView에서 분리)
 *
 * 초기 로드와 경로 갱신 두 곳에서 동일하게 사용하는 DOM 마커 생성 로직의 단일 진실 공급원입니다.
 */

import { RouteFeatureCollection, RouteStepPin } from '../../types/route';
import { MapRouteColors } from '../../constants/mapStyles';
import { RemovableHandle } from './webMapLifecycle';
import { getRouteStepPinIcon, getLargeArrowSvg } from './routeStepIcon';

/** maplibre-gl Marker 생성자의 최소 구조 (동적 import 결과를 그대로 전달) */
export interface MarkerLike extends RemovableHandle {
  setLngLat(lngLat: [number, number]): MarkerLike;
  addTo(map: unknown): MarkerLike;
}
export type MarkerConstructor = new (options: {
  element: HTMLElement;
  anchor?: string;
  offset?: [number, number];
}) => MarkerLike;

function createStartElement(guidanceColor: string): HTMLElement {
  const element = document.createElement('div');
  element.textContent = '출발/도착 🐾';
  Object.assign(element.style, {
    background: 'transparent',
    border: 'transparent',
    color: guidanceColor,
    fontSize: '13px',
    fontWeight: '900',
    whiteSpace: 'nowrap',
    textShadow: '0 0 4px #FFFFFF, 0 0 8px #FFFFFF, 0 0 12px rgba(255, 255, 255, 0.95)',
  });
  return element;
}

function fillTitleLayout(element: HTMLElement, pin: RouteStepPin, guidanceColor: string): void {
  element.replaceChildren();
  element.style.display = 'grid';
  element.style.justifyItems = 'center';
  element.style.gap = '2px';
  const icon = document.createElement('span');
  icon.textContent = pin.icon ?? '';
  icon.style.fontSize = '14px';
  const title = document.createElement('strong');
  title.textContent = pin.title ?? '';
  title.style.color = guidanceColor;
  title.style.fontSize = '12px';
  title.style.fontWeight = '900';
  title.style.textShadow = '0 0 4px #FFFFFF, 0 0 8px #FFFFFF';
  element.append(icon, title);
  if (!pin.detail) return;
  const detail = document.createElement('small');
  detail.textContent = pin.detail;
  detail.style.fontSize = '10px';
  detail.style.fontWeight = '700';
  detail.style.textShadow = '0 0 4px #FFFFFF';
  element.appendChild(detail);
}

function getPinLabel(pin: RouteStepPin, isCurrentLoc: boolean): string {
  if (!isCurrentLoc) {
    return getRouteStepPinIcon(pin);
  }
  return pin.bearingDeg == null ? '●' : '➤';
}

function getPinTextColor(hasTitle: boolean, isCurrentLoc: boolean, guidanceColor: string): string {
  if (isCurrentLoc) {
    return hasTitle ? '#1D4ED8' : '#fff';
  }
  return guidanceColor;
}

function createPinElement(pin: RouteStepPin, guidanceColor: string): HTMLElement {
  const hasTitle = Boolean(pin.title);
  const isCurrentLoc = pin.id === 'current-location-pin' || pin.title === '현재 위치';
  const element = document.createElement(hasTitle ? 'div' : 'button');
  if (!hasTitle) (element as HTMLButtonElement).type = 'button';
  element.setAttribute('aria-label', pin.instruction);

  const pinLabel = getPinLabel(pin, isCurrentLoc);
  element.textContent = pinLabel;

  const textColor = getPinTextColor(hasTitle, isCurrentLoc, guidanceColor);
  const textShadow = isCurrentLoc && !hasTitle ? undefined : '0 0 4px #FFFFFF, 0 0 8px #FFFFFF, 0 0 12px rgba(255, 255, 255, 0.95)';

  Object.assign(element.style, {
    width: hasTitle ? 'auto' : '32px',
    height: hasTitle ? 'auto' : '32px',
    background: 'transparent',
    border: 'transparent',
    boxShadow: 'none',
    color: textColor,
    fontWeight: '900',
    cursor: 'pointer',
    fontSize: hasTitle ? '11px' : '16px',
    whiteSpace: 'nowrap',
    textAlign: 'center',
    textShadow,
  });

  if (isCurrentLoc && !hasTitle) {
    if (pin.bearingDeg != null) {
      element.style.borderRadius = '50%';
      element.style.transform = `rotate(${pin.bearingDeg - 90}deg)`;
      const headingSvg = '<svg width="18" height="18" viewBox="0 0 28 28" fill="none" style="display:block;"><polygon points="26,14 4,4 9,14 4,24" fill="#FFFFFF"/></svg>';
      if (typeof document !== 'undefined' && 'innerHTML' in element) {
        element.innerHTML = headingSvg;
      }
    }
  } else if (!hasTitle) {
    const arrowSvg = getLargeArrowSvg(pinLabel, textColor);
    if (arrowSvg && typeof document !== 'undefined' && 'innerHTML' in element) {
      element.innerHTML = arrowSvg;
    }
  }

  if (hasTitle) fillTitleLayout(element, pin, guidanceColor);
  return element;
}

/**
 * 출발/도착 마커와 스텝 핀을 지도에 추가하고, 이후 해제할 수 있도록 마커 목록을 반환합니다.
 */
export function renderWebMarkers(
  map: unknown,
  MarkerClass: MarkerConstructor,
  route: RouteFeatureCollection,
  pins: readonly RouteStepPin[],
  colors: MapRouteColors,
  onPinSelect: (instruction: string) => void,
): MarkerLike[] {
  const markers: MarkerLike[] = [];
  const guidanceColor = colors.mapGuidance || colors.startMarker;

  const firstCoord = route.features[0]?.geometry.coordinates[0];
  if (firstCoord) {
    // 안내 핀이 출발점에 겹쳐도 배지 아래에서 가려지지 않도록 위쪽으로 분리합니다.
    markers.push(new MarkerClass({
      element: createStartElement(guidanceColor),
      anchor: 'bottom',
      offset: [0, -20],
    }).setLngLat([...firstCoord]).addTo(map));
  }

  pins.forEach((pin) => {
    const element = createPinElement(pin, guidanceColor);
    element.addEventListener('click', () => onPinSelect(pin.instruction));
    const anchor = pin.title ? 'bottom' : 'center';
    markers.push(new MarkerClass({ element, anchor }).setLngLat([...pin.position]).addTo(map));
  });

  return markers;
}
