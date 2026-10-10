/**
 * [편안하개 - PetWalk]
 * React Native / Expo 모바일 메인 애플리케이션 (App.tsx)
 * 
 * - 시선 해방(Eyes-Free) & 두 손의 자유 (US-C2)
 * - 3색 Polyline 코스 지도 프리뷰 (US-C1)
 * - Local-First AsyncStorage 프로필 및 피드백 (US-A2, US-E3)
 * - expo-speech TTS 음성 안내 엔진 연동 (US-C2)
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
import { StatusBadge } from './src/components/common/StatusBadge';
import { BottomTabBar, TabKey } from './src/components/common/BottomTabBar';
import { DogProfile, JointCareLevel, calculateRecommendedSpeedKmH } from './src/types/dogProfile';

function getCareChipText(lvl: number): string {
  if (lvl === 0) return '일반';
  if (lvl === 1) return '주의';
  return '적극보호';
}
import { LocalStorageService } from './src/services/storage';
import { FeedbackContextService, FeedbackSummaryPayload } from './src/services/feedbackContext';
import { STORAGE_KEYS, WalkRecord } from './src/types/storage';
import { RouteMapView } from './src/components/map/RouteMapView';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from './src/services/sampleRoute';
import { TTSNavigationService } from './src/services/ttsNavigation';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('산책');
  const [profile, setProfile] = useState<DogProfile>({
    id: 'dog_default',
    name: '초코',
    breed: '말티즈',
    ageYears: 9,
    weightKg: 4.2,
    jointCareLevel: 2,
    speedKmH: 2.2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummaryPayload | null>(null);

  useEffect(() => {
    async function loadData() {
      const savedProfile = await LocalStorageService.getItem<DogProfile>(STORAGE_KEYS.DOG_PROFILE);
      if (savedProfile) {
        setProfile(savedProfile);
      } else {
        await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, profile);
      }

      const summary = await FeedbackContextService.buildRecentFeedbackContext();
      setFeedbackSummary(summary);
    }
    void loadData();
  }, []);

  const handleProfileChange = (fields: Partial<DogProfile>) => {
    const updated = { ...profile, ...fields };
    updated.speedKmH = calculateRecommendedSpeedKmH(
      updated.weightKg,
      updated.ageYears,
      updated.jointCareLevel
    );
    updated.updatedAt = new Date().toISOString();
    setProfile(updated);
  };

  const handleSaveProfile = async () => {
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, profile);
    Alert.alert('저장 완료', '🐾 반려견 프로필이 로컬 스토리지에 안전하게 저장되었습니다!');
  };

  const handleStartWalk = () => {
    TTSNavigationService.speak('편안하개 안심 산책을 시작합니다. 50미터 앞 완만한 길입니다.');
    Alert.alert('산책 시작 🐾', '시선 해방 음성 안내가 시작되었습니다. 스마트폰을 주머니에 넣으셔도 안전하게 안내됩니다.');
  };

  const handlePinVoiceBriefing = (instruction: string) => {
    TTSNavigationService.speak(instruction);
  };

  const handleInjectSampleWalk = async (dissatisfied: boolean) => {
    const sampleWalk: WalkRecord = {
      id: `walk_${Date.now()}`,
      dogId: profile.id,
      startedAt: new Date(Date.now() - 1800000).toISOString(),
      completedAt: new Date().toISOString(),
      durationMinutes: 28,
      totalDistanceKm: 1.4,
      averageSpeedKmH: profile.speedKmH,
      safeSurfaceRatio: 0.85,
      gpsTrack: [],
      feedback: {
        comfortScore: dissatisfied ? 2 : 5,
        tags: dissatisfied ? ['경사가 가팔랐어요'] : ['완만해요', '그늘많아요'],
        comment: dissatisfied ? '계단과 언덕이 조금 힘들었어요' : '발이 편하고 좋았어요',
      },
    };

    await LocalStorageService.appendWalkRecord(sampleWalk);
    const summary = await FeedbackContextService.buildRecentFeedbackContext();
    setFeedbackSummary(summary);
    Alert.alert('피드백 등록', dissatisfied ? '⚠️ 가파른 경사 불만족이 반영되었습니다.' : '👍 완만길 만족이 등록되었습니다.');
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={TOKENS.colors.background} />

      {/* 상단 앱 헤더 */}
      <View style={styles.header}>
        <View style={styles.logoGroup}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>🐾</Text>
          </View>
          <Text style={styles.appTitle}>편안하개</Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>Mobile Native 🔒</Text>
        </View>
      </View>

      {/* 메인 콘텐츠 스크롤 뷰 */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 1. 산책 탭: 코스 프리뷰 지도 및 3색 Polyline (Phase 3) */}
        {activeTab === '산책' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSubtitle}>AI 추천 안심 코스 (US-C1)</Text>
              <Text style={styles.sectionTitle}>{profile.name}와 걷는 순환 코스 🗺️</Text>
            </View>

            <RouteMapView
              route={SAMPLE_ROUTE}
              stepPins={SAMPLE_STEP_PINS}
              speedKmH={profile.speedKmH}
              onStart={handleStartWalk}
              onPinSelect={handlePinVoiceBriefing}
            />
          </View>
        )}

        {/* 2. 홈 탭 */}
        {activeTab === '홈' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSubtitle}>오늘도 편안하게,</Text>
              <Text style={styles.sectionTitle}>우리 아이와 걸어요 🐾</Text>
            </View>

            <CardWrapper style={{ marginBottom: 14 }}>
              <View style={styles.dogSummaryRow}>
                <View style={styles.dogAvatarPlaceholder}>
                  <Text style={{ fontSize: 28 }}>🐶</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.dogName}>{profile.name}</Text>
                    <StatusBadge variant="green">준비 완료</StatusBadge>
                  </View>
                  <Text style={styles.dogMeta}>
                    {profile.breed} · {profile.ageYears}세 · {profile.weightKg}kg
                  </Text>
                  <Text style={styles.dogSpeed}>
                    권장 속도: {profile.speedKmH} km/h (US-A3 모델)
                  </Text>
                </View>
              </View>

              <View style={styles.cardActionRow}>
                <StatusBadge variant="solidGreen">🌿 폭신한 길 위주</StatusBadge>
                <GradientButton size="sm" onPress={() => setActiveTab('산책')}>
                  산책 시작 →
                </GradientButton>
              </View>
            </CardWrapper>

            {/* 피드백 AI 보정 요약 */}
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

        {/* 3. 마이 탭: 프로필 설정 & Local-First */}
        {activeTab === '마이' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSubtitle}>반려견 안심 케어 프로필</Text>
              <Text style={styles.sectionTitle}>우리 아이 정보 관리 🐾</Text>
            </View>

            <CardWrapper style={{ marginBottom: 16 }}>
              <Text style={styles.fieldLabel}>이름</Text>
              <TextInput
                value={profile.name}
                onChangeText={(text) => handleProfileChange({ name: text })}
                style={styles.input}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>나이 (세)</Text>
                  <TextInput
                    value={String(profile.ageYears)}
                    keyboardType="numeric"
                    onChangeText={(text) => handleProfileChange({ ageYears: Number(text) || 0 })}
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>체중 (kg)</Text>
                  <TextInput
                    value={String(profile.weightKg)}
                    keyboardType="numeric"
                    onChangeText={(text) => handleProfileChange({ weightKg: Number(text) || 0 })}
                    style={styles.input}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>관절 안심 케어 수준</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                {[0, 1, 2].map((lvl) => {
                  const isSelected = profile.jointCareLevel === lvl;
                  const label = getCareChipText(lvl);
                  return (
                    <TouchableOpacity
                      key={lvl}
                      onPress={() => handleProfileChange({ jointCareLevel: lvl as JointCareLevel })}
                      style={[styles.levelChip, isSelected && styles.levelChipSelected]}
                    >
                      <Text style={[styles.levelChipText, isSelected && styles.levelChipTextSelected]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <GradientButton fullWidth onPress={handleSaveProfile} style={{ marginTop: 16 }}>
                로컬 프로필 저장 ✓
              </GradientButton>
            </CardWrapper>

            {/* 피드백 시뮬레이션 */}
            <CardWrapper variant="flat">
              <Text style={styles.cardHeaderTitle}>🧪 피드백 주입 시뮬레이션</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => handleInjectSampleWalk(true)}
                  style={[styles.simButton, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                >
                  <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '600' }}>+ 가파름 불만족</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleInjectSampleWalk(false)}
                  style={[styles.simButton, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                >
                  <Text style={{ color: '#065F46', fontSize: 12, fontWeight: '600' }}>+ 완만길 만족</Text>
                </TouchableOpacity>
              </View>
            </CardWrapper>
          </View>
        )}

        {/* 4. 커뮤니티 탭 */}
        {activeTab === '커뮤니티' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSubtitle}>동네 안심 산책로 공유</Text>
              <Text style={styles.sectionTitle}>커뮤니티 코스 피드 👥</Text>
            </View>
            <CardWrapper>
              <Text style={styles.cardHeaderTitle}>🔒 200m 공간 마스킹 보호</Text>
              <Text style={[styles.cardBodyText, { marginTop: 6 }]}>
                이웃 견주들이 공유한 안심 산책 코스입니다. 견주의 자택 프라이버시를 위해 출발지/도착지 200m 구간은 자동으로 마스킹(Jittering)됩니다.
              </Text>
            </CardWrapper>
          </View>
        )}
      </ScrollView>

      {/* 하단 탭 바 */}
      <BottomTabBar
        activeTab={activeTab}
        onTabChange={(tab: TabKey) => setActiveTab(tab)}
        onActionPress={() => setActiveTab('산책')}
      />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: TOKENS.colors.background,
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
    fontSize: 18,
  },
  appTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
  },
  headerBadge: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
  },
  dogSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dogAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TOKENS.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: TOKENS.colors.primary,
  },
  dogName: {
    fontSize: 17,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  dogMeta: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    marginTop: 2,
  },
  dogSpeed: {
    fontSize: 12,
    color: TOKENS.colors.primaryDark,
    fontWeight: '600',
    marginTop: 2,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
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
    marginTop: 4,
  },
  aiQuote: {
    fontSize: 12,
    color: TOKENS.colors.textMain,
    fontStyle: 'italic',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  fieldLabel: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: '#FFFFFF',
  },
  levelChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  levelChipSelected: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderColor: TOKENS.colors.primary,
  },
  levelChipText: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
  },
  levelChipTextSelected: {
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  simButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
});
