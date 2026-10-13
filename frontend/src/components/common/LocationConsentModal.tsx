/**
 * [편안하개 - PetWalk]
 * 위치 정보 수집 동의 및 Local-First 투명 고지 팝업 모달 (US-23)
 */

import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { AppIcon, AppIconName } from './AppIcon';
import { LocationConsentController } from '../../hooks/useLocationConsent';

export interface LocationConsentModalProps {
  controller: LocationConsentController;
}

interface NoticeItem {
  icon: AppIconName;
  title: string;
  desc: string;
}

const NOTICES: NoticeItem[] = [
  {
    icon: 'location',
    title: '산책 중 맞춤 안내 및 통계',
    desc: '30m 전 음성 코칭 및 이동 거리·시간 측정을 위해 산책 중에만 위치를 확인합니다.',
  },
  {
    icon: 'lock',
    title: '스마트폰에만 안전하게 보관',
    desc: '상세 이동 경로는 외부 서버로 전송되지 않으며, 오직 내 스마트폰에만 안전하게 보관됩니다.',
  },
  {
    icon: 'shield',
    title: '출발·도착지 200m 안심 마스킹',
    desc: '이웃과 추천 코스를 공유할 때도 자택 위치 보호를 위해 출발지와 도착지 200m 반경이 자동 블러링됩니다.',
  },
];

export const LocationConsentModal: React.FC<LocationConsentModalProps> = ({ controller }) => {
  return (
    <Modal
      visible={controller.visible}
      transparent
      animationType="fade"
      onRequestClose={controller.decline}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>안심 프라이버시 약속</Text>
            </View>
            <Text style={styles.title}>위치 정보 수집 및 보호 안내</Text>
            <Text style={styles.subtitle}>
              편안하개는 보호자와 반려견의 프라이버시를 최우선으로 보호합니다.
            </Text>
          </View>

          <View style={styles.noticeList}>
            {NOTICES.map((item) => (
              <View key={item.title} style={styles.noticeRow}>
                <View style={styles.iconCircle}>
                  <AppIcon name={item.icon} size={18} color={TOKENS.colors.primaryDark} />
                </View>
                <View style={styles.textCol}>
                  <Text style={styles.noticeTitle}>{item.title}</Text>
                  <Text style={styles.noticeDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.cancelButton}
              activeOpacity={0.7}
              onPress={controller.decline}
            >
              <Text style={styles.cancelText}>나중에 하기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
              activeOpacity={0.8}
              onPress={() => void controller.agree()}
            >
              <Text style={styles.confirmText}>동의하고 계속하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
        } as any)
      : {}),
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    padding: 22,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    ...(Platform.OS === 'web'
      ? ({
          zIndex: 100000,
        } as any)
      : {}),
  },
  header: {
    marginBottom: 16,
    alignItems: 'center',
  },
  badge: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.borderRadius.badge,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
  noticeList: {
    gap: 12,
    marginBottom: 20,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: TOKENS.colors.background,
    padding: 12,
    borderRadius: TOKENS.borderRadius.button,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    gap: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TOKENS.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    marginBottom: 2,
  },
  noticeDesc: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    lineHeight: 16,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: TOKENS.borderRadius.button,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    backgroundColor: TOKENS.colors.surface,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  confirmButton: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: TOKENS.borderRadius.button,
    backgroundColor: TOKENS.colors.primary,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.surface,
  },
});
