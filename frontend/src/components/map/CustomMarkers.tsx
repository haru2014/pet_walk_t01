/**
 * [편안하개 - PetWalk]
 * 지도 커스텀 마커 (Phase 3, US-C1)
 *  - 출발/도착: 초록 발자국(Paw) 원형 마커
 *  - 스텝 핀: 회전 안내(파랑) / 위험 주의(주황)
 */

import React from 'react';
import { TOKENS } from '../../theme/tokens';
import { LonLat, RouteStepPin } from '../../types/route';
import { ProjectedPoint } from '../../services/routeGeometry';

export interface PawMarkerProps {
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

/** 출발/도착 발자국 원형 마커 */
export const PawMarker: React.FC<PawMarkerProps> = ({ x, y, label }) => (
  <g transform={`translate(${x}, ${y})`}>
    <circle r={20} fill={TOKENS.colors.primary} opacity={0.18} />
    <circle r={14} fill={TOKENS.colors.primary} stroke="#FFFFFF" strokeWidth={3} />
    <g transform="translate(-8,-8) scale(0.67)" fill="#FFFFFF">
      <ellipse cx="5" cy="6" rx="2" ry="2.5" />
      <ellipse cx="9.5" cy="3.5" rx="2" ry="2.5" />
      <ellipse cx="14.5" cy="3.5" rx="2" ry="2.5" />
      <ellipse cx="19" cy="6" rx="2" ry="2.5" />
      <path d="M12 22c-4 0-8-3-8-7 0-2 1.5-3.5 3.5-4.5 1-.5 2-1.5 2.5-2 .5-.5 1-1 2-1s1.5.5 2 1c.5.5 1.5 1.5 2.5 2C18.5 11.5 20 13 20 15c0 4-4 7-8 7z" />
    </g>
    <text
      y={-24}
      textAnchor="middle"
      fontSize={10}
      fontWeight={700}
      fill={TOKENS.colors.primaryDark}
      stroke="#FFFFFF"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {label}
    </text>
  </g>
);

export interface StepPinProps {
  readonly pin: RouteStepPin;
  readonly project: (p: LonLat) => ProjectedPoint;
  readonly selected?: boolean;
  readonly onSelect?: (id: string) => void;
}

/** 회전/위험 안내 스텝 핀 */
export const StepPin: React.FC<StepPinProps> = ({ pin, project, selected = false, onSelect }) => {
  const { x, y } = project(pin.position);
  const color = pin.kind === 'caution' ? TOKENS.colors.routeRubber : TOKENS.colors.routeNormal;
  const glyph = pin.kind === 'caution' ? '!' : '↱';

  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect?.(pin.id)}
      role="button"
      aria-label={pin.instruction}
    >
      <circle r={selected ? 14 : 11} fill={color} stroke="#FFFFFF" strokeWidth={2.5} />
      <text y={4} textAnchor="middle" fontSize={selected ? 14 : 12} fontWeight={800} fill="#FFFFFF">
        {glyph}
      </text>
    </g>
  );
};
