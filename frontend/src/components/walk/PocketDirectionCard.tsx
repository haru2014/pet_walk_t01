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
  PocketManeuver,
} from '../../services/pocketManeuver';

const DIRECTION_ICONS: Record<ManeuverDirection, AppIconName> = {
  straight: 'turnStraight',
  slightLeft: 'turnSlightLeft',
  left: 'turnLeft',
  slightRight: 'turnSlightRight',
  right: 'turnRight',
  uturn: 'turnUturn',
  arrive: 'flag',
};

const SURFACE = '#0E1311';
const HAIRLINE = 'rgba(255,255,255,0.08)';
const TEXT_PRIMARY = '#F4F5F2';
const TEXT_SECONDARY = '#A3AAA4';
const TEXT_MUTED = '#6F7771';
const WARN = '#F5B544';
const DANGER = '#F38B8B';

/** #RRGGBB → rgba 문자열 */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
    readonly tone?: 'normal' | 'warning' | 'danger';
    readonly compact?: boolean;
  };

const DirectionTile: React.FC<{
  icon: AppIconName;
  color: string;
  filled: boolean;
  compact?: boolean;
  onFilledColor?: string;
}> = ({ icon, color, filled, compact, onFilledColor = '#06110C' }) => (
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

const NavigateCard: React.FC<{ maneuver: PocketManeuver; accent: string; compact?: boolean }> = ({
  maneuver, accent, compact,
}) => {
  const { current, following, progressRatio } = maneuver;
  const isImminent = current.distanceM <= MANEUVER_IMMINENT_DISTANCE_M;
  const distance = formatManeuverDistance(current.distanceM);
  const followingDistance = following ? formatManeuverDistance(following.distanceM) : null;
  const a11yLabel = `${distance.value}${distance.unit === 'km' ? '킬로미터' : '미터'} 후 ${current.title}. ${current.detail}`;

  return (
    <View
      style={[styles.card, compact && styles.cardCompact, isImminent && { borderColor: withAlpha(accent, 0.55) }]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.mainRow}>
        <DirectionTile icon={DIRECTION_ICONS[current.direction]} color={accent} filled={isImminent} compact={compact} />
        <View style={styles.textColumn}>
          <View style={styles.distanceRow}>
            <Text style={[styles.distanceValue, compact && styles.distanceValueCompact, isImminent && { color: accent }]}>
              {distance.value}
            </Text>
            <Text style={styles.distanceUnit}>{distance.unit}</Text>
            <Text style={styles.maneuverTitle} numberOfLines={1}>{current.title}</Text>
          </View>
          {current.detail ? (
            <Text style={styles.detailText} numberOfLines={1}>{current.detail}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progressRatio * 100)}%`, backgroundColor: accent }]} />
      </View>

      {following && followingDistance ? (
        <View style={styles.followingRow}>
          <AppIcon name={DIRECTION_ICONS[following.direction]} size={15} color={TEXT_SECONDARY} strokeWidth={2.2} />
          <Text style={styles.followingLabel}>그다음</Text>
          <Text style={styles.followingText} numberOfLines={1}>
            {followingDistance.value}{followingDistance.unit} 후 {following.title}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export const PocketDirectionCard: React.FC<PocketDirectionCardProps> = (props) => {
  if (props.variant === 'navigate') {
    return <NavigateCard maneuver={props.maneuver} accent={props.accent} compact={props.compact} />;
  }

  if (props.variant === 'offRoute') {
    return (
      <View
        style={[styles.card, props.compact && styles.cardCompact, { borderColor: withAlpha(WARN, 0.45) }]}
        accessibilityRole="alert"
      >
        <View style={styles.mainRow}>
          <DirectionTile icon="refresh" color={WARN} filled={false} compact={props.compact} />
          <View style={styles.textColumn}>
            <Text style={styles.messageTitle}>경로를 벗어났어요</Text>
            <Text style={styles.detailText} numberOfLines={2}>지도의 경로로 돌아오면 안내를 이어갈게요</Text>
          </View>
        </View>
        {props.onAction ? (
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={props.onAction}
            style={[styles.inlineAction, { backgroundColor: withAlpha(WARN, 0.16) }]}
          >
            <AppIcon name="refresh" size={16} color={WARN} strokeWidth={2.2} />
            <Text style={[styles.inlineActionText, { color: WARN }]}>{props.actionLabel ?? '경로 다시 만들기'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const toneColor = props.tone === 'danger' ? DANGER : props.tone === 'warning' ? WARN : props.accent;
  return (
    <View
      style={[
        styles.card,
        props.compact && styles.cardCompact,
        props.tone && props.tone !== 'normal' ? { borderColor: withAlpha(toneColor, 0.45) } : null,
      ]}
      accessibilityRole={props.tone && props.tone !== 'normal' ? 'alert' : 'summary'}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.mainRow}>
        <DirectionTile icon={props.icon} color={toneColor} filled={false} compact={props.compact} />
        <View style={styles.textColumn}>
          <Text style={styles.messageTitle} numberOfLines={1}>{props.title}</Text>
          <Text style={styles.detailText} numberOfLines={2}>{props.message}</Text>
        </View>
      </View>
    </View>
  );
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
    minHeight: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inlineActionText: { fontSize: 15, fontWeight: '700' },
});
