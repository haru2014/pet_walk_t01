/**
 * [편안하개 - PetWalk]
 * 사용자 실시간 GPS 위치 핀 생성 및 통합 헬퍼 (SSOT)
 */

import { LonLat, RouteStepPin } from '../types/route';

export const CURRENT_LOCATION_PIN_ID = 'current-location-pin';

/**
 * 사용자 GPS 좌표(경도, 위도)를 기반으로 지도에 표출할 현재 위치 핀 객체를 생성합니다.
 */
export function createCurrentLocationPin(
  lon: number,
  lat: number,
  detail: string = '내 위치',
): RouteStepPin {
  return {
    id: CURRENT_LOCATION_PIN_ID,
    kind: 'safe',
    position: [lon, lat] as LonLat,
    instruction: '현재 위치에서 산책을 시작합니다.',
    icon: '📍',
    title: '현재 위치',
    detail,
  };
}

/**
 * 기존 핀 목록에 현재 위치 핀이 없으면 선두에 병합합니다.
 */
export function mergeCurrentLocationPin(
  pins: readonly RouteStepPin[],
  lon?: number | null,
  lat?: number | null,
): readonly RouteStepPin[] {
  if (lon == null || lat == null) return pins;

  const filtered = pins.filter((p) => p.id !== CURRENT_LOCATION_PIN_ID);
  const currentPin = createCurrentLocationPin(lon, lat);
  return [currentPin, ...filtered];
}
