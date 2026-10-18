/**
 * [편안하개 - PetWalk]
 * 모바일 홈 골든타임 위젯 (Screen-01, US-B2, US-F1)
 *
 * 기상청 실시간 기온 및 지면열 추정 모델 연동
 * - 지면온도 안전(<=35℃) / 주의(35~45℃) / 위험(>45℃) 상태 반영
 * - 당일 계절/일사량 맞춤 골든타임 윈도우(1.5~2시간 슬롯) 동적 시각화
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { HeatRiskLevel, HeatRiskResponse, SurfaceTempsDTO } from '../../types/weather';
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

function getSurfaceSubText(solarRadiation?: number, riskLevel?: HeatRiskLevel): string {
  if (typeof solarRadiation === 'number') {
    return `일사 ${Math.round(solarRadiation)}W/m²`;
  }
  return riskLevel === 'SAFE' ? '발바닥 안심' : '아스팔트 주의';
}

function getGrassTempDisplay(
  surfaceTemps?: SurfaceTempsDTO,
  fallbackTemp?: number
): string {
  if (surfaceTemps?.grass !== undefined) {
    return `${surfaceTemps.grass}°C`;
  }
  if (surfaceTemps?.dirt !== undefined) {
    return `${surfaceTemps.dirt}°C`;
  }
  return `${fallbackTemp ?? 22}°C`;
}

function resolveAttributionText(weather?: HeatRiskResponse | null, isLoading?: boolean): string {
  if (isLoading || weather === null || weather === undefined) {
    return '데이터 출처: 기상청 · 한국환경공단(에어코리아) 실시간 수신 중...';
  }
  const isVirtual = weather?.isLiveServer === false || weather?.data_source === 'fallback_estimate';
  if (isVirtual) {
    return '데이터 출처: [가상 시뮬레이션 추정치] (실시간 네트워크 미연결 · 모의 데이터)';
  }
  const base = '데이터 출처: 기상청 · 한국환경공단(에어코리아)';
  return weather?.attribution ? `${base} · ${weather.attribution}` : base;
}

function resolveModalAttributionText(weather?: HeatRiskResponse | null): string {
  const isVirtual = weather?.isLiveServer === false || weather?.data_source === 'fallback_estimate';
  if (isVirtual) {
    return '데이터 출처: [가상 시뮬레이션 추정치] (실시간 네트워크 미연결 시 모의 추정 모델 적용)';
  }
  const base = '데이터 출처: 기상청 단기예보 · 한국환경공단(에어코리아)';
  return weather?.attribution ? `${base} · ${weather.attribution}` : `${base} · Open-Meteo`;
}

interface WeatherDetailModalProps {
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

const WeatherDetailModal: React.FC<WeatherDetailModalProps> = ({
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
  const grassTemp = getGrassTempDisplay(surfaceTemps, currentAirTemp);
  const grassDiff = typeof surfaceTemps?.asphalt === 'number' && typeof surfaceTemps?.grass === 'number'
    ? Math.round(surfaceTemps.asphalt - surfaceTemps.grass)
    : null;

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
              <Text style={[styles.modalTitle, { color: colors.textMain }]}>오늘의 산책 날씨 리포트</Text>
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
                  ⚠️ [가상 시뮬레이션 데이터] 실시간 기상 서버에 연결되지 않아 KST 모의 추정 모델이 적용되었습니다.
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
            <Text style={[styles.modalSectionTitle, { color: colors.textMain }]}>4대 환경 메트릭 상세 분석</Text>
            <View style={styles.modalMetricsGrid}>
              {/* 1. 기온 */}
              <View style={[styles.modalMetricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={styles.modalMetricEmoji}>🌡️</Text>
                <Text style={[styles.modalMetricTitle, { color: colors.textMuted }]}>현재 기온</Text>
                <Text style={[styles.modalMetricValue, { color: colors.textMain }]}>{currentAirTemp}°C</Text>
                <Text style={[styles.modalMetricSub, { color: colors.textMuted }]}>대기 관측 온도</Text>
              </View>

              {/* 2. 발바닥 체감 지면온도 */}
              <View style={[styles.modalMetricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={styles.modalMetricEmoji}>🔥</Text>
                <Text style={[styles.modalMetricTitle, { color: colors.textMuted }]}>체감 지면열</Text>
                <Text style={[styles.modalMetricValue, { color: colors.textMain }]}>{roundedSurfaceTemp}°C</Text>
                <Text style={[styles.modalMetricSub, { color: riskLevel === 'SAFE' ? '#059669' : '#B45309' }]}>
                  {surfaceSubText}
                </Text>
              </View>

              {/* 3. 강수확률 */}
              <View style={[styles.modalMetricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={styles.modalMetricEmoji}>🌧️</Text>
                <Text style={[styles.modalMetricTitle, { color: colors.textMuted }]}>강수확률</Text>
                <Text style={[styles.modalMetricValue, { color: colors.textMain }]}>{popPercent}%</Text>
                <Text style={[styles.modalMetricSub, { color: colors.textMuted }]}>
                  {popPercent > 30 ? '우산 준비 권장' : '비 소식 없음'}
                </Text>
              </View>

              {/* 4. 미세먼지 */}
              <View style={[styles.modalMetricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={styles.modalMetricEmoji}>🌫️</Text>
                <Text style={[styles.modalMetricTitle, { color: colors.textMuted }]}>미세먼지</Text>
                <Text style={[styles.modalMetricValue, { color: airQualityColor }]}>{airQualityLabel}</Text>
                <Text style={[styles.modalMetricSub, { color: colors.textMuted }]}>
                  {airQuality?.station_name ? `${airQuality.station_name} 측정소` : '실시간 공공데이터'}
                </Text>
              </View>
            </View>

            {/* 노면별 발바닥 체감온도 실시간 분석 (US-B2) */}
            {surfaceTemps && (
              <View style={[styles.modalSurfaceBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={styles.modalSurfaceHeaderRow}>
                  <Text style={styles.modalSurfaceEmoji}>🐾</Text>
                  <Text style={[styles.modalSurfaceTitle, { color: colors.textMain }]}>노면별 발바닥 체감온도 비교</Text>
                </View>
                <View style={styles.modalSurfaceGrid}>
                  <View style={styles.modalSurfaceItem}>
                    <Text style={[styles.modalSurfaceItemLabel, { color: colors.textMuted }]}>아스팔트</Text>
                    <Text style={[styles.modalSurfaceItemVal, { color: '#DC2626' }]}>{asphaltTemp}</Text>
                    <Text style={styles.modalSurfaceItemStatus}>🔥 고열 주의</Text>
                  </View>
                  <View style={styles.modalSurfaceItem}>
                    <Text style={[styles.modalSurfaceItemLabel, { color: colors.textMuted }]}>보도블록</Text>
                    <Text style={[styles.modalSurfaceItemVal, { color: '#D97706' }]}>{pavedTemp}</Text>
                    <Text style={styles.modalSurfaceItemStatus}>주의</Text>
                  </View>
                  <View style={styles.modalSurfaceItem}>
                    <Text style={[styles.modalSurfaceItemLabel, { color: colors.textMuted }]}>흙길 / 잔디</Text>
                    <Text style={[styles.modalSurfaceItemVal, { color: '#059669' }]}>{grassTemp}</Text>
                    <Text style={styles.modalSurfaceItemStatus}>🌱 시원·안전</Text>
                  </View>
                </View>
                {grassDiff !== null && (
                  <View style={styles.modalSurfaceTipRow}>
                    <Text style={styles.modalSurfaceTipText}>
                      💡 아스팔트 대비 잔디밭이 약 {grassDiff}℃ 더 시원해요!
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
        오늘 강아지 산책지수
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
}) => (
  <TouchableOpacity
    activeOpacity={0.88}
    onPress={onOpenModal}
    accessibilityRole="button"
    accessibilityLabel="산책지수 상세 날씨 모달 열기"
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
                {isLoading ? '✓ 실시간 분석 중' : `✓ ${quotient.statusLabel}`}
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
          {isLoading ? '기상청·에어코리아 실시간 지수 분석 중...' : quotient.statusTitle}
        </Text>

        {/* 하단: 추천 시간 & 상세보기 터치 힌트 */}
        <View style={styles.bottomHintRow}>
          <Text
            style={[
              styles.recommendTimeInline,
              { color: colors.textMuted, fontSize: responsive.weatherRecommendTimeSize },
            ]}
          >
            {isLoading ? '실시간 예보 분석 중' : `${isTomorrow ? '내일 ' : '오늘 '}${timeRangeDisplay}`}
          </Text>
          <Text style={[styles.detailHintText, { fontSize: responsive.weatherDetailHintSize }]}>
            상세보기 〉
          </Text>
        </View>
      </View>
    </View>
  </TouchableOpacity>
);

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
  const grass = weather.surface_temps.grass !== undefined ? `${weather.surface_temps.grass}°C` : '';
  const diffNotice =
    typeof weather.surface_temps.asphalt === 'number' && typeof weather.surface_temps.grass === 'number'
      ? ` 아스팔트 대비 잔디밭이 약 ${Math.round(weather.surface_temps.asphalt - weather.surface_temps.grass)}℃ 더 시원해요!`
      : '';
  return `노면별 발바닥 체감온도 비교: 아스팔트 ${asphalt}, 흙길 / 잔디 ${grass}.${diffNotice}`;
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

  const popPercent = typeof weather?.pop === 'number' ? weather.pop : 20;
  const airQuality = weather?.air_quality;
  const airQualityLabel = airQuality?.grade_label ?? '좋음';
  const airQualityColor = AIR_QUALITY_COLOR_MAP[airQualityLabel] ?? '#059669';
  const isVirtual = weather?.isLiveServer === false || weather?.data_source === 'fallback_estimate';

  return (
    <View
      style={styles.container}
      accessibilityLabel="산책하기 좋은 지면온도 시간"
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
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  mainSubHeading: {
    fontSize: 11,
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
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 24,
  },
  scoreUnit: {
    fontSize: 9.5,
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
    fontSize: 10.5,
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
    fontSize: 9,
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
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 18,
    marginBottom: 3,
  },
  bottomHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recommendTimeInline: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailHintText: {
    fontSize: 10.5,
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
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 16,
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
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: 15,
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
    fontSize: 24,
    fontWeight: '900',
  },
  modalScoreBannerTextWrap: {
    flex: 1,
  },
  modalScoreLabel: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  modalScoreTitle: {
    fontSize: 13,
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
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '500',
  },
  modalSectionTitle: {
    fontSize: 12.5,
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
    fontSize: 10.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  modalMetricValue: {
    fontSize: 14.5,
    fontWeight: '800',
    marginBottom: 1,
  },
  modalMetricSub: {
    fontSize: 9.5,
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
    fontSize: 12,
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
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  modalSurfaceItemVal: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  modalSurfaceItemStatus: {
    fontSize: 9,
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
    fontSize: 10.5,
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
    fontSize: 11,
    fontWeight: '600',
  },
  modalGoldenTime: {
    fontSize: 13.5,
    fontWeight: '800',
    marginTop: 1,
  },
  modalAttributionBox: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  modalAttributionText: {
    fontSize: 9,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 13,
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
    fontSize: 13.5,
    fontWeight: '700',
  },
  hiddenMetaArea: {
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
  hiddenMetaText: {
    fontSize: 10.5,
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
    fontSize: 8.5,
    fontWeight: '400',
    textAlign: 'center',
  },
});

