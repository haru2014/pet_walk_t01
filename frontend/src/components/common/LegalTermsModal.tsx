/**
 * [편안하개 - PetWalk]
 * 회원가입약관 및 개인정보보호정책 열람 모달 컴포넌트
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from './AppIcon';
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from '../../constants/legalTerms';

export type LegalTabType = 'terms' | 'privacy';

export interface LegalTermsModalProps {
  readonly visible: boolean;
  readonly initialTab?: LegalTabType;
  readonly onClose: () => void;
  readonly onAccept?: () => void;
  readonly showAcceptButton?: boolean;
}

export const LegalTermsModal: React.FC<LegalTermsModalProps> = ({
  visible,
  initialTab = 'terms',
  onClose,
  onAccept,
  showAcceptButton = false,
}) => {
  const { colors } = useAppTheme();
  const [activeTab, setActiveTab] = useState<LegalTabType>(initialTab);

  // 모달이 열릴 때 초기 탭 동기화
  React.useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

  const contentText = activeTab === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY;
  const contentTitle = activeTab === 'terms' ? '회원가입 및 서비스 이용약관' : '개인정보보호정책 (처리방침)';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          {/* 헤더 */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTitleWrap}>
              <AppIcon name="lock" size={18} color={colors.primary} />
              <Text style={[styles.headerTitle, { color: colors.textMain }]}>
                약관 및 정책 안내
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[styles.closeIcon, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 세그먼트 탭 */}
          <View style={[styles.tabBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('terms')}
              style={[
                styles.tabBtn,
                activeTab === 'terms' && [styles.tabBtnActive, { backgroundColor: colors.primary }],
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === 'terms' ? colors.textWhite : colors.textMuted },
                  activeTab === 'terms' && styles.tabTextActive,
                ]}
              >
                회원가입 약관
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveTab('privacy')}
              style={[
                styles.tabBtn,
                activeTab === 'privacy' && [styles.tabBtnActive, { backgroundColor: colors.primary }],
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === 'privacy' ? colors.textWhite : colors.textMuted },
                  activeTab === 'privacy' && styles.tabTextActive,
                ]}
              >
                개인정보보호정책
              </Text>
            </TouchableOpacity>
          </View>

          {/* 본문 소제목 */}
          <View style={styles.subHeader}>
            <Text style={[styles.subTitle, { color: colors.textMain }]}>{contentTitle}</Text>
            <Text style={[styles.policyNotice, { color: colors.textMuted }]}>
              {activeTab === 'terms'
                ? 'Local-First 및 위치기반서비스 규정 포함'
                : '200m 공간 마스킹 및 단말기 격리 보관 원칙'}
            </Text>
          </View>

          {/* 본문 스크롤 영역 */}
          <ScrollView style={[styles.contentScroll, { backgroundColor: colors.background }]}>
            <Text style={[styles.bodyText, { color: colors.textMain }]}>{contentText}</Text>
            <View style={{ height: 24 }} />
          </ScrollView>

          {/* 하단 액션 버튼 */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            {showAcceptButton && onAccept ? (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onClose}
                  style={[styles.outlineBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.outlineBtnText, { color: colors.textMuted }]}>닫기</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    onAccept();
                    onClose();
                  }}
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.primaryBtnText}>동의하고 닫기</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onClose}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, width: '100%' }]}
              >
                <Text style={styles.primaryBtnText}>확인</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  closeIcon: {
    fontSize: 18,
    fontWeight: '600',
    padding: 4,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    fontWeight: '800',
  },
  subHeader: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  subTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  policyNotice: {
    fontSize: 11,
    marginTop: 2,
  },
  contentScroll: {
    marginHorizontal: 16,
    marginTop: 6,
    borderRadius: 12,
    padding: 14,
    maxHeight: 380,
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  outlineBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
