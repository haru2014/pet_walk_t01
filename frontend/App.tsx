/**
 * [편안하개 - PetWalk]
 * React Native / Expo 모바일 메인 애플리케이션 (App.tsx)
 *
 * - 화면별 컴포넌트 모듈화 리팩터링 (단일 파일 250라인 이하 준수)
 * - Screen 01~05 사용자 여정 통합 라우팅
 * - Phase 4: Foreground GPS 추적 + 30m 전 TTS 안내 + 다크 포켓 모드
 * - Phase 5: 완주 기록 영구 저장 (100회 FIFO) & 3초 인포그래픽 리포트
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, StatusBar, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { TOKENS } from './src/theme/tokens';
import { BottomTabBar, TabKey } from './src/components/common/BottomTabBar';
import { DogProfile, DEFAULT_DOGS, calculateRecommendedSpeedKmH } from './src/types/dogProfile';
import { WalkPreferences, RecommendedCourse } from './src/types/walkSettings';
import { LocalStorageService } from './src/services/storage';
import { FeedbackContextService, FeedbackSummaryPayload } from './src/services/feedbackContext';
import { STORAGE_KEYS, WalkRecord, WalkFeedback } from './src/types/storage';
import { TTSNavigationService } from './src/services/ttsNavigation';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from './src/services/sampleRoute';
import { useWalkGuidance } from './src/hooks/useWalkGuidance';
import { BookmarkedRoute, CoursePlan } from './src/types/bookmark';
import { RouteFeatureCollection, RouteStepPin } from './src/types/route';
import { createBookmark } from './src/services/bookmarkService';
import { useLocationConsent } from './src/hooks/useLocationConsent';
import { ConsentService } from './src/services/consentService';
import { LocationConsentModal } from './src/components/common/LocationConsentModal';
import { OnboardingService } from './src/services/onboardingService';
import { OnboardingWizard } from './src/components/onboarding/OnboardingWizard';

import { HomeScreen } from './src/screens/HomeScreen';
import { WalkTabScreen } from './src/screens/WalkTabScreen';
import { CommunityTabScreen } from './src/screens/CommunityTabScreen';
import { MyProfileTabScreen } from './src/screens/MyProfileTabScreen';
import { DarkPocketScreen } from './src/screens/DarkPocketScreen';
import { WalkReportScreen } from './src/screens/WalkReportScreen';
import { DogSelectionView } from './src/components/profile/DogSelectionView';
import { WalkSettingsView } from './src/components/walk/WalkSettingsView';
import { CourseRecommendationView } from './src/components/walk/CourseRecommendationView';

export type AppSubScreen = 'main' | 'dog_selection' | 'walk_settings' | 'course_recommend' | 'pocket' | 'report' | 'onboarding';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('홈');
  const [subScreen, setSubScreen] = useState<AppSubScreen>('main');
  const [dogs, setDogs] = useState<DogProfile[]>([...DEFAULT_DOGS]);
  const [selectedDogId, setSelectedDogId] = useState<string>('dog_choco');
  const activeDog = dogs.find((d) => d.id === selectedDogId) ?? dogs[0];

  const [preferences, setPreferences] = useState<WalkPreferences>({
    durationMinutes: 30, environments: ['soft', 'shade', 'stairs'], requestText: '',
  });

  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummaryPayload | null>(null);
  const [completedRecord, setCompletedRecord] = useState<WalkRecord | null>(null);
  const walk = useWalkGuidance(SAMPLE_ROUTE, SAMPLE_STEP_PINS);
  const [walkBookmark, setWalkBookmark] = useState<BookmarkedRoute | null>(null);
  const consent = useLocationConsent();

  useEffect(() => {
    async function loadData() {
      const saved = await LocalStorageService.getItem<DogProfile>(STORAGE_KEYS.DOG_PROFILE);
      if (saved) {
        setDogs((prev) => (prev.some((d) => d.id === saved.id) ? prev.map((d) => (d.id === saved.id ? saved : d)) : [saved, ...prev]));
        setSelectedDogId(saved.id);
      } else {
        await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, DEFAULT_DOGS[0]);
      }
      setFeedbackSummary(await FeedbackContextService.buildRecentFeedbackContext());
      if (typeof window !== 'undefined') (window as any).__petWalkNav = { setSubScreen, setActiveTab, setCompletedRecord, handleStopWalkAndReport, consent };
      if (!(await OnboardingService.hasSeenOnboarding())) setSubScreen('onboarding');
    }
    void loadData();
  }, []);

  const handleSaveActiveDog = async (fields: Partial<DogProfile>) => {
    const updated = { ...activeDog, ...fields, updatedAt: new Date().toISOString() };
    updated.speedKmH = calculateRecommendedSpeedKmH(updated.weightKg, updated.ageYears, updated.jointCareLevel);
    setDogs(dogs.map((d) => (d.id === updated.id ? updated : d)));
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, updated);
  };

  const handleAddDog = async (newDog: DogProfile) => {
    setDogs([...dogs, newDog]); setSelectedDogId(newDog.id);
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, newDog);
  };

  const handleCompleteOnboarding = async () => {
    await OnboardingService.markOnboardingCompleted();
    setSubScreen('main');
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
      TTSNavigationService.speak(`${activeDog.name}와 ${title} 산책을 시작합니다.`);
      setSubScreen('pocket');
    } catch (err) {
      console.warn('[App] beginWalk 실행 중 예외 처리:', err);
      setWalkBookmark(bookmark);
      setSubScreen('pocket');
    }
  };

  const handleStartWalk = (course?: RecommendedCourse, plan?: CoursePlan) =>
    void beginWalk(course?.name ?? '편안한 숲길 코스', plan, course && plan ? createBookmark(course, plan, activeDog.name) : null);

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

  const handleStopWalkAndReport = async () => {
    const distKm = walk.stats.distanceKm;
    const gpsTrack = walk.getTrackBuffer().map((p) => ({ lat: p.latitude, lon: p.longitude, timestamp: p.timestamp }));
    const newRecord: WalkRecord = {
      id: `walk_${Date.now()}`, dogId: activeDog.id,
      startedAt: new Date(Date.now() - walk.stats.elapsedSec * 1000).toISOString(),
      completedAt: new Date().toISOString(),
      durationMinutes: Math.max(1, Math.round(walk.stats.elapsedSec / 60)),
      totalDistanceKm: distKm > 0 ? distKm : 1.2,
      averageSpeedKmH: walk.stats.speedKmH > 0 ? walk.stats.speedKmH : activeDog.speedKmH,
      safeSurfaceRatio: 0.88, gpsTrack,
    };
    await LocalStorageService.appendWalkRecord(newRecord);
    await walk.stop();
    setCompletedRecord(newRecord);
    setSubScreen('report');
  };

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
      if (finish) void handleStopWalkAndReport(); else setSubScreen('course_recommend');
      return;
    }
    Alert.alert('산책을 종료할까요?', '지도를 확인하거나 산책을 마칠 수 있어요.', [
      { text: '지도 보기', onPress: () => setSubScreen('course_recommend') },
      { text: '산책 종료', onPress: () => void handleStopWalkAndReport() },
    ]);
  };

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
      <SafeAreaView style={[styles.safeArea, subScreen === 'pocket' && styles.safeAreaPocket]}>
        <StatusBar barStyle={subScreen === 'pocket' ? 'light-content' : 'dark-content'} backgroundColor={subScreen === 'pocket' ? TOKENS.colors.pocketBg : TOKENS.colors.background} />
        {subScreen === 'onboarding' && <OnboardingWizard onComplete={handleCompleteOnboarding} />}
        {subScreen === 'pocket' && <DarkPocketScreen dogName={activeDog.name} stats={walk.stats} onUnlock={handlePocketUnlock} />}
        {subScreen === 'report' && completedRecord && (
          <WalkReportScreen
            record={completedRecord} dogName={activeDog.name} bookmarkCandidate={walkBookmark}
            onSaveFeedback={handleSaveReportFeedback} onGoHome={() => { setSubScreen('main'); setActiveTab('홈'); }}
            onGoToCommunity={() => { setSubScreen('main'); setActiveTab('커뮤니티'); }}
          />
        )}
        {subScreen === 'dog_selection' && (
          <DogSelectionView
            dogs={dogs} selectedDogId={selectedDogId} onSelectDog={setSelectedDogId}
            onAddDog={handleAddDog} onContinue={() => setSubScreen('walk_settings')} onBack={() => setSubScreen('main')}
          />
        )}
        {subScreen === 'walk_settings' && (
          <WalkSettingsView
            dog={activeDog} initialPreferences={preferences} onBack={() => setSubScreen('main')}
            onFindRoute={(next) => { setPreferences(next); setSubScreen('course_recommend'); }}
          />
        )}
        {subScreen === 'course_recommend' && (
          <CourseRecommendationView
            dog={activeDog} preferences={preferences} feedback={feedbackSummary} onBack={() => setSubScreen('walk_settings')}
            onStartWalk={handleStartWalk} onPinSelect={TTSNavigationService.speak}
          />
        )}
        {subScreen === 'main' && (
          <View style={styles.mainContainer}>
            <View style={styles.header}>
              <View style={styles.logoGroup}><View style={styles.logoBadge}><Text style={styles.logoIcon}>🐾</Text></View><Text style={styles.appTitle}>편안하개</Text></View>
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={() => Alert.alert('알림', '새로운 소식이 없습니다.')} style={styles.iconBtn}><Text style={styles.iconText}>🔔</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setSubScreen('dog_selection')} style={styles.iconBtn}><Text style={styles.iconText}>⋯</Text></TouchableOpacity>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {activeTab === '홈' && (
                <HomeScreen
                  dog={activeDog} feedbackSummary={feedbackSummary}
                  onPressProfile={() => setSubScreen('dog_selection')} onStartWalk={() => setSubScreen('course_recommend')}
                  onOpenPlanner={() => setSubScreen('walk_settings')}
                />
              )}
              {activeTab === '산책' && (
                <WalkTabScreen
                  dog={activeDog} preferences={preferences} feedbackSummary={feedbackSummary} onBack={() => setActiveTab('홈')}
                  onStartWalk={handleStartWalk} onPinSelect={TTSNavigationService.speak}
                />
              )}
              {activeTab === '커뮤니티' && (
                <CommunityTabScreen
                  onStartCommunityWalk={handleStartCommunityWalk}
                  dogSpeedKmH={activeDog.speedKmH}
                />
              )}
              {activeTab === '마이' && (
                <MyProfileTabScreen
                  dog={activeDog} feedbackSummary={feedbackSummary} onSaveDog={handleSaveActiveDog} onInjectFeedback={handleInjectSampleWalk}
                  onResetFeedback={handleResetFeedback} onStartBookmark={handleStartBookmark} onResetData={handleResetAllData}
                  onOpenOnboarding={() => setSubScreen('onboarding')}
                />
              )}
            </ScrollView>
            <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} onActionPress={() => setSubScreen('walk_settings')} />
          </View>
        )}
        <LocationConsentModal controller={consent} />
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 }, iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18, color: TOKENS.colors.textMain }, scrollContent: { padding: 20, paddingBottom: 24 },
});
