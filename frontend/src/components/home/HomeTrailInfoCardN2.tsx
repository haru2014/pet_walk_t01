import { TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { HeatRiskResponse } from '../../types/weather';
import { DogProfile } from '../../types/dogProfile';
import { FeedbackSummaryPayload } from '../../services/feedbackContext';
import { WeeklyWalkStats } from '../../services/walkStatisticsService';
import { useAppTheme } from '../../theme/themeManager';
import { WeeklyWalkStampCard } from './WeeklyWalkStampCard';
import { DEFAULT_SURFACE_TEMP, computeWalkQuotient } from '../../services/walkQuotient';
import trees01Img from '../../../assets/ui_n2/trees_01.png';
import bushImg from '../../../assets/ui_n2/bush.png';

/** 이 점수 이상이면 '지금 산책하기 좋아요'로 안내한다 (산책 지수 '좋음' 구간: 88·100점). */
export const GOOD_WALK_SCORE = 85;

export function isGoodWalkScore(score: number): boolean {
  return score >= GOOD_WALK_SCORE;
}

function resolveTrailAuraColor(isGoodToWalk: boolean, isDark: boolean): string {
  if (isGoodToWalk) {
    return isDark ? 'rgba(52, 211, 153, 0.12)' : 'rgba(207, 160, 82, 0.16)';
  }
  return isDark ? 'rgba(245, 158, 11, 0.10)' : 'rgba(90, 115, 97, 0.10)';
}

export interface HomeTrailInfoCardN2Props {
  weather: HeatRiskResponse | null;
  isLoadingWeather?: boolean;
  dog: DogProfile;
  feedbackSummary: FeedbackSummaryPayload | null;
  weeklyStats: WeeklyWalkStats | null;
  onOpenStats?: () => void;
  onOpenPlanner?: () => void;
  onOpenWeatherModal?: () => void;
}

export const HomeTrailInfoCardN2: React.FC<HomeTrailInfoCardN2Props> = ({
  weather,
  isLoadingWeather = false,
  dog: _dog,
  feedbackSummary: _feedbackSummary,
  weeklyStats,
  onOpenStats,
  onOpenPlanner,
  onOpenWeatherModal,
}) => {
  const { theme, colors } = useAppTheme();
  const isDark = theme === 'dark';

  // 상세보기(WeatherDetailModal)와 같은 계산식(SSOT)을 써야 두 화면의 산책 점수·상태가 일치한다.
  const walkQuotient = useMemo(() => computeWalkQuotient(weather), [weather]);
  const walkIndex = { score: walkQuotient.score, grade: walkQuotient.statusLabel };

  // 안내 문구·배지·오라도 골든타임 여부가 아니라 같은 산책 점수로 정해야 점수와 어긋나지 않는다
  const surfaceTemp = weather?.current_surface_temp ?? DEFAULT_SURFACE_TEMP;
  const isGoodToWalk = isGoodWalkScore(walkQuotient.score);
  // 실데이터(기상청/에어코리아 실시간 응답)와 폴백(추정치)을 문구·배지에서 구분한다.
  const isVirtualWeather = !weather || weather.isLiveServer === false || weather.data_source === 'fallback_estimate';
  const surfaceTempPhrase = isVirtualWeather
    ? `${surfaceTemp.toFixed(1)}℃로 추정돼요`
    : `${surfaceTemp.toFixed(1)}℃로 측정됐어요`;
  const weatherNotice = isGoodToWalk
    ? `노면 온도가 ${surfaceTempPhrase}!\n산책하기 좋은 시간이에요.`
    : `노면 온도가 ${surfaceTempPhrase}. (${walkQuotient.statusLabel})\n${walkQuotient.statusTitle}`;
  const walkBadgeText = isGoodToWalk ? '✨ 지금 산책하기 좋아요' : `⚠️ ${walkQuotient.statusLabel}`;
  const sourceTagText = isLoadingWeather
    ? null
    : isVirtualWeather
      ? '⚠️ 예상치 (측정 불가)'
      : '📡 실시간 측정';

  return (
    <View style={[styles.sheetContainer, { backgroundColor: colors.background }]}>
      {/* 1. 상단 슬림 핸들 바 */}
      <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

      {/* 2. 메인 Trail info 카드 (골든타임 기상 모달 오픈) */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onOpenWeatherModal ?? onOpenPlanner}
        style={[
          styles.trailCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.65)',
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="산책하기 좋은 시간과 날씨 자세히 보기"
      >
        {/* 토스/애플 스타일: 상태별 은은한 앰비언트 오라 글로우 */}
        <View
          pointerEvents="none"
          style={[styles.trailAuraGlow, { backgroundColor: resolveTrailAuraColor(isGoodToWalk, isDark) }]}
        />

        {/* 위젯 우측 상단: 실시간 측정 / 예상치 뱃지 */}
        {sourceTagText && (
          <View
            style={[
              styles.sourceTag,
              isVirtualWeather ? styles.sourceTagFallback : styles.sourceTagLive,
              { backgroundColor: isDark ? (isVirtualWeather ? 'rgba(217, 119, 6, 0.2)' : 'rgba(37, 99, 235, 0.2)') : (isVirtualWeather ? '#FEF3C7' : '#EFF6FF') },
            ]}
          >
            <Text
              style={[
                styles.sourceTagText,
                isVirtualWeather ? styles.sourceTagTextFallback : styles.sourceTagTextLive,
              ]}
            >
              {sourceTagText}
            </Text>
          </View>
        )}

        <View style={styles.cardTextCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.trailTitle, { color: colors.textMain }]}>산책 정보</Text>
            <View style={styles.detailLinkWrap}>
              <Text style={[styles.detailLinkText, { color: colors.primaryDark }]}>상세보기</Text>
              <Text style={[styles.detailLinkArrow, { color: colors.primaryDark }]}>›</Text>
            </View>
          </View>
          <Text style={[styles.trailDescription, { color: colors.textMuted }]} numberOfLines={2}>
            {isLoadingWeather ? '산책 정보를 받아오고 있어요...' : weatherNotice}
          </Text>
          <View style={[styles.goldenBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.goldenBadgeText, { color: colors.primaryDark }]}>
              {walkBadgeText}
            </Text>
          </View>
        </View>

        {/* 개선된 산책 지수 (점수/단위 분리, 진행 막대, 등급 배지) */}
        <View style={styles.walkIndexWrap}>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreNumber, { color: colors.textMain }]}>{walkIndex.score}</Text>
            <Text style={[styles.scoreUnit, { color: colors.textMuted }]}>점</Text>
          </View>
          <View style={[styles.scoreBarTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.scoreBarFill,
                { width: `${Math.min(100, Math.max(0, walkIndex.score))}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
          <View style={[styles.gradeBadge, { backgroundColor: isDark ? 'rgba(90, 115, 97, 0.3)' : '#E8EFE9' }]}>
            <Text style={[styles.gradeBadgeText, { color: colors.primaryDark }]}>{walkIndex.grade}</Text>
          </View>
        </View>

        {/* 점수와 나무 일러스트 사이 얇은 구분선 */}
        <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />

        {/* 나무 및 보태니컬 서브 일러스트 (입체감 있는 자연 비주얼) */}
        <View style={styles.treeImageWrap}>
          <View pointerEvents="none" style={styles.bushSubDeco}>
            <Image
              source={bushImg}
              style={[styles.bushImage, { opacity: isDark ? 0.22 : 0.34 }]}
              resizeMode="contain"
            />
          </View>
          <Image source={trees01Img} style={styles.tree01Image} resizeMode="contain" />
        </View>
      </TouchableOpacity>

      {/* 3. 이번 주 산책 달성도 위젯 (7일 발자국 스탬프 도장 형식) */}
      <WeeklyWalkStampCard weeklyStats={weeklyStats} onPress={onOpenStats} />
    </View>
  );
};

const styles = StyleSheet.create({
  sheetContainer: { width: '100%', backgroundColor: '#F5EFE0', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#DCD2BE', alignSelf: 'center', marginBottom: 2 },
  trailCard: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FDFAF4',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#EFE7D6',
    shadowColor: '#5A7361',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  trailAuraGlow: { position: 'absolute', top: -24, right: -10, width: 140, height: 140, borderRadius: 70 },
  bushSubDeco: { position: 'absolute', bottom: -3, left: -12, width: 28, height: 20, zIndex: 1 },
  bushImage: { width: '100%', height: '100%' },
  cardTextCol: { flex: 1, paddingRight: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  trailTitle: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '800', color: '#2D3A31', letterSpacing: -0.2 },
  detailLinkWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  detailLinkText: { fontSize: 11, fontWeight: '700', letterSpacing: -0.2 },
  detailLinkArrow: { fontSize: 12, fontWeight: '700', lineHeight: 13 },
  trailDescription: { fontSize: TYPOGRAPHY.support, lineHeight: TYPOGRAPHY_LINE_HEIGHT.support, color: '#758579', fontWeight: '500', marginBottom: 4 },
  goldenBadge: { alignSelf: 'flex-start', backgroundColor: '#E3ECE4', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  goldenBadgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '700', color: '#5A7361' },
  sourceTag: { position: 'absolute', top: 7, right: 9, zIndex: 2, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 5, borderWidth: 1 },
  sourceTagLive: { borderColor: 'rgba(37, 99, 235, 0.3)' },
  sourceTagFallback: { borderColor: 'rgba(217, 119, 6, 0.35)' },
  sourceTagText: { fontSize: 10, fontWeight: '700', letterSpacing: -0.2 },
  sourceTagTextLive: { color: '#2563EB' },
  sourceTagTextFallback: { color: '#B45309' },
  // 산책 지수 UI 스타일
  walkIndexWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 48, marginLeft: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  scoreNumber: { fontSize: TYPOGRAPHY.metricValue, fontWeight: '900', letterSpacing: -0.6, lineHeight: TYPOGRAPHY_LINE_HEIGHT.metricValue },
  scoreUnit: { fontSize: TYPOGRAPHY.caption, fontWeight: '700', marginBottom: 1.5, marginLeft: 1 },
  scoreBarTrack: { width: 44, height: 3, borderRadius: 1.5, marginVertical: 3, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 1.5 },
  gradeBadge: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 5, alignItems: 'center' },
  gradeBadgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '700' },
  verticalDivider: { width: 1, height: 38, marginHorizontal: 8, opacity: 0.7 },
  treeImageWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', opacity: 0.9, marginTop: 8 },
  tree01Image: { width: 52, height: 52 },
});
