/**
 * [편안하개 - PetWalk]
 * 현재 선택된 산책 조건 요약 태그 뷰 컴포넌트
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { TOKENS, TYPOGRAPHY } from '../../theme/tokens';

export interface WalkConditionsSummaryProps {
  labels: string[];
}

export const WalkConditionsSummary: React.FC<WalkConditionsSummaryProps> = ({ labels }) => {
  if (labels.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.summaryTitle}>현재 산책 조건</Text>
      <View style={styles.tagWrap}>
        {labels.map((lbl) => (
          <View key={lbl} style={styles.summaryTag}>
            <Text style={styles.summaryTagText}>{lbl}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  summaryTitle: { fontSize: TYPOGRAPHY.support, fontWeight: '600', color: TOKENS.colors.textMuted, marginBottom: 8 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  summaryTag: {
    backgroundColor: TOKENS.colors.background,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summaryTagText: { fontSize: TYPOGRAPHY.label, color: TOKENS.colors.textMuted, fontWeight: '500' },
});
