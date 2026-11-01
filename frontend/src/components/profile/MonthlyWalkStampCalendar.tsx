import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/themeManager';
import { TOKENS, TYPOGRAPHY } from '../../theme/tokens';
import { WalkRecord } from '../../types/storage';
import { WeeklyWalkStats, WalkStatisticsService } from '../../services/walkStatisticsService';

const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];

export interface MonthlyWalkStampCalendarProps {
  readonly records: readonly WalkRecord[];
  readonly weeklyStats: WeeklyWalkStats;
  /** Stable reference date for the displayed month and deterministic tests. */
  readonly now?: Date;
}

export const MonthlyWalkStampCalendar: React.FC<MonthlyWalkStampCalendarProps> = ({
  records,
  weeklyStats,
  now,
}) => {
  const { colors } = useAppTheme();
  const [referenceDate] = useState(() => now ?? new Date());
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1),
  );
  const calendar = useMemo(
    () => WalkStatisticsService.getMonthlyWalkCalendar(
      records,
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      referenceDate,
    ),
    [records, visibleMonth, referenceDate],
  );

  const currentMonthIndex = referenceDate.getFullYear() * 12 + referenceDate.getMonth();
  const visibleMonthIndex = visibleMonth.getFullYear() * 12 + visibleMonth.getMonth();
  const canGoNext = visibleMonthIndex < currentMonthIndex;
  const cellCount = Math.ceil((calendar.firstDayOfWeek + calendar.daysInMonth) / 7) * 7;
  const cells: (typeof calendar.days[number] | null)[] = [
    ...Array.from({ length: calendar.firstDayOfWeek }, () => null),
    ...calendar.days,
    ...Array.from({ length: cellCount - calendar.firstDayOfWeek - calendar.daysInMonth }, () => null),
  ];

  const changeMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={[styles.title, { color: colors.textMain }]}>이번 달 산책 스탬프</Text>
          <Text style={[styles.monthLabel, { color: colors.textMuted }]}>{calendar.monthLabel}</Text>
        </View>
        <View style={styles.monthControls}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="이전 달"
            onPress={() => changeMonth(-1)}
            style={[styles.monthButton, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <AppIcon name="back" size={18} color={colors.textMain} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="다음 달"
            accessibilityState={{ disabled: !canGoNext }}
            disabled={!canGoNext}
            onPress={() => changeMonth(1)}
            style={[
              styles.monthButton,
              { backgroundColor: colors.background, borderColor: colors.border },
              !canGoNext && styles.disabledMonthButton,
            ]}
          >
            <AppIcon name="chevronRight" size={18} color={canGoNext ? colors.textMain : colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.weekdayRow, { backgroundColor: colors.primaryLight }]}>
        {WEEKDAY_HEADERS.map((weekday, index) => (
          <View key={weekday} style={styles.weekdayCell}>
            <Text style={[styles.weekdayText, { color: index === 0 || index === 6 ? colors.primaryDark : colors.textMuted }]}>
              {weekday}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.calendarGrid, { borderColor: colors.borderSoft }]}>
        {Array.from({ length: cellCount / 7 }, (_, weekIndex) => (
          <View key={weekIndex} style={[styles.weekRow, { borderBottomColor: colors.borderSoft }]}>
            {cells.slice(weekIndex * 7, weekIndex * 7 + 7).map((day, dayIndex) => (
              <View
                key={day?.dateStr ?? `empty-${weekIndex}-${dayIndex}`}
                style={[
                  styles.dayCell,
                  day?.isToday && { backgroundColor: colors.primaryWash, borderColor: colors.primary },
                ]}
                accessibilityLabel={day
                  ? `${calendar.monthLabel} ${day.day}일${day.hasWalked ? ` 산책 완료 ${day.walkCount}회` : day.isFuture ? ' 예정' : ' 산책 기록 없음'}`
                  : undefined}
              >
                {day ? (
                  <>
                    <Text style={[
                      styles.dayNumber,
                      { color: day.isFuture ? colors.textMuted : colors.textMain },
                      day.isFuture && styles.futureDayNumber,
                      day.isToday && { color: colors.primaryDark, fontWeight: '800' },
                    ]}>
                      {day.day}
                    </Text>
                    <View style={styles.stampSlot}>
                      {day.hasWalked ? (
                        <AppIcon name="paw" size={17} color={colors.primaryDark} />
                      ) : null}
                    </View>
                  </>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <View style={[styles.monthCountBadge, { backgroundColor: colors.primaryLight }]}>
          <AppIcon name="paw" size={17} color={colors.primaryDark} />
          <Text style={[styles.monthCountText, { color: colors.primaryDark }]}>
            이번 달 {calendar.completedDays}일 산책 완료
          </Text>
        </View>
        {calendar.completedDays === 0 && (
          <Text style={[styles.emptyMessage, { color: colors.textMuted }]}>이 달에는 아직 산책 기록이 없어요.</Text>
        )}
        <View style={[styles.weekSummary, { borderTopColor: colors.borderSoft }]}>
          <Text style={[styles.weekSummaryLabel, { color: colors.textMuted }]}>이번 주</Text>
          <Text style={[styles.weekSummaryText, { color: colors.textMain }]}>
            {weeklyStats.completedDays}/{weeklyStats.targetDays}일 달성 · 산책 {weeklyStats.totalWalks}회
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: TOKENS.borderRadius.card,
    padding: 14,
    marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  titleGroup: { flex: 1, gap: 2 },
  title: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '800' },
  monthLabel: { fontSize: TYPOGRAPHY.support, fontWeight: '600' },
  monthControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthButton: { width: 34, height: 34, borderWidth: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  disabledMonthButton: { opacity: 0.45 },
  weekdayRow: { flexDirection: 'row', borderRadius: TOKENS.borderRadius.button, marginBottom: 3 },
  weekdayCell: { flex: 1, height: 30, alignItems: 'center', justifyContent: 'center' },
  weekdayText: { fontSize: TYPOGRAPHY.caption, fontWeight: '800' },
  calendarGrid: { borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth },
  weekRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  dayCell: {
    flex: 1,
    minWidth: 0,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    borderRadius: 8,
  },
  dayNumber: { fontSize: TYPOGRAPHY.support, fontWeight: '600', lineHeight: 19 },
  futureDayNumber: { opacity: 0.45 },
  stampSlot: { height: 16, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingTop: 10, gap: 8 },
  monthCountBadge: { minHeight: 36, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', borderRadius: TOKENS.borderRadius.badge, paddingHorizontal: 12, gap: 6 },
  monthCountText: { fontSize: TYPOGRAPHY.support, fontWeight: '800' },
  emptyMessage: { fontSize: TYPOGRAPHY.caption },
  weekSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  weekSummaryLabel: { fontSize: TYPOGRAPHY.caption, fontWeight: '700' },
  weekSummaryText: { fontSize: TYPOGRAPHY.caption, fontWeight: '700' },
});
