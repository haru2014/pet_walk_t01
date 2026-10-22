import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CardWrapper } from '../common/CardWrapper';
import { AppTheme } from '../../types/appTheme';
import { TOKENS } from '../../theme/tokens';

export interface WeeklyWalkAchievementCardProps {
  walkCount: number;
  theme: AppTheme;
  weeklyGoal?: number;
}

export const WeeklyWalkAchievementCard: React.FC<WeeklyWalkAchievementCardProps> = ({
  walkCount,
  theme,
  weeklyGoal = 3,
}) => {
  const isComplete = walkCount >= weeklyGoal;

  return (
    <CardWrapper variant="flat" style={styles.card}>
      <View style={styles.row}>
        <View>
          <Text style={styles.title}>이번 주 산책</Text>
          <Text style={styles.progress}>{walkCount}/{weeklyGoal}회 달성</Text>
        </View>
        <View
          style={[
            styles.badge,
            isComplete
              ? { backgroundColor: theme.primaryWash }
              : styles.badgeIncomplete,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              isComplete
                ? { color: theme.primaryDark }
                : styles.badgeTextIncomplete,
            ]}
          >
            {isComplete ? '달성 완료' : '진행 중'}
          </Text>
        </View>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${Math.min(Math.max(walkCount / weeklyGoal, 0), 1) * 100}%`,
              backgroundColor: theme.primary,
            },
          ]}
        />
      </View>
    </CardWrapper>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain },
  progress: { marginTop: 4, fontSize: 12, color: TOKENS.colors.textMuted },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  badgeIncomplete: { backgroundColor: TOKENS.colors.background },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextIncomplete: { color: TOKENS.colors.textMuted },
  track: { height: 6, marginTop: 12, overflow: 'hidden', borderRadius: 3, backgroundColor: TOKENS.colors.borderSoft },
  progressBar: { height: '100%', borderRadius: 3 },
});
