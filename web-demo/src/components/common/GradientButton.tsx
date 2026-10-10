/**
 * [편안하개 - PetWalk]
 * 시그니처 에메랄드 그라디언트 버튼 (GradientButton)
 * 
 * 디자인 규격:
 * - 그라디언트: linear-gradient(135deg, #10B981, #087F5B)
 * - 텍스트: #FFFFFF, Bold
 * - 라운딩: 14px
 * - 섀도우: 0 4px 12px rgba(16,185,129,0.35)
 */

import React, { ReactNode } from 'react';
import { TOKENS } from '../../theme/tokens';

export interface GradientButtonProps {
  children: ReactNode;
  onClick?: () => void;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export const GradientButton: React.FC<GradientButtonProps> = ({
  children,
  onClick,
  fullWidth = false,
  size = 'md',
  disabled = false,
  style,
  className = '',
}) => {
  const getSizePadding = (): string => {
    switch (size) {
      case 'sm':
        return '6px 12px';
      case 'lg':
        return '14px 24px';
      case 'md':
      default:
        return '9px 16px';
    }
  };

  const buttonStyle: React.CSSProperties = {
    background: disabled
      ? '#D1D5DB'
      : `linear-gradient(135deg, ${TOKENS.colors.primary}, ${TOKENS.colors.primaryDark})`,
    color: TOKENS.colors.textWhite,
    fontWeight: TOKENS.fontWeight.bold,
    fontSize: size === 'lg' ? '15px' : '13px',
    border: 'none',
    borderRadius: `${TOKENS.borderRadius.button}px`,
    padding: getSizePadding(),
    cursor: disabled ? 'not-allowed' : 'pointer',
    width: fullWidth ? '100%' : 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.2px',
    boxShadow: disabled ? 'none' : '0 4px 12px rgba(16,185,129,0.35)',
    transition: 'transform 0.1s ease, box-shadow 0.1s ease',
    ...style,
  };

  return (
    <button
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={buttonStyle}
      className={`petwalk-button-primary ${className}`}
    >
      {children}
    </button>
  );
};
