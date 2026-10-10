/**
 * [편안하개 - PetWalk]
 * 모바일 홈 골든타임 위젯 (Screen-01, US-B2)
 *
 * 지면온도 안전 시간대 (14:00 ~ 17:00) 시각화 게이지
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../../theme/tokens';

export interface GoldenTimeWidgetProps {
  currentTimeLabel?: string;
  startTimeLabel?: string;
  endTimeLabel?: string;
  progressPercent?: number; // 0 ~ 100
  statusNotice?: string;
}

export const GoldenTimeWidget: React.FC<GoldenTimeWidgetProps> = ({
  currentTimeLabel = '15:30',
  startTimeLabel = '14:00',
  endTimeLabel = '17:00',
  progressPercent = 52,
  statusNotice = '현재 15:30 · 산책 추천 시간대',
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progressPercent));

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.icon}>🌤️</Text>
        <Text style={styles.title}>산책하기 좋은 시간</Text>
      </View>
      <Text style={styles.subText}>지금은 지면 온도가 적절하고 편안한 시간이에요.</Text>

      {/* 게이지 타임라인 */}
      <View style={styles.timelineRow}>
        <Text style={styles.timeLabel}>{startTimeLabel}</Text>
        <View style={styles.track}>
          <View style={[styles.progressFill, { width: `${clampedProgress}%` }]} />
          <View style={[styles.indicator, { left: `${clampedProgress}%` }]}>
            <View style={styles.indicatorDot} />
          </View>
        </View>
        <Text style={[styles.timeLabel, { textAlign: 'right' }]}>{endTimeLabel}</Text>
      </View>

      <View style={styles.badgeContainer}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{statusNotice}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    padding: 18,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  icon: {
    fontSize: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  subText: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    marginBottom: 16,
    paddingLeft: 24,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  timeLabel: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    fontWeight: '500',
    width: 38,
  },
  track: {
    flex: 1,
    height: 8,
    backgroundColor: TOKENS.colors.borderSubtle,
    borderRadius: 4,
    position: 'relative',
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: TOKENS.colors.primary,
    borderRadius: 4,
  },
  indicator: {
    position: 'absolute',
    top: '50%',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: TOKENS.colors.primaryDark,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ translateX: -8 }, { translateY: -8 }],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  indicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  badgeContainer: {
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderWidth: 1,
    borderColor: TOKENS.colors.primaryMint,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
});
