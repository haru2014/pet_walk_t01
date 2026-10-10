/**
 * [편안하개 - PetWalk]
 * React Native 하단 5개 탭 바 컴포넌트 (BottomTabBar)
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TOKENS } from '../../theme/tokens';

export type TabKey = '홈' | '산책' | '액션' | '커뮤니티' | '마이';

export interface BottomTabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onActionPress?: () => void;
}

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: '홈', label: '홈', icon: '🏠' },
  { key: '산책', label: '산책', icon: '🗺️' },
  { key: '액션', label: '', icon: '🐾' },
  { key: '커뮤니티', label: '커뮤니티', icon: '👥' },
  { key: '마이', label: '마이', icon: '🐶' },
];

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onTabChange,
  onActionPress,
}) => {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        if (tab.key === '액션') {
          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.85}
              onPress={onActionPress || (() => onTabChange('산책'))}
              style={styles.actionButton}
            >
              <Text style={styles.actionIcon}>{tab.icon}</Text>
            </TouchableOpacity>
          );
        }

        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.7}
            onPress={() => onTabChange(tab.key)}
            style={styles.tabItem}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
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
    height: 72,
    backgroundColor: TOKENS.colors.surface,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 8,
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
  },
  tabIcon: {
    fontSize: 20,
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
  actionButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: TOKENS.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  actionIcon: {
    fontSize: 24,
  },
});
