/**
 * [편안하개 - PetWalk]
 * 모바일 홈 화면 (디자인 시안 02번 Dusty Amber & Sage Green 전면 개편)
 * (docs/reference/UI개선/app_design_n2-1.png 기준)
 *
 * 1. 상단: Sage Green 바탕, 메뉴 아이콘, 알림 아이콘 (HomeHeaderN2)
 * 2. 메인 카드: 카드 상단에 걸쳐진 강아지 마스코트, Park Walk Mode, 실제 코스 지도, 산책 거리/시간, 시작 버튼 (HomeParkWalkCardN2)
 * 3. 정보 카드: Trail info(지면온도/기상 산책지수 + 나무 일러스트), Leaf Green(노면 및 관절 지표) (HomeTrailInfoCardN2)
 * 4. 기존 비즈니스 로직(반려견 선택, 산책 시작, 날씨 연동, 주간 통계) 100% 보존
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { DogProfile } from '../types/dogProfile';
import { FeedbackSummaryPayload } from '../services/feedbackContext';
import { fetchHeatRiskForecast } from '../services/weatherApi';
import { HeatRiskResponse } from '../types/weather';
import { LocalStorageService } from '../services/storage';
import { WalkStatisticsService, WeeklyWalkStats } from '../services/walkStatisticsService';
import { warmupBackendServer } from '../services/apiClient';

import { HomeHeaderN2 } from '../components/home/HomeHeaderN2';
import { HomeParkWalkCardN2 } from '../components/home/HomeParkWalkCardN2';
import { HomeTrailInfoCardN2 } from '../components/home/HomeTrailInfoCardN2';

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
  onOpenMenu?: () => void;
  onOpenNotification?: () => void;
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
  onOpenMenu,
  onOpenNotification,
}) => {
  const [weather, setWeather] = useState<HeatRiskResponse | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(true);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyWalkStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setIsLoadingWeather(true);
    try {
      const res = await fetchHeatRiskForecast(36.3628, 127.3592, { forceRefresh: true });
      setWeather(res);
    } catch {
      // 오프라인 폴백 처리
    } finally {
      setIsLoadingWeather(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    warmupBackendServer();
    let isMounted = true;
    void fetchHeatRiskForecast(36.3628, 127.3592)
      .then((res) => {
        if (isMounted) {
          setWeather(res);
          setIsLoadingWeather(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoadingWeather(false);
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
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      bounces={true}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#5A7361']}
          tintColor="#5A7361"
        />
      }
    >
      {/* 1. 상단 Sage Green 배경 영역 (헤더 + 마스코트 및 Park Walk Mode 메인 카드) */}
      <View style={styles.topSageSection}>
        <HomeHeaderN2
          onPressMenu={onOpenMenu ?? onPressProfile}
          onPressNotification={onOpenNotification}
        />

        <View style={styles.mainCardPadding}>
          <HomeParkWalkCardN2
            dog={dog}
            dogs={dogs}
            onSelectDog={onSelectDog}
            onPressProfile={onPressProfile}
            onStartWalk={onStartWalk}
            estimatedMinutes={30}
            distanceKm="2.1 km"
            courseName="Park Walk Mode"
          />
        </View>
      </View>

      {/* 2. 하단 Soft Cream 시트 영역 (Trail info + Leaf Green 안심 지표) */}
      <HomeTrailInfoCardN2
        weather={weather}
        isLoadingWeather={isLoadingWeather}
        dog={dog}
        feedbackSummary={feedbackSummary}
        weeklyStats={weeklyStats}
        onOpenStats={onOpenStats}
        onOpenPlanner={onOpenPlanner}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EFE0', // Soft Cream
  },
  contentContainer: {
    flexGrow: 1,
  },
  topSageSection: {
    backgroundColor: '#5A7361', // Sage Green 메인 배경
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingBottom: 20,
  },
  mainCardPadding: {
    paddingHorizontal: 18,
  },
});
