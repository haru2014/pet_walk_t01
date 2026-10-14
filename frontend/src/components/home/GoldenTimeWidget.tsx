/**
 * [편안하개 - PetWalk]
 * 모바일 홈 골든타임 위젯 (Screen-01, US-B2, US-F1)
 *
 * 기상청 실시간 기온 및 지면열 추정 모델 연동
 * - 지면온도 안전(<=35℃) / 주의(35~45℃) / 위험(>45℃) 상태 반영
 * - 당일 계절/일사량 맞춤 골든타임 윈도우 동적 시각화
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HeatRiskResponse } from '../../types/weather';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from '../common/AppIcon';

export interface GoldenTimeWidgetProps {
  weather?: HeatRiskResponse | null;
  currentTimeLabel?: string;
  startTimeLabel?: string;
  endTimeLabel?: string;
  progressPercent?: number;
  statusNotice?: string;
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
  const currentMin = String(now.getMinutes()).padStart(2, '0');
  const nowLabel = currentTimeLabel ?? `${currentHour}:${currentMin}`;

  // 날씨 데이터가 있는 경우 실시간 계산치 적용
  let start = startTimeLabel ?? '14:00';
  let end = endTimeLabel ?? '17:00';
  let progress = progressPercent ?? 50;
  let notice = statusNotice ?? `현재 ${nowLabel} · 산책 추천 골든타임`;
  let surfaceTemp = 24.5;
  let isSafe = true;

  if (weather) {
    surfaceTemp = weather.current_surface_temp;
    isSafe = weather.current_risk_level === 'SAFE';

    // 골든타임 윈도우 파싱 (예: "16:00 ~ 19:00")
    if (weather.golden_time_window.includes('~')) {
      const parts = weather.golden_time_window.split('~').map((s) => s.trim());
      start = parts[0] || '14:00';
      end = parts[1] || '17:00';
    }

    const startH = Number.parseInt(start.split(':')[0], 10) || 14;
    const endH = Number.parseInt(end.split(':')[0], 10) || 17;
    const duration = Math.max(1, endH - startH);
    const elapsed = Math.max(0, Math.min(duration, currentHour + now.getMinutes() / 60 - startH));
    progress = Math.round((elapsed / duration) * 100);

    if (weather.is_current_golden) {
      notice = `현재 ${nowLabel} · 지면 ${surfaceTemp.toFixed(1)}℃ (발바닥 안심 골든타임)`;
    } else if (weather.current_risk_level === 'CAUTION') {
      notice = `현재 지면 ${surfaceTemp.toFixed(1)}℃ 다소 높음 · 그늘길 위주 권장`;
    } else {
      notice = `지면 ${surfaceTemp.toFixed(1)}℃ 고열 위험 · ${weather.golden_time_window} 권장`;
    }
  }

  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <AppIcon name="sun" size={18} color={isSafe ? colors.primaryDark : '#F59E0B'} />
        <Text style={[styles.title, { color: colors.textMain }]}>산책하기 좋은 지면온도 시간</Text>
        {weather?.isLiveServer && (
          <View style={[styles.liveBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.liveBadgeText, { color: colors.primaryDark }]}>기상청 연동</Text>
          </View>
        )}
      </View>

      <Text style={[styles.subText, { color: colors.textMuted }]}>
        {isSafe
          ? `지면온도 ${surfaceTemp.toFixed(1)}℃로 발바닥이 편안하고 안전해요.`
          : `현재 지면열이 있어 ${start} 이후 서늘한 산책을 권장해요.`}
      </Text>

      {/* 게이지 타임라인 */}
      <View style={styles.timelineRow}>
        <Text style={[styles.timeLabel, { color: colors.textMuted }]}>{start}</Text>
        <View style={[styles.track, { backgroundColor: colors.borderSubtle }]}>
          <View style={[styles.progressFill, { width: `${clampedProgress}%`, backgroundColor: colors.primary }]} />
          <View style={[styles.indicator, { left: `${clampedProgress}%`, backgroundColor: colors.primaryDark }]}>
            <View style={styles.indicatorDot} />
          </View>
        </View>
        <Text style={[styles.timeLabel, { textAlign: 'right', color: colors.textMuted }]}>{end}</Text>
      </View>

      <View style={styles.badgeContainer}>
        <View style={[styles.statusBadge, { backgroundColor: colors.primaryLight, borderColor: colors.primaryMint }]}>
          <Text style={[styles.statusBadgeText, { color: colors.primaryDark }]}>{notice}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  title: { fontSize: 14, fontWeight: '700' },
  liveBadge: { marginLeft: 'auto', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  liveBadgeText: { fontSize: 9, fontWeight: '800' },
  subText: { fontSize: 11, marginBottom: 10, paddingLeft: 24 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  timeLabel: { fontSize: 10, fontWeight: '600', width: 36 },
  track: { flex: 1, height: 6, borderRadius: 3, position: 'relative', justifyContent: 'center' },
  progressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  indicator: { position: 'absolute', top: '50%', width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF', transform: [{ translateX: -7 }, { translateY: -7 }], alignItems: 'center', justifyContent: 'center' },
  indicatorDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
  badgeContainer: { alignItems: 'center' },
  statusBadge: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 14 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
});
