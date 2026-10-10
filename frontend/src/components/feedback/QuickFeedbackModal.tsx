/**
 * [편안하개 - PetWalk]
 * 3초 원터치 산책 체감 피드백 모달 (Screen-05, US-E2, Phase 5)
 *
 * 5점 만족도 평가, 원터치 웰니스 칩 선택, 한 줄 메모 입력
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { WalkFeedback } from '../../types/storage';

export interface QuickFeedbackModalProps {
  visible: boolean;
  dogName: string;
  onSubmit: (feedback: WalkFeedback) => void;
  onClose: () => void;
}

const FEEDBACK_TAGS = [
  '👍 완만해요',
  '🌳 그늘 많아요',
  '🐾 발이 편해요',
  '⛰️ 경사가 가팔랐어요',
  '🚶 계단이 적었어요',
];

function getScoreEmoji(score: number): string {
  if (score >= 5) return '🥰';
  if (score >= 4) return '😊';
  if (score >= 3) return '😐';
  return '😥';
}

export const QuickFeedbackModal: React.FC<QuickFeedbackModalProps> = ({
  visible,
  dogName,
  onSubmit,
  onClose,
}) => {
  const [comfortScore, setComfortScore] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>(['완만해요', '발이 편해요']);
  const [comment, setComment] = useState('');

  const toggleTag = (tag: string) => {
    const rawTag = tag.replace(/^[^\s]+\s*/, '');
    setSelectedTags((prev) =>
      prev.includes(rawTag) ? prev.filter((t) => t !== rawTag) : [...prev, rawTag]
    );
  };

  const handleSubmit = () => {
    onSubmit({
      comfortScore,
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
            <Text style={styles.title}>3초 빠른 피드백 🐾</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            {dogName}와의 오늘 산책은 어떠셨나요? 다음 산책 AI 코스에 자동 반영돼요.
          </Text>

          {/* 5점 만족도 점수 */}
          <Text style={styles.sectionLabel}>보행 만족도</Text>
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
                  <Text style={styles.scoreEmoji}>{getScoreEmoji(score)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>


          {/* 원터치 태그 칩 */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>체감 특징 (여러 개 선택 가능)</Text>
          <View style={styles.tagWrap}>
            {FEEDBACK_TAGS.map((tag) => {
              const rawTag = tag.replace(/^[^\s]+\s*/, '');
              const isSelected = selectedTags.includes(rawTag);
              return (
                <TouchableOpacity
                  key={tag}
                  activeOpacity={0.8}
                  onPress={() => toggleTag(tag)}
                  style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                >
                  <Text style={[styles.tagChipText, isSelected && styles.tagChipTextSelected]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 한 줄 메모 */}
          <Text style={[styles.sectionLabel, { marginTop: 14 }]}>한 줄 메모 (선택)</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="예: 흙길 구간이 넓고 조용해서 좋았어요"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />

          <TouchableOpacity activeOpacity={0.85} onPress={handleSubmit} style={styles.submitBtn}>
            <Text style={styles.submitBtnText}>피드백 완료 ✓</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  container: { backgroundColor: TOKENS.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', color: TOKENS.colors.textMain },
  closeBtn: { padding: 4 },
  closeIcon: { fontSize: 18, color: TOKENS.colors.textMuted },
  subtitle: { fontSize: 13, color: TOKENS.colors.textMuted, lineHeight: 18, marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 8 },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: TOKENS.colors.border, alignItems: 'center', backgroundColor: TOKENS.colors.background },
  scoreBtnSelected: { borderColor: TOKENS.colors.primary, backgroundColor: '#F0FDF4' },
  scoreText: { fontSize: 12, fontWeight: '700', color: TOKENS.colors.textMuted, marginBottom: 2 },
  scoreTextSelected: { color: TOKENS.colors.primaryDark },
  scoreEmoji: { fontSize: 16 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1.5, borderColor: TOKENS.colors.border, backgroundColor: TOKENS.colors.surface },
  tagChipSelected: { borderColor: TOKENS.colors.primary, backgroundColor: TOKENS.colors.primaryLight },
  tagChipText: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.textMuted },
  tagChipTextSelected: { color: TOKENS.colors.primaryDark, fontWeight: '700' },
  input: { backgroundColor: TOKENS.colors.background, borderWidth: 1, borderColor: TOKENS.colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: TOKENS.colors.textMain, marginBottom: 16 },
  submitBtn: { backgroundColor: TOKENS.colors.primary, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

