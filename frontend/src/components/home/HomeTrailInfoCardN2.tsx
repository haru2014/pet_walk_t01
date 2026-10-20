/**
 * [편안하개 - PetWalk]
 * 디자인 시안 02번 (Dusty Amber & Sage Green) 하단 Trail Info 카드 시트
 * (docs/reference/UI개선/app_design_n2-1.png 기준)
 *
 * 1. 상단 슬림 핸들 바
 * 2. Trail info 카드: 실시간 기상/지면온도 산책지수 + trees_01.png 자연 일러스트
 * 3. Leaf Green 카드: 노면 상태 및 관절 안심 맞춤 지표 + tree_02.png 일러스트
 * 4. 최근 AI 산책 피드백 / 주간 통계 퀵 링크
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { HeatRiskResponse } from '../../types/weather';
import { DogProfile } from '../../types/dogProfile';
import { FeedbackSummaryPayload } from '../../services/feedbackContext';
import { WeeklyWalkStats } from '../../services/walkStatisticsService';
import trees01Img from '../../../assets/ui_n2/trees_01.png';
import tree02Img from '../../../assets/ui_n2/tree_02.png';

export interface HomeTrailInfoCardN2Props {
  weather: HeatRiskResponse | null;
  isLoadingWeather?: boolean;
  dog: DogProfile;
  feedbackSummary: FeedbackSummaryPayload | null;
  weeklyStats: WeeklyWalkStats | null;
  onOpenStats?: () => void;
  onOpenPlanner?: () => void;
}

export const HomeTrailInfoCardN2: React.FC<HomeTrailInfoCardN2Props> = ({
  weather,
  isLoadingWeather = false,
  dog,
  feedbackSummary,
  weeklyStats,
  onOpenStats,
  onOpenPlanner,
}) => {
  // 실시간 기상 및 지면온도 브리핑 문구 생성
  const surfaceTemp = weather?.current_surface_temp ?? 24.8;
  const isGolden = weather?.is_current_golden ?? true;

  const weatherNotice = isGolden
    ? `지면온도 ${surfaceTemp.toFixed(1)}℃로 시원해요!\n안심하고 걷기 좋은 골든타임입니다.`
    : `지면온도 ${surfaceTemp.toFixed(1)}℃ (주의)\n그늘 숲길과 서늘한 시간대를 추천해요.`;

  // 관절 케어 레벨 및 노면 정보
  const jointLevel = dog.jointCareLevel ?? 1;
  const jointCareText = jointLevel >= 2
    ? '관절 집중 케어: 폭신한 흙길 85% 이상 권장'
    : '폭신 노면 78% · 평탄한 완만 산책로';

  return (
    <View style={styles.sheetContainer}>
      {/* 1. 상단 핸들 바 */}
      <View style={styles.handleBar} />

      {/* 2. 메인 Trail info 카드 */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onOpenPlanner}
        style={styles.trailCard}
        accessibilityLabel="산책로 정보 및 코스 탐색"
      >
        <View style={styles.cardTextCol}>
          <Text style={styles.trailTitle}>Trail info</Text>
          <Text style={styles.trailDescription} numberOfLines={2}>
            {isLoadingWeather ? '실시간 산책 지표를 확인하고 있어요...' : weatherNotice}
          </Text>
          <View style={styles.goldenBadge}>
            <Text style={styles.goldenBadgeText}>
              {isGolden ? '✨ 골든타임 산책 추천' : '⚠️ 낮 시간대 그늘길 권장'}
            </Text>
          </View>
        </View>
        <View style={styles.treeImageWrap}>
          <Image source={trees01Img} style={styles.tree01Image} resizeMode="contain" />
        </View>
      </TouchableOpacity>

      {/* 3. 서브 Leaf Green 카드 (노면 & 관절 안심 지표) */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onOpenStats}
        style={styles.leafGreenCard}
        accessibilityLabel="노면 상태 및 주간 산책 지표"
      >
        <View style={styles.cardTextCol}>
          <Text style={styles.leafTitle}>Leaf Green</Text>
          <Text style={styles.leafDescription} numberOfLines={2}>
            {jointCareText}
          </Text>
          {weeklyStats && (
            <Text style={styles.statsMiniText}>
              이번 주 {weeklyStats.totalWalks}회 산책 ({weeklyStats.totalDistanceKm.toFixed(1)}km 완주)
            </Text>
          )}
        </View>
        <View style={styles.tree02ImageWrap}>
          <Image source={tree02Img} style={styles.tree02Image} resizeMode="contain" />
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    width: '100%',
    backgroundColor: '#F5EFE0', // Soft Cream
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  handleBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DCD2BE',
    alignSelf: 'center',
    marginBottom: 6,
  },
  trailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FDFAF4', // Warm Cream White
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#EFE7D6',
    shadowColor: '#5A7361',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  trailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2D3A31', // Deep Sage Charcoal
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  trailDescription: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#758579',
    fontWeight: '500',
    marginBottom: 8,
  },
  goldenBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E3ECE4', // Soft Sage
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  goldenBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5A7361',
  },
  treeImageWrap: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tree01Image: {
    width: 80,
    height: 80,
  },
  leafGreenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E3ECE4', // Soft Leaf Green Wash
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#D4E2D6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    overflow: 'hidden',
  },
  leafTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3E5244',
    marginBottom: 4,
  },
  leafDescription: {
    fontSize: 12,
    lineHeight: 16,
    color: '#5A7361',
    fontWeight: '600',
    marginBottom: 4,
  },
  statsMiniText: {
    fontSize: 11,
    color: '#758579',
    fontWeight: '500',
  },
  tree02ImageWrap: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tree02Image: {
    width: 64,
    height: 64,
  },
});
