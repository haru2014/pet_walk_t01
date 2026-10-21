/**
 * [편안하개 - PetWalk]
 * React Native / Expo 모바일 메인 애플리케이션 (App.tsx)
 *
 * - 화면별 컴포넌트 모듈화 리팩터링 (단일 파일 250라인 이하 준수)
 * - Screen 01~05 사용자 여정 통합 라우팅
 * - Phase 4: Foreground GPS 추적 + 30m 전 TTS 안내 + 다크 포켓 모드
 * - Phase 5: 완주 기록 영구 저장 (100회 FIFO) & 3초 인포그래픽 리포트
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, StatusBar, Platform } from 'react-native';
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
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS, getCoursePlanById, getCoursePlanByParkId } from './src/services/sampleRoute';
import { requestWalkPlan } from './src/services/api';
import { generateAdaptiveCourses } from './src/services/courseAdaptivePlanner';
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
import { AppIcon } from './src/components/common/AppIcon';
import { ErrorBoundary } from './src/components/common/ErrorBoundary';

export type AppSubScreen = 'main' | 'dog_selection' | 'walk_settings' | 'course_recommend' | 'pocket' | 'report' | 'onboarding';

export default function App() {
  const { theme, colors } = useAppTheme();
  const [activeTab, setActiveTab] = useState<TabKey>('홈');
  const [subScreen, setSubScreen] = useState<AppSubScreen>('main');
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
    async function loadData() {
      void themeManager.init();
      void SupabaseService.initSession();
      const savedProfiles = await LocalStorageService.getItem<DogProfile[]>(STORAGE_KEYS.DOG_PROFILES);
      if (savedProfiles !== null && Array.isArray(savedProfiles)) {
        setDogs(savedProfiles);
        const savedProfile = await LocalStorageService.getItem<DogProfile>(STORAGE_KEYS.DOG_PROFILE);
        const initialDog = savedProfiles.find((dog) => dog.id === savedProfile?.id) ?? savedProfiles[0];
        setSelectedDogId(initialDog?.id ?? '');
        if (!initialDog) setSubScreen('dog_selection');
      } else {
        // Migrate the previous single-profile key while retaining the app's sample profiles.
        const savedProfile = await LocalStorageService.getItem<DogProfile>(STORAGE_KEYS.DOG_PROFILE);
        let migratedDogs: DogProfile[];
        if (savedProfile) {
          const exists = DEFAULT_DOGS.some((dog) => dog.id === savedProfile.id);
          migratedDogs = exists
            ? DEFAULT_DOGS.map((dog) => dog.id === savedProfile.id ? savedProfile : dog)
            : [savedProfile, ...DEFAULT_DOGS];
        } else {
          migratedDogs = [...DEFAULT_DOGS];
        }
        setDogs(migratedDogs);
        setSelectedDogId(savedProfile?.id ?? migratedDogs[0].id);
        await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILES, migratedDogs);
        if (!savedProfile) await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, migratedDogs[0]);
      }
      setFeedbackSummary(await FeedbackContextService.buildRecentFeedbackContext());
      if (!(await OnboardingService.hasSeenOnboarding())) setSubScreen('onboarding');
    }
    void loadData();
  }, []);

  const handleSaveActiveDog = async (fields: Partial<DogProfile>) => {
    const updated = { ...activeDog, ...fields, updatedAt: new Date().toISOString() };
    updated.speedKmH = calculateRecommendedSpeedKmH(updated.weightKg, updated.ageYears, updated.jointCareLevel);
    const updatedDogs = dogs.map((d) => (d.id === updated.id ? updated : d));
    setDogs(updatedDogs);
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILES, updatedDogs);
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, updated);
  };

  const handleAddDog = async (newDog: DogProfile) => {
    const updatedDogs = [...dogs, newDog];
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

  const beginWalk = async (title: string, plan: CoursePlan | undefined, bookmark: BookmarkedRoute | null) => {
    try {
      const agreed = await consent.ensureConsent();
      if (!agreed) return;

      if (plan) walk.loadCourse(plan.route, plan.stepPins);
      const status = await walk.start();
      if (status === 'permission_denied') {
        const msg = '안심 산책을 위해 위치 권한을 허용해 주세요.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(`[위치 권한 필요] ${msg}`);
        } else {
          Alert.alert('위치 권한 필요', msg);
        }
        return;
      }
      if (status !== 'running') {
        const msg = '산책을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(`[안내] ${msg}`);
        } else {
          Alert.alert('안내', msg);
        }
        return;
      }
      setWalkBookmark(bookmark);
      const walkAnnouncement = title.includes('산책')
        ? `${activeDog.name}와 ${title}을 시작합니다.`
        : `${activeDog.name}와 ${title} 산책을 시작합니다.`;
      TTSNavigationService.speak(walkAnnouncement);
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
   * 1. 홈 화면 "바로 산책하기" 클릭 시:
   * 사전에 추천 경로를 생성하지 않고, 실제 GPS 트래킹을 수행하는 자유 산책 모드로 즉시 진입
   */
  const handleStartFreeWalk = async () => {
    setPreferences((prev) => ({
      ...prev,
      isFreeWalk: true,
      durationMinutes: null,
    }));
    await beginWalk('자유 산책', undefined, null);
  };

  /**
   * 2. 추천 경로 1에 따라 즉시 산책 시작
   */
  const handleStartTopCourse = async () => {
    try {
      const planRes = await requestWalkPlan(activeDog, preferences, feedbackSummary);
      const courses = planRes.courses.length > 0
        ? planRes.courses
        : generateAdaptiveCourses(activeDog, preferences, feedbackSummary);
      const topCourse = courses[0];
      const candidatePlan = topCourse?.id ? planRes.coursePlans?.[topCourse.id] : undefined;
      const plan: CoursePlan = candidatePlan
        ?? (planRes.isLiveServer ? { route: planRes.route, stepPins: planRes.stepPins } : undefined)
        ?? getCoursePlanById(topCourse?.id, getCoursePlanByParkId(preferences?.pilotParkId));

      handleStartWalk(topCourse, plan);
    } catch (err) {
      if ((preferences.originMode ?? 'park') !== 'current_location') {
        const message = err instanceof Error ? err.message : '공원 내부 경로를 생성하지 못했습니다.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
        else Alert.alert('산책 경로 확인 필요', message);
        return;
      }
      console.warn('[App] 실시간 AI 추천 코스 생성 중 오류 발생, 로컬 안전 코스로 즉시 폴백합니다:', err);
      const fallbackCourses = generateAdaptiveCourses(activeDog, preferences, feedbackSummary);
      const topCourse = fallbackCourses[0];
      const plan = getCoursePlanById(topCourse?.id, getCoursePlanByParkId(preferences?.pilotParkId));
      handleStartWalk(topCourse, plan);
    }
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

  const handleStopWalkAndReport = useCallback(async () => {
    const distKm = walk.stats.distanceKm;
    const gpsTrack = walk.getTrackBuffer().map((p) => ({ lat: p.latitude, lon: p.longitude, timestamp: p.timestamp }));
    const currentRoute = walkBookmark?.routeGeoJson ?? walk.route;
    const calculatedSafeRatio = calculateSafeSurfaceRatio(currentRoute);
    const courseDistKm = buildCourseSummary(currentRoute, activeDog.speedKmH).totalDistanceKm;

    let finalDistanceKm = distKm;
    if (distKm <= 0) {
      finalDistanceKm = walk.stats.elapsedSec >= 120 ? courseDistKm : Math.round(distKm * 10) / 10;
    }

    const newRecord: WalkRecord = {
      id: `walk_${Date.now()}`,
      dogId: activeDog.id,
      dogSummary: toWalkDogSummary(activeDog),
      startedAt: new Date(Date.now() - walk.stats.elapsedSec * 1000).toISOString(),
      completedAt: new Date().toISOString(),
      durationMinutes: Math.max(1, Math.round(walk.stats.elapsedSec / 60)),
      totalDistanceKm: finalDistanceKm,
      averageSpeedKmH: walk.stats.speedKmH > 0 ? walk.stats.speedKmH : activeDog.speedKmH,
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
        onPress: () => {
          setSubScreen('main');
          setActiveTab('산책');
        },
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
            isFreeWalk={preferences.isFreeWalk}
            onUnlock={handlePocketUnlock}
            onMarkPoop={walk.markPoop}
            poopCount={walk.poopCount}
            currentCoords={walk.getTrackBuffer().length > 0 ? {
              lat: walk.getTrackBuffer()[walk.getTrackBuffer().length - 1].latitude,
              lon: walk.getTrackBuffer()[walk.getTrackBuffer().length - 1].longitude,
            } : null}
            startCoords={walk.route.features[0]?.geometry?.coordinates[0] ? {
              lat: walk.route.features[0].geometry.coordinates[0][1],
              lon: walk.route.features[0].geometry.coordinates[0][0],
            } : null}
            routeCoords={walk.route.features[0]?.geometry?.coordinates as any}
            onReroute={(res) => {
              walk.applyReroute(res.newRoute);
              if (res.voiceAlert) {
                TTSNavigationService.speak(res.voiceAlert);
              }
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
