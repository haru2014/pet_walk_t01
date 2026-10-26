/**
 * [편안하개 - PetWalk]
 * 모바일 홈 화면 (디자인 시안 02번 Dusty Amber & Sage Green - Phase 2 개선)
 * (docs/reference/UI개선/prompt/UI오류수정_계획.md 기준)
 *
 * 1. 상단 좌측 버튼/빈 공간 제거 및 갈색 카드 내 알림 버튼 이관
 * 2. 갈색 카드 타이틀 '바로 산책하기' 적용
 * 3. Trail info 카드 터치 시 기존 골든타임 모달(WeatherDetailModal, SSOT) 연동
 * 4. 지도 flex: 1 반응형 및 무스크롤 레이아웃
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { DogProfile } from '../types/dogProfile';
import { FeedbackSummaryPayload } from '../services/feedbackContext';
import { fetchHeatRiskForecast } from '../services/weatherApi';
import { HeatRiskResponse } from '../types/weather';
import { LocalStorageService } from '../services/storage';
import { WalkStatisticsService, WeeklyWalkStats } from '../services/walkStatisticsService';
import { warmupBackendServer } from '../services/apiClient';
import { getCurrentLocationCoords } from '../services/locationService';
import { useAppTheme } from '../theme/themeManager';

import { HomeParkWalkCardN2 } from '../components/home/HomeParkWalkCardN2';
import { HomeTrailInfoCardN2 } from '../components/home/HomeTrailInfoCardN2';
import {
  WeatherDetailModal,
  computeWeatherModalProps,
} from '../components/home/GoldenTimeWidget';
import { HomeNotificationModal } from '../components/home/HomeNotificationModal';
import { getNearbyHazardReports, NearbyHazardReport } from '../services/hazardApi';

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
  const { colors } = useAppTheme();
  const [weather, setWeather] = useState<HeatRiskResponse | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(true);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyWalkStats | null>(null);
  const [weatherModalVisible, setWeatherModalVisible] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [hasUnreadNotification, setHasUnreadNotification] = useState(true);
  const [nearbyHazards, setNearbyHazards] = useState<NearbyHazardReport[]>([]);
  const [userCoords, setUserCoords] = useState<{ lon: number; lat: number } | null>(null);

  useEffect(() => {
    warmupBackendServer();
    let isMounted = true;
    void getCurrentLocationCoords(4000).then((res) => {
      if (isMounted && res.ok && res.coords) {
        setUserCoords({ lon: res.coords.longitude, lat: res.coords.latitude });
      }
    });
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
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const lat = userCoords?.lat ?? 36.3628;
    const lon = userCoords?.lon ?? 127.3592;
    void getNearbyHazardReports(lat, lon, 300)
      .then((reports) => {
        if (isMounted) setNearbyHazards(reports);
      })
      .catch(() => {
        // 네트워크 장애 시 빈 제보 목록 유지
      });
    return () => {
      isMounted = false;
    };
  }, [userCoords?.lat, userCoords?.lon]);

  const modalProps = useMemo(() => computeWeatherModalProps(weather), [weather]);

  useEffect(() => {
    let isMounted = true;
    void LocalStorageService.getWalkHistory().then((history) => {
      if (!isMounted) return;
      setWeeklyStats(WalkStatisticsService.getWeeklyStats(history));
    });
    return () => {
      isMounted = false;
    };
  }, [dog.id]);

  const handlePressNotification = () => {
    setHasUnreadNotification(false);
    setNotificationModalVisible(true);
    onOpenNotification?.();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 1. 상단 테마 메인 배경 영역 (마스코트 및 메인 카드) */}
      <View style={[styles.topSageSection, { backgroundColor: colors.primaryDark }]}>
        <HomeParkWalkCardN2
          dog={dog}
          dogs={dogs}
          onSelectDog={onSelectDog}
          onPressProfile={onPressProfile}
          onPressNotification={handlePressNotification}
          hasUnreadNotification={hasUnreadNotification}
          onStartWalk={onStartWalk}
          courseName="바로 산책하기"
          userCoords={userCoords}
        />
      </View>

      {/* 2. 하단 시트 영역 (Trail info + Leaf Green 안심 지표) */}
      <HomeTrailInfoCardN2
        weather={weather}
        isLoadingWeather={isLoadingWeather}
        dog={dog}
        feedbackSummary={feedbackSummary}
        weeklyStats={weeklyStats}
        onOpenStats={onOpenStats}
        onOpenPlanner={onOpenPlanner}
        onOpenWeatherModal={() => setWeatherModalVisible(true)}
      />

      {/* 3. Trail info 터치 시 열리는 기존 골든타임 상세 모달 (SSOT 재사용) */}
      <WeatherDetailModal
        visible={weatherModalVisible}
        onClose={() => setWeatherModalVisible(false)}
        colors={colors}
        quotient={modalProps.quotient}
        subtitleText={modalProps.subtitleText}
        currentAirTemp={modalProps.currentAirTemp}
        roundedSurfaceTemp={modalProps.roundedSurfaceTemp}
        riskLevel={modalProps.riskLevel}
        popPercent={modalProps.popPercent}
        airQualityColor={modalProps.airQualityColor}
        airQualityLabel={modalProps.airQualityLabel}
        airQuality={modalProps.airQuality}
        isTomorrow={modalProps.isTomorrow}
        timeRangeDisplay={modalProps.timeRangeDisplay}
        weather={weather}
      />

      {/* 4. 종 아이콘(🔔) 터치 시 열리는 안심 산책 스마트 알림 센터 모달 */}
      <HomeNotificationModal
        visible={notificationModalVisible}
        onClose={() => setNotificationModalVisible(false)}
        weather={weather}
        dog={dog}
        weeklyStats={weeklyStats}
        nearbyHazards={nearbyHazards}
        onOpenWeatherModal={() => {
          setNotificationModalVisible(false);
          setWeatherModalVisible(true);
        }}
        onStartWalk={onStartWalk}
        onOpenPlanner={onOpenPlanner}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSageSection: {
    flex: 1,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
});
