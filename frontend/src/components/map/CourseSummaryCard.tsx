import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { useAppTheme } from '../../theme/themeManager';
import { CourseSummary } from '../../types/route';
import { GradientButton } from '../common/GradientButton';
import { StatusBadge } from '../common/StatusBadge';
import { AppIcon } from '../common/AppIcon';

export interface CourseSummaryCardProps {
  summary: CourseSummary;
  onStart?: () => void;
}

export const CourseSummaryCard: React.FC<CourseSummaryCardProps> = ({ summary, onStart }) => {
  const { colors } = useAppTheme();
  const slopeVariant = summary.maxSlopePercent > 8 ? 'warning' : 'green';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={[styles.handle, { backgroundColor: colors.border }]} />

      <View style={styles.statsRow}>
        <View style={styles.statGroup}>
          <Text style={[styles.statNumber, { color: colors.textMain }]}>{summary.totalDistanceKm.toFixed(2)}</Text>
          <Text style={[styles.statUnit, { color: colors.textMuted }]}>km</Text>
          <Text style={[styles.statNumber, { color: colors.textMain, marginLeft: 16 }]}>{summary.estimatedMinutes}</Text>
          <Text style={[styles.statUnit, { color: colors.textMuted }]}>분</Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        <StatusBadge variant={slopeVariant}>
          <View style={styles.badgeContent}>
            <AppIcon
              name="mountain"
              size={13}
              color={slopeVariant === 'warning' ? colors.routeCaution : colors.primaryDark}
            />
            <Text
              style={[
                styles.badgeText,
                { color: slopeVariant === 'warning' ? colors.routeCaution : colors.primaryDark },
              ]}
            >
              최대 경사 {summary.maxSlopePercent}%
            </Text>
          </View>
        </StatusBadge>
        <StatusBadge>
          <View style={styles.badgeContent}>
            <AppIcon name="shade" size={13} color={colors.primaryDark} />
            <Text style={[styles.badgeText, { color: colors.primaryDark }]}>
              그늘 {summary.shadeRatioPercent}%
            </Text>
          </View>
        </StatusBadge>
      </View>

      {onStart && (
        <GradientButton fullWidth size="lg" onPress={onStart}>
          <View style={styles.startButtonContent}>
            <Text style={[styles.startButtonText, { color: colors.textWhite }]}>산책 시작</Text>
            <AppIcon name="chevronRight" size={18} color={colors.textWhite} />
          </View>
        </GradientButton>
      )}
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
  badgeContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 11, fontWeight: '600', color: TOKENS.colors.primaryDark },
  badgeWarningText: { color: TOKENS.colors.routeCaution },
  startButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  startButtonText: { color: TOKENS.colors.textWhite, fontSize: 15, fontWeight: '700' },
});
