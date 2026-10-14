/**
 * [편안하개 - PetWalk]
 * React Native 하단 4개 탭 바 컴포넌트 (BottomTabBar)
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon, AppIconName } from './AppIcon';

export type TabKey = '홈' | '산책' | '커뮤니티' | '마이';

export interface BottomTabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onActionPress?: () => void;
}

const TABS: Array<{ key: TabKey; label: string; icon: AppIconName }> = [
  { key: '홈', label: '홈', icon: 'home' },
  { key: '산책', label: '산책', icon: 'map' },
  { key: '커뮤니티', label: '커뮤니티', icon: 'users' },
  { key: '마이', label: '마이', icon: 'user' },
];

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onTabChange,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.7}
            onPress={() => onTabChange(tab.key)}
            style={styles.tabItem}
          >
            <AppIcon
              name={tab.icon}
              size={22}
              color={isActive ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: isActive ? colors.primary : colors.textMuted },
                isActive && styles.tabLabelActive,
              ]}
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
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 6,
  },
  tabLabel: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: TOKENS.colors.primary,
    fontWeight: '700',
  },
});
