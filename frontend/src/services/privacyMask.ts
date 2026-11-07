/**
 * [편안하개 - PetWalk]
 * 산책 중 지도의 200m 개인정보 보호 원 기준점
 */

/**
 * 지도에 그리는 200m 개인정보 보호 원의 중심.
 * 현재 위치가 아니라 산책을 처음 시작한 지점(집 근처)에 고정한다. 경로 이탈 후 재탐색해도 바뀌지 않는다.
 */
export function resolvePrivacyMaskCenter(
  startCoords?: { lat: number; lon: number } | null,
  currentCoords?: { lat: number; lon: number } | null,
): [number, number] | undefined {
  const anchor = startCoords ?? currentCoords;
  return anchor ? [anchor.lon, anchor.lat] : undefined;
}
