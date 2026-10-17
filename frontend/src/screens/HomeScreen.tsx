/**
 * [편안하개 - PetWalk]
 * 모바일 홈 화면 (Screen-02, docs/screenshots/02_home_screen.png 원형 복원 및 스크롤 방지 최적화)
 *
 * 1. 상단 환영 인사: "오늘도 편안하게, 우리 아이와 걸어요. 🐾"
 * 2. 활성 반려견 카드: 프로필, 상태 뱃지, 30분/폭신한길 칩, 원터치 [산책 시작 →] 버튼
 * 3. 지면온도 골든타임 위젯: 실시간 기상청 예보 연동 지면온도 추천 바
 * 4. 최근 피드백 AI 보정 브리핑 (선택)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAppTheme } from '../theme/themeManager';
import { DogProfile } from '../types/dogProfile';
import { HomeDogCard } from '../components/home/HomeDogCard';
import { GoldenTimeWidget } from '../components/home/GoldenTimeWidget';
import { FeedbackContextService, FeedbackSummaryPayload } from '../services/feedbackContext';
import { AppIcon } from '../components/common/AppIcon';
import { fetchHeatRiskForecast } from '../services/weatherApi';
import { HeatRiskResponse } from '../types/weather';

export interface HomeScreenProps {
  dog: DogProfile;
  dogs?: readonly DogProfile[];
  selectedDogId?: string;
  onSelectDog?: (dogId: string) => void;
  onAddDog?: () => void;
  feedbackSummary: FeedbackSummaryPayload | null;
  onPressProfile: () => void;
  onStartWalk: () => void;
  onOpenPlanner: () => void;
  onOpenStats?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  dog,
  dogs,
  selectedDogId,
  onSelectDog,
  onAddDog,
  feedbackSummary,
  onPressProfile,
  onStartWalk,
  onOpenPlanner,
  onOpenStats,
}) => {
  const { colors } = useAppTheme();
  const [weather, setWeather] = useState<HeatRiskResponse | null>(null);

  useEffect(() => {
    let isMounted = true;
    void fetchHeatRiskForecast(36.3628, 127.3592).then((res) => {
      if (isMounted) setWeather(res);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. 환영 인사 (02_home_screen.png 원형 복원) */}
      <View style={styles.greetingSection}>
        <Text style={[styles.greetingSub, { color: colors.textMuted }]}>오늘도 편안하게,</Text>
        <View style={styles.greetingMainRow}>
          <Text style={[styles.greetingMain, { color: colors.textMain }]}>우리 아이와 걸어요.</Text>
          <AppIcon name="paw" size={18} color={colors.primary} />
        </View>
      </View>

      {/* 2. 메인 반려견 카드 / 다견 슬라이더 (좌우 스와이프 페이징 연동) */}
      <HomeDogCard
        profile={dog}
        dogs={dogs}
        selectedDogId={selectedDogId}
        onSelectDog={onSelectDog}
        onAddDog={onAddDog}
        onPressProfile={onPressProfile}
        onStartWalk={onStartWalk}
      />

      {/* 3. 산책하기 좋은 시간 (지면온도 골든타임 위젯 실데이터 연동) */}
      <GoldenTimeWidget weather={weather} />

      {/* (선택) 최근 피드백 AI 보정 브리핑 (전체 메시지 가독성 확보) */}
      {feedbackSummary && feedbackSummary.recent_walk_count > 0 && (
        <View style={[styles.feedbackBadge, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <View style={styles.feedbackIconWrap}>
            <AppIcon name="sparkle" size={13} color={colors.primaryDark} />
          </View>
          <Text style={[styles.feedbackText, { color: colors.primaryDark }]}>
            AI 맞춤 보정: {FeedbackContextService.generateBriefingNotice(feedbackSummary)}
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24, // 하단 탭바에 마지막 카드가 잘리지 않도록 안전 여백 확보
    gap: 10,
  },
  greetingSection: {
    marginBottom: 2,
  },
  greetingSub: {
    fontSize: 12.5,
    fontWeight: '500',
    marginBottom: 1,
  },
  greetingMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  greetingMain: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  feedbackBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
  },
  feedbackIconWrap: {
    marginTop: 1,
  },
  feedbackText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    flex: 1,
  },
});
