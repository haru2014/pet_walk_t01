/**
 * [편안하개 - PetWalk]
 * React Native / Expo 모바일 메인 애플리케이션 (App.tsx)
 * 
 * 목업 Screen 01~04 사용자 여정 통합 UI/UX:
 * - Screen-01: 홈 화면 (골든타임 위젯, AI 도우미 배너, 최근 산책)
 * - Screen-02: 다견 선택 화면 (누구와 산책할까요? & 새 강아지 등록)
 * - Screen-03: 산책 조건 설정 (목표 시간, 6대 선호 환경, 음성/자연어 플래너)
 * - Screen-04: AI 코스 추천 및 3대 안심 지표 상세 사유 (경사/노면/그늘 인포그래픽)
 * - 시선 해방(Eyes-Free) expo-speech TTS 음성 안내 연동 (US-C2)
 * - Local-First AsyncStorage 프로필 및 피드백 영구 보존 (US-A2, US-E3)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { TOKENS } from './src/theme/tokens';
import { CardWrapper } from './src/components/common/CardWrapper';
import { GradientButton } from './src/components/common/GradientButton';
import { BottomTabBar, TabKey } from './src/components/common/BottomTabBar';
import {
  DogProfile,
  JointCareLevel,
  calculateRecommendedSpeedKmH,
} from './src/types/dogProfile';
import { WalkPreferences, RecommendedCourse } from './src/types/walkSettings';
import { LocalStorageService } from './src/services/storage';
import {
  FeedbackContextService,
  FeedbackSummaryPayload,
} from './src/services/feedbackContext';
import { STORAGE_KEYS, WalkRecord } from './src/types/storage';
import { TTSNavigationService } from './src/services/ttsNavigation';

// 홈 화면 전용 컴포넌트들 (Screen-01)
import { HomeDogCard } from './src/components/home/HomeDogCard';
import { GoldenTimeWidget } from './src/components/home/GoldenTimeWidget';
import { AiPlannerBanner } from './src/components/home/AiPlannerBanner';
import { RecentWalkCard } from './src/components/home/RecentWalkCard';

// 강아지 선택 화면 (Screen-02)
import { DogSelectionView } from './src/components/profile/DogSelectionView';

// 산책 설정 플래너 (Screen-03)
import { WalkSettingsView } from './src/components/walk/WalkSettingsView';

// 추천 코스 및 사유 화면 (Screen-04)
import { CourseRecommendationView } from './src/components/walk/CourseRecommendationView';

export type AppSubScreen =
  | 'main'             // 일반 탭 화면 (홈, 산책, 커뮤니티, 마이)
  | 'dog_selection'    // Screen-02: 누구와 산책할까요?
  | 'walk_settings'    // Screen-03: 어떤 산책을 할까요?
  | 'course_recommend'; // Screen-04: 추천 산책 코스 상세

const INITIAL_DOGS: DogProfile[] = [
  {
    id: 'dog_choco',
    name: '초코',
    breed: '말티즈',
    ageYears: 3,
    weightKg: 4.2,
    jointCareLevel: 1,
    speedKmH: 2.5,
    preference: '30분 산책 선호',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'dog_kong',
    name: '콩이',
    breed: '푸들',
    ageYears: 5,
    weightKg: 5.8,
    jointCareLevel: 2,
    speedKmH: 2.2,
    preference: '천천히 걷는 산책 선호',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('홈');
  const [subScreen, setSubScreen] = useState<AppSubScreen>('main');

  // 다견 프로필 목록 및 선택된 강아지
  const [dogs, setDogs] = useState<DogProfile[]>(INITIAL_DOGS);
  const [selectedDogId, setSelectedDogId] = useState<string>('dog_choco');
  const activeDog = dogs.find((d) => d.id === selectedDogId) ?? dogs[0];

  // 산책 조건 상태
  const [preferences, setPreferences] = useState<WalkPreferences>({
    durationMinutes: 30,
    environments: ['soft', 'shade', 'stairs'],
    requestText: '',
  });

  const [feedbackSummary, setFeedbackSummary] =
    useState<FeedbackSummaryPayload | null>(null);

  // 로컬 스토리지 초기화
  useEffect(() => {
    async function loadData() {
      const savedProfile = await LocalStorageService.getItem<DogProfile>(
        STORAGE_KEYS.DOG_PROFILE
      );
      if (savedProfile) {
        setDogs((prev) => {
          const exists = prev.some((d) => d.id === savedProfile.id);
          return exists
            ? prev.map((d) => (d.id === savedProfile.id ? savedProfile : d))
            : [savedProfile, ...prev];
        });
        setSelectedDogId(savedProfile.id);
      } else {
        await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, INITIAL_DOGS[0]);
      }

      const summary = await FeedbackContextService.buildRecentFeedbackContext();
      setFeedbackSummary(summary);
    }
    void loadData();
  }, []);

  // 강아지 프로필 저장
  const handleSaveActiveDog = async (fields: Partial<DogProfile>) => {
    const updated = { ...activeDog, ...fields };
    updated.speedKmH = calculateRecommendedSpeedKmH(
      updated.weightKg,
      updated.ageYears,
      updated.jointCareLevel
    );
    updated.updatedAt = new Date().toISOString();

    const newDogs = dogs.map((d) => (d.id === updated.id ? updated : d));
    setDogs(newDogs);
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, updated);
  };

  // 신규 강아지 등록
  const handleAddDog = async (newDog: DogProfile) => {
    const newDogs = [...dogs, newDog];
    setDogs(newDogs);
    setSelectedDogId(newDog.id);
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, newDog);
  };

  // 산책 시작 액션
  const handleStartWalk = (course?: RecommendedCourse) => {
    const courseTitle = course?.name ?? '편안한 숲길 코스';
    TTSNavigationService.speak(
      `${activeDog.name}와 ${courseTitle} 산책을 시작합니다. 50미터 앞 완만한 흙길 구간입니다.`
    );
    Alert.alert(
      '산책 시작 🐾',
      `"${courseTitle}" 안내가 시작되었습니다. 스마트폰을 주머니에 넣으셔도 음성으로 안전하게 안내됩니다.`
    );
  };

  const handlePinVoiceBriefing = (instruction: string) => {
    TTSNavigationService.speak(instruction);
  };

  // 피드백 주입 시뮬레이션
  const handleInjectSampleWalk = async (dissatisfied: boolean) => {
    const sampleWalk: WalkRecord = {
      id: `walk_${Date.now()}`,
      dogId: activeDog.id,
      startedAt: new Date(Date.now() - 1800000).toISOString(),
      completedAt: new Date().toISOString(),
      durationMinutes: 28,
      totalDistanceKm: 1.4,
      averageSpeedKmH: activeDog.speedKmH,
      safeSurfaceRatio: 0.85,
      gpsTrack: [],
      feedback: {
        comfortScore: dissatisfied ? 2 : 5,
        tags: dissatisfied ? ['경사가 가팔랐어요'] : ['완만해요', '그늘많아요'],
        comment: dissatisfied
          ? '계단과 언덕이 조금 힘들었어요'
          : '발이 편하고 좋았어요',
      },
    };

    await LocalStorageService.appendWalkRecord(sampleWalk);
    const summary = await FeedbackContextService.buildRecentFeedbackContext();
    setFeedbackSummary(summary);
    Alert.alert(
      '피드백 등록',
      dissatisfied
        ? '⚠️ 가파른 경사 불만족이 반영되었습니다.'
        : '👍 완만길 만족이 등록되었습니다.'
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={TOKENS.colors.background} />

        {/* 1. Screen-02: 누구와 산책할까요? (강아지 선택) */}
        {subScreen === 'dog_selection' && (
          <DogSelectionView
            dogs={dogs}
            selectedDogId={selectedDogId}
            onSelectDog={(id) => setSelectedDogId(id)}
            onAddDog={handleAddDog}
            onContinue={() => setSubScreen('walk_settings')}
            onBack={() => setSubScreen('main')}
          />
        )}

        {/* 2. Screen-03: 어떤 산책을 할까요? (산책 설정 플래너) */}
        {subScreen === 'walk_settings' && (
          <WalkSettingsView
            dog={activeDog}
            initialPreferences={preferences}
            onBack={() => setSubScreen('main')}
            onFindRoute={(nextPrefs) => {
              setPreferences(nextPrefs);
              setSubScreen('course_recommend');
            }}
          />
        )}

        {/* 3. Screen-04: 추천 산책 코스 & 상세 사유 */}
        {subScreen === 'course_recommend' && (
          <CourseRecommendationView
            dog={activeDog}
            preferences={preferences}
            onBack={() => setSubScreen('walk_settings')}
            onStartWalk={handleStartWalk}
            onPinSelect={handlePinVoiceBriefing}
          />
        )}

        {/* 4. 메인 탭 화면 (Screen-01 홈, 산책, 커뮤니티, 마이) */}
        {subScreen === 'main' && (
          <View style={styles.mainContainer}>
            {/* 상단 공통 헤더 */}
            <View style={styles.header}>
              <View style={styles.logoGroup}>
                <View style={styles.logoBadge}>
                  <Text style={styles.logoIcon}>🐾</Text>
                </View>
                <Text style={styles.appTitle}>편안하개</Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => Alert.alert('알림', '새로운 안심 산책 소식이 없습니다.')}
                  style={styles.headerIconBtn}
                >
                  <Text style={styles.headerIconText}>🔔</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSubScreen('dog_selection')}
                  style={styles.headerIconBtn}
                >
                  <Text style={styles.headerIconText}>⋯</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 스크롤 콘텐츠 */}
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {/* ---------------- 1. 홈 탭 (Screen-01) ---------------- */}
              {activeTab === '홈' && (
                <View>
                  {/* 환영 인사 */}
                  <View style={styles.greetingSection}>
                    <Text style={styles.greetingSub}>오늘도 편안하게,</Text>
                    <Text style={styles.greetingMain}>우리 아이와 걸어요. 🐾</Text>
                  </View>

                  {/* 메인 반려견 카드 (Screen-01) */}
                  <HomeDogCard
                    profile={activeDog}
                    onPressProfile={() => setSubScreen('dog_selection')}
                    onStartWalk={() => setSubScreen('course_recommend')}
                  />

                  {/* 오늘의 산책 골든타임 위젯 (Screen-01) */}
                  <GoldenTimeWidget
                    currentTimeLabel="15:30"
                    startTimeLabel="14:00"
                    endTimeLabel="17:00"
                    progressPercent={52}
                    statusNotice="현재 15:30 · 산책 추천 시간대"
                  />

                  {/* AI 산책 도우미 배너 (Screen-01) */}
                  <AiPlannerBanner
                    onPress={() => setSubScreen('walk_settings')}
                    examplePrompt='"30분 정도 걷고 싶어"'
                  />

                  {/* 최근 산책 요약 카드 (Screen-01) */}
                  <RecentWalkCard
                    title="오늘의 산책"
                    distanceKm={2.4}
                    durationMinutes={38}
                    safeRatioPercent={72}
                    onPress={() => setSubScreen('course_recommend')}
                  />

                  {/* 최근 피드백 AI 보정 알림 (US-E3) */}
                  {feedbackSummary && (
                    <CardWrapper variant="flat" style={{ marginBottom: 14 }}>
                      <Text style={styles.cardHeaderTitle}>🤖 최근 피드백 AI 보정 (US-E3)</Text>
                      <Text style={styles.cardBodyText}>
                        • 최근 분석: {feedbackSummary.recent_walk_count}회{'\n'}
                        • 경사 불만족: {feedbackSummary.slope_dissatisfaction_count}회{'\n'}
                        • 최대 경사도 보정치: {feedbackSummary.recommended_max_slope_offset}%
                      </Text>
                      <Text style={styles.aiQuote}>
                        "{FeedbackContextService.generateBriefingNotice(feedbackSummary)}"
                      </Text>
                    </CardWrapper>
                  )}
                </View>
              )}

              {/* ---------------- 2. 산책 탭 (Screen-04 직행) ---------------- */}
              {activeTab === '산책' && (
                <View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionSubtitle}>AI 추천 안심 코스 (US-C1)</Text>
                    <Text style={styles.sectionTitle}>{activeDog.name}와 걷는 순환 코스 🗺️</Text>
                  </View>

                  <CourseRecommendationView
                    dog={activeDog}
                    preferences={preferences}
                    onBack={() => setActiveTab('홈')}
                    onStartWalk={handleStartWalk}
                    onPinSelect={handlePinVoiceBriefing}
                  />
                </View>
              )}

              {/* ---------------- 3. 커뮤니티 탭 ---------------- */}
              {activeTab === '커뮤니티' && (
                <View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionSubtitle}>동네 안심 산책로 공유</Text>
                    <Text style={styles.sectionTitle}>커뮤니티 코스 피드 👥</Text>
                  </View>
                  <CardWrapper>
                    <Text style={styles.cardHeaderTitle}>🔒 200m 공간 마스킹 보호</Text>
                    <Text style={[styles.cardBodyText, { marginTop: 6 }]}>
                      이웃 견주들이 공유한 안심 산책 코스입니다. 견주의 자택 프라이버시를 위해
                      출발지/도착지 200m 구간은 자동으로 마스킹(Jittering)됩니다.
                    </Text>
                  </CardWrapper>
                </View>
              )}

              {/* ---------------- 4. 마이 탭 (프로필 관리) ---------------- */}
              {activeTab === '마이' && (
                <View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionSubtitle}>반려견 안심 케어 프로필</Text>
                    <Text style={styles.sectionTitle}>우리 아이 정보 관리 🐾</Text>
                  </View>

                  <CardWrapper style={{ marginBottom: 16 }}>
                    <Text style={styles.fieldLabel}>이름</Text>
                    <TextInput
                      value={activeDog.name}
                      onChangeText={(text) => handleSaveActiveDog({ name: text })}
                      style={styles.input}
                    />

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>나이 (세)</Text>
                        <TextInput
                          value={String(activeDog.ageYears)}
                          keyboardType="numeric"
                          onChangeText={(text) =>
                            handleSaveActiveDog({ ageYears: Number(text) || 0 })
                          }
                          style={styles.input}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>체중 (kg)</Text>
                        <TextInput
                          value={String(activeDog.weightKg)}
                          keyboardType="numeric"
                          onChangeText={(text) =>
                            handleSaveActiveDog({ weightKg: Number(text) || 0 })
                          }
                          style={styles.input}
                        />
                      </View>
                    </View>

                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                      관절 안심 케어 수준
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      {[0, 1, 2].map((lvl) => {
                        const isSelected = activeDog.jointCareLevel === lvl;
                        const labels = ['일반', '주의', '적극보호'];
                        return (
                          <TouchableOpacity
                            key={lvl}
                            onPress={() =>
                              handleSaveActiveDog({ jointCareLevel: lvl as JointCareLevel })
                            }
                            style={[
                              styles.levelChip,
                              isSelected && styles.levelChipSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.levelChipText,
                                isSelected && styles.levelChipTextSelected,
                              ]}
                            >
                              {labels[lvl]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <GradientButton
                      fullWidth
                      onPress={() =>
                        Alert.alert('저장 완료', '🐾 프로필이 로컬에 저장되었습니다!')
                      }
                      style={{ marginTop: 16 }}
                    >
                      로컬 프로필 저장 ✓
                    </GradientButton>
                  </CardWrapper>

                  {/* 피드백 시뮬레이션 */}
                  <CardWrapper variant="flat">
                    <Text style={styles.cardHeaderTitle}>🧪 피드백 주입 시뮬레이션</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => handleInjectSampleWalk(true)}
                        style={[
                          styles.simButton,
                          { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
                        ]}
                      >
                        <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '600' }}>
                          + 가파름 불만족
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleInjectSampleWalk(false)}
                        style={[
                          styles.simButton,
                          { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                        ]}
                      >
                        <Text style={{ color: '#065F46', fontSize: 12, fontWeight: '600' }}>
                          + 완만길 만족
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </CardWrapper>
                </View>
              )}
            </ScrollView>

            {/* 하단 탭 바 */}
            <BottomTabBar
              activeTab={activeTab}
              onTabChange={(tab: TabKey) => setActiveTab(tab)}
              onActionPress={() => setSubScreen('walk_settings')}
            />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: TOKENS.colors.background,
  },
  mainContainer: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.surface,
  },
  logoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: TOKENS.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    fontSize: 16,
  },
  appTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    fontSize: 18,
    color: TOKENS.colors.textMain,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 24,
  },
  greetingSection: {
    marginBottom: 16,
    marginTop: 4,
  },
  greetingSub: {
    fontSize: 14,
    color: TOKENS.colors.textMuted,
    marginBottom: 4,
  },
  greetingMain: {
    fontSize: 22,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.5,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: TOKENS.colors.textMuted,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.5,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  cardBodyText: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    lineHeight: 18,
    marginTop: 6,
  },
  aiQuote: {
    fontSize: 12,
    color: TOKENS.colors.primaryDark,
    fontStyle: 'italic',
    marginTop: 8,
    paddingLeft: 4,
    borderLeftWidth: 2,
    borderLeftColor: TOKENS.colors.primary,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.textMain,
    marginBottom: 4,
  },
  input: {
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: TOKENS.colors.textMain,
  },
  levelChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    backgroundColor: TOKENS.colors.background,
  },
  levelChipSelected: {
    borderColor: TOKENS.colors.primary,
    backgroundColor: TOKENS.colors.primaryLight,
  },
  levelChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: TOKENS.colors.textMuted,
  },
  levelChipTextSelected: {
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  simButton: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
});
