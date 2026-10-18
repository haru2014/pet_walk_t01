/**
 * [편안하개 - PetWalk]
 * 모바일 홈 화면 (Screen-02, docs/screenshots/02_home_screen.png 원형 복원 및 스크롤 방지 최적화)
 *
 * 1. 상단 환영 인사: "오늘도 편안하게, 우리 아이와 걸어요. 🐾"
 * 2. 활성 반려견 카드: 프로필, 상태 뱃지, 30분/폭신한길 칩, 원터치 [산책 시작 →] 버튼
 * 3. 지면온도 골든타임 위젯: 실시간 기상청 예보 연동 지면온도 추천 바
 * 4. 최근 피드백 AI 보정 브리핑 (선택)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useAppTheme } from '../theme/themeManager';
import { DogProfile } from '../types/dogProfile';
import { HomeDogCard } from '../components/home/HomeDogCard';
import { GoldenTimeWidget } from '../components/home/GoldenTimeWidget';
import { TrailAccomplishmentWidget } from '../components/home/TrailAccomplishmentWidget';
import { FeedbackContextService, FeedbackSummaryPayload } from '../services/feedbackContext';
import { AppIcon } from '../components/common/AppIcon';
import { fetchHeatRiskForecast } from '../services/weatherApi';
import { HeatRiskResponse } from '../types/weather';
import { LocalStorageService } from '../services/storage';
import { WalkStatisticsService, WeeklyWalkStats } from '../services/walkStatisticsService';
import { useHomeResponsive } from '../hooks/useHomeResponsive';

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
  const responsive = useHomeResponsive();
  const [weather, setWeather] = useState<HeatRiskResponse | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyWalkStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetchHeatRiskForecast(36.3628, 127.3592, { forceRefresh: true });
      setWeather(res);
    } catch {
      // 오프라인 폴백 처리
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    void fetchHeatRiskForecast(36.3628, 127.3592).then((res) => {
      if (isMounted) {
        setWeather(res);
      }
    });
    void LocalStorageService.getWalkHistory().then((history) => {
      if (isMounted) {
        setWeeklyStats(WalkStatisticsService.getWeeklyStats(history));
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingHorizontal: responsive.screenPaddingHorizontal,
          paddingTop: responsive.screenPaddingTop,
          paddingBottom: responsive.screenPaddingBottom,
        },
      ]}
      showsVerticalScrollIndicator={false}
      bounces={true}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <View style={[styles.mainColumn, { gap: responsive.screenGap }]}>
        {/* 1. 환영 인사 (반응형 헤더) */}
        <View style={[styles.greetingSection, { marginBottom: responsive.greetingMarginBottom }]}>
          <Text style={[styles.greetingSub, { color: colors.textMuted, fontSize: responsive.greetingSubSize }]}>
            오늘도 편안하게,
          </Text>
          <View style={styles.greetingMainRow}>
            <Text style={[styles.greetingMain, { color: colors.textMain, fontSize: responsive.greetingMainSize }]}>
              우리 아이와 걸어요.
            </Text>
            <AppIcon name="paw" size={responsive.greetingPawIconSize} color={colors.primary} />
          </View>
        </View>

        {/* 2. 메인 반려견 카드 / 다견 슬라이더 (반응형 스케일링) */}
        <HomeDogCard
          profile={dog}
          dogs={dogs}
          selectedDogId={selectedDogId}
          onSelectDog={onSelectDog}
          onAddDog={onAddDog}
          onPressProfile={onPressProfile}
          onStartWalk={onStartWalk}
        />

        {/* 3. 오늘 강아지 산책지수 위젯 (지면온도/기상청 연동 산책지수) */}
        <GoldenTimeWidget weather={weather} />

        {/* (선택) 최근 피드백 AI 보정 브리핑 */}
        {feedbackSummary && feedbackSummary.recent_walk_count > 0 && (
          <View
            style={[
              styles.feedbackBadge,
              {
                backgroundColor: colors.primaryLight,
                borderColor: colors.primary,
                paddingVertical: responsive.isSpacious ? 8 : 5,
              },
            ]}
          >
            <View style={styles.feedbackIconWrap}>
              <AppIcon name="sparkle" size={responsive.isSpacious ? 15 : 13} color={colors.primaryDark} />
            </View>
            <Text
              style={[
                styles.feedbackText,
                { color: colors.primaryDark, fontSize: responsive.isSpacious ? 11.5 : 10.5 },
              ]}
            >
              AI 맞춤 보정: {FeedbackContextService.generateBriefingNotice(feedbackSummary)}
            </Text>
          </View>
        )}

        {/* 4. 이번 주 산책 달성도 위젯 (일주일 7일 발자국 게이지) */}
        <TrailAccomplishmentWidget
          stats={weeklyStats}
          onPress={onOpenStats}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  mainColumn: {
    flex: 1,
    justifyContent: 'space-between',
  },
  greetingSection: {
    marginBottom: 0,
  },
  greetingSub: {
    fontWeight: '500',
    marginBottom: 1,
  },
  greetingMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  greetingMain: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  feedbackBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  feedbackIconWrap: {
    marginTop: 1,
  },
  feedbackText: {
    lineHeight: 15,
    fontWeight: '600',
    flex: 1,
  },
});

