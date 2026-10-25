import { RouteStepPin } from '../../types/route';

const DEFAULT_PIN_ICONS: Record<RouteStepPin['kind'], string> = {
  caution: '!',
  safe: '🌿',
  turn: '➤',
};

/** 안내 문구의 실제 회전 방향에 맞는 지도 핀 아이콘을 반환한다. */
export function getRouteStepPinIcon(pin: RouteStepPin): string {
  if (pin.icon) return pin.icon;
  if (pin.kind !== 'turn') return DEFAULT_PIN_ICONS[pin.kind];

  const instruction = pin.instruction;
  if (/(유턴|회차|U[\s-]?턴|U[\s-]?turn|turn\s+around|turn\s+back)/i.test(instruction)) {
    return '↶';
  }
  if (/(좌회전|좌측|왼쪽|turn\s+left|\bleft\s+turn\b)/i.test(instruction)) {
    return '↰';
  }
  if (/(우회전|우측|오른쪽|turn\s+right|\bright\s+turn\b)/i.test(instruction)) {
    return '↱';
  }

  // 방향 정보가 없는 샘플·일반 안내는 우회전으로 표시하지 않는다.
  return DEFAULT_PIN_ICONS.turn;
}
