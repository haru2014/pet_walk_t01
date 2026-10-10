import { describe, it, expect } from 'vitest';
import { formatElapsed } from './walkFormat';

describe('경과 시간 포맷터', () => {
  it('초를 mm:ss로 변환해야 한다', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(65)).toBe('01:05');
    expect(formatElapsed(1122)).toBe('18:42');
  });

  it('음수와 소수는 0 이상 정수로 보정해야 한다', () => {
    expect(formatElapsed(-5)).toBe('00:00');
    expect(formatElapsed(59.9)).toBe('00:59');
  });
});
