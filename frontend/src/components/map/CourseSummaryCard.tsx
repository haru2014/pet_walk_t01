/**
 * [편안하개 - PetWalk]
 * 모바일 코스 요약 바텀시트 카드 (Phase 3, US-C1)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { CourseSummary } from '../../types/route';
import { GradientButton } from '../common/GradientButton';
import { StatusBadge } from '../common/StatusBadge';

export interface CourseSummaryCardProps {
  summary: CourseSummary;
  onStart?: () => void;
}

export const CourseSummaryCard: React.FC<CourseSummaryCardProps> = ({ summary, onStart }) => {
  const slopeVariant = summary.maxSlopePercent > 8 ? 'warning' : 'green';

  return (
    <View style={styles.card}>
      <View style={styles.handle} />

      <View style={styles.statsRow}>
        <View style={styles.statGroup}>
          <Text style={styles.statNumber}>{summary.totalDistanceKm.toFixed(2)}</Text>
          <Text style={styles.statUnit}>km</Text>
          <Text style={[styles.statNumber, { marginLeft: 16 }]}>{summary.estimatedMinutes}</Text>
          <Text style={styles.statUnit}>분</Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        <StatusBadge variant={slopeVariant}>
          {`⛰ 최대 경사 ${summary.maxSlopePercent}%`}
        </StatusBadge>
        <StatusBadge>
          {`🌳 그늘 ${summary.shadeRatioPercent}%`}
        </StatusBadge>
      </View>

      <GradientButton fullWidth size="lg" onPress={onStart}>
        산책 시작 →
      </GradientButton>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.colors.surface,
    borderTopLeftRadius: TOKENS.borderRadius.card,
    borderTopRightRadius: TOKENS.borderRadius.card,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  statGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
  },
  statUnit: {
    fontSize: 13,
    color: TOKENS.colors.textMuted,
    marginLeft: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
});
