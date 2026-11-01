/**
 * [편안하개 - PetWalk]
 * React Native 공통 카드 래퍼 컴포넌트 (CardWrapper)
 */

import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, TouchableOpacity } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { useAppTheme } from '../../theme/themeManager';

export interface CardWrapperProps {
  children: ReactNode;
  variant?: 'elevated' | 'flat' | 'highlight';
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export const CardWrapper: React.FC<CardWrapperProps> = ({
  children,
  variant = 'elevated',
  style,
  onPress,
}) => {
  const { colors } = useAppTheme();

  const dynamicVariantStyle: ViewStyle =
    variant === 'highlight'
      ? {
          backgroundColor: colors.primaryLight,
          borderColor: colors.primaryMint,
        }
      : {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        };

  const containerStyle = [
    styles.base,
    dynamicVariantStyle,
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
    borderWidth: 1,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
});

