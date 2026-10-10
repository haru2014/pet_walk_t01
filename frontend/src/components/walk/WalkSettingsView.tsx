/**
 * [편안하개 - PetWalk]
 * 모바일 산책 설정 화면 (Screen-03, US-A1, US-A3)
 *
 * 목표 시간 칩, 6대 선호 환경 다중 선택, 자연어/음성 입력, 산책 코스 탐색
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { DogProfile } from '../../types/dogProfile';
import {
  EnvironmentId,
  WALK_ENVIRONMENTS,
  WalkPreferences,
} from '../../types/walkSettings';
import { TTSNavigationService } from '../../services/ttsNavigation';

export interface WalkSettingsViewProps {
  dog: DogProfile;
  initialPreferences?: WalkPreferences;
  onBack: () => void;
  onFindRoute: (preferences: WalkPreferences) => void;
}

export const WalkSettingsView: React.FC<WalkSettingsViewProps> = ({
  dog,
  initialPreferences,
  onBack,
  onFindRoute,
}) => {
  const [duration, setDuration] = useState<number | null>(
    initialPreferences?.durationMinutes ?? 30
  );
  const [environments, setEnvironments] = useState<EnvironmentId[]>(
    initialPreferences?.environments ?? ['soft', 'shade', 'stairs']
  );
  const [requestText, setRequestText] = useState(
    initialPreferences?.requestText ?? ''
  );
  const [isListening, setIsListening] = useState(false);

  const durationOptions = [20, 30, 40, 60];

  const handleToggleEnvironment = (id: EnvironmentId) => {
    setEnvironments((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleVoiceInput = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    setIsListening(true);
    TTSNavigationService.speak('원하시는 산책 조건을 편안하게 말씀해주세요.');

    // 모바일 음성 발화 예시 자동 반영
    setTimeout(() => {
      setRequestText((prev) =>
        prev ? `${prev} 계단 피하고 시원한 길로 찾아줘` : `${dog.name}랑 30분 정도 폭신한 길로 걸을래`
      );
      setIsListening(false);
    }, 1600);
  };

  const handleSubmit = () => {
    onFindRoute({
      durationMinutes: duration,
      environments,
      requestText,
    });
  };

  // 선택된 조건 레이블 배열
  const selectedLabels: string[] = [
    dog.name,
    ...(duration ? [duration === 60 ? '1시간' : `${duration}분`] : []),
    ...WALK_ENVIRONMENTS.filter((opt) => environments.includes(opt.id)).map(
      (opt) => opt.label
    ),
    ...(requestText.trim() ? ['직접 입력한 요청'] : []),
  ];

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>산책 설정</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 타이틀 안내 */}
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>{dog.name}와 어떤 산책을 할까요?</Text>
          <Text style={styles.subTitle}>
            원하는 산책 조건을 알려주면 AI가 {dog.name}에게{'\n'}맞는 안심 길을 찾아볼게요.
          </Text>
        </View>

        {/* AI 안내 배너 */}
        <View style={styles.aiBanner}>
          <View style={styles.aiBannerHeader}>
            <Text style={styles.aiSparkleIcon}>✨</Text>
            <Text style={styles.aiBannerTitle}>오늘의 산책, AI에게 맡겨보세요</Text>
          </View>
          <Text style={styles.aiBannerBody}>
            {dog.name}의 산책 시간과 원하는 환경을 알려주면{'\n'}
            관절 안심 지수와 온도를 분석해 코스를 찾아드릴게요.
          </Text>
        </View>

        {/* 섹션 1: 얼마나 걸을까요? */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>얼마나 걸을까요?</Text>
          <View style={styles.durationGrid}>
            {durationOptions.map((minutes) => {
              const isSelected = duration === minutes;
              const label = minutes === 60 ? '1시간' : `${minutes}분`;
              return (
                <TouchableOpacity
                  key={minutes}
                  activeOpacity={0.8}
                  onPress={() => setDuration(isSelected ? null : minutes)}
                  style={[
                    styles.durationChip,
                    isSelected && styles.durationChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      isSelected && styles.durationChipTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 섹션 2: 어떤 길이 좋을까요? */}
        <View style={styles.section}>
          <View style={styles.environmentHeaderRow}>
            <Text style={styles.sectionTitle}>어떤 길이 좋을까요?</Text>
            <Text style={styles.sectionHint}>여러 개 선택할 수 있어요</Text>
          </View>

          <View style={styles.envGrid}>
            {WALK_ENVIRONMENTS.map((option) => {
              const isSelected = environments.includes(option.id);
              return (
                <TouchableOpacity
                  key={option.id}
                  activeOpacity={0.8}
                  onPress={() => handleToggleEnvironment(option.id)}
                  style={[
                    styles.envCard,
                    isSelected && styles.envCardSelected,
                  ]}
                >
                  <View style={styles.envCardTop}>
                    <Text style={styles.envIcon}>{option.icon}</Text>
                    {isSelected && (
                      <View style={styles.envCheckCircle}>
                        <Text style={styles.envCheckMark}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.envLabel,
                      isSelected && styles.envLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.envDetail}>{option.detail}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 섹션 3: 직접 말해도 좋아요 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>직접 말해도 좋아요</Text>
          <View style={styles.textInputBox}>
            <TextInput
              value={requestText}
              onChangeText={setRequestText}
              multiline
              placeholder={`예) ${dog.name}랑 30분 정도 천천히 걷고 싶어.\n계단은 피하고 그늘이 많은 길로 찾아줘.`}
              placeholderTextColor="#9CA3AF"
              style={styles.textArea}
            />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleToggleVoiceInput}
              style={[
                styles.micButton,
                isListening && styles.micButtonActive,
              ]}
            >
              <Text style={styles.micIcon}>{isListening ? '🛑' : '🎙️'}</Text>
            </TouchableOpacity>
          </View>
          {isListening && (
            <Text style={styles.listeningNotice}>말씀해주세요. 듣고 있어요...</Text>
          )}
        </View>

        {/* 섹션 4: 현재 산책 조건 태그 */}
        <View style={styles.section}>
          <Text style={styles.summaryTitle}>현재 산책 조건</Text>
          <View style={styles.tagWrap}>
            {selectedLabels.map((lbl) => (
              <View key={lbl} style={styles.summaryTag}>
                <Text style={styles.summaryTagText}>{lbl}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* 하단 고정 버튼 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={handleSubmit}
          style={styles.submitButton}
        >
          <Text style={styles.submitButtonText}>✨ AI 산책 코스 찾아보기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.background,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.surface,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 26,
    color: TOKENS.colors.textMain,
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.3,
  },
  headerPlaceholder: {
    width: 36,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 110,
  },
  titleSection: {
    marginBottom: 20,
    marginTop: 6,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subTitle: {
    fontSize: 14,
    color: TOKENS.colors.textMuted,
    lineHeight: 20,
  },
  aiBanner: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: TOKENS.colors.primaryMint,
    borderRadius: TOKENS.borderRadius.card,
    padding: 16,
    marginBottom: 24,
  },
  aiBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  aiSparkleIcon: {
    fontSize: 16,
  },
  aiBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  aiBannerBody: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    lineHeight: 18,
    paddingLeft: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  environmentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHint: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
  },
  durationGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  durationChip: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: TOKENS.colors.surface,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationChipSelected: {
    backgroundColor: TOKENS.colors.primary,
    borderColor: TOKENS.colors.primary,
  },
  durationChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  durationChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  envGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  envCard: {
    width: '48%',
    backgroundColor: TOKENS.colors.surface,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    borderRadius: 16,
    padding: 12,
    minHeight: 84,
  },
  envCardSelected: {
    borderColor: TOKENS.colors.primary,
    backgroundColor: '#F0FDF4',
  },
  envCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  envIcon: {
    fontSize: 18,
  },
  envCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: TOKENS.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  envCheckMark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  envLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    marginBottom: 2,
  },
  envLabelSelected: {
    color: TOKENS.colors.primaryDark,
  },
  envDetail: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
  },
  textInputBox: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    padding: 14,
    position: 'relative',
  },
  textArea: {
    fontSize: 13,
    color: TOKENS.colors.textMain,
    lineHeight: 20,
    minHeight: 70,
    textAlignVertical: 'top',
    paddingRight: 40,
  },
  micButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: TOKENS.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  micButtonActive: {
    backgroundColor: TOKENS.colors.primary,
    borderColor: TOKENS.colors.primary,
  },
  micIcon: {
    fontSize: 16,
  },
  listeningNotice: {
    fontSize: 11,
    color: TOKENS.colors.primaryDark,
    marginTop: 6,
    paddingLeft: 4,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
    marginBottom: 8,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  summaryTag: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  summaryTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.primaryDark,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: TOKENS.colors.surface,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 6,
  },
  submitButton: {
    backgroundColor: TOKENS.colors.primary,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
