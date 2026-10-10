/**
 * [편안하개 - PetWalk]
 * 모바일 지도 범례 오버레이 컴포넌트 (US-C1)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { SegmentType } from '../../types/route';

export const SEGMENT_COLORS: Record<SegmentType, string> = {
  safe: TOKENS.colors.routeSafe,
  normal: TOKENS.colors.routeNormal,
  caution: TOKENS.colors.routeCaution,
};

const LEGEND = [
  { type: 'safe' as const, label: '완만/그늘' },
  { type: 'normal' as const, label: '일반 보도' },
  { type: 'caution' as const, label: '주의 구간' },
];

export const RouteMapLegend: React.FC = () => {
  return (
    <View style={styles.legend}>
      {LEGEND.map((item) => (
        <View key={item.type} style={styles.legendItem}>
          <View style={[styles.legendBar, { backgroundColor: SEGMENT_COLORS[item.type] }]} />
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  legend: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendBar: { width: 14, height: 4, borderRadius: 2 },
  legendLabel: { fontSize: 10, color: TOKENS.colors.textMain, fontWeight: '500' },
});
