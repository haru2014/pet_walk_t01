import { describe, expect, it } from 'vitest';
import {
  classifySlopeSignedPercent,
  classifySurfaceTempC,
  routeConditionColorExpression,
  resolveSegmentCondition,
  slopeSymbolExpression,
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

describe('MapLibre route condition expressions', () => {
  it('colors only known surface temperatures and falls back to the course segment color', () => {
    const expression = JSON.stringify(routeConditionColorExpression({ safe: '#0a0', normal: '#aa0', caution: '#a00' }));
    expect(expression).toContain('surfaceTempC');
    expect(expression).toContain('#10B981');
    expect(expression).toContain('#DC2626');
    expect(expression).toContain('segmentType');
  });

  it('labels slopes from the signed server value and leaves missing values unmarked', () => {
    const expression = JSON.stringify(slopeSymbolExpression());
    expect(expression).toContain('slopeSignedPercent');
    expect(expression).toContain('▼');
    expect(expression).toContain('▲');
    expect(expression).toContain('""');
  });
});
