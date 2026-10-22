/**
 * [편안하개 - PetWalk]
 * 모바일 마이 프로필 탭 화면 (US-A2, US-E3)
 *
 * 반려견 안심 케어 프로필 편집, Local-First 저장, 피드백 주입 시뮬레이션
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { DogProfile, JointCareLevel } from '../types/dogProfile';
import { CardWrapper } from '../components/common/CardWrapper';
import { GradientButton } from '../components/common/GradientButton';
import { BackupService } from '../services/backupService';
import { BookmarkListView } from '../components/bookmark/BookmarkListView';
import { BookmarkedRoute } from '../types/bookmark';
import { DataResetCard } from '../components/privacy/DataResetCard';
import { FeedbackSummaryPayload } from '../services/feedbackContext';
import { APP_THEMES, AppThemeId } from '../types/appTheme';

export interface MyProfileTabScreenProps {
  dog: DogProfile;
  feedbackSummary?: FeedbackSummaryPayload | null;
  onSaveDog: (fields: Partial<DogProfile>) => void;
  onInjectFeedback: (dissatisfied: boolean) => void;
  onResetFeedback?: () => void;
  onStartBookmark: (bookmark: BookmarkedRoute) => void;
  onResetData?: () => Promise<void>;
  onOpenOnboarding?: () => void;
  activeThemeId: AppThemeId;
  themeReady: boolean;
  themeSaving: boolean;
  onSelectTheme: (themeId: AppThemeId) => Promise<boolean>;
}

export const MyProfileTabScreen: React.FC<MyProfileTabScreenProps> = ({
  dog, feedbackSummary, onSaveDog, onInjectFeedback, onResetFeedback, onStartBookmark, onResetData, onOpenOnboarding,
  activeThemeId, themeReady, themeSaving, onSelectTheme,
}) => {
  const [resetCount, setResetCount] = useState(0);
  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionSubtitle}>반려견 안심 케어 프로필</Text>
        <Text style={styles.sectionTitle}>우리 아이 정보 관리 🐾</Text>
      </View>

      <CardWrapper variant="flat" style={{ marginBottom: 16 }}>
        <Text style={styles.cardHeaderTitle}>앱 테마</Text>
        <Text style={styles.backupDesc}>산책 달성 배지에 적용할 기본 색상을 선택해 주세요.</Text>
        <View style={styles.themeOptions}>
          {Object.values(APP_THEMES).map((theme) => {
            const isSelected = activeThemeId === theme.id;
            return (
              <TouchableOpacity
                key={theme.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: !themeReady || themeSaving }}
                disabled={!themeReady || themeSaving}
                onPress={() => { void onSelectTheme(theme.id); }}
                style={[
                  styles.themeOption,
                  { borderColor: isSelected ? theme.primary : TOKENS.colors.border },
                  isSelected && { backgroundColor: theme.primaryWash },
                  (!themeReady || themeSaving) && styles.themeOptionDisabled,
                ]}
              >
                <View style={[styles.themeSwatch, { backgroundColor: theme.primary }]} />
                <Text style={[styles.themeOptionText, isSelected && { color: theme.primaryDark }]}>
                  {theme.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </CardWrapper>

      <CardWrapper style={{ marginBottom: 16 }}>
        <Text style={styles.fieldLabel}>이름</Text>
        <TextInput
          value={dog.name}
          onChangeText={(text) => onSaveDog({ name: text })}
          style={styles.input}
        />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>나이 (세)</Text>
            <TextInput
              value={String(dog.ageYears)}
              keyboardType="numeric"
              onChangeText={(text) => onSaveDog({ ageYears: Number(text) || 0 })}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>체중 (kg)</Text>
            <TextInput
              value={String(dog.weightKg)}
              keyboardType="numeric"
              onChangeText={(text) => onSaveDog({ weightKg: Number(text) || 0 })}
              style={styles.input}
            />
          </View>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>관절 안심 케어 수준</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          {[0, 1, 2].map((lvl) => {
            const isSelected = dog.jointCareLevel === lvl;
            const labels = ['일반', '주의', '적극보호'];
            return (
              <TouchableOpacity
                key={lvl}
                onPress={() => onSaveDog({ jointCareLevel: lvl as JointCareLevel })}
                style={[styles.levelChip, isSelected && styles.levelChipSelected]}
              >
                <Text style={[styles.levelChipText, isSelected && styles.levelChipTextSelected]}>
                  {labels[lvl]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <GradientButton
          fullWidth
          onPress={() => Alert.alert('저장 완료', '🐾 반려견 프로필이 안전하게 저장되었습니다!')}
          style={{ marginTop: 16 }}
        >
          반려견 프로필 저장 ✓
        </GradientButton>
      </CardWrapper>

      {/* 내 보관함 (즐겨찾기 안심 코스) */}
      <BookmarkListView key={resetCount} onStartBookmark={onStartBookmark} dogSpeedKmH={dog.speedKmH} />

      {/* 반려견 프로필 파일 보관 및 복원 */}
      <CardWrapper variant="flat" style={{ marginBottom: 16 }}>
        <Text style={styles.cardHeaderTitle}>💾 반려견 프로필 백업 및 복원</Text>
        <Text style={styles.backupDesc}>
          소중한 반려견 프로필을 내 스마트폰 파일로 안전하게 보관하고 필요할 때 불러옵니다.
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            const ok = BackupService.downloadProfileJsonFile(dog);
            if (ok) {
              Alert.alert('프로필 저장 완료', `🐾 ${dog.name} 프로필 파일이 기기에 다운로드되었습니다.`);
            } else {
              const jsonStr = BackupService.exportProfileToJson(dog);
              Alert.alert('프로필 내보내기', `백업 데이터가 생성되었습니다:\n${jsonStr.slice(0, 80)}...`);
            }
          }}
          style={[styles.simButton, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', marginTop: 10 }]}
        >
          <Text style={{ color: '#065F46', fontSize: 12, fontWeight: '700' }}>
            📥 내 프로필 파일로 저장하기
          </Text>
        </TouchableOpacity>
      </CardWrapper>

      {/* AI 경로 보정 시뮬레이터 (개발/시연용 가상 피드백) */}
      <CardWrapper variant="flat">
        <Text style={styles.cardHeaderTitle}>🧪 [시연/테스트] AI 산책로 보정 시뮬레이터</Text>
        <Text style={styles.backupDesc}>
          실제 산책을 돌지 않고도 가상의 보행 피드백을 즉시 주입하여, AI 에이전트가 다음 산책로 추천 시 경사도를 자동으로 낮추어 관절 안심 코스로 보정하는 기능을 테스트합니다.
        </Text>
        {feedbackSummary && (
          <View style={styles.simStatusBadge}>
            <Text style={styles.simStatusText}>
              📊 현재 적용 상태: 최근 {feedbackSummary.recent_walk_count}회 분석 · 경사 불만족 {feedbackSummary.slope_dissatisfaction_count}회 (최대 경사도 보정치: {feedbackSummary.recommended_max_slope_offset}%)
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            onPress={() => onInjectFeedback(true)}
            style={[styles.simButton, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', flex: 1, minWidth: 140 }]}
          >
            <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '600' }}>
              + 가상 "언덕/경사 부담" 주입
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onInjectFeedback(false)}
            style={[styles.simButton, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', flex: 1, minWidth: 140 }]}
          >
            <Text style={{ color: '#065F46', fontSize: 12, fontWeight: '600' }}>
              + 가상 "완만하고 편안함" 주입
            </Text>
          </TouchableOpacity>
          {onResetFeedback && (
            <TouchableOpacity
              onPress={onResetFeedback}
              style={[styles.simButton, { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB', width: '100%', flex: undefined }]}
            >
              <Text style={{ color: '#4B5563', fontSize: 12, fontWeight: '600' }}>
                ↺ 피드백 초기화 (0회로 리셋)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </CardWrapper>

      {/* 이용 안내 가이드 투어 다시 보기 */}
      {onOpenOnboarding && (
        <CardWrapper variant="flat" style={{ marginBottom: 12 }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onOpenOnboarding}
            style={[styles.simButton, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
          >
            <Text style={{ color: '#166534', fontSize: 13, fontWeight: '700' }}>
              📖 첫 산책 가이드 투어 다시 보기
            </Text>
          </TouchableOpacity>
        </CardWrapper>
      )}

      {/* 로컬 데이터 완전 초기화 */}
      {onResetData && (
        <DataResetCard
          onReset={onResetData}
          onCompleted={() => setResetCount((c) => c + 1)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  simButton: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  backupDesc: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    lineHeight: 16,
    marginTop: 4,
  },
  themeOptions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  themeOption: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
  },
  themeOptionDisabled: { opacity: 0.6 },
  themeSwatch: { width: 12, height: 12, borderRadius: 6 },
  themeOptionText: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.textMuted },
  simStatusBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  simStatusText: {
    fontSize: 11,
    color: TOKENS.colors.textMain,
    fontWeight: '600',
    lineHeight: 16,
  },
});
