/**
 * [편안하개 - PetWalk]
 * React Native 공통 카드 래퍼 컴포넌트 (CardWrapper)
 */

import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { TOKENS } from '../../theme/tokens';

export interface CardWrapperProps {
  children: ReactNode;
  variant?: 'elevated' | 'flat' | 'highlight';
  style?: ViewStyle;
  onPress?: () => void;
}

export const CardWrapper: React.FC<CardWrapperProps> = ({
  children,
  variant = 'elevated',
  style,
  onPress,
}) => {
  const containerStyle = [
    styles.base,
    variant === 'flat' && styles.flat,
    variant === 'highlight' && styles.highlight,
    variant === 'elevated' && styles.elevated,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={containerStyle}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={containerStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    borderRadius: TOKENS.borderRadius.card,
    padding: 16,
    backgroundColor: TOKENS.colors.surface,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  elevated: {
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  flat: {
    backgroundColor: TOKENS.colors.surface,
    borderColor: TOKENS.colors.border,
    elevation: 0,
  },
  highlight: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderColor: TOKENS.colors.primaryMint,
  },
});
