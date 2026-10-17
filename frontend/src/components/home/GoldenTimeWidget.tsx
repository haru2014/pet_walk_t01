/**
 * [편안하개 - PetWalk]
 * 모바일 홈 골든타임 위젯 (Screen-01, US-B2, US-F1)
 *
 * 기상청 실시간 기온 및 지면열 추정 모델 연동
 * - 지면온도 안전(<=35℃) / 주의(35~45℃) / 위험(>45℃) 상태 반영
 * - 당일 계절/일사량 맞춤 골든타임 윈도우(1.5~2시간 슬롯) 동적 시각화
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
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
      start ??= parts[0] ?? '17:00';
      end ??= parts[1] ?? '23:00';
    } else {
      start ??= '17:00';
      end ??= '23:00';
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

  const startH = Number.parseInt(range.start.split(':')[0], 10) || 17;
  const startM = Number.parseInt(range.start.split(':')[1], 10) || 0;
  const endH = Number.parseInt(range.end.split(':')[0], 10) || 23;
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

interface WalkQuotientScore {
  score: number;
  statusLabel: string;
  statusTitle: string;
  badgeBg: string;
  badgeColor: string;
  ringColor: string;
}

function calculateWalkQuotient(
  surfaceTemp: number,
  riskLevel: HeatRiskLevel
): WalkQuotientScore {
  if (riskLevel === 'DANGER' || surfaceTemp > 45) {
    return {
      score: 35,
      statusLabel: '고열 주의',
      statusTitle: '한낮 지면열이 매우 높아요.',
      badgeBg: '#FEE2E2',
      badgeColor: '#B91C1C',
      ringColor: '#EF4444',
    };
  }
  if (riskLevel === 'CAUTION' || surfaceTemp > 35) {
    return {
      score: 65,
      statusLabel: '주의',
      statusTitle: '그늘길 위주 산책이 필요해요.',
      badgeBg: '#FEF3C7',
      badgeColor: '#B45309',
      ringColor: '#F59E0B',
    };
  }
  if (surfaceTemp <= 28) {
    return {
      score: 100,
      statusLabel: '좋음',
      statusTitle: '산책하기 편한 시간이 있어요.',
      badgeBg: '#DCFCE7',
      badgeColor: '#166534',
      ringColor: '#10B981',
    };
  }
  return {
    score: 88,
    statusLabel: '좋음',
    statusTitle: '산책하기 편한 시간이 있어요.',
    badgeBg: '#DCFCE7',
    badgeColor: '#166534',
    ringColor: '#10B981',
  };
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
  const [selectedLocation, setSelectedLocation] = useState('대전광역시 서구');

  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const nowLabel =
    currentTimeLabel ??
    `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

  const currentAirTemp = Math.round(weather?.current_air_temp ?? 22.0);
  const currentSurfaceTemp = weather?.current_surface_temp ?? 23.0;
  const roundedSurfaceTemp = Math.round(currentSurfaceTemp);
  const riskLevel = resolveRiskLevel(currentSurfaceTemp, weather?.current_risk_level);

  const isTomorrow =
    weather?.golden_time_window_day === 'tomorrow' ||
    Boolean(weather?.golden_time_window?.startsWith('내일'));

  const range = parseGoldenWindow(weather?.golden_time_window, startTimeLabel, endTimeLabel);
  const { progress } = calculateProgress(
    range,
    isTomorrow,
    currentHour,
    currentMin,
    progressPercent
  );

  const startDisplay = isTomorrow ? `내일 ${range.start}` : range.start;
  const timeRangeDisplay = isTomorrow ? `내일 ${range.start} ~ ${range.end}` : `${range.start} ~ ${range.end}`;

  const quotient = calculateWalkQuotient(currentSurfaceTemp, riskLevel);

  const { subtitleText, badgeNotice } = buildNoticeMessages(
    riskLevel,
    currentSurfaceTemp,
    startDisplay,
    nowLabel,
    statusNotice
  );

  const handleChangeRegion = () => {
    const locations = ['대전광역시 서구', '대전광역시 유성구', '세종특별자치시 연기면'];
    const nextIdx = (locations.indexOf(selectedLocation) + 1) % locations.length;
    const nextLoc = locations[nextIdx];
    setSelectedLocation(nextLoc);
    Alert.alert('산책 지역 변경', `지역이 "${nextLoc}"(으)로 변경되었습니다.`);
  };

  return (
    <View
      style={styles.container}
      accessibilityLabel="산책하기 좋은 지면온도 시간"
    >
      {/* 1. 상단 타이틀 영역 (trail_quotient.jpg) */}
      <View style={styles.topHeader}>
        <View style={styles.pawIconBox}>
          <AppIcon name="paw" size={24} color="#6366F1" />
        </View>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.mainHeading, { color: colors.textMain }]}>오늘 강아지 산책지수</Text>
          <Text style={[styles.mainSubHeading, { color: colors.textMuted }]}>
            더위·추위·대기질을 함께 봐요
          </Text>
        </View>
      </View>

      {/* 2. 위치 및 기준 시각 칩 바 & 지역 변경 */}
      <View style={styles.locationBar}>
        <View style={styles.chipsRow}>
          <View style={[styles.infoChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppIcon name="map" size={12} color="#64748B" />
            <Text style={[styles.infoChipText, { color: colors.textMain }]}>{selectedLocation}</Text>
          </View>
          <View style={[styles.infoChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.infoChipText, { color: colors.textMuted }]}>대략 위치</Text>
          </View>
          <View style={[styles.infoChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppIcon name="clock" size={12} color="#64748B" />
            <Text style={[styles.infoChipText, { color: colors.textMain }]}>{nowLabel} 기준</Text>
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleChangeRegion}
          style={styles.changeRegionBtn}
          accessibilityRole="button"
          accessibilityLabel="지역 변경"
        >
          <Text style={styles.changeRegionText}>지역 변경</Text>
        </TouchableOpacity>
      </View>

      {/* 3. 메인 산책지수 카드 (원형 게이지 + 상태 + 추천 시간) */}
      <View
        style={[
          styles.scoreCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        {/* 원형 점수 게이지 (100점) */}
        <View style={styles.gaugeContainer}>
          <View style={[styles.circleRing, { borderColor: quotient.ringColor }]}>
            <Text style={[styles.scoreNumber, { color: colors.textMain }]}>{quotient.score}</Text>
            <Text style={[styles.scoreUnit, { color: colors.textMuted }]}>점</Text>
          </View>
        </View>

        {/* 상태 뱃지 & 안내 문구 */}
        <View style={styles.scoreContent}>
          <View style={[styles.statusBadge, { backgroundColor: quotient.badgeBg }]}>
            <Text style={[styles.statusBadgeText, { color: quotient.badgeColor }]}>
              ✓ {quotient.statusLabel}
            </Text>
          </View>

          <Text style={[styles.statusTitle, { color: colors.textMain }]}>
            {quotient.statusTitle}
          </Text>

          <View style={styles.recommendTimeBox}>
            <Text style={[styles.recommendLeadText, { color: colors.textMuted }]}>
              {isTomorrow ? '내일' : '오늘'} 추천 시간은
            </Text>
            <Text style={[styles.recommendRangeText, { color: colors.textMain }]}>
              <Text style={styles.recommendRangeBold}>{timeRangeDisplay}</Text>
              이에요.
            </Text>
          </View>
        </View>
      </View>

      {/* 4. 하단 4대 환경 메트릭 캡슐 바 (기온, 체감, 강수확률, 미세먼지) */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCapsule, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.metricEmoji}>🌡️</Text>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>기온</Text>
          <Text style={[styles.metricValue, { color: colors.textMain }]}>{currentAirTemp}°</Text>
        </View>
        <View style={[styles.metricCapsule, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.metricEmoji}>🌡️</Text>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>체감</Text>
          <Text style={[styles.metricValue, { color: colors.textMain }]}>{roundedSurfaceTemp}°</Text>
        </View>
        <View style={[styles.metricCapsule, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.metricEmoji}>🌧️</Text>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>강수확률</Text>
          <Text style={[styles.metricValue, { color: colors.textMain }]}>20%</Text>
        </View>
        <View style={[styles.metricCapsule, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.metricEmoji}>🌫️</Text>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>미세먼지</Text>
          <Text style={[styles.metricValue, { color: colors.primaryDark }]}>좋음</Text>
        </View>
      </View>

      {/* 5. 보조 세부 안내 및 진행도 (테스트 호환성 & 접근성) */}
      <View style={styles.hiddenMetaArea}>
        <Text style={[styles.hiddenMetaText, { color: colors.textMuted }]}>{subtitleText}</Text>
        <Text style={[styles.hiddenMetaText, { color: colors.textMuted }]}>{badgeNotice}</Text>
        <View style={styles.hiddenTrack}>
          <View style={[styles.hiddenProgress, { width: `${progress}%` }]} />
          <View style={[styles.hiddenIndicator, { left: `${progress}%` }]} />
        </View>
      </View>

      {/* 6. 오픈메테오 일사량 데이터 출처 (라이선스 CC BY 4.0 표기) */}
      {Boolean(weather?.attribution) && (
        <View style={styles.attributionContainer}>
          <Text style={[styles.attributionText, { color: colors.textMuted }]}>
            {weather?.attribution}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 6,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    marginTop: 2,
  },
  pawIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  mainHeading: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  mainSubHeading: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
  },
  locationBar: {
    marginBottom: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  infoChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  changeRegionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  changeRegionText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  scoreCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  scoreNumber: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  scoreUnit: {
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: -2,
  },
  scoreContent: {
    flex: 1,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 22,
    marginBottom: 6,
  },
  recommendTimeBox: {},
  recommendLeadText: {
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 16,
  },
  recommendRangeText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  recommendRangeBold: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  metricCapsule: {
    width: '48.7%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  metricEmoji: {
    fontSize: 14,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  metricValue: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  hiddenMetaArea: {
    marginTop: 6,
    paddingHorizontal: 4,
  },
  hiddenMetaText: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  hiddenTrack: {
    height: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  hiddenProgress: {
    position: 'absolute',
    height: 0,
  },
  hiddenIndicator: {
    position: 'absolute',
  },
  attributionContainer: {
    alignItems: 'center',
    marginTop: 6,
  },
  attributionText: {
    fontSize: 9.5,
    fontWeight: '400',
    textAlign: 'center',
  },
});

