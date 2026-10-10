/**
 * [편안하개 - PetWalk]
 * AI 추천 사유 및 3대 안심 지표 인포그래픽 카드 (Screen-04, US-B1, US-B3)
 *
 * 1. 완만한 경사도 (최대 2.1%)
 * 2. 폭신한 노면 (흙길/잔디 85%)
 * 3. 시원한 그늘길 (실시간 그늘 57%)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../../theme/tokens';

export interface RouteReasonCardProps {
  reasonText: string;
  maxSlopePercent?: number;
  softSurfacePercent?: number;
  shadePercent?: number;
}

export const RouteReasonCard: React.FC<RouteReasonCardProps> = ({
  reasonText,
  maxSlopePercent = 2.1,
  softSurfacePercent = 85,
  shadePercent = 57,
}) => {
  return (
    <View style={styles.card}>
      {/* 헤더 */}
      <View style={styles.headerRow}>
        <Text style={styles.sparkleIcon}>✨</Text>
        <Text style={styles.headerTitle}>왜 이 코스를 추천했을까요?</Text>
      </View>

      {/* 3대 안심 지표 인포그래픽 그리드 */}
      <View style={styles.metricsGrid}>
        {/* 지표 1: 완만 경사 */}
        <View style={styles.metricItem}>
          <Text style={styles.metricIcon}>⛰️</Text>
          <Text style={styles.metricLabel}>완만한 경사</Text>
          <Text style={styles.metricValue}>최대 {maxSlopePercent}%</Text>
          <Text style={styles.metricSub}>관절 무리 없는 평지 위주</Text>
        </View>

        {/* 지표 2: 폭신 노면 */}
        <View style={styles.metricItem}>
          <Text style={styles.metricIcon}>🌿</Text>
          <Text style={styles.metricLabel}>폭신한 노면</Text>
          <Text style={styles.metricValue}>{softSurfacePercent}%</Text>
          <Text style={styles.metricSub}>흙길·잔디로 발바닥 안심</Text>
        </View>

        {/* 지표 3: 그늘 구간 */}
        <View style={styles.metricItem}>
          <Text style={styles.metricIcon}>🌳</Text>
          <Text style={styles.metricLabel}>시원한 그늘</Text>
          <Text style={styles.metricValue}>{shadePercent}%</Text>
          <Text style={styles.metricSub}>자외선 차단 및 저온 유지</Text>
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
    backgroundColor: '#ECFDF5',
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
  sparkleIcon: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 14,
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
    borderColor: '#E6F4EA',
  },
  metricIcon: {
    fontSize: 16,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: TOKENS.colors.primaryDark,
    marginBottom: 2,
  },
  metricSub: {
    fontSize: 9,
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
    fontSize: 12,
    color: TOKENS.colors.textMain,
    lineHeight: 18,
    fontWeight: '500',
  },
});
