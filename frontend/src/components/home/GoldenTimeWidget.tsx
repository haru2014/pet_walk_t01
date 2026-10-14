/**
 * [편안하개 - PetWalk]
 * 모바일 홈 골든타임 위젯 (Screen-01, US-B2, US-F1)
 *
 * 기상청 실시간 기온 및 지면열 추정 모델 연동
 * - 지면온도 안전(<=35℃) / 주의(35~45℃) / 위험(>45℃) 상태 반영
 * - 당일 계절/일사량 맞춤 골든타임 윈도우(1.5~2시간 슬롯) 동적 시각화
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HeatRiskLevel, HeatRiskResponse } from '../../types/weather';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from '../common/AppIcon';

export interface GoldenTimeWidgetProps {
  readonly weather?: HeatRiskResponse | null;
  readonly currentTimeLabel?: string;
  readonly startTimeLabel?: string;
  readonly endTimeLabel?: string;
  readonly progressPercent?: number;
  readonly statusNotice?: string;
}

const TIME_REGEX = /^\d{1,2}:\d{2}$/;

interface WindowRange {
  start: string;
  end: string;
  hasValidTimes: boolean;
}

function resolveRiskLevel(currentTemp: number, serverRiskLevel?: HeatRiskLevel): HeatRiskLevel {
  if (serverRiskLevel) return serverRiskLevel;
  if (currentTemp <= 35) return 'SAFE';
  if (currentTemp <= 45) return 'CAUTION';
  return 'DANGER';
}

function parseGoldenWindow(
  windowStr?: string,
  startProp?: string,
  endProp?: string
): WindowRange {
  let start = startProp;
  let end = endProp;

  if (!start || !end) {
    if (windowStr?.includes('~')) {
      const parts = windowStr.split('~').map((s) => s.trim().replace(/^내일\s*/, ''));
      start ??= parts[0] ?? '18:00';
      end ??= parts[1] ?? '20:00';
    } else {
      start ??= '18:00';
      end ??= '20:00';
    }
  }

  const hasValidTimes = TIME_REGEX.test(start.trim()) && TIME_REGEX.test(end.trim());
  return { start, end, hasValidTimes };
}

function calculateProgress(
  range: WindowRange,
  isTomorrow: boolean,
  currentHour: number,
  currentMin: number,
  overridePercent?: number
): { progress: number; isUpcoming: boolean; isPast: boolean } {
  if (overridePercent !== undefined) {
    return { progress: Math.max(0, Math.min(100, overridePercent)), isUpcoming: false, isPast: false };
  }
  if (isTomorrow || !range.hasValidTimes) {
    return { progress: 0, isUpcoming: isTomorrow, isPast: false };
  }

  const startH = Number.parseInt(range.start.split(':')[0], 10) || 18;
  const startM = Number.parseInt(range.start.split(':')[1], 10) || 0;
  const endH = Number.parseInt(range.end.split(':')[0], 10) || 20;
  const endM = Number.parseInt(range.end.split(':')[1], 10) || 0;

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const currentMinutes = currentHour * 60 + currentMin;
  const duration = Math.max(30, endMinutes - startMinutes);

  if (currentMinutes < startMinutes) {
    return { progress: 0, isUpcoming: true, isPast: false };
  }
  if (currentMinutes > endMinutes) {
    return { progress: 100, isUpcoming: false, isPast: true };
  }

  const progress = Math.max(0, Math.min(100, Math.round(((currentMinutes - startMinutes) / duration) * 100)));
  return { progress, isUpcoming: false, isPast: false };
}

interface ThemePalette {
  statusColor: string;
  statusBg: string;
  statusBorder: string;
  borderColor: string;
  progressColor: string;
}

function resolveThemePalette(
  riskLevel: HeatRiskLevel,
  colors: ReturnType<typeof useAppTheme>['colors']
): ThemePalette {
  if (riskLevel === 'DANGER') {
    return {
      statusColor: '#EF4444',
      statusBg: '#FEE2E2',
      statusBorder: '#FCA5A5',
      borderColor: '#FECACA',
      progressColor: '#EF4444',
    };
  }
  if (riskLevel === 'CAUTION') {
    return {
      statusColor: '#F59E0B',
      statusBg: '#FEF3C7',
      statusBorder: '#FCD34D',
      borderColor: '#FDE68A',
      progressColor: '#F59E0B',
    };
  }
  return {
    statusColor: colors.primaryDark,
    statusBg: colors.primaryLight,
    statusBorder: colors.primaryMint,
    borderColor: colors.border,
    progressColor: colors.primary,
  };
}

function formatSlotBadgeTitle(
  isTomorrow: boolean,
  isUpcoming: boolean,
  isPast: boolean,
  timeRangeDisplay: string
): string {
  if (isTomorrow || isUpcoming) {
    return `🕒 다음 추천 골든타임 (${timeRangeDisplay})`;
  }
  if (isPast) {
    return `오늘 골든타임 종료 (${timeRangeDisplay})`;
  }
  return `✨ 지금 안심 골든타임 (${timeRangeDisplay})`;
}

function buildNoticeMessages(
  riskLevel: HeatRiskLevel,
  currentTemp: number,
  startDisplay: string,
  nowLabel: string,
  customNotice?: string
): { subtitleText: string; badgeNotice: string } {
  if (riskLevel === 'DANGER') {
    return {
      subtitleText: `현재 지면열이 ${currentTemp.toFixed(1)}℃로 매우 뜨거워요. ${startDisplay} 이후 서늘한 산책을 추천해요.`,
      badgeNotice: customNotice ?? `현재 ${nowLabel} · 지면 ${currentTemp.toFixed(1)}℃ 고열 위험 · ${startDisplay} 권장`,
    };
  }
  if (riskLevel === 'CAUTION') {
    return {
      subtitleText: `현재 지면온도 ${currentTemp.toFixed(1)}℃로 다소 높아요. 아스팔트 대신 그늘길 산책을 권장해요.`,
      badgeNotice: customNotice ?? `현재 ${nowLabel} · 지면 ${currentTemp.toFixed(1)}℃ (그늘길 위주 20분 내 산책)`,
    };
  }
  return {
    subtitleText: `지면온도 ${currentTemp.toFixed(1)}℃로 발바닥이 편안하고 안전해요.`,
    badgeNotice: customNotice ?? `현재 ${nowLabel} · 지면 ${currentTemp.toFixed(1)}℃ (발바닥 안심 골든타임)`,
  };
}

export const GoldenTimeWidget: React.FC<GoldenTimeWidgetProps> = ({
  weather,
  currentTimeLabel,
  startTimeLabel,
  endTimeLabel,
  progressPercent,
  statusNotice,
}) => {
  const { colors } = useAppTheme();
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const nowLabel =
    currentTimeLabel ??
    `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

  const currentTemp = weather?.current_surface_temp ?? 24.5;
  const riskLevel = resolveRiskLevel(currentTemp, weather?.current_risk_level);
  const palette = resolveThemePalette(riskLevel, colors);

  const isTomorrow =
    weather?.golden_time_window_day === 'tomorrow' ||
    Boolean(weather?.golden_time_window?.startsWith('내일'));

  const range = parseGoldenWindow(weather?.golden_time_window, startTimeLabel, endTimeLabel);
  const { progress, isUpcoming, isPast } = calculateProgress(
    range,
    isTomorrow,
    currentHour,
    currentMin,
    progressPercent
  );

  const startDisplay = isTomorrow ? `내일 ${range.start}` : range.start;
  const timeRangeDisplay = isTomorrow ? `내일 ${range.start} ~ ${range.end}` : `${range.start} ~ ${range.end}`;

  const { subtitleText, badgeNotice } = buildNoticeMessages(
    riskLevel,
    currentTemp,
    startDisplay,
    nowLabel,
    statusNotice
  );

  const slotBadgeTitle = formatSlotBadgeTitle(isTomorrow, isUpcoming, isPast, timeRangeDisplay);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: palette.borderColor }]}>
      <View style={styles.headerRow}>
        <AppIcon name="sun" size={18} color={palette.statusColor} />
        <Text style={[styles.title, { color: colors.textMain }]}>산책하기 좋은 지면온도 시간</Text>
        {riskLevel === 'DANGER' && (
          <View style={[styles.liveBadge, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.liveBadgeText, { color: '#B91C1C' }]}>고열 주의</Text>
          </View>
        )}
        {riskLevel === 'CAUTION' && (
          <View style={[styles.liveBadge, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.liveBadgeText, { color: '#B45309' }]}>주의</Text>
          </View>
        )}
        {riskLevel === 'SAFE' && Boolean(weather?.isLiveServer) && (
          <View style={[styles.liveBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.liveBadgeText, { color: colors.primaryDark }]}>기상청 연동</Text>
          </View>
        )}
      </View>

      <Text style={[styles.subText, { color: riskLevel === 'DANGER' ? '#DC2626' : colors.textMuted }]}>
        {subtitleText}
      </Text>

      {/* 1.5~2시간 집중 추천 슬롯 헤더 */}
      <View style={styles.slotHeaderRow}>
        <Text style={[styles.slotBadgeText, { color: palette.statusColor }]}>
          {slotBadgeTitle}
        </Text>
      </View>

      {/* 게이지 타임라인 */}
      <View style={styles.timelineRow}>
        <Text style={[styles.timeLabel, isTomorrow && styles.timeLabelWide, { color: colors.textMuted }]}>
          {startDisplay}
        </Text>
        <View style={[styles.track, { backgroundColor: riskLevel === 'DANGER' ? '#FEE2E2' : colors.borderSubtle }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor: palette.progressColor,
              },
            ]}
          />
          <View
            style={[
              styles.indicator,
              {
                left: `${progress}%`,
                backgroundColor: palette.statusColor,
              },
            ]}
          >
            <View style={styles.indicatorDot} />
          </View>
        </View>
        <Text style={[styles.timeLabel, { textAlign: 'right', color: colors.textMuted }]}>{range.end}</Text>
      </View>

      <View style={styles.badgeContainer}>
        <View style={[styles.statusBadge, { backgroundColor: palette.statusBg, borderColor: palette.statusBorder }]}>
          <Text style={[styles.statusBadgeText, { color: palette.statusColor }]}>{badgeNotice}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  title: { fontSize: 13.5, fontWeight: '700' },
  liveBadge: { marginLeft: 'auto', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  liveBadgeText: { fontSize: 9, fontWeight: '800' },
  subText: { fontSize: 11, marginBottom: 6, paddingLeft: 24, lineHeight: 15 },
  slotHeaderRow: {
    paddingLeft: 24,
    marginBottom: 4,
  },
  slotBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  timeLabel: { fontSize: 10, fontWeight: '600', minWidth: 36 },
  timeLabelWide: { minWidth: 54 },
  track: { flex: 1, height: 6, borderRadius: 3, position: 'relative', justifyContent: 'center' },
  progressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  indicator: {
    position: 'absolute',
    top: '50%',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    transform: [{ translateX: -7 }, { translateY: -7 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
  badgeContainer: { alignItems: 'center' },
  statusBadge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
});
