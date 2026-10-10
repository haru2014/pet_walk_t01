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
