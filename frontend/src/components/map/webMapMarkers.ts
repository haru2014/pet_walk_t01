/**
 * [편안하개 - PetWalk]
 * 웹 MapLibre 출발/도착 마커 및 스텝 핀 렌더링 (MapLibreMapView에서 분리)
 *
 * 초기 로드와 경로 갱신 두 곳에서 동일하게 사용하는 DOM 마커 생성 로직의 단일 진실 공급원입니다.
 */

import { RouteFeatureCollection, RouteStepPin } from '../../types/route';
import { MapRouteColors } from '../../constants/mapStyles';
import { RemovableHandle } from './webMapLifecycle';
import { getRouteStepPinIcon } from './routeStepIcon';

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

function createStartElement(colors: MapRouteColors): HTMLElement {
  const element = document.createElement('div');
  element.textContent = '출발/도착 🐾';
  const textHalo = `0 0 2px ${colors.casing}, 0 0 5px ${colors.casing}`;
  Object.assign(element.style, {
    background: 'transparent',
    color: colors.startMarker, textShadow: textHalo, fontSize: '10px', fontWeight: '800',
    whiteSpace: 'nowrap',
  });
  return element;
}

function pinColor(pin: RouteStepPin, colors: MapRouteColors): string {
  if (pin.id === 'current-location-pin' || pin.title === '현재 위치') return colors.startMarker;
  if (pin.kind === 'caution') return colors.caution;
  if (pin.kind === 'safe') return colors.safe;
  return colors.normal;
}

function fillTitleLayout(element: HTMLElement, pin: RouteStepPin, textHalo: string): void {
  element.replaceChildren();
  element.style.display = 'grid';
  element.style.justifyItems = 'center';
  element.style.gap = '2px';
  const icon = document.createElement('span');
  icon.textContent = pin.icon ?? '';
  icon.style.textShadow = textHalo;
  const title = document.createElement('strong');
  title.textContent = pin.title ?? '';
  title.style.textShadow = textHalo;
  element.append(icon, title);
  if (!pin.detail) return;
  const detail = document.createElement('small');
  detail.textContent = pin.detail;
  detail.style.textShadow = textHalo;
  element.appendChild(detail);
}

function createPinElement(pin: RouteStepPin, colors: MapRouteColors): HTMLElement {
  const hasTitle = Boolean(pin.title);
  const isCurrentLoc = pin.id === 'current-location-pin' || pin.title === '현재 위치';
  const textHalo = `0 0 2px ${colors.casing}, 0 0 5px ${colors.casing}`;
  const element = document.createElement(hasTitle ? 'div' : 'button');
  if (!hasTitle) (element as HTMLButtonElement).type = 'button';
  element.setAttribute('aria-label', pin.instruction);
  element.textContent = isCurrentLoc
    ? (pin.bearingDeg == null ? '●' : '➤')
    : getRouteStepPinIcon(pin);
  Object.assign(element.style, {
    width: hasTitle ? 'auto' : '28px', height: hasTitle ? 'auto' : '28px',
    background: 'transparent',
    border: 'none', boxShadow: 'none',
    color: pinColor(pin, colors), textShadow: textHalo,
    fontWeight: '700', cursor: 'pointer',
    fontSize: hasTitle ? '10px' : '13px', whiteSpace: 'nowrap', textAlign: 'center',
  });
  if (isCurrentLoc && pin.bearingDeg != null) {
    element.style.borderRadius = '50%';
    element.style.transform = `rotate(${pin.bearingDeg - 90}deg)`;
  }
  if (hasTitle) fillTitleLayout(element, pin, textHalo);
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

  const firstCoord = route.features[0]?.geometry.coordinates[0];
  if (firstCoord) {
    // 안내 핀이 출발점에 겹쳐도 배지 아래에서 가려지지 않도록 위쪽으로 분리합니다.
    markers.push(new MarkerClass({
      element: createStartElement(colors),
      anchor: 'bottom',
      offset: [0, -20],
    }).setLngLat([...firstCoord]).addTo(map));
  }

  pins.forEach((pin) => {
    const element = createPinElement(pin, colors);
    element.addEventListener('click', () => onPinSelect(pin.instruction));
    const anchor = pin.title ? 'bottom' : 'center';
    markers.push(new MarkerClass({ element, anchor }).setLngLat([...pin.position]).addTo(map));
  });

  return markers;
}
