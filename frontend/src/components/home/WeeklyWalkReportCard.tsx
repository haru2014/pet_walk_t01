/**
 * [편안하개 - PetWalk]
 * 마이페이지 활동 탭 주간 산책 달성도 & 관절 케어 리포트 카드
 *
 * 1. 주간 산책일 달성 프로그레스 바 (예: 주 7일 중 3일 산책, 43%)
 * 2. 3대 보행 헬스케어 지표 (누적 거리, 총 소요 시간, 완만 노면율)
 * 3. 매일 목표 대비 달성도 막대그래프 (Daily Goal Bar Chart)
 * 4. 관절 안심 케어 피드백 & 산책 통계 화면 원터치 이동
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from '../common/AppIcon';
import { WeeklyWalkStats } from '../../services/walkStatisticsService';

export interface RecentWalkInfo {
  title?: string;
  distanceKm?: number;
  durationMinutes?: number;
  safeRatioPercent?: number;
}

export interface WeeklyWalkReportCardProps {
  stats: WeeklyWalkStats;
  onPress?: () => void;
  recentWalk?: RecentWalkInfo | null;
  onPressRecent?: () => void;
  style?: ViewStyle;
}

export const WeeklyWalkReportCard: React.FC<WeeklyWalkReportCardProps> = ({
  stats,
  onPress,
  recentWalk,
  onPressRecent,
  style,
}) => {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {/* 1. 카드 헤더 & 주간 목표 뱃지 */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
            <AppIcon name="sparkle" size={14} color={colors.primaryDark} />
          </View>
          <View>
            <View style={styles.titleWithArrow}>
              <Text style={[styles.cardTitle, { color: colors.textMain }]}>이번 주 산책 달성도</Text>
              <AppIcon name="chevronRight" size={14} color={colors.textMuted} />
            </View>
            <Text style={[styles.rangeSubtitle, { color: colors.textMuted }]}>
              {stats.weekRangeLabel} · 터치 시 통계 상세
            </Text>
          </View>
        </View>

        {/* 주간 목표 달성 뱃지 */}
        <View
          style={[
            styles.badge,
            {
              backgroundColor:
                stats.completedDays >= stats.targetDays ? colors.primaryLight : colors.background,
              borderColor:
                stats.completedDays >= stats.targetDays ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              {
                color:
                  stats.completedDays >= stats.targetDays ? colors.primaryDark : colors.textMuted,
              },
            ]}
          >
            {stats.completedDays}/{stats.targetDays}일 완료 ({stats.completionRatePercent}%)
          </Text>
        </View>
      </View>

      {/* 2. 주간 목표 프로그레스 바 (Progress Bar) */}
      <View style={styles.progressBarSection}>
        <View style={[styles.progressBarTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(100, Math.max(0, stats.completionRatePercent))}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>
      </View>

      {/* 3. 3대 지표 요약 박스 (누적 거리, 소요 시간, 완만 노면율) */}
      <View style={[styles.metricsContainer, { backgroundColor: colors.background }]}>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>누적 거리</Text>
          <Text style={[styles.metricValue, { color: colors.textMain }]}>
            {stats.totalDistanceKm} <Text style={styles.metricUnit}>km</Text>
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>산책 시간</Text>
          <Text style={[styles.metricValue, { color: colors.textMain }]}>
            {stats.totalDurationMinutes} <Text style={styles.metricUnit}>분</Text>
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>완만 노면</Text>
          <Text style={[styles.metricValue, { color: colors.primaryDark }]}>
            {stats.safeSurfaceRatioPercent} <Text style={styles.metricUnit}>%</Text>
          </Text>
        </View>
      </View>

      {/* 4. 매일 목표 대비 달성도 막대그래프 (Daily Goal Bar Chart) */}
      <View style={styles.chartSection}>
        <View style={styles.chartHeaderRow}>
          <Text style={[styles.chartHeaderTitle, { color: colors.textMuted }]}>
            요일별 일일 목표(1회) 달성도
          </Text>
          <Text style={[styles.chartHeaderGoal, { color: colors.primaryDark }]}>
            목표: 매일 1회 이상
          </Text>
        </View>
        <View style={styles.barsRow}>
          {stats.dailyStats.map((item) => {
            const fillPercent = Math.min(100, item.achievementRatePercent);
            const isCompleted = item.walkCount >= item.targetCount;

            return (
              <View key={item.dateStr} style={styles.barCol}>
                {/* 상단: 완주 수치 라벨 */}
                <Text
                  style={[
                    styles.barTopLabel,
                    isCompleted
                      ? { color: colors.primaryDark, fontWeight: '700' }
                      : { color: colors.textMuted },
                  ]}
                >
                  {item.walkCount > 0 ? `${item.walkCount}회` : '-'}
                </Text>

                {/* 중앙: 세로 막대그래프 트랙 & 채움 바 */}
                <View
                  style={[
                    styles.barTrack,
                    item.isToday && styles.barTrackToday,
                    {
                      backgroundColor: colors.background,
                      borderColor: item.isToday ? colors.primary : colors.border,
                    },
                  ]}
                >
                  {/* 목표선 (트랙 상단 100% 점선 가이드) */}
                  <View style={styles.goalTargetLine} />

                  {/* 실제 달성도 게이지 */}
                  {fillPercent > 0 && (
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${fillPercent}%`,
                          backgroundColor:
                            item.walkCount > item.targetCount
                              ? '#059669' // 초과 달성: 진한 에메랄드
                              : colors.primary,
                        },
                      ]}
                    >
                      {isCompleted && (
                        <Text style={styles.barPawIcon}>🐾</Text>
                      )}
                    </View>
                  )}
                </View>

                {/* 하단: 요일 라벨 및 오늘 인디케이터 */}
                <View style={styles.dayLabelWrap}>
                  <Text
                    style={[
                      styles.dayLabel,
                      item.isToday
                        ? { color: colors.primaryDark, fontWeight: '800' }
                        : { color: colors.textMuted },
                    ]}
                  >
                    {item.dayLabel}
                  </Text>
                  {item.isToday && <View style={[styles.todayIndicatorDot, { backgroundColor: colors.primary }]} />}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* 5. 직전 완주 산책 인라인 푸터 (Zero-Scroll 통합 규격) */}
      {recentWalk && (
        <View style={[styles.recentWalkRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.recentWalkLeft}>
            <Text style={styles.recentPawIcon}>🐾</Text>
            <Text style={[styles.recentWalkTitle, { color: colors.textMain }]} numberOfLines={1}>
              {recentWalk.title}
            </Text>
            <Text style={[styles.recentWalkMeta, { color: colors.textMuted }]}>
              {recentWalk.distanceKm}km · {recentWalk.durationMinutes}분 · 완만 {recentWalk.safeRatioPercent}%
            </Text>
          </View>
          <View style={styles.recentWalkRight}>
            <Text style={[styles.recentWalkLinkText, { color: colors.primaryDark }]}>상세</Text>
            <AppIcon name="chevronRight" size={11} color={colors.primaryDark} />
          </View>
        </View>
      )}

      {/* 6. 관절 안심 케어 한줄 브리핑 */}
      <View style={[styles.jointNoticeBox, { backgroundColor: colors.primaryLight }]}>
        <Text style={[styles.jointNoticeText, { color: colors.primaryDark }]} numberOfLines={1}>
          💡 {stats.jointCareMessage}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWithArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rangeSubtitle: {
    fontSize: 10,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarSection: {
    marginBottom: 8,
  },
  progressBarTrack: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  metricsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 1,
  },
  metricValue: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  metricUnit: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 22,
  },
  chartSection: {
    marginBottom: 8,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    paddingHorizontal: 2,
  },
  chartHeaderTitle: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  chartHeaderGoal: {
    fontSize: 10,
    fontWeight: '700',
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 2,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
  },
  barTopLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    minHeight: 12,
  },
  barTrack: {
    width: 22,
    height: 40,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  barTrackToday: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
  },
  goalTargetLine: {
    position: 'absolute',
    top: 4,
    left: 2,
    right: 2,
    height: 1,
    backgroundColor: '#CBD5E1',
    zIndex: 1,
  },
  barFill: {
    width: '100%',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  barPawIcon: {
    fontSize: 8,
  },
  dayLabelWrap: {
    alignItems: 'center',
    gap: 2,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  todayIndicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  jointNoticeBox: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  jointNoticeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  recentWalkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    marginBottom: 5,
  },
  recentWalkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  recentPawIcon: {
    fontSize: 10.5,
  },
  recentWalkTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  recentWalkMeta: {
    fontSize: 10,
    fontWeight: '500',
  },
  recentWalkRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 6,
  },
  recentWalkLinkText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
});
