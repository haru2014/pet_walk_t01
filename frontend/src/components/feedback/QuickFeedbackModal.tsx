/**
 * [편안하개 - PetWalk]
 * 3초 원터치 산책 체감 피드백 모달 (Screen-05, US-E2, Phase 5)
 *
 * 5점 만족도 평가, [📐 경사도 체감 3단계 평가], 웰니스 태그 칩, 한 줄 메모
 */

import React, { useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../common/AppText';
import { TOKENS, TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import { WalkFeedback, SlopeFeedbackLevel } from '../../types/storage';
import { AppIcon, AppIconName } from '../common/AppIcon';

export interface QuickFeedbackModalProps {
  readonly visible: boolean;
  readonly dogName: string;
  readonly onSubmit: (feedback: WalkFeedback) => void;
  readonly onClose: () => void;
}

interface SlopeOption {
  readonly key: SlopeFeedbackLevel;
  readonly icon: AppIconName;
  readonly title: string;
  readonly desc: string;
}

const SLOPE_OPTIONS: readonly SlopeOption[] = [
  { key: 'gentle', icon: 'soft', title: '완만/평지', desc: '관절에 편안해요' },
  { key: 'moderate', icon: 'shade', title: '적당함', desc: '무난한 오르내림' },
  { key: 'steep', icon: 'mountain', title: '가파름', desc: '다음 코스 경사 완화' },
];

const FEEDBACK_TAGS: readonly { icon: AppIconName; label: string }[] = [
  { icon: 'shade', label: '그늘 많아요' },
  { icon: 'soft', label: '폭신한 흙/잔디' },
  { icon: 'stairs', label: '계단 적어요' },
  { icon: 'sun', label: '땡볕 구간 있음' },
  { icon: 'water', label: '음용수대 있음' },
];

export const QuickFeedbackModal: React.FC<QuickFeedbackModalProps> = ({
  visible,
  dogName,
  onSubmit,
  onClose,
}) => {
  const [comfortScore, setComfortScore] = useState<number>(5);
  const [slopeRating, setSlopeRating] = useState<SlopeFeedbackLevel>('gentle');
  const [selectedTags, setSelectedTags] = useState<string[]>(['폭신한 흙/잔디']);
  const [comment, setComment] = useState('');

  const toggleTag = (tag: string) => {
    const rawTag = tag.replace(/^[^\s]+\s*/, '');
    setSelectedTags((prev) =>
      prev.includes(rawTag) ? prev.filter((t) => t !== rawTag) : [...prev, rawTag],
    );
  };

  const handleSubmit = () => {
    onSubmit({
      comfortScore,
      slopeRating,
      tags: selectedTags,
      comment: comment.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* 헤더 */}
          <View style={styles.header}>
            <View style={styles.titleRow}><AppIcon name="paw" size={18} color={TOKENS.colors.primary} /><Text style={styles.title}>산책 체감 피드백</Text></View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            {dogName}와의 오늘 산책은 어떠셨나요? 남겨 주신 의견을 다음 코스에 반영할게요.
          </Text>

          {/* 1. 보행 종합 만족도 */}
          <Text style={styles.sectionLabel}>보행 종합 만족도</Text>
          <View style={styles.scoreRow}>
            {[1, 2, 3, 4, 5].map((score) => {
              const isSelected = comfortScore === score;
              return (
                <TouchableOpacity
                  key={score}
                  activeOpacity={0.8}
                  onPress={() => setComfortScore(score)}
                  style={[styles.scoreBtn, isSelected && styles.scoreBtnSelected]}
                >
                  <Text style={[styles.scoreText, isSelected && styles.scoreTextSelected]}>
                    {score}점
                  </Text>
                  <AppIcon name="star" size={19} color={isSelected ? TOKENS.colors.primary : TOKENS.colors.textMuted} filled={isSelected} />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 2. 📐 경사도 체감 세분화 평가 (복원) */}
          <Text style={[styles.sectionLabel, { marginTop: 14 }]}>
            📐 오르막과 내리막은 어땠나요?
          </Text>
          <View style={styles.slopeRow}>
            {SLOPE_OPTIONS.map((opt) => {
              const isSelected = slopeRating === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  activeOpacity={0.8}
                  onPress={() => setSlopeRating(opt.key)}
                  style={[styles.slopeBtn, isSelected && styles.slopeBtnSelected]}
                >
                  <View style={styles.slopeIconWrap}><AppIcon name={opt.icon} size={22} color={isSelected ? TOKENS.colors.primaryDark : TOKENS.colors.textMuted} /></View>
                  <Text style={[styles.slopeTitle, isSelected && styles.slopeTitleSelected]}>
                    {opt.title}
                  </Text>
                  <Text style={[styles.slopeDesc, isSelected && styles.slopeDescSelected]}>
                    {opt.desc}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 3. 웰니스 체감 태그 */}
          <Text style={[styles.sectionLabel, { marginTop: 14 }]}>길과 주변 환경은 어땠나요?</Text>
          <View style={styles.tagWrap}>
            {FEEDBACK_TAGS.map((tag) => {
              const rawTag = tag.label;
              const isSelected = selectedTags.includes(rawTag);
              return (
                <TouchableOpacity
                  key={tag.label}
                  activeOpacity={0.8}
                  onPress={() => toggleTag(tag.label)}
                  style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                >
                  <View style={styles.tagChipContent}>
                    <AppIcon name={tag.icon} size={15} color={isSelected ? TOKENS.colors.primaryDark : TOKENS.colors.textMuted} />
                    <Text style={[styles.tagChipText, isSelected && styles.tagChipTextSelected]}>{tag.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 4. 한 줄 메모 */}
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>한 줄 메모 (선택)</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="예: 흙길 구간이 넓고 경사가 완만해 좋았어요"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />

          <TouchableOpacity activeOpacity={0.85} onPress={handleSubmit} style={styles.submitBtn}>
            <Text style={styles.submitBtnText}>의견 저장하기 ✓</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  container: { backgroundColor: TOKENS.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '800', color: TOKENS.colors.textMain },
  closeBtn: { padding: 4 },
  closeIcon: { fontSize: 18, color: TOKENS.colors.textMuted },
  subtitle: { fontSize: TYPOGRAPHY.support, color: TOKENS.colors.textMuted, lineHeight: TYPOGRAPHY_LINE_HEIGHT.support, marginBottom: 12 },
  sectionLabel: { fontSize: TYPOGRAPHY.label, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 6 },
  scoreRow: { flexDirection: 'row', gap: 6 },
  scoreBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: TOKENS.colors.border, alignItems: 'center', backgroundColor: TOKENS.colors.background },
  scoreBtnSelected: { borderColor: TOKENS.colors.primary, backgroundColor: TOKENS.colors.primaryLight },
  scoreText: { fontSize: TYPOGRAPHY.caption, fontWeight: '700', color: TOKENS.colors.textMuted, marginBottom: 2 },
  scoreTextSelected: { color: TOKENS.colors.primaryDark },
  slopeRow: { flexDirection: 'row', gap: 6 },
  slopeBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1.5, borderColor: TOKENS.colors.border, alignItems: 'center', backgroundColor: TOKENS.colors.background },
  slopeBtnSelected: { borderColor: TOKENS.colors.primary, backgroundColor: TOKENS.colors.primaryLight },
  slopeIconWrap: { marginBottom: 2 },
  slopeTitle: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 2 },
  slopeTitleSelected: { color: TOKENS.colors.primaryDark },
  slopeDesc: { fontSize: TYPOGRAPHY.support, color: TOKENS.colors.textMuted, textAlign: 'center' },
  slopeDescSelected: { color: TOKENS.colors.primaryDark, fontWeight: '600' },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1.2, borderColor: TOKENS.colors.border, backgroundColor: TOKENS.colors.surface },
  tagChipContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tagChipSelected: { borderColor: TOKENS.colors.primary, backgroundColor: TOKENS.colors.primaryLight },
  tagChipText: { fontSize: TYPOGRAPHY.label, fontWeight: '600', color: TOKENS.colors.textMuted },
  tagChipTextSelected: { color: TOKENS.colors.primaryDark, fontWeight: '700' },
  input: { backgroundColor: TOKENS.colors.background, borderWidth: 1, borderColor: TOKENS.colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: TYPOGRAPHY.label, color: TOKENS.colors.textMain, marginBottom: 14 },
  submitBtn: { backgroundColor: TOKENS.colors.primary, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#FFFFFF', fontSize: TYPOGRAPHY.button, fontWeight: '700' },
});
