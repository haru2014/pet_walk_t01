import { TYPOGRAPHY } from '../../theme/tokens';
/**
 * [편안하개 - PetWalk]
 * 공통 화면 상단 헤더 컴포넌트 (AppScreenHeader.tsx)
 *
 * 모든 화면의 상단 메뉴 및 이전 화면(뒤로가기) 버튼의 통일된 규격:
 * 1. 좌측: 48px 이상 터치 타깃 뒤로가기 버튼 (AppIcon name="back")
 * 2. 중앙: 화면 제목 (title)
 * 3. 우측: 48px 이상 알림/보조 액션 (또는 균형용 플레이스홀더)
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText as Text } from './AppText';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from './AppIcon';

export interface AppScreenHeaderProps {
  title: string;
  titleFontSize?: number;
  onBack?: () => boolean | void;
  showBack?: boolean;
  rightElement?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export const AppScreenHeader: React.FC<AppScreenHeaderProps> = ({
  title,
  titleFontSize,
  onBack,
  showBack = true,
  rightElement,
  rightAction,
}) => {
  const { colors } = useAppTheme();
  const rightContent = rightAction ?? rightElement;

  return (
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {/* 1. 좌측 뒤로가기 버튼 */}
      {showBack && onBack ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onBack}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
        >
          <AppIcon name="back" size={22} color={colors.textMain} />
        </TouchableOpacity>
      ) : (
        <View style={styles.actionBtnPlaceholder} />
      )}

      {/* 2. 중앙 화면 제목 */}
      <Text style={[styles.title, titleFontSize != null && { fontSize: titleFontSize }, { color: colors.textMain }]} numberOfLines={1}>
        {title}
      </Text>

      {/* 3. 우측 액션 또는 균형 플레이스홀더 */}
      {rightContent ? (
        <View style={styles.actionBtnWrap}>{rightContent}</View>
      ) : (
        <View style={styles.actionBtnPlaceholder} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnWrap: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPlaceholder: {
    width: 48,
    height: 48,
  },
  title: {
    fontSize: TYPOGRAPHY.screenTitle,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
    flex: 1,
  },
});
