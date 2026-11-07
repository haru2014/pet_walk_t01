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
import { prewarmCurrentLocation, warmupBackendServer } from '../services/apiClient';
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
import { getPilotParkById } from '../types/pilotParks';

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
  pilotParkId?: string;
  initialUserCoords?: { lon: number; lat: number } | null;
  onUpdateUserCoords?: (coords: { lat: number; lon: number }) => void;
}

/**
 * 홈 날씨 및 주변 안전 정보 조회에 사용할 시작 좌표를 결정한다 (#281).
 * 1. 사용자 GPS 좌표(4초 이내) 획득 성공 시 사용자 위치 좌표 반환
 * 2. 실패/권한 거부/타임아웃 시 선택한 공원(또는 기본 유림공원) 중심 좌표 반환
 */
export async function resolveHomeScreenWeatherCoords(
  pilotParkId?: string,
  getLocation = getCurrentLocationCoords,
): Promise<{ lat: number; lon: number; isGps: boolean }> {
  const fallbackPark = getPilotParkById(pilotParkId);
  try {
    const res = await getLocation(4000);
    if (res.ok && res.coords) {
      return { lat: res.coords.latitude, lon: res.coords.longitude, isGps: true };
    }
  } catch (err) {
    console.warn('[HomeScreen] 현재 위치 조회 실패 (선택 공원 폴백 사용):', err);
  }
  return { lat: fallbackPark.center.lat, lon: fallbackPark.center.lon, isGps: false };
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
  pilotParkId,
  initialUserCoords,
  onUpdateUserCoords,
}) => {
  const { colors } = useAppTheme();
  const [weather, setWeather] = useState<HeatRiskResponse | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(true);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyWalkStats | null>(null);
  const [weatherModalVisible, setWeatherModalVisible] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [hasUnreadNotification, setHasUnreadNotification] = useState(true);
  const [nearbyHazards, setNearbyHazards] = useState<NearbyHazardReport[]>([]);
  const [userCoords, setUserCoords] = useState<{ lon: number; lat: number } | null>(() => {
    if (initialUserCoords) return initialUserCoords;
    return null;
  });

  const fallbackPark = useMemo(() => getPilotParkById(pilotParkId), [pilotParkId]);

  useEffect(() => {
    warmupBackendServer();
    let isMounted = true;

    void (async () => {
      const coords = await resolveHomeScreenWeatherCoords(pilotParkId);
      if (!isMounted) return;

      if (coords.isGps) {
        setUserCoords({ lon: coords.lon, lat: coords.lat });
        onUpdateUserCoords?.({ lat: coords.lat, lon: coords.lon });
        // 첫 코스 요청이 날씨·주변 길 조회를 기다리지 않도록 서버가 미리 받아 두게 한다
        prewarmCurrentLocation(coords.lat, coords.lon);
      }

      try {
        const weatherRes = await fetchHeatRiskForecast(coords.lat, coords.lon);
        if (isMounted) {
          setWeather(weatherRes);
          setIsLoadingWeather(false);
        }
      } catch {
        if (isMounted) {
          setIsLoadingWeather(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [fallbackPark.center.lat, fallbackPark.center.lon, pilotParkId, onUpdateUserCoords]);

  useEffect(() => {
    let isMounted = true;
    const lat = userCoords?.lat ?? fallbackPark.center.lat;
    const lon = userCoords?.lon ?? fallbackPark.center.lon;
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
  }, [userCoords?.lat, userCoords?.lon, fallbackPark.center.lat, fallbackPark.center.lon]);

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
        {/* 자연 톤 오로라/메시 블렌딩 데코 (중심이 어긋난 다중 타원으로 은은한 유기적 깊이감 형성) */}
        <View pointerEvents="none" style={styles.ambientAuraTop} />
        <View pointerEvents="none" style={styles.ambientAuraTopSub} />
        <View pointerEvents="none" style={styles.ambientAuraBottom} />
        <View pointerEvents="none" style={styles.ambientAuraBottomSub} />

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
        isLoading={isLoadingWeather}
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
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  ambientAuraTop: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  ambientAuraTopSub: {
    position: 'absolute',
    top: -15,
    right: 25,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  ambientAuraBottom: {
    position: 'absolute',
    bottom: -60,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(0, 0, 0, 0.07)',
  },
  ambientAuraBottomSub: {
    position: 'absolute',
    bottom: -20,
    left: 20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
});
