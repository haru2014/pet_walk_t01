/**
 * [편안하개 - PetWalk]
 * React Native 하단 4개 탭 바 컴포넌트 (BottomTabBar)
 * - 4대 테마 동적 컬러 지원
 * - 선택 탭 아이콘 둥근 알약형 배경(Pill) 강조
 * - 아이콘 및 텍스트 색상/굵기(600/400) 동기화
 * - 접근성(accessibilityRole, accessibilityState) 및 흔들림 없는 고정 그리드
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { AppText as Text } from './AppText';
import { TOKENS, TYPOGRAPHY } from '../../theme/tokens';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon, AppIconName } from './AppIcon';

export type TabKey = '홈' | '산책' | '커뮤니티' | '마이';

export interface BottomTabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onActionPress?: () => void;
}

const TABS: { key: TabKey; label: string; icon: AppIconName }[] = [
  { key: '홈', label: '홈', icon: 'home' },
  { key: '산책', label: '산책', icon: 'map' },
  { key: '커뮤니티', label: '커뮤니티', icon: 'users' },
  { key: '마이', label: '마이', icon: 'user' },
];

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onTabChange,
}) => {
  const { theme, colors } = useAppTheme();
  const isDark = theme === 'dark';

  // 테마별 최적 대비 컬러 배색
  const activeColor = colors.primaryDark;
  const activeBg = isDark ? 'rgba(52, 211, 153, 0.18)' : colors.primaryLight;
  const inactiveColor = colors.textMuted;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}
      accessibilityRole="tablist"
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const tintColor = isActive ? activeColor : inactiveColor;

        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.7}
            onPress={() => onTabChange(tab.key)}
            style={styles.tabItem}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} 탭`}
          >
            {/* ① 아이콘 배경 강조: 44x30px 고정 둥근 알약형 컨테이너로 흔들림 방지 */}
            <View
              style={[
                styles.iconContainer,
                isActive && [
                  styles.iconContainerActive,
                  { backgroundColor: activeBg },
                ],
              ]}
            >
              <AppIcon
                name={tab.icon}
                size={22}
                color={tintColor}
              />
            </View>

            {/* ② 메뉴 텍스트: 선택 시 굵기 변경(600 vs 400), 크기 12px 고정 */}
            <Text
              style={[
                styles.tabLabel,
                { color: tintColor, fontWeight: isActive ? '600' : '400' },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 64,
    backgroundColor: TOKENS.colors.surface,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'ios' ? 8 : 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconContainer: {
    width: 44,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconContainerActive: {
    // 배경색은 테마에 따라 인라인으로 주입
  },
  tabLabel: {
    fontSize: TYPOGRAPHY.label,
    color: TOKENS.colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
});
