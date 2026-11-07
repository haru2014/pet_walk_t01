/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 하단 시트 (Thumb Zone)
 * 접힌 상태: 경과 시간·거리·속도, 원터치 배변/소변 마킹(US-18), 산책 종료
 * 펼친 상태: 목표 안내, 배변 기록 수, 스마트 짖음 감지, 출발지로 돌아가기
 */

import React from 'react';
import { LayoutChangeEvent, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { AppIcon, AppIconName } from '../common/AppIcon';
import { WalkStats } from '../../hooks/useWalkGuidance';
import { formatElapsed } from '../../services/walkFormat';
import { WalkGoalState } from '../../services/pocketScreenModel';
import { TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import { POCKET_COLORS, POCKET_TOUCH_TARGET } from './pocketTheme';

const C = POCKET_COLORS;

export interface PocketBottomSheetProps {
  readonly dogName: string;
  readonly accent: string;
  readonly compact: boolean;
  readonly stats: WalkStats;
  readonly goal: WalkGoalState;
  readonly poopCount: number;
  readonly expanded: boolean;
  readonly smartBarkEnabled: boolean;
  readonly onToggleExpanded: () => void;
  readonly onMark: (type: 'poop' | 'pee') => void;
  readonly onFinish: () => void;
  readonly onToggleSmartBark: () => void;
  readonly onSimulateBark?: () => void;
  readonly onReturnToStart: () => void;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}

const StatCell: React.FC<{ label: string; value: string; unit?: string; valueColor?: string; labelColor?: string; compact: boolean }> = ({
  label, value, unit, valueColor = C.textPrimary, labelColor = C.textMuted, compact,
}) => (
  <View style={styles.statCell}>
    <Text style={[styles.statValue, compact && styles.statValueCompact, { color: valueColor }]} numberOfLines={1}>
      {value}
      {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
    </Text>
    <Text style={[styles.statLabel, { color: labelColor }]} numberOfLines={1}>{label}</Text>
  </View>
);

const MarkButton: React.FC<{ icon: AppIconName; color: string; label: string; onPress: () => void }> = ({ icon, color, label, onPress }) => (
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label} 마킹`} activeOpacity={0.8} onPress={onPress} style={styles.markButton}>
    <AppIcon name={icon} size={18} color={color} />
    <Text style={styles.markButtonText}>{label}</Text>
  </TouchableOpacity>
);

const SheetHeader: React.FC<{ dogName: string; accent: string; expanded: boolean; onPress: () => void }> = ({ dogName, accent, expanded, onPress }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={expanded ? '산책 메뉴 접기' : '산책 메뉴 펼치기'}
    activeOpacity={0.7}
    onPress={onPress}
    style={styles.sheetHeader}
  >
    <View style={styles.sheetHandle} />
    <View style={styles.sheetTitleRow}>
      <AppIcon name="paw" size={14} color={accent} />
      <Text style={styles.sheetTitle} numberOfLines={1}>{dogName}와 안심 산책 중</Text>
      <View style={{ transform: [{ rotate: expanded ? '90deg' : '-90deg' }] }}>
        <AppIcon name="chevronRight" size={16} color={C.textMuted} />
      </View>
    </View>
  </TouchableOpacity>
);

const ExpandedSection: React.FC<PocketBottomSheetProps> = ({ accent, goal, poopCount, smartBarkEnabled, onToggleSmartBark, onSimulateBark, onReturnToStart }) => (
  <View style={styles.expanded}>
    <Text style={[styles.hintText, goal.isOvertime && { color: C.warn }]}>{goal.hint}</Text>
    <Text style={styles.hintText}>
      {poopCount > 0 ? `배변 기록 ${poopCount}회` : '배변 시 위 버튼을 한 번 탭하면 위치와 함께 기록돼요'}
    </Text>
    <TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: smartBarkEnabled }} activeOpacity={0.75} onPress={onToggleSmartBark} style={styles.settingRow}>
      <View style={styles.settingTextWrap}>
        <Text style={styles.settingTitle}>스마트 짖음 감지</Text>
        <Text style={styles.settingDesc}>짖음·돌발 소음(73dB 이상) 시 안내를 잠시 멈춰요</Text>
      </View>
      <View style={[styles.switchTrack, smartBarkEnabled && { backgroundColor: accent }]}>
        <View style={[styles.switchThumb, smartBarkEnabled && styles.switchThumbOn]} />
      </View>
    </TouchableOpacity>
    {onSimulateBark ? (
      <TouchableOpacity onPress={onSimulateBark} style={styles.devChip}>
        <Text style={styles.devChipText}>개발용 · 짖음 테스트</Text>
      </TouchableOpacity>
    ) : null}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="출발지로 돌아가기" activeOpacity={0.8} onPress={onReturnToStart} style={styles.returnButton}>
      <AppIcon name="shield" size={18} color={C.returnBlue} />
      <Text style={styles.returnButtonText}>출발지로 돌아가기</Text>
    </TouchableOpacity>
  </View>
);

export const PocketBottomSheet: React.FC<PocketBottomSheetProps> = (props) => {
  const { accent, compact, stats, goal, expanded } = props;
  return (
    <View style={[styles.sheet, compact && styles.sheetCompact]} onLayout={props.onLayout}>
      <SheetHeader dogName={props.dogName} accent={accent} expanded={expanded} onPress={props.onToggleExpanded} />
      <View style={styles.statsRow}>
        <StatCell label={goal.elapsedLabel} labelColor={goal.isOvertime ? C.warn : C.textMuted} value={formatElapsed(stats.elapsedSec)} valueColor={accent} compact={compact} />
        <StatCell label="이동 거리" value={stats.distanceKm.toFixed(2)} unit="km" compact={compact} />
        <StatCell label="현재 속도" value={stats.speedKmH.toFixed(1)} unit="km/h" compact={compact} />
      </View>
      <View style={styles.actionRow}>
        <MarkButton icon="paw" color={C.poop} label="대변" onPress={() => props.onMark('poop')} />
        <MarkButton icon="water" color={C.pee} label="소변" onPress={() => props.onMark('pee')} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="산책 종료" activeOpacity={0.8} onPress={props.onFinish} style={styles.stopButton}>
          <AppIcon name="stop" size={20} color={C.danger} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>
      {expanded ? <ExpandedSection {...props} /> : null}
    </View>
  );
};

const ACTION_HEIGHT = 52;

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: C.hairline,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  sheetCompact: { paddingHorizontal: 14, paddingBottom: 14 },
  sheetHeader: { minHeight: POCKET_TOUCH_TARGET, paddingTop: 8, paddingBottom: 10 },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 10 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetTitle: { flex: 1, color: C.textSecondary, fontSize: TYPOGRAPHY.caption, fontWeight: '600' },
  statsRow: { flexDirection: 'row', marginBottom: 14 },
  statCell: { flex: 1, minWidth: 0 },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  statValueCompact: { fontSize: TYPOGRAPHY.metricValue, lineHeight: TYPOGRAPHY_LINE_HEIGHT.metricValue },
  statUnit: { color: C.textMuted, fontSize: TYPOGRAPHY.caption, fontWeight: '600' },
  statLabel: { fontSize: TYPOGRAPHY.micro, lineHeight: TYPOGRAPHY_LINE_HEIGHT.micro, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8 },
  markButton: {
    flex: 1,
    minHeight: ACTION_HEIGHT,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: C.surfaceRaised,
  },
  markButtonText: { color: C.textPrimary, fontSize: TYPOGRAPHY.button, fontWeight: '700' },
  stopButton: { width: ACTION_HEIGHT, minHeight: ACTION_HEIGHT, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.dangerSurface },
  expanded: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.hairline, gap: 10 },
  hintText: { color: C.textSecondary, fontSize: TYPOGRAPHY.caption, lineHeight: TYPOGRAPHY_LINE_HEIGHT.caption },
  settingRow: { minHeight: POCKET_TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  settingTextWrap: { flex: 1 },
  settingTitle: { color: C.textPrimary, fontSize: TYPOGRAPHY.label, fontWeight: '700' },
  settingDesc: { color: C.textMuted, fontSize: TYPOGRAPHY.caption, lineHeight: TYPOGRAPHY_LINE_HEIGHT.caption, marginTop: 1 },
  switchTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#2C332F', padding: 3 },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.textPrimary },
  switchThumbOn: { alignSelf: 'flex-end' },
  devChip: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(245, 181, 68, 0.14)' },
  devChipText: { color: C.warn, fontSize: TYPOGRAPHY.caption, fontWeight: '600' },
  returnButton: {
    minHeight: POCKET_TOUCH_TARGET,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: C.returnSurface,
  },
  returnButtonText: { color: C.returnBlue, fontSize: TYPOGRAPHY.button, fontWeight: '700' },
});
