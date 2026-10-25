import { TYPOGRAPHY } from '../../theme/tokens';
/**
 * [편안하개 - PetWalk]
 * 이번 주 산책 달성도 7일 발자국 스탬프 위젯 (WeeklyWalkStampCard.tsx)
 * (시안: error/1021-산책달성도1.png)
 *
 * 1. 상단 좌측: dog-icon1.png 강아지 마스코트 + '이번 주 산책 달성도' 타이틀
 * 2. 상단 우측: 'N/7일 완료' 라운드 뱃지
 * 3. 중앙: 월~일 7일 발자국 스탬프 (달성 시 녹색 도장, 미달성 시 연한 그레이블루)
 * 4. 오늘 요일 하이라이트 (파란색 글자 + 하단 인디케이터 점)
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { AppText as Text } from '../common/AppText';
import Svg, { Circle, Path } from 'react-native-svg';
import { WeeklyWalkStats, DailyWalkStat } from '../../services/walkStatisticsService';
import { useAppTheme } from '../../theme/themeManager';
import dogIconImg from '../../../assets/dog-icon1.png';

export interface WeeklyWalkStampCardProps {
  weeklyStats: WeeklyWalkStats | null;
  onPress?: () => void;
}

const DEFAULT_DAYS: DailyWalkStat[] = [
  { dayLabel: '월', dateStr: '', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
  { dayLabel: '화', dateStr: '', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
  { dayLabel: '수', dateStr: '', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
  { dayLabel: '목', dateStr: '', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
  { dayLabel: '금', dateStr: '', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
  { dayLabel: '토', dateStr: '', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: false },
  { dayLabel: '일', dateStr: '', distanceKm: 0, durationMinutes: 0, walkCount: 0, targetCount: 1, achievementRatePercent: 0, hasWalked: false, isToday: true },
];

/**
 * 발자국 스탬프 SVG 아이콘
 */
const PawStampIcon: React.FC<{ size?: number; color: string }> = ({ size = 32, color }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Circle cx="5.2" cy="8.2" r="2.1" />
    <Circle cx="9.6" cy="4.8" r="2.2" />
    <Circle cx="14.4" cy="4.8" r="2.2" />
    <Circle cx="18.8" cy="8.2" r="2.1" />
    <Path d="M12 9.8 C8.2 9.8 5.8 12.2 5.8 15.4 C5.8 18.2 7.8 19.8 12 19.8 C16.2 19.8 18.2 18.2 18.2 15.4 C18.2 12.2 15.8 9.8 12 9.8 Z" />
  </Svg>
);

export const WeeklyWalkStampCard: React.FC<WeeklyWalkStampCardProps> = ({
  weeklyStats,
  onPress,
}) => {
  const { theme, colors } = useAppTheme();
  const isDark = theme === 'dark';
  const dailyStats = weeklyStats?.dailyStats?.length === 7 ? weeklyStats.dailyStats : DEFAULT_DAYS;
  const completedDaysCount = dailyStats.filter((d) => d.hasWalked).length;

  const inactiveStampColor = isDark ? 'rgba(255, 255, 255, 0.18)' : '#DCE4EC';
  const activeStampColor = colors.primary;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[
        styles.cardContainer,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`이번 주 산책 달성도, 7일 중 ${completedDaysCount}일 완료`}
    >
      {/* 1. 상단 헤더: 강아지 아이콘 + 타이틀 & 완료 뱃지 */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={[styles.avatarWrap, { backgroundColor: isDark ? 'rgba(90, 115, 97, 0.25)' : '#E8F5E9' }]}>
            <Image source={dogIconImg} style={styles.avatarImg} resizeMode="contain" />
          </View>
          <Text style={[styles.cardTitle, { color: colors.textMain }]}>이번 주 산책 달성도</Text>
        </View>

        <View
          style={[
            styles.badgeWrap,
            { backgroundColor: colors.primaryWash },
          ]}
        >
          <Text style={[styles.badgeText, { color: colors.primaryDark }]}>
            {completedDaysCount}/7일 완료
          </Text>
        </View>
      </View>

      {/* 2. 월~일 7일 발자국 스탬프 행 */}
      <View style={styles.stampRow}>
        {dailyStats.map((day) => {
          const isDone = day.hasWalked;
          const isToday = day.isToday;

          return (
            <View key={day.dayLabel} style={styles.stampCol}>
              {/* 발자국 스탬프 */}
              <View style={styles.pawIconWrap}>
                <PawStampIcon
                  size={32}
                  color={isDone ? activeStampColor : inactiveStampColor}
                />
              </View>

              {/* 요일 라벨 및 오늘 인디케이터 점 */}
              <Text
                style={[
                  styles.dayText,
                  {
                    color: isToday
                      ? (isDark ? '#60A5FA' : '#2563EB')
                      : colors.textMuted,
                    fontWeight: isToday ? '800' : '600',
                  },
                ]}
              >
                {day.dayLabel}
              </Text>
              {isToday ? (
                <View style={[styles.todayDot, { backgroundColor: isDark ? '#60A5FA' : '#2563EB' }]} />
              ) : (
                <View style={styles.dotPlaceholder} />
              )}
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FDFAF4',
    borderRadius: 18,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#EFE7D6',
    shadowColor: '#5A7361',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 32,
    height: 32,
  },
  cardTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  badgeWrap: {
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  stampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  stampCol: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
  },
  pawIconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dayText: {
    fontSize: TYPOGRAPHY.label,
    marginBottom: 2,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotPlaceholder: {
    width: 4,
    height: 4,
  },
});
