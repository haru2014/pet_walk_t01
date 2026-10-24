/**
 * 지도 지면온도·경사도 레이어 분류.
 * 서버 필드 surfaceTempC / slopeSignedPercent 만 사용한다.
 * shaded, surface, maxSlopePercent 로는 추론하지 않는다.
 */

export type SurfaceTempBand = 'safe' | 'cautionLow' | 'cautionHigh' | 'danger' | 'unknown';

export type SlopeGrade =
  | 'flat'
  | 'gentleUp'
  | 'steepUp'
  | 'gentleDown'
  | 'steepDown'
  | 'unknown';

export interface SegmentConditionValues {
  readonly surfaceTempC?: number | null;
  readonly slopeSignedPercent?: number | null;
}

export interface SlopeGradeThresholds {
  readonly flatMaxAbsPercent: number;
  readonly steepMinAbsPercent: number;
}

/**
 * 경사 5단계 경계. 팀 기준이 정해지면 이 설정만 바꾼다.
 * 화면/색상 코드에 숫자를 직접 쓰지 말 것.
 */
export const SLOPE_GRADE_THRESHOLDS: SlopeGradeThresholds = {
  flatMaxAbsPercent: 3,
  steepMinAbsPercent: 8,
};

export const SURFACE_TEMP_STYLE: Record<SurfaceTempBand, { color: string; label: string }> = {
  safe: { color: '#10B981', label: '안전' },
  cautionLow: { color: '#F59E0B', label: '주의(낮음)' },
  cautionHigh: { color: '#F97316', label: '주의(높음)' },
  danger: { color: '#DC2626', label: '위험' },
  unknown: { color: '#9CA3AF', label: '확인 불가' },
};

export const SLOPE_GRADE_STYLE: Record<SlopeGrade, { color: string; label: string; symbol: string }> = {
  flat: { color: '#64748B', label: '평지', symbol: '━' },
  gentleUp: { color: '#16A34A', label: '완만한 오르막', symbol: '▲' },
  steepUp: { color: '#EA580C', label: '급한 오르막', symbol: '▲▲' },
  gentleDown: { color: '#0284C7', label: '완만한 내리막', symbol: '▼' },
  steepDown: { color: '#1D4ED8', label: '급한 내리막', symbol: '▼▼' },
  unknown: { color: '#9CA3AF', label: '확인 불가', symbol: '·' },
};

export function classifySurfaceTempC(value: number | null | undefined): SurfaceTempBand {
  if (value == null || Number.isNaN(value)) return 'unknown';
  if (value <= 33) return 'safe';
  if (value <= 39) return 'cautionLow';
  if (value <= 45) return 'cautionHigh';
  return 'danger';
}

export function classifySlopeSignedPercent(
  value: number | null | undefined,
  thresholds: SlopeGradeThresholds = SLOPE_GRADE_THRESHOLDS,
): SlopeGrade {
  if (value == null || Number.isNaN(value)) return 'unknown';
  const abs = Math.abs(value);
  if (abs <= thresholds.flatMaxAbsPercent) return 'flat';
  const steep = abs >= thresholds.steepMinAbsPercent;
  if (value > 0) return steep ? 'steepUp' : 'gentleUp';
  return steep ? 'steepDown' : 'gentleDown';
}

export function resolveSegmentCondition(
  properties: SegmentConditionValues,
  override?: SegmentConditionValues,
): SegmentConditionValues {
  return {
    surfaceTempC:
      override && 'surfaceTempC' in override ? override.surfaceTempC : properties.surfaceTempC,
    slopeSignedPercent:
      override && 'slopeSignedPercent' in override
        ? override.slopeSignedPercent
        : properties.slopeSignedPercent,
  };
}

export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
}

export interface SlopeArrowMark {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly headingRad: number;
  readonly grade: SlopeGrade;
}

export function buildSlopeArrowMarks(
  projected: readonly ProjectedPoint[],
  grade: SlopeGrade,
  segmentKey: string,
  spacingPx = 44,
): SlopeArrowMark[] {
  if (projected.length < 2) return [];
  const marks: SlopeArrowMark[] = [];
  let traveled = 0;
  let nextAt = spacingPx / 2;

  for (let i = 1; i < projected.length; i += 1) {
    const a = projected[i - 1];
    const b = projected[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1) continue;
    const headingRad = Math.atan2(dy, dx);

    while (nextAt <= traveled + segLen) {
      const t = (nextAt - traveled) / segLen;
      marks.push({
        id: `slope_${segmentKey}_${marks.length}`,
        x: a.x + dx * t,
        y: a.y + dy * t,
        headingRad,
        grade,
      });
      nextAt += spacingPx;
    }
    traveled += segLen;
  }

  if (marks.length === 0) {
    const mid = projected[Math.floor(projected.length / 2)];
    const a = projected[0];
    const b = projected[projected.length - 1];
    marks.push({
      id: `slope_${segmentKey}_0`,
      x: mid.x,
      y: mid.y,
      headingRad: Math.atan2(b.y - a.y, b.x - a.x),
      grade,
    });
  }
  return marks;
}

export function slopeArrowPolygonPoints(
  mark: SlopeArrowMark,
  size: number,
  alongTravel: boolean,
): string {
  const heading = alongTravel ? mark.headingRad : mark.headingRad + Math.PI;
  const tipX = mark.x + Math.cos(heading) * size;
  const tipY = mark.y + Math.sin(heading) * size;
  const leftX = mark.x + Math.cos(heading + 2.45) * size * 0.72;
  const leftY = mark.y + Math.sin(heading + 2.45) * size * 0.72;
  const rightX = mark.x + Math.cos(heading - 2.45) * size * 0.72;
  const rightY = mark.y + Math.sin(heading - 2.45) * size * 0.72;
  return `${tipX.toFixed(1)},${tipY.toFixed(1)} ${leftX.toFixed(1)},${leftY.toFixed(1)} ${rightX.toFixed(1)},${rightY.toFixed(1)}`;
}

export function slopeFlatBarPoints(mark: SlopeArrowMark, size: number): string {
  const nx = Math.cos(mark.headingRad + Math.PI / 2);
  const ny = Math.sin(mark.headingRad + Math.PI / 2);
  const hx = Math.cos(mark.headingRad) * 1.6;
  const hy = Math.sin(mark.headingRad) * 1.6;
  const ax = mark.x - nx * size - hx;
  const ay = mark.y - ny * size - hy;
  const bx = mark.x + nx * size - hx;
  const by = mark.y + ny * size - hy;
  const cx = mark.x + nx * size + hx;
  const cy = mark.y + ny * size + hy;
  const dx = mark.x - nx * size + hx;
  const dy = mark.y - ny * size + hy;
  return `${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)} ${dx.toFixed(1)},${dy.toFixed(1)}`;
}
