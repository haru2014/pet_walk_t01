/**
 * [편안하개 - PetWalk]
 * 공통 카드 래퍼 컴포넌트 (CardWrapper)
 * 
 * 디자인 규격:
 * - 배경: #FFFFFF
 * - 테두리: 1px solid #F0F5F2
 * - 라운딩: 20px
 * - 부드러운 에메랄드/그레이 섀도우 효과
 */

import React, { ReactNode } from 'react';
import { TOKENS } from '../../theme/tokens';

export interface CardWrapperProps {
  children: ReactNode;
  variant?: 'elevated' | 'flat' | 'highlight';
  style?: React.CSSProperties;
  onClick?: () => void;
  className?: string;
}

export const CardWrapper: React.FC<CardWrapperProps> = ({
  children,
  variant = 'elevated',
  style,
  onClick,
  className = '',
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'highlight':
        return {
          background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
          border: `1px solid ${TOKENS.colors.primaryMint}`,
          boxShadow: '0 2px 16px rgba(16,185,129,0.12)',
        };
      case 'flat':
        return {
          background: TOKENS.colors.surface,
          border: `1px solid ${TOKENS.colors.border}`,
          boxShadow: 'none',
        };
      case 'elevated':
      default:
        return {
          background: TOKENS.colors.surface,
          border: `1px solid ${TOKENS.colors.border}`,
          boxShadow: '0 2px 16px rgba(16,185,129,0.10)',
        };
    }
  };

  const baseStyle: React.CSSProperties = {
    borderRadius: `${TOKENS.borderRadius.card}px`,
    padding: '18px 18px 16px',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    ...getVariantStyles(),
    ...style,
  };

  return (
    <div
      style={baseStyle}
      onClick={onClick}
      className={`petwalk-card ${className}`}
    >
      {children}
    </div>
  );
};
