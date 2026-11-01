import { TYPOGRAPHY } from '../../theme/tokens';
/**
 * [편안하개 - PetWalk]
 * 경로 데이터 출처 뱃지 (Live AI 서버 vs 로컬 오프라인 폴백)
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from '../common/AppIcon';

export interface PlanSourceBadgeProps {
  readonly isLive: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

export const PlanSourceBadge: React.FC<PlanSourceBadgeProps> = ({ isLive, style }) => {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.bar, style]}>
      <View
        style={[
          styles.badge,
          {
            backgroundColor: isLive ? colors.primaryWash : colors.background,
            borderColor: isLive ? colors.primaryMint : colors.border,
          },
        ]}
      >
        <AppIcon
          name={isLive ? 'sparkle' : 'soft'}
          size={12}
          color={isLive ? colors.primaryDark : colors.textMain}
        />
        <Text
          style={[
            styles.text,
            { color: isLive ? colors.primaryDark : colors.textMain },
          ]}
        >
          {isLive ? '맞춤 산책 코스' : '기본 안심 코스'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: { fontSize: TYPOGRAPHY.caption, fontWeight: '600' },
});
