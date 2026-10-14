/**
 * [편안하개 - PetWalk]
 * 랜딩 가입 -> 반려견 이름/사진 등록(pet-photos 업로드) -> 홈 진입 플로우 모달 (US-G2, PR #42)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { GradientButton } from '../common/GradientButton';
import { AppIcon } from '../common/AppIcon';
import { SupabaseService } from '../../services/supabaseService';
import { DogProfile } from '../../types/dogProfile';
import { LegalTermsModal, LegalTabType } from '../common/LegalTermsModal';

export interface LandingAuthModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onFinish: (dog: DogProfile) => void;
  readonly initialMode?: 'signup' | 'signin';
}

export const LandingAuthModal: React.FC<LandingAuthModalProps> = ({ visible, onClose, onFinish, initialMode = 'signup' }) => {
  const [step, setStep] = useState<'auth' | 'dog'>('auth');
  const [isSignUp, setIsSignUp] = useState(initialMode !== 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState<string>('');
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTabType>('terms');

  useEffect(() => {
    if (visible) {
      setIsSignUp(initialMode !== 'signin');
      setStep('auth');
    }
  }, [visible, initialMode]);

  // 반려견 정보
  const [dogName, setDogName] = useState('');
  const [breed, setBreed] = useState('골든 리트리버');
  const [weightKg, setWeightKg] = useState('24');
  const [photoSelected, setPhotoSelected] = useState(false);

  const handleAuthSubmit = async () => {
    if (!email || !password) {
      Alert.alert('안내', '이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    const res = isSignUp
      ? await SupabaseService.signUp(email, password)
      : await SupabaseService.signIn(email, password);

    if (res.error) {
      Alert.alert('인증 오류', res.error);
      return;
    }

    const uid = res.user?.id ?? 'user_' + Date.now();
    setUserId(uid);
    setStep('dog');
  };

  const handleDogSubmit = async () => {
    if (!dogName.trim()) {
      Alert.alert('안내', '우리 아이의 이름을 입력해 주세요.');
      return;
    }

    let photoPath: string | undefined;
    if (photoSelected) {
      const uploadRes = await SupabaseService.uploadPetPhoto(
        userId || 'guest_user',
        `${dogName.toLowerCase()}_profile.jpg`,
        'mock_photo_data'
      );
      photoPath = uploadRes.photoPath;
    }

    const weight = Number.parseFloat(weightKg) || 10;
    const newDog: DogProfile = {
      id: `dog_${Date.now()}`,
      name: dogName,
      breed,
      ageYears: 3,
      weightKg: weight,
      jointCareLevel: 1,
      speedKmH: 2.8,
      photoUri: photoPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await SupabaseService.saveDogProfile({
      name: dogName,
      breed,
      weight_kg: weight,
      photo_path: photoPath,
    });

    onFinish(newDog);
    onClose();
  };

  const handleGuest = () => {
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {step === 'auth' ? (
            <View>
              <View style={styles.header}>
                <Text style={styles.title}>
                  🐾 {isSignUp ? '편안하개 회원가입' : '편안하개 로그인'}
                </Text>
                <Text style={styles.subtitle}>
                  {isSignUp ? '이메일 가입하고 우리 아이 안심 코스를 공유해 보세요!' : '기존 계정으로 로그인합니다.'}
                </Text>
              </View>

              <Text style={styles.label}>이메일</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="user@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />

              <Text style={[styles.label, { marginTop: 10 }]}>비밀번호</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="6자리 이상 비밀번호"
                secureTextEntry
                style={styles.input}
              />

              <GradientButton fullWidth onPress={handleAuthSubmit} style={{ marginTop: 16 }}>
                {isSignUp ? '회원가입하고 반려견 등록하기 →' : '로그인 완료 →'}
              </GradientButton>

              <View style={styles.switchRow}>
                <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
                  <Text style={styles.switchText}>
                    {isSignUp ? '이미 계정이 있나요? 로그인' : '아직 회원이 아니신가요? 회원가입'}
                  </Text>
                </TouchableOpacity>
              </View>

              {isSignUp && (
                <View style={styles.legalNoticeRow}>
                  <Text style={styles.legalNoticeText}>가입 시 </Text>
                  <TouchableOpacity onPress={() => { setLegalModalTab('terms'); setLegalModalVisible(true); }}>
                    <Text style={styles.legalLink}>[서비스이용약관]</Text>
                  </TouchableOpacity>
                  <Text style={styles.legalNoticeText}> 및 </Text>
                  <TouchableOpacity onPress={() => { setLegalModalTab('privacy'); setLegalModalVisible(true); }}>
                    <Text style={styles.legalLink}>[개인정보처리방침]</Text>
                  </TouchableOpacity>
                  <Text style={styles.legalNoticeText}>에 동의하게 됩니다.</Text>
                </View>
              )}

              <TouchableOpacity onPress={handleGuest} style={styles.guestBtn}>
                <Text style={styles.guestBtnText}>게스트 모드로 바로 둘러보기</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.header}>
                <Text style={styles.title}>🐕 우리 아이 등록하기 (pet-photos)</Text>
                <Text style={styles.subtitle}>Supabase 클라우드에 안전하게 보관됩니다.</Text>
              </View>

              <Text style={styles.label}>반려견 이름</Text>
              <TextInput
                value={dogName}
                onChangeText={setDogName}
                placeholder="예: 초코, 코코, 콩이"
                style={styles.input}
              />

              <Text style={[styles.label, { marginTop: 10 }]}>견종</Text>
              <TextInput
                value={breed}
                onChangeText={setBreed}
                placeholder="예: 말티즈, 포메라니안, 진돗개"
                style={styles.input}
              />

              <Text style={[styles.label, { marginTop: 10 }]}>체중 (kg)</Text>
              <TextInput
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="numeric"
                style={styles.input}
              />

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setPhotoSelected(!photoSelected)}
                style={[styles.photoCard, photoSelected && styles.photoCardSelected]}
              >
                <AppIcon name="paw" size={20} color={photoSelected ? '#059669' : TOKENS.colors.textMuted} />
                <Text style={[styles.photoText, photoSelected && styles.photoTextSelected]}>
                  {photoSelected ? '📷 사진 선택됨 (pet-photos/<user_id>/... 업로드)' : '📷 대표 사진 등록하기 (터치)'}
                </Text>
              </TouchableOpacity>

              <GradientButton fullWidth onPress={handleDogSubmit} style={{ marginTop: 16 }}>
                등록 완료하고 산책 시작하기 ✓
              </GradientButton>
            </View>
          )}
        </View>
      </View>

      <LegalTermsModal
        visible={legalModalVisible}
        initialTab={legalModalTab}
        onClose={() => setLegalModalVisible(false)}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  container: { backgroundColor: TOKENS.colors.surface, borderRadius: 20, padding: 22 },
  header: { marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', color: TOKENS.colors.textMain },
  subtitle: { fontSize: 12, color: TOKENS.colors.textMuted, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 4 },
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
  switchRow: { alignItems: 'center', marginTop: 12 },
  switchText: { fontSize: 12, color: TOKENS.colors.primaryDark, fontWeight: '600' },
  legalNoticeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingHorizontal: 10,
  },
  legalNoticeText: { fontSize: 11, color: TOKENS.colors.textMuted },
  legalLink: { fontSize: 11, color: TOKENS.colors.primaryDark, fontWeight: '700' },
  guestBtn: { alignItems: 'center', marginTop: 10, paddingVertical: 6 },
  guestBtnText: { fontSize: 12, color: TOKENS.colors.textMuted, textDecorationLine: 'underline' },
  photoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  photoCardSelected: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  photoText: { fontSize: 12, color: TOKENS.colors.textMuted, fontWeight: '600' },
  photoTextSelected: { color: '#065F46', fontWeight: '700' },
});
