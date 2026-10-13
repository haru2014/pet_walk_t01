/**
 * [편안하개 - PetWalk]
 * 완주 코스 커뮤니티 공유 모달 (US-G2, T1-2)
 *
 * - 출발지 및 도착지 200m 공간 절단 및 사생활 보호 뱃지
 * - 코스 제목, 추천 별점, 반려견 체급 칩, 한줄 소개 입력
 * - FastAPI/Supabase POST /api/v1/community/share 연계
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';

export interface ShareCourseModalProps {
  readonly visible: boolean;
  readonly defaultTitle?: string;
  readonly distanceKm: number;
  readonly durationMinutes: number;
  readonly safeSurfaceRatio: number;
  readonly onShare: (title: string, rating: number, comment?: string) => Promise<void> | void;
  readonly onClose: () => void;
  readonly isSubmitting?: boolean;
}

const DOG_SIZE_CHIPS = ['모든 반려견', '소형견 안심', '노령견 추천', '대형견 환영'] as const;

export const ShareCourseModal: React.FC<ShareCourseModalProps> = ({
  visible,
  defaultTitle = '성산근린공원 폭신한 둘레길',
  distanceKm,
  durationMinutes,
  safeSurfaceRatio,
  onShare,
  onClose,
  isSubmitting = false,
}) => {
  const [title, setTitle] = useState(defaultTitle);
  const [rating, setRating] = useState<number>(5);
  const [selectedChip, setSelectedChip] = useState<string>('모든 반려견');
  const [comment, setComment] = useState('');

  const handleSubmit = async () => {
    const finalTitle = title.trim() || defaultTitle;
    const finalComment = comment.trim() ? `[${selectedChip}] ${comment.trim()}` : `[${selectedChip}]`;
    await onShare(finalTitle, rating, finalComment);
  };

  const safePercent = Math.round(safeSurfaceRatio * 100);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <AppIcon name="users" size={20} color={TOKENS.colors.primaryDark} />
              <Text style={styles.headerTitle}>이웃과 안심 코스 공유</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.privacyBadge}>
            <AppIcon name="shield" size={18} color={TOKENS.colors.primaryDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyTitle}>자택 위치 200m 자동 보호</Text>
              <Text style={styles.privacyDesc}>출발·도착지 200m는 최근접 교차로로 자동 절단되어 집 위치가 노출되지 않아요.</Text>
            </View>
          </View>

          <View style={styles.courseSummaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>거리</Text>
              <Text style={styles.summaryVal}>{distanceKm.toFixed(2)}km</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>시간</Text>
              <Text style={styles.summaryVal}>{durationMinutes}분</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>완만 노면</Text>
              <Text style={[styles.summaryVal, { color: TOKENS.colors.primaryDark }]}>{safePercent}%</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>코스 이름</Text>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder="예: 성산근린공원 폭신한 숲길 루프"
              placeholderTextColor={TOKENS.colors.textMuted}
              maxLength={40}
            />
          </View>

          <View style={styles.ratingRow}>
            <Text style={styles.inputLabel}>이 코스 추천도</Text>
            <View style={styles.starsWrap}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                  <AppIcon name="star" size={24} color={star <= rating ? TOKENS.colors.primary : TOKENS.colors.border} filled={star <= rating} />
                </TouchableOpacity>
              ))}
              <Text style={styles.ratingValueText}>{rating}.0점</Text>
            </View>
          </View>

          <View style={styles.chipsSection}>
            <Text style={styles.inputLabel}>추천 대상</Text>
            <View style={styles.chipsWrap}>
              {DOG_SIZE_CHIPS.map((chip) => (
                <TouchableOpacity
                  key={chip}
                  onPress={() => setSelectedChip(chip)}
                  style={[styles.chip, selectedChip === chip && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selectedChip === chip && styles.chipTextActive]}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>이웃을 위한 산책 팁 (선택)</Text>
            <TextInput
              style={[styles.textInput, { height: 42 }]}
              value={comment}
              onChangeText={setComment}
              placeholder="예: 흙길이 부드럽고 계단이 없어 관절이 편안해요."
              placeholderTextColor={TOKENS.colors.textMuted}
              maxLength={100}
            />
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isSubmitting}>
              <Text style={styles.cancelBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>이웃에게 코스 공유하기</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: TOKENS.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28, gap: 11 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: TOKENS.colors.textMain },
  closeBtn: { fontSize: 18, color: TOKENS.colors.textMuted, fontWeight: '600' },
  privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: TOKENS.colors.primaryWash, borderWidth: 1, borderColor: TOKENS.colors.primaryMint, borderRadius: 14, padding: 12 },
  privacyTitle: { fontSize: 12, fontWeight: '700', color: TOKENS.colors.primaryDark, marginBottom: 2 },
  privacyDesc: { fontSize: 11, color: TOKENS.colors.textMuted, lineHeight: 15 },
  courseSummaryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: TOKENS.colors.background, borderRadius: 12, paddingVertical: 10 },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: TOKENS.colors.textMuted, fontWeight: '600', marginBottom: 2 },
  summaryVal: { fontSize: 15, fontWeight: '800', color: TOKENS.colors.textMain },
  summaryDivider: { width: 1, height: 22, backgroundColor: TOKENS.colors.border },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: TOKENS.colors.textMain },
  textInput: { borderWidth: 1, borderColor: TOKENS.colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: TOKENS.colors.textMain, backgroundColor: '#FFFFFF' },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  starsWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingValueText: { fontSize: 13, fontWeight: '800', color: TOKENS.colors.primaryDark, marginLeft: 4 },
  chipsSection: { gap: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: TOKENS.colors.background, borderWidth: 1, borderColor: TOKENS.colors.border },
  chipActive: { backgroundColor: TOKENS.colors.primaryLight, borderColor: TOKENS.colors.primary },
  chipText: { fontSize: 11, color: TOKENS.colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: TOKENS.colors.primaryDark, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: TOKENS.colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: TOKENS.colors.background },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMuted },
  submitBtn: { flex: 2, height: 48, borderRadius: 14, backgroundColor: TOKENS.colors.primary, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
});
