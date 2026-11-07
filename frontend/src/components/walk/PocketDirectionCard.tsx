/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 상단 방향 안내 카드
 *
 * - navigate: 방향 타일 + 남은 거리 + 안내, 구간 진행 바, "그다음" 미리보기
 * - offRoute: 경로 이탈 안내 + 경로 재생성/합류 액션
 * - message: 자유 산책 안전 정보, GPS 대기 등 단일 메시지
 * 회전 지점 30m 이내에서는 타일이 채워지고 테두리가 강조된다.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { AppIcon, AppIconName } from '../common/AppIcon';
import {
  formatManeuverDistance,
  MANEUVER_IMMINENT_DISTANCE_M,
  ManeuverDirection,
  ManeuverStep,
  PocketManeuver,
} from '../../services/pocketManeuver';
import { POCKET_COLORS, POCKET_TOUCH_TARGET, withAlpha } from '../pocket/pocketTheme';

const DIRECTION_ICONS: Record<ManeuverDirection, AppIconName> = {
  straight: 'turnStraight',
  slightLeft: 'turnSlightLeft',
  left: 'turnLeft',
  slightRight: 'turnSlightRight',
  right: 'turnRight',
  uturn: 'turnUturn',
  arrive: 'flag',
};

const SURFACE = POCKET_COLORS.surface;
const HAIRLINE = POCKET_COLORS.hairline;
const TEXT_PRIMARY = POCKET_COLORS.textPrimary;
const TEXT_SECONDARY = POCKET_COLORS.textSecondary;
const TEXT_MUTED = POCKET_COLORS.textMuted;
const WARN = POCKET_COLORS.warn;

type MessageTone = 'normal' | 'warning' | 'danger';
const TONE_COLORS: Record<Exclude<MessageTone, 'normal'>, string> = {
  warning: POCKET_COLORS.warn,
  danger: POCKET_COLORS.danger,
};

export type PocketDirectionCardProps =
  | {
    readonly variant: 'navigate';
    readonly maneuver: PocketManeuver;
    readonly accent: string;
    readonly compact?: boolean;
  }
  | {
    readonly variant: 'offRoute';
    readonly accent: string;
    readonly actionLabel?: string;
    readonly onAction?: () => void;
    readonly compact?: boolean;
  }
  | {
    readonly variant: 'message';
    readonly accent: string;
    readonly icon: AppIconName;
    readonly title: string;
    readonly message: string;
    readonly tone?: MessageTone;
    readonly compact?: boolean;
  };

const DirectionTile: React.FC<{
  icon: AppIconName;
  color: string;
  filled: boolean;
  compact?: boolean;
  onFilledColor?: string;
}> = ({ icon, color, filled, compact, onFilledColor = POCKET_COLORS.onAccent }) => (
  <View
    style={[
      styles.tile,
      compact && styles.tileCompact,
      { backgroundColor: filled ? color : withAlpha(color, 0.14) },
    ]}
  >
    <AppIcon name={icon} size={compact ? 30 : 36} color={filled ? onFilledColor : color} strokeWidth={2.6} />
  </View>
);

const FollowingRow: React.FC<{ step: ManeuverStep }> = ({ step }) => {
  const distance = formatManeuverDistance(step.distanceM);
  return (
    <View style={styles.followingRow}>
      <AppIcon name={DIRECTION_ICONS[step.direction]} size={15} color={TEXT_SECONDARY} strokeWidth={2.2} />
      <Text style={styles.followingLabel}>그다음</Text>
      <Text style={styles.followingText} numberOfLines={1}>{distance.value}{distance.unit} 후 {step.title}</Text>
    </View>
  );
};

const NavigateCard: React.FC<{ maneuver: PocketManeuver; accent: string; compact?: boolean }> = ({ maneuver, accent, compact }) => {
  const { current, following, progressRatio } = maneuver;
  const isImminent = current.distanceM <= MANEUVER_IMMINENT_DISTANCE_M;
  const distance = formatManeuverDistance(current.distanceM);
  const unitLabel = distance.unit === 'km' ? '킬로미터' : '미터';
  return (
    <View
      style={[styles.card, compact && styles.cardCompact, isImminent && { borderColor: withAlpha(accent, 0.55) }]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${distance.value}${unitLabel} 후 ${current.title}. ${current.detail}`}
    >
      <View style={styles.mainRow}>
        <DirectionTile icon={DIRECTION_ICONS[current.direction]} color={accent} filled={isImminent} compact={compact} />
        <View style={styles.textColumn}>
          <View style={styles.distanceRow}>
            <Text style={[styles.distanceValue, compact && styles.distanceValueCompact, isImminent && { color: accent }]}>{distance.value}</Text>
            <Text style={styles.distanceUnit}>{distance.unit}</Text>
            <Text style={styles.maneuverTitle} numberOfLines={1}>{current.title}</Text>
          </View>
          {current.detail ? <Text style={styles.detailText} numberOfLines={1}>{current.detail}</Text> : null}
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progressRatio * 100)}%`, backgroundColor: accent }]} />
      </View>
      {following ? <FollowingRow step={following} /> : null}
    </View>
  );
};

type OffRouteProps = Extract<PocketDirectionCardProps, { variant: 'offRoute' }>;
type MessageProps = Extract<PocketDirectionCardProps, { variant: 'message' }>;

const OffRouteCard: React.FC<OffRouteProps> = ({ compact, actionLabel, onAction }) => (
  <View style={[styles.card, compact && styles.cardCompact, { borderColor: withAlpha(WARN, 0.45) }]} accessibilityRole="alert">
    <View style={styles.mainRow}>
      <DirectionTile icon="refresh" color={WARN} filled={false} compact={compact} />
      <View style={styles.textColumn}>
        <Text style={styles.messageTitle}>경로를 벗어났어요</Text>
        <Text style={styles.detailText} numberOfLines={2}>지도의 경로로 돌아오면 안내를 이어갈게요</Text>
      </View>
    </View>
    {onAction ? (
      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.8}
        onPress={onAction}
        style={[styles.inlineAction, { backgroundColor: withAlpha(WARN, 0.16) }]}
      >
        <AppIcon name="refresh" size={16} color={WARN} strokeWidth={2.2} />
        <Text style={[styles.inlineActionText, { color: WARN }]}>{actionLabel ?? '경로 다시 만들기'}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

const MessageCard: React.FC<MessageProps> = ({ compact, accent, icon, title, message, tone }) => {
  const isAlertTone = tone === 'warning' || tone === 'danger';
  const toneColor = isAlertTone ? TONE_COLORS[tone] : accent;
  return (
    <View
      style={[styles.card, compact && styles.cardCompact, isAlertTone ? { borderColor: withAlpha(toneColor, 0.45) } : null]}
      accessibilityRole={isAlertTone ? 'alert' : 'summary'}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.mainRow}>
        <DirectionTile icon={icon} color={toneColor} filled={false} compact={compact} />
        <View style={styles.textColumn}>
          <Text style={styles.messageTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.detailText} numberOfLines={2}>{message}</Text>
        </View>
      </View>
    </View>
  );
};

export const PocketDirectionCard: React.FC<PocketDirectionCardProps> = (props) => {
  if (props.variant === 'navigate') {
    return <NavigateCard maneuver={props.maneuver} accent={props.accent} compact={props.compact} />;
  }
  if (props.variant === 'offRoute') return <OffRouteCard {...props} />;
  return <MessageCard {...props} />;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: HAIRLINE,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  cardCompact: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, borderRadius: 22 },
  mainRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tile: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tileCompact: { width: 54, height: 54, borderRadius: 17 },
  textColumn: { flex: 1, minWidth: 0 },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline' },
  distanceValue: {
    color: TEXT_PRIMARY,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  distanceValueCompact: { fontSize: 32, lineHeight: 36 },
  distanceUnit: { color: TEXT_SECONDARY, fontSize: 16, fontWeight: '600', marginLeft: 3 },
  maneuverTitle: { flexShrink: 1, color: TEXT_PRIMARY, fontSize: 19, fontWeight: '700', marginLeft: 10 },
  detailText: { color: TEXT_SECONDARY, fontSize: 13, lineHeight: 18, marginTop: 2 },
  messageTitle: { color: TEXT_PRIMARY, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  followingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  followingLabel: { color: TEXT_MUTED, fontSize: 12, fontWeight: '600' },
  followingText: { flexShrink: 1, color: TEXT_SECONDARY, fontSize: 13, fontWeight: '600' },
  inlineAction: {
    marginTop: 12,
    minHeight: POCKET_TOUCH_TARGET,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inlineActionText: { fontSize: 15, fontWeight: '700' },
});
