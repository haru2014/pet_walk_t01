/**
 * [편안하개 - PetWalk]
 * 웰니스 상태 뱃지 및 인포 칩 (StatusBadge)
 * 
 * 디자인 규격:
 * - 배경: #ECFDF5
 * - 테두리: 1px solid #A7F3D0
 * - 텍스트: #087F5B, Medium (500)
 * - 라운딩: 20px
 */

import React, { ReactNode } from 'react';
import { TOKENS } from '../../theme/tokens';

export interface StatusBadgeProps {
  children: ReactNode;
  variant?: 'green' | 'muted' | 'warning' | 'solidGreen';
  icon?: ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  children,
  variant = 'green',
  icon,
  style,
  className = '',
  onClick,
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'solidGreen':
        return {
          background: TOKENS.colors.primarySubtle,
          color: TOKENS.colors.primary,
          border: 'none',
          fontWeight: TOKENS.fontWeight.bold,
        };
      case 'muted':
        return {
          background: '#F3F4F6',
          color: TOKENS.colors.textMuted,
          border: '1px solid #E5E7EB',
          fontWeight: TOKENS.fontWeight.medium,
        };
      case 'warning':
        return {
          background: '#FEF3C7',
          color: '#B45309',
          border: '1px solid #FDE68A',
          fontWeight: TOKENS.fontWeight.medium,
        };
      case 'green':
      default:
        return {
          background: TOKENS.colors.primaryLight,
          color: TOKENS.colors.primaryDark,
          border: `1px solid ${TOKENS.colors.primaryMint}`,
          fontWeight: TOKENS.fontWeight.medium,
        };
    }
  };

  const badgeStyle: React.CSSProperties = {
    fontSize: '12px',
    padding: '4px 10px',
    borderRadius: `${TOKENS.borderRadius.badge}px`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    cursor: onClick ? 'pointer' : 'default',
    lineHeight: '1.2',
    ...getVariantStyles(),
    ...style,
  };

  return (
    <span
      onClick={onClick}
      style={badgeStyle}
      className={`petwalk-badge ${className}`}
    >
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      {children}
    </span>
  );
};
