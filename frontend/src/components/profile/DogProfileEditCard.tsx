/**
 * [편안하개 - PetWalk]
 * 반려견 안심 케어 프로필 편집 카드 (US-A2)
 *
 * 1. 상단: 등록된 반려견 선택 칩 바 ([🐾 초코] [🐾 콩이 ✓] [+ 새 아이 추가])
 * 2. 중단: 선택된 반려견 대표 사진 및 상세 정보(이름, 나이, 체중, 관절케어) 수정
 * 3. 팝업: "+ 새 아이 추가" 시 직관적인 다견 등록 모달 지원
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
import { TOKENS } from '../../theme/tokens';
import {
  DogProfile,
  JointCareLevel,
  calculateRecommendedSpeedKmH,
} from '../../types/dogProfile';
import { CardWrapper } from '../common/CardWrapper';
import { GradientButton } from '../common/GradientButton';
import { DogAvatar } from '../common/DogAvatar';
import { PhotoPickerModal } from './PhotoPickerModal';

export interface DogProfileEditCardProps {
  readonly dog: DogProfile;
  readonly dogs?: readonly DogProfile[];
  readonly selectedDogId?: string;
  readonly onSelectDog?: (dogId: string) => void;
  readonly onAddDog?: (newDog: DogProfile) => void;
  readonly onSaveDog: (fields: Partial<DogProfile>) => void;
  readonly onDeleteDog?: (dogId: string) => void | Promise<void>;
}

export const DogProfileEditCard: React.FC<DogProfileEditCardProps> = ({
  dog,
  dogs,
  selectedDogId,
  onSelectDog,
  onAddDog,
  onSaveDog,
  onDeleteDog,
}) => {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // 신규 반려견 등록 폼 상태
  const [newName, setNewName] = useState('');
  const [newBreed, setNewBreed] = useState('믹스견');
  const [newAge, setNewAge] = useState('3');
  const [newWeight, setNewWeight] = useState('5');
  const [newJointLevel, setNewJointLevel] = useState<JointCareLevel>(0);
  const [newPhotoUri, setNewPhotoUri] = useState<string | undefined>(undefined);
  const [newPhotoPickerVisible, setNewPhotoPickerVisible] = useState(false);

  const dogList = dogs && dogs.length > 0 ? dogs : [dog];

  const handleRegisterNewDog = () => {
    if (!newName.trim()) {
      Alert.alert('알림', '반려견 이름을 입력해주세요.');
      return;
    }

    const age = Number(newAge) || 3;
    const weight = Number(newWeight) || 5;
    const speed = calculateRecommendedSpeedKmH(weight, age, newJointLevel);

    const newDog: DogProfile = {
      id: `dog_${Date.now()}`,
      name: newName.trim(),
      breed: newBreed.trim() || '믹스견',
      ageYears: age,
      weightKg: weight,
      jointCareLevel: newJointLevel,
      speedKmH: speed,
      photoUri: newPhotoUri,
      preference: '30분 산책 선호',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onAddDog?.(newDog);
    onSelectDog?.(newDog.id);
    setShowAddModal(false);

    // 폼 초기화
    setNewName('');
    setNewBreed('믹스견');
    setNewAge('3');
    setNewWeight('5');
    setNewJointLevel(0);
    setNewPhotoUri(undefined);

    Alert.alert('등록 완료', `🐾 ${newDog.name}가 새 가족으로 등록되었습니다!`);
  };

  const confirmDeleteDog = () => {
    const deleteDog = () => { void onDeleteDog?.(dog.id); };
    const message = `${dog.name} 프로필과 이 기기에 저장된 해당 프로필이 삭제됩니다. 로그인 계정에 동기화된 프로필도 함께 삭제됩니다.`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${dog.name} 프로필을 삭제할까요?\n${message}`)) deleteDog();
      return;
    }

    Alert.alert('반려견 프로필 삭제', message, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: deleteDog },
    ]);
  };

  return (
    <CardWrapper style={{ marginBottom: 16 }}>
      {/* 1. 상단 다견 선택 칩 바 및 새 아이 추가 버튼 */}
      <View style={styles.dogChipSection}>
        <View style={styles.chipHeaderRow}>
          <Text style={styles.dogChipSectionTitle}>반려견 선택</Text>
          <Text style={styles.dogChipCountText}>{dogList.length}마리 등록됨</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dogChipScrollRow}
        >
          {dogList.map((item) => {
            const isCurrent = item.id === (selectedDogId ?? dog.id);
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                onPress={() => onSelectDog?.(item.id)}
                style={[
                  styles.dogChip,
                  isCurrent ? styles.dogChipActive : styles.dogChipInactive,
                ]}
              >
                <DogAvatar photoUri={item.photoUri} size={22} />
                <Text
                  style={[
                    styles.dogChipText,
                    isCurrent ? styles.dogChipTextActive : styles.dogChipTextInactive,
                  ]}
                >
                  {item.name}
                </Text>
                {isCurrent && <Text style={styles.checkMark}>✓</Text>}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowAddModal(true)}
            style={styles.addDogChip}
          >
            <Text style={styles.addDogChipText}>＋ 새 아이 추가</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 2. 반려견 대표 사진 & 변경 영역 */}
      <View style={styles.photoRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setPickerVisible(true)}
          style={styles.avatarTouchArea}
        >
          <DogAvatar photoUri={dog.photoUri} size={60} />
          <View style={styles.cameraBadge}>
            <Text style={styles.cameraIcon}>📷</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.photoInfoArea}>
          <Text style={styles.photoTitle}>우리 아이 대표 사진</Text>
          <Text style={styles.photoSub}>
            {dog.photoUri ? '대표 사진이 등록되어 있습니다' : '사진을 등록해주세요'}
          </Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setPickerVisible(true)}
            style={styles.changePhotoBtn}
          >
            <Text style={styles.changePhotoText}>
              {dog.photoUri ? '사진/캐릭터 변경' : '대표 사진 등록'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. 반려견 상세 정보 폼 */}
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
        onPress={() => Alert.alert('저장 완료', `🐾 ${dog.name} 프로필이 안전하게 저장되었습니다!`)}
        style={{ marginTop: 16 }}
      >
        반려견 프로필 저장 ✓
      </GradientButton>

      {onDeleteDog && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={confirmDeleteDog}
          style={styles.deleteDogButton}
        >
          <Text style={styles.deleteDogButtonText}>이 반려견 프로필 삭제</Text>
        </TouchableOpacity>
      )}

      {/* 기존 프로필 사진 선택 모달 */}
      <PhotoPickerModal
        visible={pickerVisible}
        currentPhotoUri={dog.photoUri}
        onClose={() => setPickerVisible(false)}
        onSelectPhoto={(uri) => onSaveDog({ photoUri: uri })}
      />

      {/* 4. 신규 반려견 추가 모달 */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>새로운 반려견 등록 🐾</Text>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* 새 아이 사진 선택 */}
              <View style={styles.newPhotoArea}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setNewPhotoPickerVisible(true)}
                  style={styles.avatarTouchArea}
                >
                  <DogAvatar photoUri={newPhotoUri} size={64} />
                  <View style={styles.cameraBadge}>
                    <Text style={styles.cameraIcon}>📷</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNewPhotoPickerVisible(true)}
                  style={[styles.changePhotoBtn, { marginTop: 8 }]}
                >
                  <Text style={styles.changePhotoText}>대표 사진 / 캐릭터 선택</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>이름 *</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="예: 초코, 콩이"
                placeholderTextColor={TOKENS.colors.textMuted}
                style={styles.input}
              />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>견종</Text>
              <TextInput
                value={newBreed}
                onChangeText={setNewBreed}
                placeholder="예: 말티즈, 푸들, 골든 리트리버"
                placeholderTextColor={TOKENS.colors.textMuted}
                style={styles.input}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>나이 (세)</Text>
                  <TextInput
                    value={newAge}
                    keyboardType="numeric"
                    onChangeText={setNewAge}
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>체중 (kg)</Text>
                  <TextInput
                    value={newWeight}
                    keyboardType="numeric"
                    onChangeText={setNewWeight}
                    style={styles.input}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>관절 안심 케어 수준</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                {[0, 1, 2].map((lvl) => {
                  const isSelected = newJointLevel === lvl;
                  const labels = ['일반', '주의', '적극보호'];
                  return (
                    <TouchableOpacity
                      key={lvl}
                      onPress={() => setNewJointLevel(lvl as JointCareLevel)}
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

            <GradientButton
              fullWidth
              onPress={handleRegisterNewDog}
              style={{ marginTop: 16 }}
            >
              새 반려견 등록 완료 ✓
            </GradientButton>
          </View>
        </View>
      </Modal>

      {/* 5. 신규 등록용 프로필 사진 모달 (중첩 모달 충돌 방지) */}
      <PhotoPickerModal
        visible={newPhotoPickerVisible}
        currentPhotoUri={newPhotoUri}
        onClose={() => setNewPhotoPickerVisible(false)}
        onSelectPhoto={(uri) => setNewPhotoUri(uri)}
      />
    </CardWrapper>
  );
};

const styles = StyleSheet.create({
  // 반려견 전환 칩 바 스타일
  dogChipSection: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
  },
  deleteDogButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D9534F',
    borderRadius: 12,
    backgroundColor: '#FFF8F7',
  },
  deleteDogButtonText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '700',
  },
  chipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dogChipSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  dogChipCountText: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
  },
  dogChipScrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dogChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
  },
  dogChipActive: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderColor: TOKENS.colors.primary,
  },
  dogChipInactive: {
    backgroundColor: TOKENS.colors.surface,
    borderColor: TOKENS.colors.border,
  },
  dogChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dogChipTextActive: {
    color: TOKENS.colors.primaryDark,
    fontWeight: '800',
  },
  dogChipTextInactive: {
    color: TOKENS.colors.textMuted,
  },
  checkMark: {
    fontSize: 11,
    fontWeight: '900',
    color: TOKENS.colors.primary,
  },
  addDogChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: TOKENS.colors.primary,
    backgroundColor: TOKENS.colors.primaryLight,
  },
  addDogChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },

  // 사진 영역
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
  },
  avatarTouchArea: {
    position: 'relative',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: TOKENS.colors.surface,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  cameraIcon: {
    fontSize: 10,
  },
  photoInfoArea: {
    flex: 1,
  },
  photoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  photoSub: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    marginTop: 2,
    marginBottom: 4,
  },
  changePhotoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  changePhotoText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  fieldLabel: { fontSize: 11.5, fontWeight: '600', color: TOKENS.colors.textMain, marginBottom: 2 },
  input: {
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13.5,
    color: TOKENS.colors.textMain,
  },
  levelChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    backgroundColor: TOKENS.colors.background,
  },
  levelChipSelected: { borderColor: TOKENS.colors.primary, backgroundColor: TOKENS.colors.primaryLight },
  levelChipText: { fontSize: 11.5, fontWeight: '500', color: TOKENS.colors.textMuted },
  levelChipTextSelected: { color: TOKENS.colors.primaryDark, fontWeight: '700' },

  // 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 16,
    color: TOKENS.colors.textMuted,
    fontWeight: '700',
  },
  newPhotoArea: {
    alignItems: 'center',
    marginBottom: 16,
  },
});
