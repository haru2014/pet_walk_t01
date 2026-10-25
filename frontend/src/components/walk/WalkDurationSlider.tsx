/**
 * [편안하개 - PetWalk]
 * 산책 시간 15분 단위 세분화 슬라이더 및 자유 산책 모드 컴포넌트 (US-A3, #38)
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, type StyleProp, type ViewStyle } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';
import {
  BREED_DURATION_GUIDES,
  DURATION_OPTIONS_15MIN,
  formatDurationLabel,
} from '../../types/walkSettings';

export interface WalkDurationSliderProps {
  duration: number | null;
  isFreeWalk: boolean;
  onChangeDuration: (minutes: number | null) => void;
  onChangeFreeWalk: (isFree: boolean) => void;
  /** 상위 섹션 헤더가 이미 존재하는 경우 중복 헤더("얼마나 걸을까요?")를 숨김 */
  hideHeader?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const WalkDurationSlider: React.FC<WalkDurationSliderProps> = ({
  duration,
  isFreeWalk,
  onChangeDuration,
  onChangeFreeWalk,
  hideHeader = false,
  style,
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customMinutesText, setCustomMinutesText] = useState('');

  const handleSelectDuration = (minutes: number) => {
    onChangeFreeWalk(false);
    onChangeDuration(minutes);
  };

  const handleToggleFreeWalk = () => {
    const nextFree = !isFreeWalk;
    onChangeFreeWalk(nextFree);
    if (nextFree) {
      onChangeDuration(null);
    } else {
      onChangeDuration(duration ?? 30);
    }
  };

  const handleApplyCustomMinutes = () => {
    const parsed = Number.parseInt(customMinutesText, 10);
    if (!Number.isNaN(parsed) && parsed >= 10 && parsed <= 300) {
      onChangeFreeWalk(false);
      onChangeDuration(parsed);
      setShowCustomInput(false);
      setCustomMinutesText('');
    }
  };

  return (
    <View style={[styles.container, hideHeader && styles.containerCompact, style]}>
      {!hideHeader && (
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>얼마나 걸을까요?</Text>
          <Text style={styles.currentBadge}>
            {formatDurationLabel(duration, isFreeWalk)}
          </Text>
        </View>
      )}

      {/* 자유 산책 모드 토글 카드 */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleToggleFreeWalk}
        style={[styles.freeWalkCard, isFreeWalk && styles.freeWalkCardActive]}
      >
        <View style={styles.freeWalkInfo}>
          <AppIcon name="paw" size={18} color={isFreeWalk ? TOKENS.colors.primaryDark : TOKENS.colors.textMuted} />
          <View>
            <Text style={[styles.freeWalkTitle, isFreeWalk && styles.freeWalkTitleActive]}>
              자유 산책 모드
            </Text>
            <Text style={styles.freeWalkDesc}>
              시간 제한 없이 편안하게 걷고 목표 초과 시에도 계속 기록해요
            </Text>
          </View>
        </View>
        <View style={[styles.radioCircle, isFreeWalk && styles.radioCircleActive]}>
          {isFreeWalk && <View style={styles.radioDot} />}
        </View>
      </TouchableOpacity>

      {/* 체급별 권장 퀵 프리셋 칩 */}
      {!isFreeWalk && (
        <>
          <Text style={styles.subGuideTitle}>💡 체급별 맞춤 권장 시간</Text>
          <View style={styles.presetRow}>
            {BREED_DURATION_GUIDES.map((guide) => {
              const isSelected = duration === guide.recommendedMinutes;
              return (
                <TouchableOpacity
                  key={guide.id}
                  activeOpacity={0.8}
                  onPress={() => handleSelectDuration(guide.recommendedMinutes)}
                  style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                >
                  <Text style={[styles.presetChipText, isSelected && styles.presetChipTextSelected]}>
                    {guide.label} ({guide.recommendedMinutes}분)
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 15분 단위 세분화 칩 그리드 */}
          <View style={styles.durationGrid}>
            {DURATION_OPTIONS_15MIN.map((mins) => {
              const isSelected = duration === mins;
              const label = formatDurationLabel(mins);
              return (
                <TouchableOpacity
                  key={mins}
                  activeOpacity={0.8}
                  onPress={() => handleSelectDuration(mins)}
                  style={[styles.durationChip, isSelected && styles.durationChipSelected]}
                >
                  <Text style={[styles.durationChipText, isSelected && styles.durationChipTextSelected]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 직접 분 입력 버튼 및 인라인 입력창 */}
          <View style={styles.customInputSection}>
            {!showCustomInput ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowCustomInput(true)}
                style={styles.customTriggerButton}
              >
                <AppIcon name="clock" size={16} color={TOKENS.colors.primaryDark} />
                <Text style={styles.customTriggerText}>+ 원하는 시간 직접 입력 (분 단위)</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.customInputRow}>
                <TextInput
                  value={customMinutesText}
                  onChangeText={setCustomMinutesText}
                  placeholder="예: 70"
                  keyboardType="numeric"
                  maxLength={3}
                  style={styles.customTextInput}
                />
                <Text style={styles.customUnitText}>분</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleApplyCustomMinutes}
                  style={styles.customApplyButton}
                >
                  <Text style={styles.customApplyText}>적용</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowCustomInput(false)}
                  style={styles.customCancelButton}
                >
                  <Text style={styles.customCancelText}>취소</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 24 },
  containerCompact: { marginBottom: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: TOKENS.colors.textMain },
  currentBadge: { fontSize: 13, fontWeight: '700', color: TOKENS.colors.primaryDark, backgroundColor: TOKENS.colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  freeWalkCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: TOKENS.colors.surface, borderWidth: 1.5, borderColor: TOKENS.colors.border, borderRadius: 12, padding: 12, marginBottom: 14 },
  freeWalkCardActive: { borderColor: TOKENS.colors.primaryDark, backgroundColor: TOKENS.colors.primaryLight },
  freeWalkInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  freeWalkTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain },
  freeWalkTitleActive: { color: TOKENS.colors.primaryDark },
  freeWalkDesc: { fontSize: 11, color: TOKENS.colors.textMuted, marginTop: 2 },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: TOKENS.colors.border, alignItems: 'center', justifyContent: 'center' },
  radioCircleActive: { borderColor: TOKENS.colors.primaryDark },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: TOKENS.colors.primaryDark },
  subGuideTitle: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.textMuted, marginBottom: 8 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  presetChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: TOKENS.colors.surface, borderWidth: 1, borderColor: TOKENS.colors.border },
  presetChipSelected: { borderColor: TOKENS.colors.primaryDark, backgroundColor: TOKENS.colors.primaryLight },
  presetChipText: { fontSize: 11, color: TOKENS.colors.textMuted },
  presetChipTextSelected: { color: TOKENS.colors.primaryDark, fontWeight: '700' },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  durationChip: { minWidth: 68, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: TOKENS.colors.surface, borderWidth: 1, borderColor: TOKENS.colors.border, alignItems: 'center', justifyContent: 'center' },
  durationChipSelected: { borderColor: TOKENS.colors.primaryDark, backgroundColor: TOKENS.colors.primaryLight },
  durationChipText: { fontSize: 13, fontWeight: '600', color: TOKENS.colors.textMuted },
  durationChipTextSelected: { color: TOKENS.colors.primaryDark, fontWeight: '800' },
  customInputSection: { marginTop: 4 },
  customTriggerButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  customTriggerText: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.primaryDark },
  customInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: TOKENS.colors.surface, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: TOKENS.colors.border },
  customTextInput: { width: 60, height: 36, borderWidth: 1, borderColor: TOKENS.colors.primaryDark, borderRadius: 6, textAlign: 'center', fontSize: 14, fontWeight: '700', backgroundColor: TOKENS.colors.background },
  customUnitText: { fontSize: 14, color: TOKENS.colors.textMain, fontWeight: '600' },
  customApplyButton: { backgroundColor: TOKENS.colors.primaryDark, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  customApplyText: { color: TOKENS.colors.textWhite, fontSize: 12, fontWeight: '700' },
  customCancelButton: { paddingHorizontal: 8, paddingVertical: 8 },
  customCancelText: { color: TOKENS.colors.textMuted, fontSize: 12 },
});
