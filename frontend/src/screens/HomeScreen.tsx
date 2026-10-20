/**
 * [편안하개 - PetWalk]
 * 모바일 홈 화면 (디자인 시안 02번 Dusty Amber & Sage Green - Phase 1 무스크롤 개편)
 * (docs/reference/UI개선/prompt/UI오류수정_계획.md 기준)
 *
 * 1. 상단 좌측 버튼 및 상단 헤더 빈 공간 완전 제거 (공간 회수)
 * 2. 갈색 카드(HomeParkWalkCardN2) 내부로 알림 종 버튼 이관 및 강아지 드롭다운(48px 이상) 연동
 * 3. 지도 영역 flex: 1 반응형 전환 (남는 높이 채움)
 * 4. UX_COMPACT_RULES.md 11번 '스크롤 금지' 적용 (ScrollView/RefreshControl 제거 및 자동 갱신)
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { DogProfile } from '../types/dogProfile';
import { FeedbackSummaryPayload } from '../services/feedbackContext';
import { fetchHeatRiskForecast } from '../services/weatherApi';
import { HeatRiskResponse } from '../types/weather';
import { LocalStorageService } from '../services/storage';
import { WalkStatisticsService, WeeklyWalkStats } from '../services/walkStatisticsService';
import { warmupBackendServer } from '../services/apiClient';

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
  onOpenNotification?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  dog,
  dogs,
  selectedDogId: _selectedDogId,
  onSelectDog,
  onAddDog: _onAddDog,
  feedbackSummary,
  onPressProfile,
  onStartWalk,
  onOpenPlanner,
  onOpenStats,
  onOpenNotification,
}) => {
  const [weather, setWeather] = useState<HeatRiskResponse | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(true);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyWalkStats | null>(null);

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
    <View style={styles.container}>
      {/* 1. 상단 Sage Green 배경 영역 (마스코트 및 메인 카드) */}
      <View style={styles.topSageSection}>
        <HomeParkWalkCardN2
          dog={dog}
          dogs={dogs}
          onSelectDog={onSelectDog}
          onPressProfile={onPressProfile}
          onPressNotification={onOpenNotification}
          onStartWalk={onStartWalk}
          estimatedMinutes={30}
          distanceKm="2.1 km"
          courseName="Park Walk Mode"
        />
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5EFE0', // Soft Cream
  },
  topSageSection: {
    flex: 1,
    backgroundColor: '#5A7361', // Sage Green 메인 배경
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
});
