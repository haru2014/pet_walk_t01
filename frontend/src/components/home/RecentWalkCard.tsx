/**
 * [편안하개 - PetWalk]
 * 모바일 홈 최근 산책 요약 카드 (Screen-01, US-E2)
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { TOKENS, TYPOGRAPHY } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';

export interface RecentWalkCardProps {
  onPress?: () => void;
  title?: string;
  distanceKm?: number;
  durationMinutes?: number;
  safeRatioPercent?: number;
}

export const RecentWalkCard: React.FC<RecentWalkCardProps> = ({
  onPress,
  title = '오늘의 산책',
  distanceKm = 2.4,
  durationMinutes = 38,
  safeRatioPercent = 72,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>최근 산책</Text>
        <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
          <Text style={styles.viewAllText}>기록 보기</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={styles.card}
      >
        <View style={styles.leftGroup}>
          <View style={styles.iconBox}>
            <AppIcon name="paw" size={22} color={TOKENS.colors.primary} />
          </View>
          <View>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardMeta}>
              {distanceKm} km · {durationMinutes}분 · 편안한 길 {safeRatioPercent}%
            </Text>
          </View>
        </View>

        <AppIcon name="chevronRight" size={20} color={TOKENS.colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.sectionTitle,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.3,
  },
  viewAllText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: TOKENS.colors.primary,
  },
  card: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: TOKENS.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: TYPOGRAPHY.caption,
    color: TOKENS.colors.textMuted,
  },
});
