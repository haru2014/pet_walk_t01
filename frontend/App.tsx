/**
 * [편안하개 - PetWalk]
 * React Native / Expo 모바일 메인 애플리케이션 (App.tsx)
 *
 * - 화면별 컴포넌트 모듈화 리팩터링 (단일 파일 250라인 이하 준수)
 * - Screen 01~05 사용자 여정 통합 라우팅
 * - Phase 4: Foreground GPS 추적 + 30m 전 TTS 안내 + 다크 포켓 모드
 * - Phase 5: 완주 기록 영구 저장 (100회 FIFO) & 3초 인포그래픽 리포트
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFonts } from 'expo-font';
import { View, StyleSheet, TouchableOpacity, Alert, StatusBar, Platform, Linking } from 'react-native';
import { AppText as Text } from './src/components/common/AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { TOKENS } from './src/theme/tokens';
import { themeManager, useAppTheme } from './src/theme/themeManager';
import { BottomTabBar, TabKey } from './src/components/common/BottomTabBar';
import { DogProfile, DEFAULT_DOGS, calculateRecommendedSpeedKmH, toWalkDogSummary } from './src/types/dogProfile';
import { WalkPreferences, RecommendedCourse } from './src/types/walkSettings';
import { LocalStorageService } from './src/services/storage';
import { FeedbackContextService, FeedbackSummaryPayload } from './src/services/feedbackContext';
import { STORAGE_KEYS, WalkRecord, WalkFeedback } from './src/types/storage';
import { TTSNavigationService } from './src/services/ttsNavigation';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from './src/services/sampleRoute';
import { useWalkGuidance } from './src/hooks/useWalkGuidance';
import { BookmarkedRoute, CoursePlan } from './src/types/bookmark';
import { RouteFeatureCollection, RouteStepPin } from './src/types/route';
import { calculateSafeSurfaceRatio, buildCourseSummary } from './src/services/routeGeometry';
import { createBookmark } from './src/services/bookmarkService';
import { useLocationConsent } from './src/hooks/useLocationConsent';
import { ConsentService } from './src/services/consentService';
import { LocationConsentModal } from './src/components/common/LocationConsentModal';
import { OnboardingService } from './src/services/onboardingService';
import { OnboardingWizard } from './src/components/onboarding/OnboardingWizard';
import { SupabaseService } from './src/services/supabaseService';
import { LandingAuthModal } from './src/components/auth/LandingAuthModal';
import { useAppBackHandler } from './src/hooks/useAppBackHandler';
import { generateUuid } from './src/utils/uuid';
import { calculateAverageSpeedKmH } from './src/services/walkFormat';

import { HomeScreen } from './src/screens/HomeScreen';
import { WalkTabScreen } from './src/screens/WalkTabScreen';
import { CommunityTabScreen } from './src/screens/CommunityTabScreen';
import { MyProfileTabScreen } from './src/screens/MyProfileTabScreen';
import { DarkPocketScreen } from './src/screens/DarkPocketScreen';
import { WalkReportScreen } from './src/screens/WalkReportScreen';
import { DogSelectionView } from './src/components/profile/DogSelectionView';
import { WalkSettingsView } from './src/components/walk/WalkSettingsView';
import { CourseRecommendationView } from './src/components/walk/CourseRecommendationView';
import { AppScreenHeader } from './src/components/common/AppScreenHeader';
import { ErrorBoundary } from './src/components/common/ErrorBoundary';
import { SplashScreen } from './src/components/common/SplashScreen';

export type AppSubScreen = 'main' | 'dog_selection' | 'walk_settings' | 'course_recommend' | 'pocket' | 'report' | 'onboarding';

const EMPTY_WALK_ROUTE: RouteFeatureCollection = { type: 'FeatureCollection', features: [] };

async function loadStartupDogProfiles(): Promise<{
  dogs: DogProfile[];
  selectedDogId: string;
  needsSelection: boolean;
}> {
  const savedProfiles = await LocalStorageService.getItem<DogProfile[]>(STORAGE_KEYS.DOG_PROFILES);
  if (savedProfiles !== null && Array.isArray(savedProfiles)) {
    const savedProfile = await LocalStorageService.getItem<DogProfile>(STORAGE_KEYS.DOG_PROFILE);
    const initialDog = savedProfiles.find((dog) => dog.id === savedProfile?.id) ?? savedProfiles[0];
    return {
      dogs: savedProfiles,
      selectedDogId: initialDog?.id ?? '',
      needsSelection: !initialDog,
    };
  }

  // Migrate the previous single-profile key while retaining the app's sample profiles.
  const savedProfile = await LocalStorageService.getItem<DogProfile>(STORAGE_KEYS.DOG_PROFILE);
  let migratedDogs: DogProfile[];
  if (savedProfile) {
    const exists = DEFAULT_DOGS.some((dog) => dog.id === savedProfile.id);
    migratedDogs = exists
      ? DEFAULT_DOGS.map((dog) => (dog.id === savedProfile.id ? savedProfile : dog))
      : [savedProfile, ...DEFAULT_DOGS];
  } else {
    migratedDogs = [...DEFAULT_DOGS];
  }

  await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILES, migratedDogs);
  if (!savedProfile) {
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, migratedDogs[0]);
  }
  return {
    dogs: migratedDogs,
    selectedDogId: savedProfile?.id ?? migratedDogs[0].id,
    needsSelection: false,
  };
}

function showPermissionDeniedAlert(): void {
  const msg = '화면이 꺼진 상태에서도 경로를 기록하고 음성 안내를 하려면 위치 권한을 “항상 허용”으로 설정해 주세요.';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`[위치 권한 필요] ${msg}`);
    return;
  }
  Alert.alert(
    '위치 권한 필요',
    `${msg}\n\n지금 설정 화면으로 이동하여 권한을 변경하시겠습니까?`,
    [
      { text: '취소', style: 'cancel' },
      {
        text: '설정으로 이동',
        onPress: () => {
          void Linking.openSettings();
        },
      },
    ],
  );
}

function showStartFailureAlert(): void {
  const msg = '산책을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`[안내] ${msg}`);
    return;
  }
  Alert.alert('안내', msg);
}

function resolveInitialCourse(
  plan: CoursePlan | undefined,
  mode: 'route' | 'free',
): { route: RouteFeatureCollection; stepPins: readonly RouteStepPin[] } {
  if (plan) {
    return { route: plan.route, stepPins: plan.stepPins };
  }
  if (mode === 'free') {
    return { route: EMPTY_WALK_ROUTE, stepPins: [] };
  }
  return { route: SAMPLE_ROUTE, stepPins: SAMPLE_STEP_PINS };
}

function getWalkStartAnnouncement(dogName: string, title: string): string {
  const suffix = title.includes('산책') ? '을 시작합니다.' : ' 산책을 시작합니다.';
  return `${dogName}와 ${title}${suffix}`;
}

export default function App() {
  useFonts({
    'Pretendard-Regular': require('./assets/fonts/pretendard/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('./assets/fonts/pretendard/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('./assets/fonts/pretendard/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('./assets/fonts/pretendard/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('./assets/fonts/pretendard/Pretendard-ExtraBold.otf'),
    'Pretendard-Black': require('./assets/fonts/pretendard/Pretendard-Black.otf'),
  });

  const { theme, colors } = useAppTheme();
  const [activeTab, setActiveTab] = useState<TabKey>('홈');
  const [subScreen, setSubScreen] = useState<AppSubScreen>('main');
  const [pocketMapVisible, setPocketMapVisible] = useState(false);
  const [startupReady, setStartupReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [splashAnimationComplete, setSplashAnimationComplete] = useState(false);
  const [dogs, setDogs] = useState<DogProfile[]>([...DEFAULT_DOGS]);
  const [selectedDogId, setSelectedDogId] = useState<string>('dog_choco');
  const activeDog = dogs.find((d) => d.id === selectedDogId) ?? dogs[0] ?? DEFAULT_DOGS[0];

  const [preferences, setPreferences] = useState<WalkPreferences>({
    durationMinutes: 30, environments: ['soft', 'shade', 'stairs'], requestText: '',
  });
  const [walkStep, setWalkStep] = useState<'settings' | 'recommend'>('settings');

  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummaryPayload | null>(null);
  const [completedRecord, setCompletedRecord] = useState<WalkRecord | null>(null);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signup' | 'signin'>('signup');
  const [myProfileSubTab, setMyProfileSubTab] = useState<'dog_profile' | 'theme_account' | 'walk_records' | 'settings'>('dog_profile');
  const walk = useWalkGuidance(SAMPLE_ROUTE, SAMPLE_STEP_PINS);
  const [walkBookmark, setWalkBookmark] = useState<BookmarkedRoute | null>(null);
  const consent = useLocationConsent();

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setStartupError(null);
      try {
        await themeManager.init();
        await SupabaseService.initSession();
        const profileData = await loadStartupDogProfiles();
        setDogs(profileData.dogs);
        setSelectedDogId(profileData.selectedDogId);
        if (profileData.needsSelection) setSubScreen('dog_selection');

        setFeedbackSummary(await FeedbackContextService.buildRecentFeedbackContext());
        if (!(await OnboardingService.hasSeenOnboarding())) setSubScreen('onboarding');
        if (isMounted) setStartupReady(true);
      } catch (error) {
        console.error('[App] 시작 데이터 초기화 실패:', error);
        if (isMounted) {
          setStartupError('앱을 시작하는 데 필요한 정보를 불러오지 못했어요. 다시 시도해 주세요.');
        }
      }
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [startupAttempt]);

  const handleSaveActiveDog = async (fields: Partial<DogProfile>) => {
    const updated = { ...activeDog, ...fields, updatedAt: new Date().toISOString() };
    updated.speedKmH = calculateRecommendedSpeedKmH(updated.weightKg, updated.ageYears, updated.jointCareLevel);
    const updatedDogs = dogs.map((d) => (d.id === updated.id ? updated : d));
    setDogs(updatedDogs);
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILES, updatedDogs);
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, updated);
  };

  const handleAddDog = async (newDog: DogProfile) => {
    const alreadyRegistered = dogs.some((dog) => dog.id === newDog.id);
    const updatedDogs = alreadyRegistered
      ? dogs.map((dog) => dog.id === newDog.id ? { ...dog, ...newDog } : dog)
      : [...dogs, newDog];
    setDogs(updatedDogs); setSelectedDogId(newDog.id);
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILES, updatedDogs);
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, newDog);
    if (subScreen === 'dog_selection' && dogs.length === 0) setActiveTab('홈');
  };

  const handleDeleteDog = async (dogId: string) => {
    if (!dogs.some((dog) => dog.id === dogId)) return;

    const updatedDogs = dogs.filter((dog) => dog.id !== dogId);
    const nextSelectedDog = updatedDogs.find((dog) => dog.id === selectedDogId) ?? updatedDogs[0];
    const profilesSaved = await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILES, updatedDogs);
    if (!profilesSaved) {
      const message = '기기 저장소에서 프로필을 갱신하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('삭제 실패', message);
      return;
    }

    await SupabaseService.initSession();
    const remoteDeleted = await SupabaseService.deleteDogProfile(dogId);
    if (!remoteDeleted) {
      await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILES, dogs);
      const message = '계정에 저장된 반려견 프로필을 삭제하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
      else Alert.alert('삭제 실패', message);
      return;
    }

    if (nextSelectedDog) {
      await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, nextSelectedDog);
    } else {
      await LocalStorageService.removeItem(STORAGE_KEYS.DOG_PROFILE);
    }

    setDogs(updatedDogs);
    setSelectedDogId(nextSelectedDog?.id ?? '');
    if (updatedDogs.length === 0) setSubScreen('dog_selection');
  };

  const handleCompleteOnboarding = async (registeredDog?: DogProfile) => {
    if (registeredDog) {
      await handleAddDog(registeredDog);
    }
    await OnboardingService.markOnboardingCompleted();
    setSubScreen('main');
  };

  const handleOpenAuthModal = (mode: 'signup' | 'signin' = 'signup') => {
    setAuthModalMode(mode);
    setAuthModalVisible(true);
  };

  const handleSplashAnimationComplete = useCallback(() => {
    setSplashAnimationComplete(true);
  }, []);

  const beginWalk = async (
    title: string,
    plan: CoursePlan | undefined,
    bookmark: BookmarkedRoute | null,
    mode: 'route' | 'free' = 'route',
  ) => {
    try {
      const agreed = await consent.ensureConsent();
      if (!agreed) return;

      const initialCourse = resolveInitialCourse(plan, mode);
      walk.loadCourse(initialCourse.route, initialCourse.stepPins);

      setPreferences((prev) => ({
        ...prev,
        isFreeWalk: mode === 'free',
        ...(mode === 'free' ? { durationMinutes: null } : {}),
      }));

      const status = await walk.start(mode);
      if (status === 'permission_denied') {
        showPermissionDeniedAlert();
        return;
      }
      if (status !== 'running') {
        showStartFailureAlert();
        return;
      }

      setWalkBookmark(bookmark);
      TTSNavigationService.speak(getWalkStartAnnouncement(activeDog.name, title));
      setSubScreen('pocket');
    } catch (err) {
      console.warn('[App] beginWalk 실행 중 예외 처리:', err);
      setWalkBookmark(bookmark);
      setSubScreen('pocket');
    }
  };

  const handleStartWalk = (course?: RecommendedCourse, plan?: CoursePlan) =>
    void beginWalk(
      course?.name ?? '편안한 숲길 코스',
      plan,
      course && plan ? createBookmark(course, plan, toWalkDogSummary(activeDog)) : null
    );

  /**
   * 홈 화면 "바로 산책하기" 클릭 시:
   * 사전에 추천 경로를 생성하지 않고, 실제 GPS 트래킹을 수행하는 자유 산책 모드로 즉시 진입
   */
  const handleStartFreeWalk = async () => {
    await beginWalk('자유 산책', undefined, null, 'free');
  };

  /** US-29: 즐겨찾기 코스를 서버 재탐색 없이 저장된 경로로 즉시 산책 시작 */
  const handleStartBookmark = (bm: BookmarkedRoute) =>
    void beginWalk(bm.title, { route: bm.routeGeoJson, stepPins: bm.stepPins }, bm);

  /** US-G2: 이웃 커뮤니티 공유 코스로 산책 시작 */
  const handleStartCommunityWalk = (
    title: string,
    route: RouteFeatureCollection,
    stepPins: readonly RouteStepPin[],
  ) => {
    void beginWalk(title, { route, stepPins: [...stepPins] }, null);
  };

  const handleStopWalkAndReport = useCallback(async (saveRecord = true) => {
    if (!saveRecord) {
      await walk.stop();
      setCompletedRecord(null);
      setSubScreen('main');
      setActiveTab('산책');
      return;
    }

    const distKm = walk.stats.distanceKm;
    const gpsTrack = (await walk.getPersistedTrackBuffer()).map((p) => ({ lat: p.latitude, lon: p.longitude, timestamp: p.timestamp }));
    const currentRoute = walkBookmark?.routeGeoJson ?? walk.route;
    const calculatedSafeRatio = calculateSafeSurfaceRatio(currentRoute);
    const courseDistKm = buildCourseSummary(currentRoute, activeDog.speedKmH).totalDistanceKm;

    let finalDistanceKm = distKm;
    if (distKm <= 0) {
      finalDistanceKm = walk.stats.elapsedSec >= 120 ? courseDistKm : Math.round(distKm * 10) / 10;
    }

    const newRecord: WalkRecord = {
      id: generateUuid(),
      dogId: activeDog.id,
      dogSummary: toWalkDogSummary(activeDog),
      startedAt: new Date(Date.now() - walk.stats.elapsedSec * 1000).toISOString(),
      completedAt: new Date().toISOString(),
      durationMinutes: Math.max(1, Math.round(walk.stats.elapsedSec / 60)),
      totalDistanceKm: finalDistanceKm,
      averageSpeedKmH: calculateAverageSpeedKmH(
        finalDistanceKm,
        walk.stats.elapsedSec,
        activeDog.speedKmH,
      ),
      safeSurfaceRatio: calculatedSafeRatio,
      gpsTrack,
      poopCount: walk.poopCount,
      poopEvents: walk.poopEvents,
    };
    await LocalStorageService.appendWalkRecord(newRecord);
    void SupabaseService.createWalkRecord({
      id: newRecord.id,
      dog_id: activeDog.id,
      started_at: newRecord.startedAt,
      ended_at: newRecord.completedAt,
      distance_m: newRecord.totalDistanceKm * 1000,
      duration_min: newRecord.durationMinutes,
      route_coords: gpsTrack.map(({ lat, lon }) => [lon, lat] as [number, number]),
      is_public: false,
    });
    await walk.stop();
    setCompletedRecord(newRecord);
    setSubScreen('report');
  }, [walk, activeDog, walkBookmark]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__petWalkNav = { setSubScreen, setActiveTab, setCompletedRecord, handleStopWalkAndReport, consent };
    }
  }, [handleStopWalkAndReport, consent]);

  const handleResetAllData = async () => {
    await ConsentService.resetAllLocalData();
    await themeManager.init();
    setDogs([...DEFAULT_DOGS]); setSelectedDogId(DEFAULT_DOGS[0].id);
    setFeedbackSummary(null); setCompletedRecord(null); setWalkBookmark(null);
  };

  const handleSaveReportFeedback = async (feedback: WalkFeedback) => {
    if (!completedRecord) return;
    await LocalStorageService.updateWalkFeedback(completedRecord.id, feedback);
    setCompletedRecord({ ...completedRecord, feedback });
    setFeedbackSummary(await FeedbackContextService.buildRecentFeedbackContext());
  };

  const handlePocketUnlock = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const finish = window.confirm('산책을 종료하고 완주 리포트를 확인할까요?');
      if (finish) void handleStopWalkAndReport();
      else {
        setSubScreen('main');
        setActiveTab('산책');
      }
      return;
    }
    Alert.alert('산책을 종료할까요?', '지도를 확인하거나 산책을 마칠 수 있어요.', [
      {
        text: '지도 보기',
        onPress: () => setPocketMapVisible(true),
      },
      { text: '산책 종료', onPress: () => void handleStopWalkAndReport() },
    ]);
  };

  // 안드로이드 물리 뒤로가기 및 상단 뒤로가기 일원화 (SSOT)
  const { triggerBack } = useAppBackHandler({
    authModalVisible,
    onCloseAuthModal: () => setAuthModalVisible(false),
    consentVisible: consent.visible,
    onDeclineConsent: consent.decline,
    subScreen,
    setSubScreen,
    activeTab,
    setActiveTab,
    walkStep,
    onBackToWalkSettings: () => setWalkStep('settings'),
    onPocketUnlock: handlePocketUnlock,
  });

  const handleInjectSampleWalk = async (dissatisfied: boolean) => {
    const sampleWalk: WalkRecord = {
      id: `walk_${Date.now()}`, dogId: activeDog.id,
      startedAt: new Date(Date.now() - 1800000).toISOString(), completedAt: new Date().toISOString(),
      durationMinutes: 28, totalDistanceKm: 1.4, averageSpeedKmH: activeDog.speedKmH, safeSurfaceRatio: 0.85, gpsTrack: [],
      feedback: {
        comfortScore: dissatisfied ? 2 : 5,
        slopeRating: dissatisfied ? 'steep' : 'gentle',
        tags: dissatisfied ? ['경사가 가팔랐어요'] : ['완만해요', '그늘많아요'],
        comment: dissatisfied ? '계단과 언덕이 조금 힘들었어요' : '발이 편하고 좋았어요',
      },
    };
    await LocalStorageService.appendWalkRecord(sampleWalk);
    const updated = await FeedbackContextService.buildRecentFeedbackContext();
    setFeedbackSummary(updated);
    const msg = dissatisfied
      ? `⚠️ 가상의 직전 산책에 "언덕/경사 부담" 피드백이 주입되었습니다.\n(현재 경사 불만족: ${updated.slope_dissatisfaction_count}회, 최대 경사도 보정치: ${updated.recommended_max_slope_offset}%)`
      : `👍 가상의 직전 산책에 "완만한 길 만족" 피드백이 주입되었습니다.\n(현재 경사 불만족: ${updated.slope_dissatisfaction_count}회, 최대 경사도 보정치: ${updated.recommended_max_slope_offset}%)`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`[시연용 피드백 반영]\n${msg}`);
    } else {
      Alert.alert('시연용 가상 피드백 반영', msg);
    }
  };

  const handleResetFeedback = async () => {
    const history = await LocalStorageService.getWalkHistory();
    const resetHistory = history.map((rec) => ({ ...rec, feedback: undefined }));
    await LocalStorageService.setItem(STORAGE_KEYS.WALK_HISTORY, resetHistory);
    const updated = await FeedbackContextService.buildRecentFeedbackContext();
    setFeedbackSummary(updated);
    const msg = '피드백 통계가 기본 상태(0회)로 초기화되었습니다.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`[알림]\n${msg}`);
    } else {
      Alert.alert('알림', msg);
    }
  };

  const walkTrack = walk.getTrackBuffer();
  const recordedCoords = walkTrack.map((point) => [point.longitude, point.latitude] as const);
  const trackingFeature = recordedCoords.length > 1
    ? [{
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 0, shaded: false },
        geometry: { type: 'LineString', coordinates: recordedCoords },
      } as const]
    : [];
  const pocketMapRoute: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [...walk.route.features, ...trackingFeature],
  };

  const pocketStartCoords = useMemo(() => {
    if (walkTrack[0]) {
      return {
        lat: walkTrack[0].latitude,
        lon: walkTrack[0].longitude,
      };
    }
    const firstCoord = walk.route.features[0]?.geometry?.coordinates[0];
    if (firstCoord) {
      return {
        lat: firstCoord[1],
        lon: firstCoord[0],
      };
    }
    return null;
  }, [walkTrack, walk.route]);

  if (!startupReady || !splashAnimationComplete) {
    return (
      <SafeAreaProvider>
        <SplashScreen
          onAnimationComplete={handleSplashAnimationComplete}
          initializationError={startupError}
          onRetry={() => {
            setStartupReady(false);
            setStartupAttempt((attempt) => attempt + 1);
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: colors.background },
          subScreen === 'pocket' && styles.safeAreaPocket,
        ]}
      >
        <StatusBar
          barStyle={subScreen === 'pocket' || theme === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={subScreen === 'pocket' ? colors.pocketBg : colors.background}
        />
        {/* 풀스크린 온보딩/절전/완주 리포트 */}
        {subScreen === 'onboarding' && <OnboardingWizard onComplete={handleCompleteOnboarding} />}
        {subScreen === 'pocket' && (
          <DarkPocketScreen
            dogName={activeDog.name}
            stats={walk.stats}
            targetMinutes={preferences.durationMinutes}
            isFreeWalk={walk.mode === 'free'}
            freeWalkSafety={walk.freeWalkSafety}
            guidanceMessage={walk.guidanceMessage}
            onFinishWalk={(saveRecord) => void handleStopWalkAndReport(saveRecord)}
            mapVisible={pocketMapVisible}
            onMapVisibleChange={setPocketMapVisible}
            onMarkPoop={walk.markPoop}
            poopCount={walk.poopCount}
            currentCoords={walk.currentPoint ? {
              lat: walk.currentPoint.latitude,
              lon: walk.currentPoint.longitude,
            } : null}
            startCoords={pocketStartCoords}
            routeCoords={walk.route.features[0]?.geometry?.coordinates as any}
            walkedCoords={recordedCoords}
            mapRoute={pocketMapRoute}
            mapPins={walk.activePins}
            onReroute={(res) => {
              walk.applyReroute(res.newRoute, res.stepPins, res.voiceAlert, true);
            }}
          />
        )}
        {subScreen === 'report' && completedRecord && (
          <WalkReportScreen
            record={completedRecord} dogName={activeDog.name} bookmarkCandidate={walkBookmark}
            onSaveFeedback={handleSaveReportFeedback} onGoHome={() => { setSubScreen('main'); setActiveTab('홈'); }}
            onGoToCommunity={() => { setSubScreen('main'); setActiveTab('커뮤니티'); }}
            onOpenAuthModal={handleOpenAuthModal}
          />
        )}

        {/* 하단 메인 메뉴(BottomTabBar)가 유지되는 기본 앱 컨테이너 */}
        {subScreen !== 'onboarding' && subScreen !== 'pocket' && (subScreen !== 'report' || !completedRecord) && (
          <View style={styles.mainContainer}>
            {/* 메인 상단 헤더: subScreen이 'main'이고 activeTab이 '커뮤니티' 또는 '마이'일 때 공통 규격 AppScreenHeader 렌더링 (뒤로가기 누르면 triggerBack -> 홈으로 이동) */}
            {subScreen === 'main' && activeTab === '커뮤니티' && (
              <AppScreenHeader
                title="커뮤니티"
                onBack={triggerBack}
                rightAction={
                  <TouchableOpacity
                    onPress={() => Alert.alert('알림', '새로운 소식이 없습니다.')}
                    style={styles.iconBtn}
                    accessibilityLabel="알림"
                  >
                    <Text style={[styles.iconText, { color: colors.textMain }]}>🔔</Text>
                  </TouchableOpacity>
                }
              />
            )}
            {subScreen === 'main' && activeTab === '마이' && (
              <AppScreenHeader
                title="마이 페이지"
                onBack={triggerBack}
                rightAction={
                  <TouchableOpacity
                    onPress={() => Alert.alert('알림', '새로운 소식이 없습니다.')}
                    style={styles.iconBtn}
                    accessibilityLabel="알림"
                  >
                    <Text style={[styles.iconText, { color: colors.textMain }]}>🔔</Text>
                  </TouchableOpacity>
                }
              />
            )}

            <View style={styles.tabContentContainer}>
              <ErrorBoundary>
                {/* 1. 강아지 선택 화면 (하단 메인 메뉴 유지) */}
                {subScreen === 'dog_selection' && (
                  <DogSelectionView
                    dogs={dogs} selectedDogId={selectedDogId} onSelectDog={setSelectedDogId}
                    onAddDog={handleAddDog}
                    onContinue={() => {
                      setSubScreen('main');
                      setActiveTab('산책');
                    }}
                    onBack={triggerBack}
                  />
                )}

                {/* 2. 산책 설정 / 코스 추천 화면 (하단 메인 메뉴 유지) */}
                {subScreen === 'walk_settings' && (
                  <WalkSettingsView
                    dog={activeDog} initialPreferences={preferences} onBack={triggerBack}
                    onFindRoute={(next) => { setPreferences(next); setSubScreen('course_recommend'); }}
                  />
                )}
                {subScreen === 'course_recommend' && (
                  <CourseRecommendationView
                    dog={activeDog} preferences={preferences} feedback={feedbackSummary} onBack={triggerBack}
                    onStartWalk={handleStartWalk} onPinSelect={TTSNavigationService.speak}
                  />
                )}

                {/* 3. 메인 4대 탭 화면 */}
                {subScreen === 'main' && activeTab === '홈' && (
                  <HomeScreen
                    dog={activeDog}
                    dogs={dogs}
                    selectedDogId={selectedDogId}
                    onSelectDog={setSelectedDogId}
                    onAddDog={() => setSubScreen('dog_selection')}
                    feedbackSummary={feedbackSummary}
                    onPressProfile={() => setSubScreen('dog_selection')}
                    onStartWalk={handleStartFreeWalk}
                    onOpenPlanner={() => setActiveTab('산책')}
                    onOpenStats={() => {
                      if (subScreen !== 'main') setSubScreen('main');
                      setMyProfileSubTab('walk_records');
                      setActiveTab('마이');
                    }}
                    onOpenNotification={() => Alert.alert('알림', '새로운 산책 알림이 없습니다.')}
                  />
                )}
                {subScreen === 'main' && activeTab === '산책' && (
                  <WalkTabScreen
                    dog={activeDog}
                    preferences={preferences}
                    onUpdatePreferences={setPreferences}
                    feedbackSummary={feedbackSummary}
                    step={walkStep}
                    onStepChange={setWalkStep}
                    onBack={triggerBack}
                    onStartWalk={handleStartWalk}
                    onPinSelect={TTSNavigationService.speak}
                  />
                )}
                {subScreen === 'main' && activeTab === '커뮤니티' && (
                  <CommunityTabScreen
                    onStartCommunityWalk={handleStartCommunityWalk}
                    dogSpeedKmH={activeDog.speedKmH}
                    onOpenAuthModal={handleOpenAuthModal}
                  />
                )}
                {subScreen === 'main' && activeTab === '마이' && (
                  <MyProfileTabScreen
                    dog={activeDog}
                    dogs={dogs}
                    selectedDogId={selectedDogId}
                    onSelectDog={setSelectedDogId}
                    onAddDog={handleAddDog}
                    feedbackSummary={feedbackSummary}
                    onSaveDog={handleSaveActiveDog}
                    onDeleteDog={handleDeleteDog}
                    onInjectFeedback={handleInjectSampleWalk}
                    onResetFeedback={handleResetFeedback}
                    onStartBookmark={handleStartBookmark}
                    onResetData={handleResetAllData}
                    onOpenOnboarding={() => setSubScreen('onboarding')}
                    onOpenAuthModal={handleOpenAuthModal}
                    initialSubTab={myProfileSubTab}
                  />
                )}
              </ErrorBoundary>
            </View>

            {dogs.length > 0 && (
              <BottomTabBar
                activeTab={activeTab}
                onTabChange={(tab) => {
                  if (subScreen !== 'main') {
                    setSubScreen('main');
                  }
                  setWalkStep('settings');
                  setActiveTab(tab);
                }}
              />
            )}
          </View>
        )}
        <LocationConsentModal controller={consent} />
        <LandingAuthModal
          visible={authModalVisible}
          initialMode={authModalMode}
          onClose={() => setAuthModalVisible(false)}
          onFinish={handleAddDog}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: TOKENS.colors.background, maxWidth: 480, width: '100%', marginHorizontal: 'auto' },
  safeAreaPocket: { backgroundColor: TOKENS.colors.pocketBg, maxWidth: 480, width: '100%', marginHorizontal: 'auto' },
  mainContainer: { flex: 1 },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: TOKENS.colors.border, backgroundColor: TOKENS.colors.surface },
  logoGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: TOKENS.colors.primary, alignItems: 'center', justifyContent: 'center' },
  logoIcon: { fontSize: 16 }, appTitle: { fontSize: 17, fontWeight: '700', color: TOKENS.colors.textMain, letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, iconBtn: { width: 48, height: 48, minWidth: 48, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18, color: TOKENS.colors.textMain },
  tabContentContainer: { flex: 1 },
});
