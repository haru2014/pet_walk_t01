/**
 * [편안하개 - PetWalk]
 * 6대 산책 환경 선호 조건 선택 그리드 컴포넌트 (US-A1)
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { TOKENS, TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';
import { EnvironmentId, WALK_ENVIRONMENTS } from '../../types/walkSettings';

export interface WalkPreferenceChipsProps {
  environments: EnvironmentId[];
  onToggleEnvironment: (id: EnvironmentId) => void;
}

export const WalkPreferenceChips: React.FC<WalkPreferenceChipsProps> = ({
  environments,
  onToggleEnvironment,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>어떤 길이 좋을까요?</Text>
        <Text style={styles.sectionHint}>여러 개 선택할 수 있어요</Text>
      </View>

      <View style={styles.envGrid}>
        {WALK_ENVIRONMENTS.map((option) => {
          const isSelected = environments.includes(option.id);
          return (
            <TouchableOpacity
              key={option.id}
              activeOpacity={0.8}
              onPress={() => onToggleEnvironment(option.id)}
              style={[styles.envCard, isSelected && styles.envCardSelected]}
            >
              <View style={styles.envCardTop}>
                <AppIcon
                  name={option.icon}
                  size={24}
                  color={isSelected ? TOKENS.colors.primaryDark : TOKENS.colors.textMuted}
                />
                {isSelected && (
                  <View style={styles.envCheckCircle}>
                    <Text style={styles.envCheckMark}>✓</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.envLabel, isSelected && styles.envLabelSelected]}>
                {option.label}
              </Text>
              <Text style={styles.envDetail}>{option.detail}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: TYPOGRAPHY.sectionTitle, fontWeight: '700', color: TOKENS.colors.textMain },
  sectionHint: { fontSize: TYPOGRAPHY.caption, color: TOKENS.colors.textMuted },
  envGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  envCard: {
    width: '48.4%',
    padding: 14,
    borderRadius: 14,
    backgroundColor: TOKENS.colors.surface,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
  },
  envCardSelected: { borderColor: TOKENS.colors.primaryDark, backgroundColor: TOKENS.colors.primaryLight },
  envCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  envCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: TOKENS.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  envCheckMark: { color: TOKENS.colors.textWhite, fontSize: TYPOGRAPHY.label, fontWeight: '800' },
  envLabel: { fontSize: TYPOGRAPHY.label, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 4 },
  envLabelSelected: { color: TOKENS.colors.primaryDark },
  envDetail: { fontSize: TYPOGRAPHY.support, color: TOKENS.colors.textMuted, lineHeight: TYPOGRAPHY_LINE_HEIGHT.support },
});
