/**
 * [편안하개 - PetWalk]
 * React Native 시그니처 버튼 (GradientButton)
 */

import React, { ReactNode } from 'react';
import { Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { TOKENS } from '../../theme/tokens';

export interface GradientButtonProps {
  children: ReactNode;
  onPress?: () => void;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  style?: ViewStyle;
}

export const GradientButton: React.FC<GradientButtonProps> = ({
  children,
  onPress,
  fullWidth = false,
  size = 'md',
  disabled = false,
  style,
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={[
        styles.button,
        size === 'sm' && styles.sizeSm,
        size === 'lg' && styles.sizeLg,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text style={[styles.text, size === 'lg' && styles.textLg]}>{children}</Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.borderRadius.button,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  sizeSm: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  sizeLg: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
    elevation: 0,
  },
  text: {
    color: TOKENS.colors.textWhite,
    fontSize: TOKENS.fontSize.md,
    fontWeight: '700',
  },
  textLg: {
    fontSize: TOKENS.fontSize.lg,
  },
});
