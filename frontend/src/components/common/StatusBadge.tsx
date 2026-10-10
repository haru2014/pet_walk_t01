/**
 * [편안하개 - PetWalk]
 * React Native 웰니스 상태 뱃지 및 인포 칩 (StatusBadge)
 */

import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { TOKENS } from '../../theme/tokens';

export interface StatusBadgeProps {
  children: ReactNode;
  variant?: 'green' | 'muted' | 'warning' | 'solidGreen';
  style?: ViewStyle;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  children,
  variant = 'green',
  style,
}) => {
  return (
    <View
      style={[
        styles.badge,
        variant === 'green' && styles.badgeGreen,
        variant === 'muted' && styles.badgeMuted,
        variant === 'warning' && styles.badgeWarning,
        variant === 'solidGreen' && styles.badgeSolidGreen,
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text
          style={[
            styles.text,
            variant === 'green' && styles.textGreen,
            variant === 'muted' && styles.textMuted,
            variant === 'warning' && styles.textWarning,
            variant === 'solidGreen' && styles.textSolidGreen,
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: TOKENS.borderRadius.badge,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeGreen: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderWidth: 1,
    borderColor: TOKENS.colors.primaryMint,
  },
  badgeMuted: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeSolidGreen: {
    backgroundColor: TOKENS.colors.primarySubtle,
  },
  text: {
    fontSize: TOKENS.fontSize.sm,
    fontWeight: '600',
  },
  textGreen: {
    color: TOKENS.colors.primaryDark,
  },
  textMuted: {
    color: TOKENS.colors.textMuted,
  },
  textWarning: {
    color: '#B45309',
  },
  textSolidGreen: {
    color: TOKENS.colors.primary,
    fontWeight: '700',
  },
});
