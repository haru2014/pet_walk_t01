/**
 * [편안하개 - PetWalk]
 * 모바일 강아지 선택 화면 (Screen-02, US-A2)
 *
 * 다견 가정 지원: 함께 걸을 반려견 선택 및 신규 반려견 로컬 등록
 */

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../common/AppText';
import { TOKENS, TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';
import { AppScreenHeader } from '../common/AppScreenHeader';
import { DogProfile, JointCareLevel, calculateRecommendedSpeedKmH } from '../../types/dogProfile';

export interface DogSelectionViewProps {
  dogs: DogProfile[];
  selectedDogId: string;
  onSelectDog: (dogId: string) => void;
  onAddDog: (newDog: DogProfile) => void;
  onContinue: () => void;
  onBack: () => void;
}

export const DogSelectionView: React.FC<DogSelectionViewProps> = ({
  dogs,
  selectedDogId,
  onSelectDog,
  onAddDog,
  onContinue,
  onBack,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [ageYears, setAgeYears] = useState('3');
  const [breed, setBreed] = useState('말티즈');
  const [weightKg, setWeightKg] = useState('4.5');
  const [preference, setPreference] = useState('30분 산책 선호');
  const [jointCareLevel, setJointCareLevel] = useState<JointCareLevel>(1);

  const selectedDog = dogs.find((d) => d.id === selectedDogId) ?? dogs[0];

  const handleRegisterDog = () => {
    if (!name.trim()) {
      Alert.alert('알림', '반려견 이름을 입력해주세요.');
      return;
    }

    const age = Number(ageYears) || 3;
    const weight = Number(weightKg) || 5;
    const speed = calculateRecommendedSpeedKmH(weight, age, jointCareLevel);

    const newDog: DogProfile = {
      id: `dog_${Date.now()}`,
      name: name.trim(),
      breed: breed.trim() || '믹스견',
      ageYears: age,
      weightKg: weight,
      jointCareLevel,
      speedKmH: speed,
      preference: preference.trim() || '편안한 산책 선호',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onAddDog(newDog);
    onSelectDog(newDog.id);
    setShowAddModal(false);
    setName('');
    Alert.alert('등록 완료', `🐾 ${newDog.name}가 새 가족으로 등록되었습니다!`);
  };

  return (
    <View style={styles.container}>
      {/* 상단 공통 규격 헤더 (48px 터치타깃 보장) */}
      <AppScreenHeader
        title="강아지 선택"
        showBack={dogs.length > 0}
        onBack={onBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 타이틀 안내 */}
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>누구와 산책할까요?</Text>
          <Text style={styles.subTitle}>오늘 함께 걸을 우리 강아지를 선택해주세요.</Text>
        </View>

        {/* 내 강아지 리스트 */}
        <View style={styles.listSection}>
          <Text style={styles.sectionHeading}>내 강아지</Text>
          {dogs.length === 0 && (
            <Text style={styles.emptyProfilesMessage}>
              등록된 반려견 프로필이 없습니다. 새 강아지를 등록해 주세요.
            </Text>
          )}

          {dogs.map((dog) => {
            const isSelected = dog.id === selectedDogId;
            return (
              <TouchableOpacity
                key={dog.id}
                activeOpacity={0.85}
                onPress={() => onSelectDog(dog.id)}
                style={[styles.dogCard, isSelected && styles.dogCardSelected]}
              >
                {/* 아바타 */}
                <View style={[styles.avatarBox, isSelected && styles.avatarBoxSelected]}>
                  <AppIcon name="pawOutline" size={28} color={TOKENS.colors.primaryDark} />
                </View>

                {/* 정보 */}
                <View style={styles.dogInfo}>
                  <Text style={styles.dogName}>{dog.name}</Text>
                  <Text style={styles.dogMeta}>
                    {dog.ageYears}살 · {dog.breed}
                  </Text>
                  <View style={styles.preferenceChip}>
                    <Text style={styles.preferenceChipText}>
                      {dog.preference || '30분 산책 선호'}
                    </Text>
                  </View>
                </View>

                {/* 라디오 버튼 */}
                <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                  {isSelected && <Text style={styles.checkMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* 새 강아지 등록 버튼 */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setShowAddModal(true)}
            style={styles.addDogButton}
          >
            <Text style={styles.addDogIcon}>+</Text>
            <Text style={styles.addDogText}>새 강아지 등록</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 하단 고정 버튼 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onContinue}
          disabled={!selectedDog}
          style={[styles.continueButton, !selectedDog && styles.continueButtonDisabled]}
        >
          <Text style={styles.continueButtonText}>
            {selectedDog ? `${selectedDog.name}와 산책 설정하기` : '강아지를 선택해주세요'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 새 강아지 등록 모달 */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>새 강아지 등록</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={styles.inputLabel}>이름</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="예: 콩이"
                style={styles.textInput}
              />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>나이 (살)</Text>
                  <TextInput
                    value={ageYears}
                    onChangeText={setAgeYears}
                    keyboardType="numeric"
                    style={styles.textInput}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>체중 (kg)</Text>
                  <TextInput
                    value={weightKg}
                    onChangeText={setWeightKg}
                    keyboardType="numeric"
                    style={styles.textInput}
                  />
                </View>
                <View style={{ flex: 1.2 }}>
                  <Text style={styles.inputLabel}>견종</Text>
                  <TextInput
                    value={breed}
                    onChangeText={setBreed}
                    placeholder="예: 푸들"
                    style={styles.textInput}
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>산책 취향</Text>
              <TextInput
                value={preference}
                onChangeText={setPreference}
                placeholder="예: 천천히 걷는 산책 선호"
                style={styles.textInput}
              />

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>관절 안심 케어 수준</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                {[0, 1, 2].map((lvl) => {
                  const isSelected = jointCareLevel === lvl;
                  const labels = ['일반', '주의', '적극보호'];
                  return (
                    <TouchableOpacity
                      key={lvl}
                      onPress={() => setJointCareLevel(lvl as JointCareLevel)}
                      style={[styles.levelChip, isSelected && styles.levelChipSelected]}
                    >
                      <Text style={[styles.levelChipText, isSelected && styles.levelChipTextSelected]}>
                        {labels[lvl]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleRegisterDog}
              style={styles.submitButton}
            >
              <Text style={styles.submitButtonText}>등록하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.background,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.surface,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.screenTitle,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.3,
  },
  headerPlaceholder: {
    width: 36,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 24,
  },
  titleSection: {
    marginBottom: 24,
    marginTop: 8,
  },
  mainTitle: {
    fontSize: TYPOGRAPHY.screenTitle,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subTitle: {
    fontSize: TYPOGRAPHY.support,
    color: TOKENS.colors.textMuted,
  },
  listSection: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    marginBottom: 12,
  },
  emptyProfilesMessage: {
    marginBottom: 12,
    color: TOKENS.colors.textMuted,
    fontSize: TYPOGRAPHY.support,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.support,
  },
  dogCard: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    padding: 16,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  dogCardSelected: {
    borderColor: TOKENS.colors.primary,
    backgroundColor: '#F2FDF8',
  },
  avatarBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TOKENS.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarBoxSelected: {
    backgroundColor: TOKENS.colors.primarySubtle,
    borderWidth: 2,
    borderColor: TOKENS.colors.primary,
  },
  dogInfo: {
    flex: 1,
  },
  dogName: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    marginBottom: 2,
  },
  dogMeta: {
    fontSize: TYPOGRAPHY.caption,
    color: TOKENS.colors.textMuted,
    marginBottom: 6,
  },
  preferenceChip: {
    alignSelf: 'flex-start',
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
  },
  preferenceChipText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: TOKENS.colors.primaryDark,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  radioCircleSelected: {
    backgroundColor: TOKENS.colors.primary,
    borderColor: TOKENS.colors.primary,
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
  },
  addDogButton: {
    backgroundColor: TOKENS.colors.surface,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.primaryMint,
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
  },
  addDogIcon: {
    fontSize: 18,
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  addDogText: {
    fontSize: TYPOGRAPHY.body,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  bottomBar: {
    backgroundColor: TOKENS.colors.surface,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButton: {
    backgroundColor: TOKENS.colors.primary,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  continueButtonDisabled: {
    opacity: 0.45,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: TOKENS.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  closeIcon: {
    fontSize: 18,
    color: TOKENS.colors.textMuted,
    padding: 4,
  },
  inputLabel: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: TOKENS.colors.textMain,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: TYPOGRAPHY.body,
    color: TOKENS.colors.textMain,
  },
  levelChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
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
    fontSize: TYPOGRAPHY.label,
    fontWeight: '500',
    color: TOKENS.colors.textMuted,
  },
  levelChipTextSelected: {
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: TOKENS.colors.primary,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
  },
});
