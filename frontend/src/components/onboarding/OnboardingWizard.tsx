/**
 * [편안하개 - PetWalk]
 * 팀장 컨펌 4단계 온보딩 위저드 (T2-ONBOARD-FLOW)
 *
 * 1단계: 가입약관 및 로그인/이메일 인증
 * 2단계: 반려견 프로필 등록 (이름, 견종, 체중, 사진)
 * 3단계: 산책 시작 위치 권한 동의 및 200m 프라이버시 고지
 * 4단계: 주변 코스 및 실시간 산책견 지도 탐색 (NearbyExploreMapView)
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { GradientButton } from '../common/GradientButton';
import { AppIcon } from '../common/AppIcon';
import { DogProfile, calculateRecommendedSpeedKmH } from '../../types/dogProfile';
import { SupabaseService } from '../../services/supabaseService';
import { NearbyExploreMapView } from './NearbyExploreMapView';
import { LegalTermsModal, LegalTabType } from '../common/LegalTermsModal';

export interface OnboardingWizardProps {
  onComplete: (registeredDog?: DogProfile) => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // 1단계 상태: 가입 및 약관
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAgreed, setTermsAgreed] = useState(true);
  const [privacyAgreed, setPrivacyAgreed] = useState(true);
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalTabType>('terms');

  const openLegalModal = (tab: LegalTabType) => {
    setLegalModalTab(tab);
    setLegalModalVisible(true);
  };

  // 2단계 상태: 반려견 정보
  const [dogName, setDogName] = useState('초코');
  const [breed, setBreed] = useState('골든 리트리버');
  const [weightKg, setWeightKg] = useState('24');
  const [photoSelected, setPhotoSelected] = useState(false);

  // 3단계 상태: 위치 권한
  const [locationAgreed, setLocationAgreed] = useState(true);

  const handleStep1Next = async () => {
    if (!termsAgreed || !privacyAgreed) {
      Alert.alert('약관 동의 필요', '서비스 이용을 위해 이용약관 및 개인정보보호정책에 모두 동의해 주세요.');
      return;
    }
    if (email && password) {
      await SupabaseService.signUp(email, password);
    }
    setCurrentStep(2);
  };

  const handleStep2Next = () => {
    if (!dogName.trim()) {
      Alert.alert('반려견 정보', '우리 아이의 이름을 입력해 주세요.');
      return;
    }
    setCurrentStep(3);
  };

  const handleStep3Next = () => {
    if (!locationAgreed) {
      Alert.alert('위치 권한 필요', '안심 보행로 안내를 위해 위치 권한 동의가 필요합니다.');
      return;
    }
    setCurrentStep(4);
  };

  const handleFinish = async () => {
    const weight = Number.parseFloat(weightKg) || 10;
    const speed = calculateRecommendedSpeedKmH(weight, 3, 1);
    const newDog: DogProfile = {
      id: `dog_${Date.now()}`,
      name: dogName.trim() || '초코',
      breed: breed.trim() || '골든 리트리버',
      ageYears: 3,
      weightKg: weight,
      jointCareLevel: 1,
      speedKmH: speed,
      photoUri: photoSelected ? 'mock_photo_url' : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await SupabaseService.saveDogProfile({
      name: newDog.name,
      breed: newDog.breed,
      weight_kg: weight,
      photo_path: newDog.photoUri,
    });

    onComplete(newDog);
  };

  return (
    <View style={styles.container}>
      {/* 상단 4단계 인디케이터 헤더 */}
      <View style={styles.topNav}>
        <Text style={styles.topLogo}>🐾 편안하개 시작하기</Text>
        <Text style={styles.stepCounter}>{currentStep} / 4 단계</Text>
      </View>

      <View style={styles.stepProgressRow}>
        {[1, 2, 3, 4].map((s) => (
          <View
            key={s}
            style={[styles.stepProgressBar, s <= currentStep && styles.stepProgressBarActive]}
          />
        ))}
      </View>

      {/* 1단계: 가입약관 및 계정 */}
      {currentStep === 1 && (
        <View style={styles.stepCard}>
          <Text style={styles.stepBadge}>Step 1. 가입 및 약관 동의</Text>
          <Text style={styles.stepTitle}>보호자님, 환영합니다! 👋</Text>
          <Text style={styles.stepSubtitle}>아이와의 안심 산책을 위한 계정을 생성하세요.</Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="이메일 (선택 또는 빠른 시작)"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="비밀번호 (선택)"
            secureTextEntry
            style={[styles.input, { marginTop: 8 }]}
          />

          {/* 이용약관 체크박스 & 보기 링크 */}
          <View style={styles.agreeRowContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setTermsAgreed(!termsAgreed)}
              style={styles.agreeRow}
            >
              <View style={[styles.checkbox, termsAgreed && styles.checkboxActive]}>
                {termsAgreed && <Text style={styles.checkIcon}>✓</Text>}
              </View>
              <Text style={styles.agreeText}>
                [필수] 서비스 이용약관 및 위치기반서비스 동의
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openLegalModal('terms')} style={styles.viewLinkBtn}>
              <Text style={styles.viewLinkText}>약관 보기</Text>
            </TouchableOpacity>
          </View>

          {/* 개인정보보호정책 체크박스 & 보기 링크 */}
          <View style={[styles.agreeRowContainer, { marginTop: 8 }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPrivacyAgreed(!privacyAgreed)}
              style={styles.agreeRow}
            >
              <View style={[styles.checkbox, privacyAgreed && styles.checkboxActive]}>
                {privacyAgreed && <Text style={styles.checkIcon}>✓</Text>}
              </View>
              <Text style={styles.agreeText}>
                [필수] 개인정보 처리방침 (Local-First) 동의
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openLegalModal('privacy')} style={styles.viewLinkBtn}>
              <Text style={styles.viewLinkText}>방침 보기</Text>
            </TouchableOpacity>
          </View>

          <GradientButton fullWidth onPress={handleStep1Next} style={{ marginTop: 18 }}>
            동의하고 반려견 등록하기 →
          </GradientButton>
        </View>
      )}

      {/* 2단계: 반려견 등록 */}
      {currentStep === 2 && (
        <View style={styles.stepCard}>
          <Text style={styles.stepBadge}>Step 2. 반려견 프로필 등록</Text>
          <Text style={styles.stepTitle}>우리 아이를 소개해 주세요 🐕</Text>
          <Text style={styles.stepSubtitle}>체급과 보폭에 맞는 안심 산책로를 분석합니다.</Text>

          <TextInput
            value={dogName}
            onChangeText={setDogName}
            placeholder="아이 이름 (예: 초코)"
            style={styles.input}
          />
          <TextInput
            value={breed}
            onChangeText={setBreed}
            placeholder="견종 (예: 골든 리트리버, 말티즈)"
            style={[styles.input, { marginTop: 8 }]}
          />
          <TextInput
            value={weightKg}
            onChangeText={setWeightKg}
            placeholder="체중 (kg)"
            keyboardType="numeric"
            style={[styles.input, { marginTop: 8 }]}
          />

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setPhotoSelected(!photoSelected)}
            style={[styles.photoSelectBox, photoSelected && styles.photoSelectBoxActive]}
          >
            <AppIcon name="paw" size={18} color={photoSelected ? '#10B981' : TOKENS.colors.textMuted} />
            <Text style={[styles.photoSelectText, photoSelected && { color: '#065F46', fontWeight: '700' }]}>
              {photoSelected ? '📷 대표 사진 등록 완료' : '📷 대표 사진 등록하기 (터치)'}
            </Text>
          </TouchableOpacity>

          <GradientButton fullWidth onPress={handleStep2Next} style={{ marginTop: 20 }}>
            등록하고 위치 동의로 →
          </GradientButton>
        </View>
      )}

      {/* 3단계: 위치 권한 동의 */}
      {currentStep === 3 && (
        <View style={styles.stepCard}>
          <Text style={styles.stepBadge}>Step 3. 산책 시작 위치 동의</Text>
          <Text style={styles.stepTitle}>안심 보행로 위치 권한 📍</Text>
          <Text style={styles.stepSubtitle}>
            내 위치 기반 지면온도와 계단 없는 맞춤 길을 실시간으로 안내합니다.
          </Text>

          <View style={styles.privacyBox}>
            <View style={styles.privacyHeader}>
              <AppIcon name="lock" size={16} color={TOKENS.colors.primaryDark} />
              <Text style={styles.privacyTitle}>집 주변 200m 자동 안심 보호</Text>
            </View>
            <Text style={styles.privacyDesc}>
              출발·도착지 200m 구간은 이웃에게 노출되지 않도록 자동 가림 처리되어 사생활이 안전합니다.
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setLocationAgreed(!locationAgreed)}
            style={styles.agreeRow}
          >
            <View style={[styles.checkbox, locationAgreed && styles.checkboxActive]}>
              {locationAgreed && <Text style={styles.checkIcon}>✓</Text>}
            </View>
            <Text style={styles.agreeText}>
              [필수] 실시간 보행 내비게이션 위치 정보 수집 동의
            </Text>
          </TouchableOpacity>

          <GradientButton fullWidth onPress={handleStep3Next} style={{ marginTop: 20 }}>
            위치 동의하고 주변 지도 탐색 →
          </GradientButton>
        </View>
      )}

      {/* 4단계: 주변 코스/산책견 지도 탐색 */}
      {currentStep === 4 && (
        <NearbyExploreMapView dogName={dogName} onStartFirstWalk={handleFinish} />
      )}

      {/* 약관 및 개인정보보호정책 모달 */}
      <LegalTermsModal
        visible={legalModalVisible}
        initialTab={legalModalTab}
        onClose={() => setLegalModalVisible(false)}
        onAccept={() => {
          if (legalModalTab === 'terms') {
            setTermsAgreed(true);
          } else {
            setPrivacyAgreed(true);
          }
        }}
        showAcceptButton
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.background,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },
  topNav: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLogo: { fontSize: 15, fontWeight: '800', color: TOKENS.colors.primaryDark },
  stepCounter: { fontSize: 12, fontWeight: '700', color: TOKENS.colors.textMuted },
  stepProgressRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 10,
  },
  stepProgressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: TOKENS.colors.border,
  },
  stepProgressBarActive: {
    backgroundColor: TOKENS.colors.primary,
  },
  stepCard: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  stepBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
    marginBottom: 6,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    lineHeight: 17,
    marginBottom: 16,
  },
  input: {
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: TOKENS.colors.textMain,
  },
  agreeRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  viewLinkBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: TOKENS.colors.primaryLight,
  },
  viewLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: TOKENS.colors.primary,
    borderColor: TOKENS.colors.primary,
  },
  checkIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  agreeText: {
    fontSize: 12,
    color: TOKENS.colors.textMain,
    fontWeight: '500',
    flex: 1,
  },
  photoSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  photoSelectBoxActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  photoSelectText: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
  },
  privacyBox: {
    backgroundColor: TOKENS.colors.primaryLight,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.colors.primary,
    marginBottom: 12,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  privacyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  privacyDesc: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    lineHeight: 15,
  },
});

