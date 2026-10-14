/**
 * [편안하개 - PetWalk]
 * 팀장 컨펌 4단계 온보딩 위저드 (T2-ONBOARD-FLOW)
 *
 * 1단계: 가입약관 및 로그인/이메일 인증
 * 2단계: 반려견 프로필 등록 (이름, 견종, 체중, 사진)
 * 3단계: 산책 시작 위치 권한 동의 및 200m 프라이버시 고지
 * 4단계: 주변 코스 및 실시간 산책견 지도 탐색 (NearbyExploreMapView)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, BackHandler, ScrollView } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { GradientButton } from '../common/GradientButton';
import { AppIcon } from '../common/AppIcon';
import { DogProfile, calculateRecommendedSpeedKmH } from '../../types/dogProfile';
import { SupabaseService } from '../../services/supabaseService';
import { NearbyExploreMapView } from './NearbyExploreMapView';
import { LegalTermsModal, LegalTabType } from '../common/LegalTermsModal';
import { DogAvatar } from '../common/DogAvatar';
import { PhotoPickerModal } from '../profile/PhotoPickerModal';

import { generateUuid } from '../../utils/uuid';
export interface OnboardingWizardProps {
  onComplete: (registeredDog?: DogProfile) => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // 안드로이드 하드웨어 뒤로가기 버튼 처리
  useEffect(() => {
    const onBackPress = () => {
      if (currentStep > 1) {
        setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [currentStep]);

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
    }
  };

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
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);

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
      id: generateUuid(),
      name: dogName.trim() || '초코',
      breed: breed.trim() || '골든 리트리버',
      ageYears: 3,
      weightKg: weight,
      jointCareLevel: 1,
      speedKmH: speed,
      photoUri: photoUri,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await SupabaseService.saveDogProfile({
      id: newDog.id,
      name: newDog.name,
      breed: newDog.breed,
      weight_kg: weight,
      photo_path: newDog.photoUri,
    });

    onComplete(newDog);
  };

  return (
    <View style={styles.container}>
      {/* 상단 4단계 인디케이터 헤더 그룹 (타이틀 + 이전 버튼 + 진행 바 일체화) */}
      <View style={styles.headerGroup}>
        <View style={styles.topNav}>
          {currentStep > 1 ? (
            <TouchableOpacity
              onPress={handleBack}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="이전 단계로 이동"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppIcon name="back" size={20} color={TOKENS.colors.primaryDark} strokeWidth={2.4} />
              <Text style={styles.backButtonText}>이전</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.topLogo}>🐾 편안하개 시작하기</Text>
          )}

          {currentStep > 1 && (
            <Text style={styles.topLogoCompact}>🐾 편안하개 시작하기</Text>
          )}

          <Text style={styles.stepCounter}>{currentStep} / 4 단계</Text>
        </View>

        <View style={styles.stepProgressRow}>
          {[1, 2, 3, 4].map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => s < currentStep && setCurrentStep(s as 1 | 2 | 3 | 4)}
              disabled={s >= currentStep}
              style={[
                styles.stepProgressBar,
                s <= currentStep && styles.stepProgressBarActive,
                s < currentStep && styles.stepProgressBarClickable,
              ]}
              accessibilityLabel={`${s}단계로 이동`}
              accessibilityRole={s < currentStep ? 'button' : undefined}
            />
          ))}
        </View>
      </View>

      {/* 스텝별 콘텐츠 영역 (스크롤 지원으로 하단 잘림 완전 방지) */}
      <ScrollView
        style={styles.stepScrollView}
        contentContainerStyle={styles.stepContentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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

            <GradientButton fullWidth onPress={handleStep1Next} style={{ marginTop: 16 }}>
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
              onPress={() => setPhotoPickerVisible(true)}
              style={[styles.photoSelectBox, Boolean(photoUri) && styles.photoSelectBoxActive]}
            >
              <DogAvatar photoUri={photoUri} size={36} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.photoSelectText, Boolean(photoUri) && { color: '#065F46', fontWeight: '700' }]}>
                  {photoUri ? '✓ 대표 사진 선택 완료' : '📷 대표 사진 등록하기 (터치)'}
                </Text>
                <Text style={{ fontSize: 10.5, color: TOKENS.colors.textMuted, marginTop: 2 }}>
                  {photoUri ? '터치하여 다른 사진이나 캐릭터로 변경' : '앨범 사진 또는 귀여운 견종 캐릭터'}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: TOKENS.colors.primaryDark, fontWeight: '700' }}>
                {photoUri ? '변경' : '선택'}
              </Text>
            </TouchableOpacity>

            <GradientButton fullWidth onPress={handleStep2Next} style={{ marginTop: 16 }}>
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

            <GradientButton fullWidth onPress={handleStep3Next} style={{ marginTop: 16 }}>
              위치 동의하고 주변 지도 탐색 →
            </GradientButton>
          </View>
        )}

        {/* 4단계: 주변 코스/산책견 지도 탐색 */}
        {currentStep === 4 && (
          <NearbyExploreMapView dogName={dogName} onStartFirstWalk={handleFinish} />
        )}
      </ScrollView>

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

      {/* 대표 사진 선택 모달 */}
      <PhotoPickerModal
        visible={photoPickerVisible}
        currentPhotoUri={photoUri}
        onClose={() => setPhotoPickerVisible(false)}
        onSelectPhoto={(uri) => setPhotoUri(uri)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.background,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerGroup: {
    marginBottom: 8,
  },
  topNav: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLogo: { fontSize: 16, fontWeight: '800', color: TOKENS.colors.primaryDark },
  topLogoCompact: { fontSize: 14, fontWeight: '800', color: TOKENS.colors.textMain },
  stepCounter: { fontSize: 12, fontWeight: '700', color: TOKENS.colors.textMuted },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingRight: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  stepProgressRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    marginBottom: 2,
  },
  stepProgressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: TOKENS.colors.border,
  },
  stepProgressBarActive: {
    backgroundColor: TOKENS.colors.primary,
  },
  stepProgressBarClickable: {
    opacity: 0.85,
  },
  stepScrollView: {
    flex: 1,
  },
  stepContentContainer: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: 20,
  },
  stepCard: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: 18,
    padding: 18,
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

