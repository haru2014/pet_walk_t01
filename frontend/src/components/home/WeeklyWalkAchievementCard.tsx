import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { CardWrapper } from '../common/CardWrapper';
import { ThemeColors, TYPOGRAPHY } from '../../theme/tokens';

export interface WeeklyWalkAchievementCardProps {
  walkCount: number;
  colors: ThemeColors;
  weeklyGoal?: number;
}

export const WeeklyWalkAchievementCard: React.FC<WeeklyWalkAchievementCardProps> = ({
  walkCount,
  colors,
  weeklyGoal = 3,
}) => {
  const isComplete = weeklyGoal > 0 && walkCount >= weeklyGoal;
  const progressPercent = Math.min(Math.max(walkCount / Math.max(weeklyGoal, 1), 0), 1) * 100;

  return (
    <CardWrapper variant="flat" style={styles.card}>
      <View style={styles.row}>
        <View>
          <Text style={[styles.title, { color: colors.textMain }]}>이번 주 산책</Text>
          <Text style={[styles.progress, { color: colors.textMuted }]}>{walkCount}/{weeklyGoal}회 달성</Text>
        </View>
        <View
          style={[
            styles.badge,
            isComplete
              ? { backgroundColor: colors.primaryWash }
              : { backgroundColor: colors.background },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              isComplete
                ? { color: colors.primaryDark }
                : { color: colors.textMuted },
            ]}
          >
            {isComplete ? '달성 완료' : '진행 중'}
          </Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: colors.borderSoft }]}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${progressPercent}%`,
              backgroundColor: colors.primary,
            },
          ]}
        />
      </View>
    </CardWrapper>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 0, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '700' },
  progress: { marginTop: 4, fontSize: TYPOGRAPHY.label },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '700' },
  track: { height: 6, marginTop: 12, overflow: 'hidden', borderRadius: 3 },
  progressBar: { height: '100%', borderRadius: 3 },
});
