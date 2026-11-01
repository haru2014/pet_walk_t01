import React, { forwardRef } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  TextInputProps,
  TextProps,
} from 'react-native';

const FONT_FAMILY_BY_WEIGHT: Record<string, string> = {
  '100': 'Pretendard-Regular',
  '200': 'Pretendard-Regular',
  '300': 'Pretendard-Regular',
  '400': 'Pretendard-Regular',
  normal: 'Pretendard-Regular',
  '500': 'Pretendard-Medium',
  '600': 'Pretendard-SemiBold',
  '700': 'Pretendard-Bold',
  bold: 'Pretendard-Bold',
  '800': 'Pretendard-ExtraBold',
  '900': 'Pretendard-Black',
};

function resolveFontFamily(style: TextProps['style'] | TextInputProps['style']): string {
  const weight = String(StyleSheet.flatten(style)?.fontWeight ?? '400');
  return FONT_FAMILY_BY_WEIGHT[weight] ?? 'Pretendard-Regular';
}

export const AppText = forwardRef<NativeText, TextProps>(function AppText({ style, ...props }, ref) {
  return <NativeText {...props} ref={ref} style={[style, { fontFamily: resolveFontFamily(style) }]} />;
});

export const AppTextInput = forwardRef<NativeTextInput, TextInputProps>(function AppTextInput(
  { style, ...props },
  ref,
) {
  return <NativeTextInput {...props} ref={ref} style={[style, { fontFamily: resolveFontFamily(style) }]} />;
});
