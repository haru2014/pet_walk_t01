/**
 * [편안하개 - PetWalk]
 * 산책 HUD 표시용 포맷터
 */

/** 경과 초를 mm:ss 형식으로 변환한다. 음수/소수는 0 이상 정수로 보정한다. */
export function formatElapsed(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * 총 이동 거리(km)와 총 경과 시간(초)을 바탕으로 실제 평균 속도(km/h)를 계산한다.
 * - 종료 시점 마지막 GPS 순간 속도가 0이더라도 (예: 정차 후 종료) 전체 산책의 정확한 평균 속도를 산출한다.
 * - 거리 또는 시간이 0 이하이거나 비정상적인 경우 fallbackSpeedKmH를 반환한다.
 * - 공식: 총 거리(km) ÷ (경과 시간(초) / 3600)
 * - 소수점 첫째 자리까지 반올림한다.
 */
export function calculateAverageSpeedKmH(
  distanceKm: number,
  elapsedSec: number,
  fallbackSpeedKmH: number = 2.8,
): number {
  if (distanceKm <= 0 || elapsedSec <= 0) {
    return fallbackSpeedKmH;
  }
  const hours = elapsedSec / 3600;
  const speed = distanceKm / hours;
  if (!Number.isFinite(speed) || speed <= 0) {
    return fallbackSpeedKmH;
  }
  const rounded = Math.round(speed * 10) / 10;
  return rounded > 0 ? rounded : fallbackSpeedKmH;
}
