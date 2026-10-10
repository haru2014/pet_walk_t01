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
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, StatusBar } from 'react-native';
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

import { HomeScreen } from './src/screens/HomeScreen';
import { WalkTabScreen } from './src/screens/WalkTabScreen';
import { CommunityTabScreen } from './src/screens/CommunityTabScreen';
import { MyProfileTabScreen } from './src/screens/MyProfileTabScreen';
import { DarkPocketScreen } from './src/screens/DarkPocketScreen';
import { WalkReportScreen } from './src/screens/WalkReportScreen';
import { DogSelectionView } from './src/components/profile/DogSelectionView';
import { WalkSettingsView } from './src/components/walk/WalkSettingsView';
import { CourseRecommendationView } from './src/components/walk/CourseRecommendationView';

export type AppSubScreen = 'main' | 'dog_selection' | 'walk_settings' | 'course_recommend' | 'pocket' | 'report';

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
    }
    void loadData();
  }, []);

  const handleSaveActiveDog = async (fields: Partial<DogProfile>) => {
    const updated = { ...activeDog, ...fields };
    updated.speedKmH = calculateRecommendedSpeedKmH(updated.weightKg, updated.ageYears, updated.jointCareLevel);
    updated.updatedAt = new Date().toISOString();
    setDogs(dogs.map((d) => (d.id === updated.id ? updated : d)));
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, updated);
  };

  const handleAddDog = async (newDog: DogProfile) => {
    setDogs([...dogs, newDog]);
    setSelectedDogId(newDog.id);
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, newDog);
  };

  const handleStartWalk = async (course?: RecommendedCourse) => {
    const status = await walk.start();
    if (status === 'permission_denied') { Alert.alert('위치 권한 필요', '안심 산책을 위해 위치 권한을 허용해 주세요.'); return; }
    if (status !== 'running') { Alert.alert('안내', '산책을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
    TTSNavigationService.speak(`${activeDog.name}와 ${course?.name ?? '편안한 숲길 코스'} 산책을 시작합니다.`);
    setSubScreen('pocket');
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



  const handleSaveReportFeedback = async (feedback: WalkFeedback) => {
    if (!completedRecord) return;
    await LocalStorageService.updateWalkFeedback(completedRecord.id, feedback);
    setCompletedRecord({ ...completedRecord, feedback });
    setFeedbackSummary(await FeedbackContextService.buildRecentFeedbackContext());
  };

  const handlePocketUnlock = () => {
    Alert.alert('산책을 종료할까요?', '지도를 확인하거나 산책을 마칠 수 있어요.', [
      { text: '지도 보기', onPress: () => setSubScreen('course_recommend') },
      { text: '산책 종료', onPress: () => void handleStopWalkAndReport() },
    ]);
  };

  const handleInjectSampleWalk = async (dissatisfied: boolean) => {
    const sampleWalk: WalkRecord = {
      id: `walk_${Date.now()}`, dogId: activeDog.id,
      startedAt: new Date(Date.now() - 1800000).toISOString(), completedAt: new Date().toISOString(),
      durationMinutes: 28, totalDistanceKm: 1.4, averageSpeedKmH: activeDog.speedKmH, safeSurfaceRatio: 0.85,
      gpsTrack: [],
      feedback: {
        comfortScore: dissatisfied ? 2 : 5,
        tags: dissatisfied ? ['경사가 가팔랐어요'] : ['완만해요', '그늘많아요'],
        comment: dissatisfied ? '계단과 언덕이 조금 힘들었어요' : '발이 편하고 좋았어요',
      },
    };
    await LocalStorageService.appendWalkRecord(sampleWalk);
    setFeedbackSummary(await FeedbackContextService.buildRecentFeedbackContext());
    Alert.alert('피드백 등록', dissatisfied ? '⚠️ 가파른 경사 불만족이 반영되었습니다.' : '👍 완만길 만족이 등록되었습니다.');
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safeArea, subScreen === 'pocket' && styles.safeAreaPocket]}>
        <StatusBar
          barStyle={subScreen === 'pocket' ? 'light-content' : 'dark-content'}
          backgroundColor={subScreen === 'pocket' ? TOKENS.colors.pocketBg : TOKENS.colors.background}
        />
        {subScreen === 'pocket' && (
          <DarkPocketScreen dogName={activeDog.name} stats={walk.stats} onUnlock={handlePocketUnlock} />
        )}
        {subScreen === 'report' && completedRecord && (
          <WalkReportScreen
            record={completedRecord} dogName={activeDog.name}
            onSaveFeedback={handleSaveReportFeedback}
            onGoHome={() => { setSubScreen('main'); setActiveTab('홈'); }}
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
            dog={activeDog} preferences={preferences} onBack={() => setSubScreen('walk_settings')}
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
                  dog={activeDog} preferences={preferences} onBack={() => setActiveTab('홈')}
                  onStartWalk={handleStartWalk} onPinSelect={TTSNavigationService.speak}
                />
              )}
              {activeTab === '커뮤니티' && <CommunityTabScreen />}
              {activeTab === '마이' && (
                <MyProfileTabScreen dog={activeDog} onSaveDog={handleSaveActiveDog} onInjectFeedback={handleInjectSampleWalk} />
              )}
            </ScrollView>
            <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} onActionPress={() => setSubScreen('walk_settings')} />
          </View>
        )}
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
  logoIcon: { fontSize: 16 },
  appTitle: { fontSize: 17, fontWeight: '700', color: TOKENS.colors.textMain, letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18, color: TOKENS.colors.textMain },
  scrollContent: { padding: 20, paddingBottom: 24 },
});
