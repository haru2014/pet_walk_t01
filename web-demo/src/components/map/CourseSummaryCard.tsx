/**
 * [편안하개 - PetWalk]
 * 코스 요약 바텀시트 카드 (Phase 3, US-C1)
 * 하단 엄지 영역(Thumb Zone) 배치: 거리/시간/최대 경사/그늘 비율 + "산책 시작" 버튼
 */

import React from 'react';
import { TOKENS } from '../../theme/tokens';
import { CourseSummary } from '../../types/route';
import { GradientButton } from '../common/GradientButton';
import { StatusBadge } from '../common/StatusBadge';

export interface CourseSummaryCardProps {
  readonly summary: CourseSummary;
  readonly onStart?: () => void;
}

export const CourseSummaryCard: React.FC<CourseSummaryCardProps> = ({ summary, onStart }) => {
  const slopeVariant = summary.maxSlopePercent > 8 ? 'warning' : 'green';

  return (
    <div
      style={{
        background: TOKENS.colors.surface,
        borderRadius: `${TOKENS.borderRadius.card}px ${TOKENS.borderRadius.card}px 0 0`,
        boxShadow: '0 -6px 24px rgba(0,0,0,0.08)',
        padding: '10px 18px 16px',
      }}
    >
      {/* 바텀시트 핸들 */}
      <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#D1D5DB', margin: '0 auto 12px' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
        <div>
          <span style={{ fontSize: '24px', fontWeight: 800, color: TOKENS.colors.textMain }}>
            {summary.totalDistanceKm.toFixed(2)}
          </span>
          <span style={{ fontSize: '13px', color: TOKENS.colors.textMuted, marginLeft: '3px' }}>km</span>
          <span style={{ fontSize: '24px', fontWeight: 800, color: TOKENS.colors.textMain, marginLeft: '14px' }}>
            {summary.estimatedMinutes}
          </span>
          <span style={{ fontSize: '13px', color: TOKENS.colors.textMuted, marginLeft: '3px' }}>분</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <StatusBadge variant={slopeVariant}>⛰ 최대 경사 {summary.maxSlopePercent}%</StatusBadge>
        <StatusBadge>🌳 그늘 {summary.shadeRatioPercent}%</StatusBadge>
      </div>

      <GradientButton fullWidth size="lg" onClick={onStart}>
        산책 시작 →
      </GradientButton>
    </div>
  );
};
