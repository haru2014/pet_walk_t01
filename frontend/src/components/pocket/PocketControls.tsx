/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 지도 위 보조 요소: 상태 칩, 우측 보조 버튼, 토스트
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { AppIcon, AppIconName } from '../common/AppIcon';
import { TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import { BarkMuteState } from '../../types/voiceSettings';
import { POCKET_COLORS, POCKET_TOUCH_TARGET } from './pocketTheme';

interface ChipSpec {
  readonly id: string;
  readonly icon: AppIconName;
  readonly label: string;
  readonly color: string;
}

export interface PocketStatusInput {
  readonly isSimulatedLocation: boolean;
  readonly barkState: BarkMuteState;
  readonly voiceMuted: boolean;
  readonly voiceCaption: string | null;
}

/** 표시할 상태 칩 목록. 웹 데모 가상 위치는 항상 고지한다 (GEMINI.md 원칙 8). */
function buildChips({ isSimulatedLocation, barkState, voiceMuted, voiceCaption }: PocketStatusInput): ChipSpec[] {
  const chips: ChipSpec[] = [];
  if (isSimulatedLocation) chips.push({ id: 'sim', icon: 'globe', label: '웹 데모 · 가상 위치', color: POCKET_COLORS.warn });
  if (barkState.isAutoMuted) {
    const seconds = barkState.cooldownRemainingSec.toFixed(0);
    chips.push({ id: 'bark', icon: 'volumeMute', label: `짖음 감지 · 안내 일시 차단 ${seconds}초`, color: POCKET_COLORS.danger });
  } else if (voiceMuted) {
    chips.push({ id: 'mute', icon: 'volumeMute', label: '음성 안내 꺼짐', color: POCKET_COLORS.warn });
  }
  if (voiceCaption) chips.push({ id: 'caption', icon: 'volume', label: voiceCaption, color: POCKET_COLORS.textSecondary });
  return chips;
}

export const PocketStatusChips: React.FC<PocketStatusInput> = (props) => {
  const chips = buildChips(props);
  if (chips.length === 0) return null;
  return (
    <View style={styles.chipRow} pointerEvents="none">
      {chips.map((chip) => (
        <View key={chip.id} style={styles.chip}>
          <AppIcon name={chip.icon} size={13} color={chip.color} strokeWidth={2.2} />
          <Text style={[styles.chipText, { color: chip.color }]} numberOfLines={1}>{chip.label}</Text>
        </View>
      ))}
    </View>
  );
};

const FloatingButton: React.FC<{
  icon: AppIconName;
  label: string;
  color?: string;
  highlighted?: boolean;
  onPress: () => void;
}> = ({ icon, label, color = '#D5DAD6', highlighted, onPress }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={label}
    activeOpacity={0.75}
    onPress={onPress}
    style={[styles.fab, highlighted && { borderColor: color }]}
  >
    <AppIcon name={icon} size={20} color={color} strokeWidth={2.1} />
  </TouchableOpacity>
);

export interface PocketFloatingActionsProps {
  readonly bottom: number;
  readonly voiceMuted: boolean;
  readonly onToggleVoice: () => void;
  readonly onReportHazard: () => void;
  /** 경로 재생성 버튼 (경로 이탈 중에는 방향 카드가 대신 보여주므로 생략) */
  readonly regenerate?: { readonly label: string; readonly onPress: () => void };
  readonly onExpandMap: () => void;
}

export const PocketFloatingActions: React.FC<PocketFloatingActionsProps> = ({
  bottom, voiceMuted, onToggleVoice, onReportHazard, regenerate, onExpandMap,
}) => (
  <View style={[styles.fabColumn, { bottom }]} pointerEvents="box-none">
    <FloatingButton
      icon={voiceMuted ? 'volumeMute' : 'volume'}
      label={voiceMuted ? '음성 안내 다시 켜기' : '음성 안내 즉시 음소거'}
      color={voiceMuted ? POCKET_COLORS.warn : undefined}
      highlighted={voiceMuted}
      onPress={onToggleVoice}
    />
    <FloatingButton icon="alert" label="현장 위험 제보 및 안전 우회" color={POCKET_COLORS.warn} onPress={onReportHazard} />
    {regenerate ? <FloatingButton icon="refresh" label={regenerate.label} onPress={regenerate.onPress} /> : null}
    <FloatingButton icon="expand" label="산책 지도 크게 보기" onPress={onExpandMap} />
  </View>
);

export const PocketToast: React.FC<{ message: string | null; bottom: number; accent: string }> = ({ message, bottom, accent }) => {
  if (!message) return null;
  return (
    <View style={[styles.toast, { bottom }]} pointerEvents="none" accessibilityLiveRegion="polite">
      <AppIcon name="paw" size={14} color={accent} />
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 2 },
  chip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: POCKET_COLORS.overlay,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { flexShrink: 1, fontSize: TYPOGRAPHY.caption, fontWeight: '600' },
  fabColumn: { position: 'absolute', right: 12, gap: 10 },
  fab: {
    width: POCKET_TOUCH_TARGET,
    height: POCKET_TOUCH_TARGET,
    borderRadius: POCKET_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: POCKET_COLORS.overlay,
    borderWidth: 1,
    borderColor: POCKET_COLORS.hairline,
  },
  toast: {
    position: 'absolute',
    left: 24,
    right: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: POCKET_COLORS.overlay,
    borderWidth: 1,
    borderColor: POCKET_COLORS.hairline,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  toastText: {
    flexShrink: 1,
    color: POCKET_COLORS.textPrimary,
    fontSize: TYPOGRAPHY.caption,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.caption,
    fontWeight: '600',
  },
});
