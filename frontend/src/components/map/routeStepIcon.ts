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

/**
 * 방향 지시 화살표 아이콘에 대해 머리(삼각형) 크기를 극대화한 고시인성 벡터 SVG를 반환합니다.
 */
export function getLargeArrowSvg(icon: string, color: string): string | null {
  if (icon === '↱') {
    return `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" style="display:block;filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px #fff);"><path d="M 8 22 L 8 13 Q 8 8 13 8 L 15 8" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/><polygon points="13,2 26,8 13,14" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/></svg>`;
  }
  if (icon === '↰') {
    return `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" style="display:block;filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px #fff);"><path d="M 20 22 L 20 13 Q 20 8 15 8 L 13 8" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/><polygon points="15,2 2,8 15,14" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/></svg>`;
  }
  if (icon === '↶') {
    return `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" style="display:block;filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px #fff);"><path d="M 19 22 L 19 12 Q 19 6 13.5 6 Q 8 6 8 12 L 8 15" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/><polygon points="2,13 8,25 14,13" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/></svg>`;
  }
  if (icon === '➤') {
    return `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" style="display:block;filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px #fff);"><polygon points="26,14 4,4 9,14 4,24" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/></svg>`;
  }
  return null;
}
