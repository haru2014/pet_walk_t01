import { TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
/**
 * [편안하개 - PetWalk]
 * 모바일 홈 골든타임 위젯 (Screen-01, US-B2, US-F1)
 *
 * 기상청 실시간 기온 및 지면열 추정 모델 연동
 * - 지면온도 안전(<=35℃) / 주의(35~45℃) / 위험(>45℃) 상태 반영
 * - 당일 계절/일사량 맞춤 골든타임 윈도우(1.5~2시간 슬롯) 동적 시각화
 */

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { AirQualityDTO, HeatRiskLevel, HeatRiskResponse, SurfaceTempsDTO } from '../../types/weather';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from '../common/AppIcon';
import { useHomeResponsive } from '../../hooks/useHomeResponsive';

export interface GoldenTimeWidgetProps {
  readonly weather?: HeatRiskResponse | null;
  readonly isLoading?: boolean;
  readonly currentTimeLabel?: string;
  readonly startTimeLabel?: string;
  readonly endTimeLabel?: string;
  readonly progressPercent?: number;
  readonly statusNotice?: string;
  readonly initialModalVisible?: boolean;
}

const TIME_REGEX = /^\d{1,2}:\d{2}$/;

const AIR_QUALITY_COLOR_MAP: Record<string, string> = {
  좋음: '#059669',
  보통: '#0284C7',
  나쁨: '#D97706',
  매우나쁨: '#DC2626',
};

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
  riskLevel: HeatRiskLevel,
  pop?: number,
  airQuality?: AirQualityDTO | null,
  condition?: string,
  pty?: number
): WalkQuotientScore {
  // 1. 강설(눈)이 내리는 중
  if (pty === 2 || pty === 3 || pty === 6 || pty === 7 || condition === 'snowy') {
    return {
      score: 38,
      statusLabel: '강설 주의',
      statusTitle: '눈 때문에 길이 미끄러워요.',
      badgeBg: '#EFF6FF',
      badgeColor: '#1E40AF',
      ringColor: '#3B82F6',
    };
  }

  // 2. 강우(비)가 내리는 중
  if (pty === 1 || pty === 4 || pty === 5 || condition === 'rainy') {
    return {
      score: 42,
      statusLabel: '우천 주의',
      statusTitle: '비가 와서 길이 젖어 있어요. 실내 놀이를 추천해요.',
      badgeBg: '#EFF6FF',
      badgeColor: '#1E40AF',
      ringColor: '#3B82F6',
    };
  }

  // 3. 지면 고열 위험 (45°C 초과)
  if (riskLevel === 'DANGER' || surfaceTemp > 45) {
    return {
      score: 35,
      statusLabel: '고열 주의',
      statusTitle: '한낮에는 길바닥이 매우 뜨거워요.',
      badgeBg: '#FEE2E2',
      badgeColor: '#B91C1C',
      ringColor: '#EF4444',
    };
  }

  // 4. 강수확률 매우 높음 (80% 이상)
  if (typeof pop === 'number' && pop >= 80) {
    return {
      score: 55,
      statusLabel: '비 예보 높음',
      statusTitle: '비가 올 가능성이 매우 높아요. 짧게 다녀오세요.',
      badgeBg: '#EEF2FF',
      badgeColor: '#4338CA',
      ringColor: '#6366F1',
    };
  }

  // 5. 강수확률 높음 (60% 이상 - 비 예보 공식 구간)
  if (typeof pop === 'number' && pop >= 60) {
    return {
      score: 65,
      statusLabel: '비 예보',
      statusTitle: '비 예보(우산 필수)가 있어요. 서두르거나 우비를 챙기세요.',
      badgeBg: '#FEF3C7',
      badgeColor: '#B45309',
      ringColor: '#F59E0B',
    };
  }

  // 6. 미세먼지 매우나쁨
  if (airQuality?.grade_label === '매우나쁨') {
    return {
      score: 45,
      statusLabel: '미세먼지 매우나쁨',
      statusTitle: '대기질이 매우 나빠요. 실내 활동을 권장해요.',
      badgeBg: '#FEE2E2',
      badgeColor: '#B91C1C',
      ringColor: '#EF4444',
    };
  }

  // 7. 지면온도 다소 높음 (35°C 초과)
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

  // 8. 강수확률 다소 있음 (40% 이상)
  if (typeof pop === 'number' && pop >= 40) {
    return {
      score: 80,
      statusLabel: '비 가능성',
      statusTitle: '비가 올 수 있어요. 가까운 코스를 추천해요.',
      badgeBg: '#FEF3C7',
      badgeColor: '#B45309',
      ringColor: '#F59E0B',
    };
  }

  // 9. 미세먼지 나쁨
  if (airQuality?.grade_label === '나쁨') {
    return {
      score: 75,
      statusLabel: '미세먼지 나쁨',
      statusTitle: '미세먼지가 나빠요. 짧은 산책을 권장해요.',
      badgeBg: '#FEF3C7',
      badgeColor: '#B45309',
      ringColor: '#F59E0B',
    };
  }

  // 10. 지면온도 28°C 이하 안전
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

  // 11. 지면온도 28~35°C 적정
  return {
    score: 88,
    statusLabel: '좋음',
    statusTitle: '산책하기 편한 시간이 있어요.',
    badgeBg: '#DCFCE7',
    badgeColor: '#166534',
    ringColor: '#10B981',
  };
}

interface NoticeMessageParams {
  readonly riskLevel: HeatRiskLevel;
  readonly currentTemp: number;
  readonly startDisplay: string;
  readonly nowLabel: string;
  readonly customNotice?: string;
  readonly pop?: number;
  readonly condition?: string;
  readonly pty?: number;
}

function getPrecipitationSubText(popPercent: number): string {
  if (popPercent >= 60) {
    return '비 예보 · 우산 필수';
  }
  if (popPercent > 30) {
    return '우산 준비 권장';
  }
  return '비 소식 없음';
}

function buildNoticeMessages(params: NoticeMessageParams): { subtitleText: string; badgeNotice: string } {
  const { riskLevel, currentTemp, startDisplay, nowLabel, customNotice, pop, condition, pty } = params;
  if (pty === 2 || pty === 3 || pty === 6 || pty === 7 || condition === 'snowy') {
    return {
      subtitleText: `현재 눈 소식으로 길이 미끄럽고 체온이 떨어지기 쉬워요.`,
      badgeNotice: customNotice ?? `현재 ${nowLabel} · 강설 주의 (방한/발바닥 보호)`,
    };
  }
  if (pty === 1 || pty === 4 || pty === 5 || condition === 'rainy') {
    return {
      subtitleText: `비가 내려 길이 젖어 있어요. 우비를 입거나 실내에서 놀기를 추천해요.`,
      badgeNotice: customNotice ?? `현재 ${nowLabel} · 우천 주의 (미끄럼 및 체온 관리)`,
    };
  }
  if (typeof pop === 'number' && pop >= 60) {
    return {
      subtitleText: `비가 올 확률이 ${pop}%예요. 외출할 때 우산이나 우비를 챙겨주세요.`,
      badgeNotice: customNotice ?? `현재 ${nowLabel} · 비 올 확률 ${pop}% (우산 준비)`,
    };
  }
  if (typeof pop === 'number' && pop >= 40) {
    return {
      subtitleText: `비가 올 확률이 ${pop}%예요. 가까운 공원에서 산책하는 걸 추천해요.`,
      badgeNotice: customNotice ?? `현재 ${nowLabel} · 비 올 확률 ${pop}% (우산 준비)`,
    };
  }
  if (riskLevel === 'DANGER') {
    return {
      subtitleText: `길바닥 온도가 ${currentTemp.toFixed(1)}℃로 매우 뜨거워요. ${startDisplay} 이후 서늘한 시간에 산책해요.`,
      badgeNotice: customNotice ?? `현재 ${nowLabel} · 지면 ${currentTemp.toFixed(1)}℃ 고열 위험 · ${startDisplay} 권장`,
    };
  }
  if (riskLevel === 'CAUTION') {
    return {
      subtitleText: `길바닥 온도가 ${currentTemp.toFixed(1)}℃로 조금 높아요. 아스팔트 대신 그늘길을 추천해요.`,
      badgeNotice: customNotice ?? `현재 ${nowLabel} · 지면 ${currentTemp.toFixed(1)}℃ (그늘길 위주 20분 내 산책)`,
    };
  }
  return {
    subtitleText: `길바닥 온도가 ${currentTemp.toFixed(1)}℃예요. 발바닥이 편안하게 걸을 수 있어요.`,
    badgeNotice: customNotice ?? `현재 ${nowLabel} · 길바닥 ${currentTemp.toFixed(1)}℃ (산책하기 좋은 시간)`,
  };
}

function getSurfaceSubText(solarRadiation?: number, riskLevel?: HeatRiskLevel): string {
  if (typeof solarRadiation === 'number') {
    return `일사 ${Math.round(solarRadiation)}W/m²`;
  }
  return riskLevel === 'SAFE' ? '발바닥 안심' : '아스팔트 주의';
}

function getDirtTempDisplay(
  surfaceTemps?: SurfaceTempsDTO,
  fallbackTemp?: number
): string {
  if (surfaceTemps?.dirt !== undefined) {
    return `${surfaceTemps.dirt}°C`;
  }
  return `${fallbackTemp ?? 22}°C`;
}

function getGrassTempDisplay(
  surfaceTemps?: SurfaceTempsDTO,
  fallbackTemp?: number
): string {
  if (surfaceTemps?.grass !== undefined) {
    return `${surfaceTemps.grass}°C`;
  }
  return `${fallbackTemp ?? 22}°C`;
}

interface SurfaceStatusInfo {
  readonly status: string;
  readonly color: string;
}

function getSurfaceStatus(temp?: number): SurfaceStatusInfo {
  if (temp === undefined || Number.isNaN(temp)) {
    return { status: '정보 없음', color: '#6B7280' };
  }
  if (temp >= 40) {
    return { status: '🔥 고열 주의', color: '#DC2626' };
  }
  if (temp >= 32) {
    return { status: '주의', color: '#D97706' };
  }
  return { status: '🌱 시원·안전', color: '#059669' };
}

function resolveAttributionText(weather?: HeatRiskResponse | null, isLoading?: boolean): string {
  if (isLoading || weather === null || weather === undefined) {
    return '기상청·에어코리아 정보를 불러오는 중이에요...';
  }
  const isVirtual = weather?.isLiveServer === false || weather?.data_source === 'fallback_estimate';
  if (isVirtual) {
    return '실시간 날씨를 불러오지 못해 예상 정보를 보여드려요.';
  }
  const base = '정보 제공: 기상청·에어코리아';
  return weather?.attribution ? `${base} · ${weather.attribution}` : base;
}

function resolveModalAttributionText(weather?: HeatRiskResponse | null): string {
  const isVirtual = weather?.isLiveServer === false || weather?.data_source === 'fallback_estimate';
  if (isVirtual) {
    return '실시간 날씨를 불러오지 못해 예상 정보를 보여드려요.';
  }
  const base = '정보 제공: 기상청·에어코리아';
  return weather?.attribution ? `${base} · ${weather.attribution}` : `${base} · Open-Meteo`;
}

export interface WeatherDetailModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly colors: any;
  readonly quotient: WalkQuotientScore;
  readonly subtitleText: string;
  readonly currentAirTemp: number;
  readonly roundedSurfaceTemp: number;
  readonly riskLevel: HeatRiskLevel;
  readonly popPercent: number;
  readonly airQualityColor: string;
  readonly airQualityLabel: string;
  readonly airQuality?: any;
  readonly isTomorrow: boolean;
  readonly timeRangeDisplay: string;
  readonly weather?: HeatRiskResponse | null;
}

export const WeatherDetailModal: React.FC<WeatherDetailModalProps> = ({
  visible,
  onClose,
  colors,
  quotient,
  subtitleText,
  currentAirTemp,
  roundedSurfaceTemp,
  riskLevel,
  popPercent,
  airQualityColor,
  airQualityLabel,
  airQuality,
  isTomorrow,
  timeRangeDisplay,
  weather,
}) => {
  const surfaceSubText = getSurfaceSubText(weather?.solar_radiation_w_m2, riskLevel);
  const surfaceTemps = weather?.surface_temps;
  const asphaltTemp = surfaceTemps?.asphalt !== undefined ? `${surfaceTemps.asphalt}°C` : `${roundedSurfaceTemp}°C`;
  const pavedTemp = surfaceTemps?.paved !== undefined ? `${surfaceTemps.paved}°C` : `${roundedSurfaceTemp}°C`;
  const dirtTemp = getDirtTempDisplay(surfaceTemps, roundedSurfaceTemp);
  const grassTemp = getGrassTempDisplay(surfaceTemps, currentAirTemp);
  const grassDiff = typeof surfaceTemps?.asphalt === 'number' && typeof surfaceTemps?.grass === 'number'
    ? Math.round(surfaceTemps.asphalt - surfaceTemps.grass)
    : null;

  const asphaltVal = surfaceTemps?.asphalt ?? roundedSurfaceTemp;
  const pavedVal = surfaceTemps?.paved ?? roundedSurfaceTemp;
  const dirtVal = surfaceTemps?.dirt ?? roundedSurfaceTemp;
  const grassVal = surfaceTemps?.grass ?? currentAirTemp;

  const asphaltStatus = getSurfaceStatus(asphaltVal);
  const pavedStatus = getSurfaceStatus(pavedVal);
  const dirtStatus = getSurfaceStatus(dirtVal);
  const grassStatus = getSurfaceStatus(grassVal);

  const isVirtual = weather?.isLiveServer === false || weather?.data_source === 'fallback_estimate';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalBackdropTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* 모달 상단 헤더 */}
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTitleRow}>
              <Text style={styles.modalHeaderPaw}>🐾</Text>
              <Text style={[styles.modalTitle, { color: colors.textMain }]}>오늘 산책 날씨</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.modalCloseBtn}
              accessibilityLabel="모달 닫기"
            >
              <Text style={[styles.modalCloseText, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScrollBody}>
            {/* 가상 데이터 사용 시 투명 고지 배너 */}
            {isVirtual && (
              <View style={styles.modalVirtualNoticeBox}>
                <Text style={styles.modalVirtualNoticeText}>
                  ⚠️ 실시간 날씨를 불러오지 못해 예상 정보를 보여드리고 있어요.
                </Text>
              </View>
            )}

            {/* 산책 지수 총평 배지 */}
            <View style={[styles.modalScoreBanner, { backgroundColor: quotient.badgeBg }]}>
              <Text style={[styles.modalScoreNumber, { color: quotient.badgeColor }]}>{quotient.score}점</Text>
              <View style={styles.modalScoreBannerTextWrap}>
                <Text style={[styles.modalScoreLabel, { color: quotient.badgeColor }]}>✓ {quotient.statusLabel}</Text>
                <Text style={[styles.modalScoreTitle, { color: quotient.badgeColor }]}>{quotient.statusTitle}</Text>
              </View>
            </View>

            {/* 지면온도 & 산책 가이드 브리핑 */}
            <View style={[styles.modalGuideBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.modalGuideText, { color: colors.textMain }]}>{subtitleText}</Text>
            </View>

            {/* 4대 환경 상세 메트릭 카드 2x2 그리드 */}
            <Text style={[styles.modalSectionTitle, { color: colors.textMain }]}>날씨와 산책 정보</Text>
            <View style={styles.modalMetricsGrid}>
              {/* 1. 기온 */}
              <View style={[styles.modalMetricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={styles.modalMetricEmoji}>🌡️</Text>
                <Text style={[styles.modalMetricTitle, { color: colors.textMuted }]}>현재 기온</Text>
                <Text style={[styles.modalMetricValue, { color: colors.textMain }]}>{currentAirTemp}°C</Text>
                <Text style={[styles.modalMetricSub, { color: colors.textMuted }]}>현재 기온</Text>
              </View>

              {/* 2. 발바닥 체감 지면온도 */}
              <View style={[styles.modalMetricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={styles.modalMetricEmoji}>🔥</Text>
                <Text style={[styles.modalMetricTitle, { color: colors.textMuted }]}>길바닥 체감 온도</Text>
                <Text style={[styles.modalMetricValue, { color: colors.textMain }]}>{roundedSurfaceTemp}°C</Text>
                <Text style={[styles.modalMetricSub, { color: riskLevel === 'SAFE' ? '#059669' : '#B45309' }]}>
                  {surfaceSubText}
                </Text>
              </View>

              {/* 3. 강수확률 */}
              <View style={[styles.modalMetricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={styles.modalMetricEmoji}>🌧️</Text>
                <Text style={[styles.modalMetricTitle, { color: colors.textMuted }]}>비 올 확률</Text>
                <Text style={[styles.modalMetricValue, { color: colors.textMain }]}>{popPercent}%</Text>
                <Text style={[styles.modalMetricSub, { color: colors.textMuted }]}>
                  {getPrecipitationSubText(popPercent)}
                </Text>
              </View>

              {/* 4. 미세먼지 */}
              <View style={[styles.modalMetricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={styles.modalMetricEmoji}>🌫️</Text>
                <Text style={[styles.modalMetricTitle, { color: colors.textMuted }]}>미세먼지</Text>
                <Text style={[styles.modalMetricValue, { color: airQualityColor }]}>{airQualityLabel}</Text>
                <Text style={[styles.modalMetricSub, { color: colors.textMuted }]}>
                  {airQuality?.station_name ? `${airQuality.station_name} 주변 측정 정보` : '주변 대기 정보'}
                </Text>
              </View>
            </View>

            {/* 노면별 발바닥 체감온도 실시간 분석 (US-B2) */}
            {surfaceTemps && (
              <View style={[styles.modalSurfaceBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={styles.modalSurfaceHeaderRow}>
                  <Text style={styles.modalSurfaceEmoji}>🐾</Text>
                  <Text style={[styles.modalSurfaceTitle, { color: colors.textMain }]}>길 종류별 발바닥 온도 예상</Text>
                </View>
                <View style={styles.modalSurfaceGrid}>
                  <View style={styles.modalSurfaceItem}>
                    <Text style={[styles.modalSurfaceItemLabel, { color: colors.textMuted }]}>아스팔트</Text>
                    <Text style={[styles.modalSurfaceItemVal, { color: asphaltStatus.color }]}>{asphaltTemp}</Text>
                    <Text style={[styles.modalSurfaceItemStatus, { color: asphaltStatus.color }]}>{asphaltStatus.status}</Text>
                  </View>
                  <View style={styles.modalSurfaceItem}>
                    <Text style={[styles.modalSurfaceItemLabel, { color: colors.textMuted }]}>보도블록</Text>
                    <Text style={[styles.modalSurfaceItemVal, { color: pavedStatus.color }]}>{pavedTemp}</Text>
                    <Text style={[styles.modalSurfaceItemStatus, { color: pavedStatus.color }]}>{pavedStatus.status}</Text>
                  </View>
                  <View style={styles.modalSurfaceItem}>
                    <Text style={[styles.modalSurfaceItemLabel, { color: colors.textMuted }]}>흙</Text>
                    <Text style={[styles.modalSurfaceItemVal, { color: dirtStatus.color }]}>{dirtTemp}</Text>
                    <Text style={[styles.modalSurfaceItemStatus, { color: dirtStatus.color }]}>{dirtStatus.status}</Text>
                  </View>
                  <View style={styles.modalSurfaceItem}>
                    <Text style={[styles.modalSurfaceItemLabel, { color: colors.textMuted }]}>잔디</Text>
                    <Text style={[styles.modalSurfaceItemVal, { color: grassStatus.color }]}>{grassTemp}</Text>
                    <Text style={[styles.modalSurfaceItemStatus, { color: grassStatus.color }]}>{grassStatus.status}</Text>
                  </View>
                </View>
                {grassDiff !== null && (
                  <View style={styles.modalSurfaceTipRow}>
                    <Text style={styles.modalSurfaceTipText}>
                      {grassDiff > 0
                        ? `💡 아스팔트 대비 잔디밭이 약 ${grassDiff}℃ 더 시원해요!`
                        : '💡 햇볕이 강하지 않아 길바닥이 시원하고 편안해요!'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* 추천 골든타임 상세 윈도우 */}
            <View style={[styles.modalGoldenBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={styles.modalGoldenEmoji}>⏰</Text>
              <View style={styles.modalGoldenTextWrap}>
                <Text style={[styles.modalGoldenTitle, { color: colors.textMain }]}>
                  {isTomorrow ? '내일 추천 산책 시간' : '오늘 추천 산책 시간'}
                </Text>
                <Text style={[styles.modalGoldenTime, { color: '#2563EB' }]}>{timeRangeDisplay}</Text>
              </View>
            </View>

            {/* 공식 데이터 출처 고지 (공공누리 제1유형 & CC BY 4.0) */}
            <View style={styles.modalAttributionBox}>
              <Text style={[styles.modalAttributionText, { color: colors.textMuted }]}>
                {resolveModalAttributionText(weather)}
              </Text>
            </View>
          </ScrollView>

          {/* 모달 닫기 버튼 */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onClose}
            style={styles.modalConfirmBtn}
          >
            <Text style={styles.modalConfirmBtnText}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

interface TopHeaderProps {
  readonly colors: any;
  readonly responsive: any;
}

const TopHeader: React.FC<TopHeaderProps> = ({ colors, responsive }) => (
  <View style={[styles.topHeader, { marginBottom: responsive.weatherTopMarginBottom }]}>
    <View
      style={[
        styles.pawIconBox,
        {
          width: responsive.weatherPawIconSize + 14,
          height: responsive.weatherPawIconSize + 14,
          borderRadius: (responsive.weatherPawIconSize + 14) / 3,
        },
      ]}
    >
      <AppIcon name="paw" size={responsive.weatherPawIconSize} color="#6366F1" />
    </View>
    <View style={styles.headerTitleWrap}>
      <Text style={[styles.mainHeading, { color: colors.textMain, fontSize: responsive.weatherHeadingSize }]}>
        오늘 산책하기 어때요?
      </Text>
      <Text style={[styles.mainSubHeading, { color: colors.textMuted, fontSize: responsive.weatherSubHeadingSize }]}>
        더위·추위·대기질을 함께 봐요
      </Text>
    </View>
  </View>
);

interface ScoreCardProps {
  readonly colors: any;
  readonly responsive: any;
  readonly quotient: WalkQuotientScore;
  readonly popPercent: number;
  readonly airQualityColor: string;
  readonly airQualityLabel: string;
  readonly isTomorrow: boolean;
  readonly timeRangeDisplay: string;
  readonly isVirtual?: boolean;
  readonly isLoading?: boolean;
  readonly onOpenModal: () => void;
}

const ScoreCard: React.FC<ScoreCardProps> = ({
  colors,
  responsive,
  quotient,
  popPercent,
  airQualityColor,
  airQualityLabel,
  isTomorrow,
  timeRangeDisplay,
  isVirtual,
  isLoading,
  onOpenModal,
}) => {
  const dayPrefix = isTomorrow ? '내일 ' : '오늘 ';
  const recommendTimeText = isLoading
    ? '날씨 정보를 불러오는 중'
    : `${dayPrefix}${timeRangeDisplay}`;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onOpenModal}
      accessibilityRole="button"
      accessibilityLabel="오늘 날씨와 산책 정보 자세히 보기"
      style={[
        styles.scoreCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          paddingVertical: responsive.weatherCardPaddingV,
          paddingHorizontal: responsive.weatherCardPaddingH,
        },
      ]}
    >
      <View style={styles.cardMainRow}>
        {/* 원형 점수 게이지 (반응형 66px ~ 82px) */}
        <View style={styles.gaugeContainer}>
          <View
            style={[
              styles.circleRing,
              {
                width: responsive.weatherGaugeSize,
                height: responsive.weatherGaugeSize,
                borderRadius: responsive.weatherGaugeSize / 2,
                borderColor: quotient.ringColor,
              },
            ]}
          >
            <Text style={[styles.scoreNumber, { color: colors.textMain, fontSize: responsive.weatherScoreFontSize }]}>
              {isLoading ? '···' : quotient.score}
            </Text>
            <Text style={[styles.scoreUnit, { color: colors.textMuted, fontSize: responsive.weatherScoreUnitSize }]}>
              {isLoading ? '' : '점'}
            </Text>
          </View>
        </View>

        {/* 상태 뱃지, 아이콘 칩(강수/미세먼지), 타이틀, 추천 시간 */}
        <View style={styles.scoreContent}>
          {/* 상단: 상태 뱃지 + 가상추정 뱃지 + 강수확률/미세먼지 아이콘 칩 */}
          <View style={styles.badgeChipsRow}>
            <View style={styles.statusBadgeWrap}>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: isLoading ? '#E0E7FF' : quotient.badgeBg,
                    paddingVertical: responsive.weatherStatusBadgePadV,
                    paddingHorizontal: responsive.weatherStatusBadgePadH,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: isLoading ? '#4338CA' : quotient.badgeColor, fontSize: responsive.weatherStatusBadgeFont },
                  ]}
                >
                  {isLoading ? '✓ 날씨를 확인하고 있어요' : `✓ ${quotient.statusLabel}`}
                </Text>
              </View>
              {!isLoading && isVirtual && (
                <View style={styles.virtualIndicatorBadge}>
                  <Text style={styles.virtualIndicatorText}>가상 추정</Text>
                </View>
              )}
            </View>

            <View style={styles.iconChipsRow}>
              <View
                style={[
                  styles.iconChip,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    paddingVertical: responsive.weatherChipPadV,
                    paddingHorizontal: responsive.weatherChipPadH,
                  },
                ]}
              >
                <Text style={styles.iconChipEmoji}>🌧️</Text>
                <Text style={[styles.iconChipText, { color: colors.textMain, fontSize: responsive.weatherChipFont }]}>
                  {isLoading ? '-' : `${popPercent}%`}
                </Text>
              </View>
              <View
                style={[
                  styles.iconChip,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    paddingVertical: responsive.weatherChipPadV,
                    paddingHorizontal: responsive.weatherChipPadH,
                  },
                ]}
              >
                <Text style={styles.iconChipEmoji}>🌫️</Text>
                <Text style={[styles.iconChipText, { color: isLoading ? colors.textMuted : airQualityColor, fontSize: responsive.weatherChipFont }]}>
                  {isLoading ? '수신중' : airQualityLabel}
                </Text>
              </View>
            </View>
          </View>

          {/* 중단: 상태 메인 문구 */}
          <Text
            style={[
              styles.statusTitle,
              { color: colors.textMain, fontSize: responsive.weatherStatusTitleSize },
            ]}
            numberOfLines={1}
          >
            {isLoading ? '기상청·에어코리아 날씨 정보를 확인하는 중...' : quotient.statusTitle}
          </Text>

          {/* 하단: 추천 시간 & 상세보기 터치 힌트 */}
          <View style={styles.bottomHintRow}>
            <Text
              style={[
                styles.recommendTimeInline,
                { color: colors.textMuted, fontSize: responsive.weatherRecommendTimeSize },
              ]}
            >
              {recommendTimeText}
            </Text>
            <Text style={[styles.detailHintText, { fontSize: responsive.weatherDetailHintSize }]}>
              상세보기 〉
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

interface HiddenMetaAreaProps {
  readonly colors: any;
  readonly subtitleText: string;
  readonly badgeNotice: string;
  readonly startDisplay: string;
  readonly timeRangeDisplay: string;
  readonly progress: number;
  readonly weather?: HeatRiskResponse | null;
}

function renderSurfaceSummary(weather?: HeatRiskResponse | null): string {
  if (!weather?.surface_temps) return '';
  const asphalt = weather.surface_temps.asphalt !== undefined ? `${weather.surface_temps.asphalt}°C` : '';
  const dirt = weather.surface_temps.dirt !== undefined ? `${weather.surface_temps.dirt}°C` : '';
  const grass = weather.surface_temps.grass !== undefined ? `${weather.surface_temps.grass}°C` : '';
  const diff =
    typeof weather.surface_temps.asphalt === 'number' && typeof weather.surface_temps.grass === 'number'
      ? Math.round(weather.surface_temps.asphalt - weather.surface_temps.grass)
      : null;
  let diffNotice = '';
  if (diff !== null) {
    diffNotice = diff > 0
      ? ` 아스팔트 대비 잔디밭이 약 ${diff}℃ 더 시원해요!`
      : ' 직사광선이 없어 길바닥이 시원하고 편안해요!';
  }
  return `길 종류별 발바닥 온도 예상: 아스팔트 ${asphalt}, 흙 ${dirt}, 잔디 ${grass}.${diffNotice}`;
}

const HiddenMetaArea: React.FC<HiddenMetaAreaProps> = ({
  colors,
  subtitleText,
  badgeNotice,
  startDisplay,
  timeRangeDisplay,
  progress,
  weather,
}) => {
  const surfaceSummary = renderSurfaceSummary(weather);
  const solarRadiation = weather?.solar_radiation_w_m2;

  return (
    <View style={styles.hiddenMetaArea}>
      <Text style={[styles.hiddenMetaText, { color: colors.textMuted }]}>{subtitleText}</Text>
      <Text style={[styles.hiddenMetaText, { color: colors.textMuted }]}>{badgeNotice}</Text>
      <Text style={[styles.hiddenMetaText, { color: colors.textMuted }]}>{startDisplay}</Text>
      <Text style={[styles.hiddenMetaText, { color: colors.textMuted }]}>{timeRangeDisplay}</Text>
      {surfaceSummary.length > 0 && (
        <Text style={[styles.hiddenMetaText, { color: colors.textMuted }]}>{surfaceSummary}</Text>
      )}
      {typeof solarRadiation === 'number' && (
        <Text style={[styles.hiddenMetaText, { color: colors.textMuted }]}>
          일사 {Math.round(solarRadiation)}W/m²
        </Text>
      )}
      <View style={styles.hiddenTrack}>
        <View style={[styles.hiddenProgress, { width: `${progress}%` }]} />
        <View style={[styles.hiddenIndicator, { left: `${progress}%` }]} />
      </View>
    </View>
  );
};

export function computeWeatherModalProps(
  weather?: HeatRiskResponse | null,
  options?: {
    currentTimeLabel?: string;
    startTimeLabel?: string;
    endTimeLabel?: string;
    statusNotice?: string;
  }
) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const nowLabel =
    options?.currentTimeLabel ??
    `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

  const currentAirTemp = Math.round(weather?.current_air_temp ?? 22.0);
  const currentSurfaceTemp = weather?.current_surface_temp ?? 23.0;
  const roundedSurfaceTemp = Math.round(currentSurfaceTemp);
  const riskLevel = resolveRiskLevel(currentSurfaceTemp, weather?.current_risk_level);

  const isTomorrow =
    weather?.golden_time_window_day === 'tomorrow' ||
    Boolean(weather?.golden_time_window?.startsWith('내일'));

  const range = parseGoldenWindow(weather?.golden_time_window, options?.startTimeLabel, options?.endTimeLabel);
  const startDisplay = isTomorrow ? `내일 ${range.start}` : range.start;
  const timeRangeDisplay = isTomorrow ? `내일 ${range.start} ~ ${range.end}` : `${range.start} ~ ${range.end}`;

  const popPercent = typeof weather?.pop === 'number' ? weather.pop : 20;
  const airQuality = weather?.air_quality;
  const airQualityLabel = airQuality?.grade_label ?? '좋음';
  const airQualityColor = AIR_QUALITY_COLOR_MAP[airQualityLabel] ?? '#059669';
  const condition = weather?.condition;
  const pty = weather?.pty;

  const quotient = calculateWalkQuotient(
    currentSurfaceTemp,
    riskLevel,
    popPercent,
    airQuality,
    condition,
    pty
  );

  const { subtitleText, badgeNotice } = buildNoticeMessages({
    riskLevel,
    currentTemp: currentSurfaceTemp,
    startDisplay,
    nowLabel,
    customNotice: options?.statusNotice,
    pop: popPercent,
    condition,
    pty,
  });

  return {
    range,
    isTomorrow,
    startDisplay,
    timeRangeDisplay,
    quotient,
    subtitleText,
    badgeNotice,
    currentAirTemp,
    roundedSurfaceTemp,
    riskLevel,
    popPercent,
    airQualityColor,
    airQualityLabel,
    airQuality,
    weather,
    currentHour,
    currentMin,
  };
}

export const GoldenTimeWidget: React.FC<GoldenTimeWidgetProps> = ({
  weather,
  isLoading,
  currentTimeLabel,
  startTimeLabel,
  endTimeLabel,
  progressPercent,
  statusNotice,
  initialModalVisible,
}) => {
  const { colors } = useAppTheme();
  const responsive = useHomeResponsive();
  const [modalVisible, setModalVisible] = useState(initialModalVisible ?? false);

  const effectiveLoading = Boolean(isLoading || weather === null);

  const modalProps = computeWeatherModalProps(weather, {
    currentTimeLabel,
    startTimeLabel,
    endTimeLabel,
    statusNotice,
  });

  const {
    range,
    isTomorrow,
    startDisplay,
    timeRangeDisplay,
    quotient,
    subtitleText,
    badgeNotice,
    currentAirTemp,
    roundedSurfaceTemp,
    riskLevel,
    popPercent,
    airQualityColor,
    airQualityLabel,
    airQuality,
    currentHour,
    currentMin,
  } = modalProps;

  const { progress } = calculateProgress(
    range,
    isTomorrow,
    currentHour,
    currentMin,
    progressPercent
  );

  const isVirtual = weather?.isLiveServer === false || weather?.data_source === 'fallback_estimate';

  return (
    <View
      style={styles.container}
      accessibilityLabel="산책하기 좋은 길바닥 온도 시간"
    >
      {/* 1. 상단 타이틀 영역 (반응형 헤더) */}
      <TopHeader colors={colors} responsive={responsive} />

      {/* 2. 메인 산책지수 카드 (원터치 터치 시 상세 모달 오픈) */}
      <ScoreCard
        colors={colors}
        responsive={responsive}
        quotient={quotient}
        popPercent={popPercent}
        airQualityColor={airQualityColor}
        airQualityLabel={airQualityLabel}
        isTomorrow={isTomorrow}
        timeRangeDisplay={timeRangeDisplay}
        isVirtual={isVirtual}
        isLoading={effectiveLoading}
        onOpenModal={() => setModalVisible(true)}
      />

      {/* 3. 상세 정보 모달 화면 (터치 시 팝업) */}
      <WeatherDetailModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        colors={colors}
        quotient={quotient}
        subtitleText={subtitleText}
        currentAirTemp={currentAirTemp}
        roundedSurfaceTemp={roundedSurfaceTemp}
        riskLevel={riskLevel}
        popPercent={popPercent}
        airQualityColor={airQualityColor}
        airQualityLabel={airQualityLabel}
        airQuality={airQuality}
        isTomorrow={isTomorrow}
        timeRangeDisplay={timeRangeDisplay}
        weather={weather}
      />

      {/* 4. 보조 세부 안내 및 진행도 (테스트 호환성 & 접근성) */}
      <HiddenMetaArea
        colors={colors}
        subtitleText={subtitleText}
        badgeNotice={badgeNotice}
        startDisplay={startDisplay}
        timeRangeDisplay={timeRangeDisplay}
        progress={progress}
        weather={weather}
      />

      {/* 5. 데이터 출처 표기 (화면 상시 마이크로 출처) */}
      <View style={[styles.attributionContainer, { marginTop: responsive.weatherAttributionMarginTop }]}>
        <Text style={[styles.attributionText, { color: colors.textMuted, fontSize: responsive.weatherAttributionSize }]}>
          {resolveAttributionText(weather, effectiveLoading)}
        </Text>
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    marginTop: 1,
  },
  pawIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  mainHeading: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  mainSubHeading: {
    fontSize: TYPOGRAPHY.support,
    fontWeight: '500',
    marginTop: 1,
  },
  scoreCard: {
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  scoreNumber: {
    fontSize: TYPOGRAPHY.metricValue,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.metricValue,
  },
  scoreUnit: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '700',
    marginTop: -2,
  },
  scoreContent: {
    flex: 1,
  },
  badgeChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  statusBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
  },
  virtualIndicatorBadge: {
    backgroundColor: '#F3F4F6',
    borderColor: '#9CA3AF',
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  virtualIndicatorText: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '700',
    color: '#4B5563',
  },
  iconChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  iconChipEmoji: {
    fontSize: 9.5,
  },
  iconChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTitle: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.label,
    marginBottom: 3,
  },
  bottomHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recommendTimeInline: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  detailHintText: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '700',
    color: '#6366F1',
  },
  /* 모달 스타일 */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalBackdropTouchable: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalHeaderPaw: {
    fontSize: TYPOGRAPHY.screenTitle,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: TYPOGRAPHY.body,
    fontWeight: '700',
  },
  modalScrollBody: {
    paddingBottom: 6,
  },
  modalVirtualNoticeBox: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  modalVirtualNoticeText: {
    fontSize: TYPOGRAPHY.support,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.support,
  },
  modalScoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  modalScoreNumber: {
    fontSize: TYPOGRAPHY.metricValue,
    fontWeight: '900',
  },
  modalScoreBannerTextWrap: {
    flex: 1,
  },
  modalScoreLabel: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
  },
  modalScoreTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '700',
    marginTop: 1,
  },
  modalGuideBox: {
    padding: 9,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  modalGuideText: {
    fontSize: TYPOGRAPHY.label,
    lineHeight: 17,
    fontWeight: '500',
  },
  modalSectionTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  modalMetricCard: {
    width: '48.8%',
    padding: 9,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalMetricEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  modalMetricTitle: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    marginBottom: 2,
  },
  modalMetricValue: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
    marginBottom: 1,
  },
  modalMetricSub: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '500',
  },
  modalSurfaceBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
  },
  modalSurfaceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  modalSurfaceEmoji: {
    fontSize: 14,
  },
  modalSurfaceTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '700',
  },
  modalSurfaceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  modalSurfaceItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  modalSurfaceItemLabel: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    marginBottom: 2,
  },
  modalSurfaceItemVal: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
    marginBottom: 2,
  },
  modalSurfaceItemStatus: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalSurfaceTipRow: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
  },
  modalSurfaceTipText: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '600',
    color: '#059669',
    textAlign: 'center',
  },
  modalGoldenBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  modalGoldenEmoji: {
    fontSize: 18,
  },
  modalGoldenTextWrap: {
    flex: 1,
  },
  modalGoldenTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '600',
  },
  modalGoldenTime: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
    marginTop: 1,
  },
  modalAttributionBox: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  modalAttributionText: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.caption,
  },
  modalConfirmBtn: {
    backgroundColor: '#6366F1',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  modalConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
  },
  hiddenMetaArea: {
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
  hiddenMetaText: {
    fontSize: TYPOGRAPHY.caption,
  },
  hiddenTrack: {
    height: 0,
  },
  hiddenProgress: {
    height: 0,
  },
  hiddenIndicator: {
    position: 'absolute',
  },
  attributionContainer: {
    alignItems: 'center',
    marginTop: 2,
  },
  attributionText: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '400',
    textAlign: 'center',
  },
});

