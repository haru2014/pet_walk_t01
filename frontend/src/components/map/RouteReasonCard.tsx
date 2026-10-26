/**
 * [편안하개 - PetWalk]
 * AI 추천 사유 및 3대 안심 지표 인포그래픽 카드 (Screen-04, US-B1, US-B3)
 *
 * 1. 완만한 경사도 (최대 2.1%)
 * 2. 폭신한 노면 (흙길/잔디 85%)
 * 3. 시원한 그늘길 (실시간 그늘 57%)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { TOKENS, TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';

import { formatSlopeDisplay, formatSurfaceDisplay } from '../../services/routeProfileFormatter';

export interface RouteReasonCardProps {
  reasonText: string;
  maxSlopePercent?: number | null;
  slopeSource?: 'dem' | 'approximation' | 'unknown' | string | null;
  softSurfacePercent?: number | null;
  surfaceKnownRatio?: number | null;
  surfaceBreakdown?: Record<string, number> | null;
  shadePercent?: number;
}

export const RouteReasonCard: React.FC<RouteReasonCardProps> = ({
  reasonText,
  maxSlopePercent,
  slopeSource,
  softSurfacePercent,
  surfaceKnownRatio,
  surfaceBreakdown,
  shadePercent = 57,
}) => {
  const slopeInfo = formatSlopeDisplay(maxSlopePercent, slopeSource);

  // profile mock or breakdown mapping
  const profileMock =
    surfaceKnownRatio !== undefined || surfaceBreakdown !== undefined
      ? {
          surface_known_ratio: surfaceKnownRatio ?? null,
          soft_surface_ratio: softSurfacePercent != null ? softSurfacePercent / 100 : null,
          surface_breakdown: surfaceBreakdown ?? null,
        }
      : null;

  const fallbackStr = softSurfacePercent != null ? `${softSurfacePercent}%` : null;
  const surfaceInfo = formatSurfaceDisplay(profileMock, fallbackStr);

  return (
    <View style={styles.card}>
      {/* 헤더 */}
      <View style={styles.headerRow}>
        <AppIcon name="sparkle" size={18} color={TOKENS.colors.primaryDark} />
        <Text style={styles.headerTitle}>왜 이 코스를 추천했을까요?</Text>
      </View>

      {/* 3대 안심 지표 인포그래픽 그리드 */}
      <View style={styles.metricsGrid}>
        {/* 지표 1: 경사도 */}
        <View style={styles.metricItem}>
          <View style={styles.metricIcon}><AppIcon name="mountain" size={20} color={TOKENS.colors.primaryDark} /></View>
          <Text style={styles.metricLabel}>{slopeInfo.label}</Text>
          <Text style={[styles.metricValue, slopeInfo.isUnknown && { color: TOKENS.colors.textMuted }]}>
            {slopeInfo.valueText}
          </Text>
          <Text style={styles.metricSub}>{slopeInfo.subText}</Text>
        </View>

        {/* 지표 2: 노면 */}
        <View style={styles.metricItem}>
          <View style={styles.metricIcon}><AppIcon name="soft" size={20} color={TOKENS.colors.primaryDark} /></View>
          <Text style={styles.metricLabel}>{surfaceInfo.label}</Text>
          <Text style={[styles.metricValue, surfaceInfo.isUnknown && { color: TOKENS.colors.textMuted }]}>
            {surfaceInfo.valueText}
          </Text>
          <Text style={styles.metricSub}>{surfaceInfo.subText}</Text>
        </View>

        {/* 지표 3: 그늘 구간 */}
        <View style={styles.metricItem}>
          <View style={styles.metricIcon}><AppIcon name="shade" size={20} color={TOKENS.colors.primaryDark} /></View>
          <Text style={styles.metricLabel}>시원한 그늘</Text>
          <Text style={styles.metricValue}>{shadePercent}%</Text>
          <Text style={styles.metricSub}>햇볕을 피하며 걸을 수 있어요</Text>
        </View>
      </View>

      {/* 자연어 브리핑 설명 */}
      <View style={styles.reasonTextBubble}>
        <Text style={styles.reasonText}>{reasonText}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.colors.primaryWash,
    borderWidth: 1,
    borderColor: TOKENS.colors.primaryMint,
    borderRadius: TOKENS.borderRadius.card,
    padding: 16,
    marginBottom: 16,
    shadowColor: TOKENS.colors.primaryDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.screenTitle,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: TOKENS.colors.borderSoft,
  },
  metricIcon: {
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
    color: TOKENS.colors.primaryDark,
    marginBottom: 2,
  },
  metricSub: {
    fontSize: TYPOGRAPHY.label,
    color: TOKENS.colors.textMuted,
    textAlign: 'center',
  },
  reasonTextBubble: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reasonText: {
    fontSize: TYPOGRAPHY.support,
    color: TOKENS.colors.textMain,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.support,
    fontWeight: '500',
  },
});
