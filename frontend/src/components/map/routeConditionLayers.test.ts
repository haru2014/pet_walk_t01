import { describe, expect, it } from 'vitest';
import {
  classifySlopeSignedPercent,
  classifySurfaceTempC,
  resolveSegmentCondition,
  SLOPE_GRADE_THRESHOLDS,
} from './routeConditionLayers';

describe('classifySurfaceTempC', () => {
  it('서버 기준 구간을 분류하고 값이 없으면 확인 불가로 둔다', () => {
    expect(classifySurfaceTempC(33)).toBe('safe');
    expect(classifySurfaceTempC(33.1)).toBe('cautionLow');
    expect(classifySurfaceTempC(39)).toBe('cautionLow');
    expect(classifySurfaceTempC(39.1)).toBe('cautionHigh');
    expect(classifySurfaceTempC(45)).toBe('cautionHigh');
    expect(classifySurfaceTempC(45.1)).toBe('danger');
    expect(classifySurfaceTempC(null)).toBe('unknown');
    expect(classifySurfaceTempC(undefined)).toBe('unknown');
  });
});

describe('classifySlopeSignedPercent', () => {
  it('경계값은 설정 객체를 따르고 값이 없으면 확인 불가이다', () => {
    const t = SLOPE_GRADE_THRESHOLDS;
    expect(classifySlopeSignedPercent(t.flatMaxAbsPercent, t)).toBe('flat');
    expect(classifySlopeSignedPercent(t.flatMaxAbsPercent + 0.1, t)).toBe('gentleUp');
    expect(classifySlopeSignedPercent(-(t.flatMaxAbsPercent + 0.1), t)).toBe('gentleDown');
    expect(classifySlopeSignedPercent(t.steepMinAbsPercent, t)).toBe('steepUp');
    expect(classifySlopeSignedPercent(-t.steepMinAbsPercent, t)).toBe('steepDown');
    expect(classifySlopeSignedPercent(null, t)).toBe('unknown');
  });
});

describe('resolveSegmentCondition', () => {
  it('shaded 같은 임시 필드가 아니라 surfaceTempC/slopeSignedPercent만 사용한다', () => {
    const fromProps = resolveSegmentCondition({
      surfaceTempC: undefined,
      slopeSignedPercent: undefined,
    });
    expect(fromProps.surfaceTempC).toBeUndefined();
    expect(fromProps.slopeSignedPercent).toBeUndefined();
    expect(classifySurfaceTempC(fromProps.surfaceTempC)).toBe('unknown');
    expect(classifySlopeSignedPercent(fromProps.slopeSignedPercent)).toBe('unknown');
  });
});
