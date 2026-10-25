import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { HeatRiskResponse } from '../../types/weather';
import { DogProfile } from '../../types/dogProfile';
import { FeedbackSummaryPayload } from '../../services/feedbackContext';
import { WeeklyWalkStats } from '../../services/walkStatisticsService';
import { useAppTheme } from '../../theme/themeManager';
import { WeeklyWalkStampCard } from './WeeklyWalkStampCard';
import trees01Img from '../../../assets/ui_n2/trees_01.png';

function computeWalkIndex(weather: HeatRiskResponse | null): { score: number; grade: string } {
  if (!weather) return { score: 92, grade: '매우 좋음' };
  const temp = weather.current_surface_temp ?? 25.0;
  if (weather.current_risk_level === 'DANGER' || temp > 45) return { score: 38, grade: '주의' };
  if (weather.current_risk_level === 'CAUTION' || temp > 35) return { score: 65, grade: '보통' };
  if ((weather.pop ?? 0) >= 60) return { score: 62, grade: '보통' };
  if (weather.is_current_golden && temp <= 28) {
    const s = Math.max(90, Math.min(98, Math.round(96 - Math.abs(temp - 24) * 1.5)));
    return { score: s, grade: '매우 좋음' };
  }
  return { score: 85, grade: '좋음' };
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
  dog,
  feedbackSummary,
  weeklyStats,
  onOpenStats,
  onOpenPlanner,
  onOpenWeatherModal,
}) => {
  const { theme, colors } = useAppTheme();
  const isDark = theme === 'dark';

  const surfaceTemp = weather?.current_surface_temp ?? 24.8;
  const isGolden = weather?.is_current_golden ?? true;
  const weatherNotice = isGolden
    ? `지면온도 ${surfaceTemp.toFixed(1)}℃로 시원해요!\n안심하고 걷기 좋은 골든타임입니다.`
    : `지면온도 ${surfaceTemp.toFixed(1)}℃ (주의)\n그늘 숲길과 서늘한 시간대를 추천해요.`;

  const walkIndex = computeWalkIndex(weather);

  return (
    <View style={[styles.sheetContainer, { backgroundColor: colors.background }]}>
      {/* 1. 상단 슬림 핸들 바 */}
      <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

      {/* 2. 메인 Trail info 카드 (골든타임 기상 모달 오픈) */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onOpenWeatherModal ?? onOpenPlanner}
        style={[styles.trailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel="골든타임 산책로 정보 및 기상 상세 보기"
      >
        <View style={styles.cardTextCol}>
          <Text style={[styles.trailTitle, { color: colors.textMain }]}>Trail info</Text>
          <Text style={[styles.trailDescription, { color: colors.textMuted }]} numberOfLines={2}>
            {isLoadingWeather ? '실시간 산책 지표를 확인하고 있어요...' : weatherNotice}
          </Text>
          <View style={[styles.goldenBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.goldenBadgeText, { color: colors.primaryDark }]}>
              {isGolden ? '✨ 골든타임 산책 추천' : '⚠️ 낮 시간대 그늘길 권장'}
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
                {
                  width: `${Math.min(100, Math.max(0, walkIndex.score))}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
          <View style={[styles.gradeBadge, { backgroundColor: isDark ? 'rgba(90, 115, 97, 0.3)' : '#E8EFE9' }]}>
            <Text style={[styles.gradeBadgeText, { color: colors.primaryDark }]}>{walkIndex.grade}</Text>
          </View>
        </View>

        {/* 점수와 나무 일러스트 사이 얇은 구분선 */}
        <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />

        {/* 나무 일러스트 (시각적 우선순위 유지) */}
        <View style={styles.treeImageWrap}>
          <Image source={trees01Img} style={styles.tree01Image} resizeMode="contain" />
        </View>
      </TouchableOpacity>

      {/* 3. 이번 주 산책 달성도 위젯 (7일 발자국 스탬프 도장 형식) */}
      <WeeklyWalkStampCard weeklyStats={weeklyStats} onPress={onOpenStats} />
    </View>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    width: '100%',
    backgroundColor: '#F5EFE0',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
  },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#DCD2BE', alignSelf: 'center', marginBottom: 2 },
  trailCard: {
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  cardTextCol: { flex: 1, paddingRight: 6 },
  trailTitle: { fontSize: 16, fontWeight: '800', color: '#2D3A31', marginBottom: 3, letterSpacing: -0.2 },
  trailDescription: { fontSize: 11.5, lineHeight: 15, color: '#758579', fontWeight: '500', marginBottom: 4 },
  goldenBadge: { alignSelf: 'flex-start', backgroundColor: '#E3ECE4', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  goldenBadgeText: { fontSize: 10, fontWeight: '700', color: '#5A7361' },
  // 산책 지수 UI 스타일
  walkIndexWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 48, marginLeft: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  scoreNumber: { fontSize: 22, fontWeight: '900', letterSpacing: -0.6, lineHeight: 24 },
  scoreUnit: { fontSize: 11, fontWeight: '700', marginBottom: 1.5, marginLeft: 1 },
  scoreBarTrack: { width: 44, height: 3, borderRadius: 1.5, marginVertical: 3, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 1.5 },
  gradeBadge: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 5, alignItems: 'center' },
  gradeBadgeText: { fontSize: 9.5, fontWeight: '700' },
  verticalDivider: { width: 1, height: 38, marginHorizontal: 8, opacity: 0.7 },
  treeImageWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', opacity: 0.9 },
  tree01Image: { width: 52, height: 52 },
});
