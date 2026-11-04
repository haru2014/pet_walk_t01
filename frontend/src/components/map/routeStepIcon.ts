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
  const filter = 'filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px #fff);';
  if (icon === '↑') {
    return `<svg width="22" height="22" viewBox="0 0 28 28" fill="none" style="display:block;${filter}"><path d="M 14 23 L 14 10" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/><polygon points="7,12 14,3 21,12" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/></svg>`;
  }
  if (icon === '↱') {
    return `<svg width="22" height="22" viewBox="0 0 28 28" fill="none" style="display:block;${filter}"><path d="M 6 22 L 6 13 Q 6 8 11 8 L 14 8" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/><polygon points="12,2 25,8 12,14" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/></svg>`;
  }
  if (icon === '↰') {
    return `<svg width="22" height="22" viewBox="0 0 28 28" fill="none" style="display:block;${filter}"><path d="M 22 22 L 22 13 Q 22 8 17 8 L 14 8" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/><polygon points="16,2 3,8 16,14" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/></svg>`;
  }
  if (icon === '↶') {
    return `<svg width="22" height="22" viewBox="0 0 28 28" fill="none" style="display:block;${filter}"><path d="M 21.5 22 L 21.5 12 Q 21.5 6 16 6 Q 10.5 6 10.5 12 L 10.5 15" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/><polygon points="4.5,13 10.5,25 16.5,13" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/></svg>`;
  }
  if (icon === '➤') {
    return `<svg width="22" height="22" viewBox="0 0 28 28" fill="none" style="display:block;${filter}"><polygon points="25,14 5,4 10,14 5,24" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/></svg>`;
  }
  return null;
}
