import { describe, it, expect } from 'vitest';
import { formatElapsed, calculateAverageSpeedKmH } from './walkFormat';

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

describe('calculateAverageSpeedKmH - 총 이동 거리 및 시간 기반 평균 속도 산출', () => {
  it('정상 보행 시 총 거리와 경과 시간으로 정확한 평균 속도를 계산한다', () => {
    // 1.9km, 30분(1800초) -> 1.9 / 0.5 = 3.8 km/h
    expect(calculateAverageSpeedKmH(1.9, 1800)).toBe(3.8);

    // 1.4km, 28분(1680초) -> 1.4 / (1680/3600) = 3.0 km/h
    expect(calculateAverageSpeedKmH(1.4, 1680)).toBe(3.0);
  });

  it('차량 이동 후 정차하여 종료한 경우에도 정지 순간의 0km/h가 아닌 실제 이동 평균 속도를 계산한다', () => {
    // 5.0km 이동 후 정차, 총 10분(600초) 소요 -> 5.0 / (600/3600) = 30.0 km/h
    expect(calculateAverageSpeedKmH(5.0, 600, 2.8)).toBe(30.0);
  });

  it('이동 거리가 0이거나 시간이 0 이하인 경우 fallbackSpeed를 반환한다', () => {
    expect(calculateAverageSpeedKmH(0, 300, 2.8)).toBe(2.8);
    expect(calculateAverageSpeedKmH(1.0, 0, 2.8)).toBe(2.8);
    expect(calculateAverageSpeedKmH(-1.0, 100, 2.8)).toBe(2.8);
  });
});
