import { describe, expect, it } from 'vitest';
import { RouteStepPin } from '../../types/route';
import {
  getRouteStepPinIcon,
  getLargeArrowSvg,
  getMiniArrowSvg,
  getAdaptiveArrowSvg,
} from './routeStepIcon';

const pin = (instruction: string, icon?: string): RouteStepPin => ({
  id: 'step',
  kind: 'turn',
  position: [127, 37],
  instruction,
  ...(icon ? { icon } : {}),
});

describe('getRouteStepPinIcon', () => {
  it.each([
    ['좌회전하여 보행로를 따라 이동하세요.', '↰'],
    ['전방에서 왼쪽으로 이동하세요.', '↰'],
    ['우회전하여 보행로를 따라 이동하세요.', '↱'],
    ['Turn right at the next path.', '↱'],
    ['유턴하여 반대 방향으로 이동하세요.', '↶'],
    ['Make a U-turn.', '↶'],
    ['보행로를 따라 이동하세요.', '➤'],
  ])('"%s" 안내에 맞는 아이콘을 반환한다', (instruction, expected) => {
    expect(getRouteStepPinIcon(pin(instruction))).toBe(expected);
  });

  it('명시적인 아이콘 재정의는 회전 방향 판정보다 우선한다', () => {
    expect(getRouteStepPinIcon(pin('좌회전하세요.', '🐾'))).toBe('🐾');
  });

  it('대형 볼드 화살표 및 초소형 미니 화살표 SVG 생성을 지원한다', () => {
    const largeStraight = getLargeArrowSvg('↑', '#166534');
    expect(largeStraight).toContain('arrow-svg-large');
    expect(largeStraight).toContain('width="22"');

    const miniRight = getMiniArrowSvg('↱', '#26352B');
    expect(miniRight).toContain('arrow-svg-mini');
    expect(miniRight).toContain('width="8"');

    const adaptive = getAdaptiveArrowSvg('↑', '#166534', '#26352B');
    expect(adaptive).toContain('arrow-svg-large');
    expect(adaptive).toContain('arrow-svg-mini');
  });
});
