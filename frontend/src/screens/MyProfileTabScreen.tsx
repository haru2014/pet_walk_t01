/**
 * [편안하개 - PetWalk]
 * 모바일 마이 프로필 탭 화면 (US-A2, US-E3)
 *
 * 반려견 안심 케어 프로필 편집, Local-First 저장, 피드백 주입 시뮬레이션
 */

import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { DogProfile, JointCareLevel } from '../types/dogProfile';
import { CardWrapper } from '../components/common/CardWrapper';
import { GradientButton } from '../components/common/GradientButton';

export interface MyProfileTabScreenProps {
  dog: DogProfile;
  onSaveDog: (fields: Partial<DogProfile>) => void;
  onInjectFeedback: (dissatisfied: boolean) => void;
}

export const MyProfileTabScreen: React.FC<MyProfileTabScreenProps> = ({
  dog,
  onSaveDog,
  onInjectFeedback,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionSubtitle}>반려견 안심 케어 프로필</Text>
        <Text style={styles.sectionTitle}>우리 아이 정보 관리 🐾</Text>
      </View>

      <CardWrapper style={{ marginBottom: 16 }}>
        <Text style={styles.fieldLabel}>이름</Text>
        <TextInput
          value={dog.name}
          onChangeText={(text) => onSaveDog({ name: text })}
          style={styles.input}
        />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>나이 (세)</Text>
            <TextInput
              value={String(dog.ageYears)}
              keyboardType="numeric"
              onChangeText={(text) => onSaveDog({ ageYears: Number(text) || 0 })}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>체중 (kg)</Text>
            <TextInput
              value={String(dog.weightKg)}
              keyboardType="numeric"
              onChangeText={(text) => onSaveDog({ weightKg: Number(text) || 0 })}
              style={styles.input}
            />
          </View>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>관절 안심 케어 수준</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          {[0, 1, 2].map((lvl) => {
            const isSelected = dog.jointCareLevel === lvl;
            const labels = ['일반', '주의', '적극보호'];
            return (
              <TouchableOpacity
                key={lvl}
                onPress={() => onSaveDog({ jointCareLevel: lvl as JointCareLevel })}
                style={[styles.levelChip, isSelected && styles.levelChipSelected]}
              >
                <Text style={[styles.levelChipText, isSelected && styles.levelChipTextSelected]}>
                  {labels[lvl]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <GradientButton
          fullWidth
          onPress={() => Alert.alert('저장 완료', '🐾 프로필이 로컬에 안전하게 저장되었습니다!')}
          style={{ marginTop: 16 }}
        >
          로컬 프로필 저장 ✓
        </GradientButton>
      </CardWrapper>

      {/* 피드백 시뮬레이션 */}
      <CardWrapper variant="flat">
        <Text style={styles.cardHeaderTitle}>🧪 피드백 주입 시뮬레이션</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            onPress={() => onInjectFeedback(true)}
            style={[styles.simButton, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
          >
            <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '600' }}>
              + 가파름 불만족
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onInjectFeedback(false)}
            style={[styles.simButton, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
          >
            <Text style={{ color: '#065F46', fontSize: 12, fontWeight: '600' }}>
              + 완만길 만족
            </Text>
          </TouchableOpacity>
        </View>
      </CardWrapper>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: TOKENS.colors.textMuted,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.5,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.textMain,
    marginBottom: 4,
  },
  input: {
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: TOKENS.colors.textMain,
  },
  levelChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    backgroundColor: TOKENS.colors.background,
  },
  levelChipSelected: {
    borderColor: TOKENS.colors.primary,
    backgroundColor: TOKENS.colors.primaryLight,
  },
  levelChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: TOKENS.colors.textMuted,
  },
  levelChipTextSelected: {
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  simButton: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
});
