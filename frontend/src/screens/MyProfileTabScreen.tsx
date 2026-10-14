/**
 * [편안하개 - PetWalk]
 * 모바일 마이 프로필 탭 화면 (US-A2, US-E3, US-G2, US-THEME)
 *
 * 3대 테마 선택(숲길/비비드 바이올렛/다크), 컴팩트 세그먼트 탭(스크롤 배제), 산책 기록 및 프로필 관리
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { DogProfile } from '../types/dogProfile';
import { CardWrapper } from '../components/common/CardWrapper';
import { BackupService } from '../services/backupService';
import { BookmarkListView } from '../components/bookmark/BookmarkListView';
import { BookmarkedRoute } from '../types/bookmark';
import { DataResetCard } from '../components/privacy/DataResetCard';
import { FeedbackSummaryPayload } from '../services/feedbackContext';
import { DogProfileEditCard } from '../components/profile/DogProfileEditCard';
import { MyWalkHistoryView } from '../components/profile/MyWalkHistoryView';
import { ThemeSelectorCard } from '../components/profile/ThemeSelectorCard';
import { SupabaseService } from '../services/supabaseService';
import { useAppTheme } from '../theme/themeManager';
import { LegalTermsModal, LegalTabType } from '../components/common/LegalTermsModal';

export interface MyProfileTabScreenProps {
  dog: DogProfile;
  feedbackSummary?: FeedbackSummaryPayload | null;
  onSaveDog: (fields: Partial<DogProfile>) => void;
  onInjectFeedback: (dissatisfied: boolean) => void;
  onResetFeedback?: () => void;
  onStartBookmark: (bookmark: BookmarkedRoute) => void;
  onResetData?: () => Promise<void>;
  onOpenOnboarding?: () => void;
  onOpenAuthModal?: () => void;
}

type SubTabKey = 'profile_theme' | 'walk_records' | 'settings';

export const MyProfileTabScreen: React.FC<MyProfileTabScreenProps> = ({
  dog, feedbackSummary, onSaveDog, onInjectFeedback, onResetFeedback, onStartBookmark, onResetData, onOpenOnboarding, onOpenAuthModal,
}) => {
  const [subTab, setSubTab] = useState<SubTabKey>('profile_theme');
  const [resetCount, setResetCount] = useState(0);
  const [legalVisible, setLegalVisible] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTabType>('terms');
  const currentUser = SupabaseService.getCurrentUser();
  const { colors } = useAppTheme();

  const handleBackupDownload = () => {
    const ok = BackupService.downloadProfileJsonFile(dog);
    if (ok) {
      Alert.alert('프로필 저장 완료', `🐾 ${dog.name} 프로필 파일이 기기에 다운로드되었습니다.`);
    } else {
      const jsonStr = BackupService.exportProfileToJson(dog);
      Alert.alert('프로필 내보내기', `백업 데이터가 생성되었습니다:\n${jsonStr.slice(0, 80)}...`);
    }
  };

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>반려견 안심 케어 프로필</Text>
        <Text style={[styles.sectionTitle, { color: colors.textMain }]}>우리 아이 정보 & 테마 설정 🐾</Text>
      </View>

      {/* 🚀 Rule 11 컴팩트 세그먼트 네비게이션 (스크롤 방지) */}
      <View style={[styles.segmentContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setSubTab('profile_theme')}
          style={[styles.segmentBtn, subTab === 'profile_theme' && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
        >
          <Text style={[styles.segmentText, subTab === 'profile_theme' && { color: colors.primaryDark, fontWeight: '700' }]}>
            🐾 프로필·테마
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSubTab('walk_records')}
          style={[styles.segmentBtn, subTab === 'walk_records' && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
        >
          <Text style={[styles.segmentText, subTab === 'walk_records' && { color: colors.primaryDark, fontWeight: '700' }]}>
            📜 산책 기록
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSubTab('settings')}
          style={[styles.segmentBtn, subTab === 'settings' && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
        >
          <Text style={[styles.segmentText, subTab === 'settings' && { color: colors.primaryDark, fontWeight: '700' }]}>
            ⚙️ 설정·보관함
          </Text>
        </TouchableOpacity>
      </View>

      {/* 서브탭 1: 프로필 & 3대 테마 선택 & 계정 상태 (한 화면 컴팩트 뷰) */}
      {subTab === 'profile_theme' && (
        <View>
          <CardWrapper variant="flat" style={styles.accountCard}>
            <View style={styles.accountRow}>
              <View>
                <Text style={[styles.accountTitle, { color: colors.textMain }]}>☁️ Supabase 클라우드 계정</Text>
                <Text style={[styles.accountSubtitle, { color: colors.textMuted }]}>
                  {currentUser ? `${currentUser.email} (로그인됨)` : '로컬 게스트 모드 (비로그인)'}
                </Text>
              </View>
              {onOpenAuthModal && (
                <TouchableOpacity onPress={onOpenAuthModal} style={[styles.accountBtn, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.accountBtnText, { color: colors.primaryDark }]}>{currentUser ? '계정 전환' : '로그인'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </CardWrapper>

          {/* 🎨 3대 컬러 테마 선택기 */}
          <ThemeSelectorCard />

          {/* 반려견 프로필 편집 카드 */}
          <DogProfileEditCard dog={dog} onSaveDog={onSaveDog} />
        </View>
      )}

      {/* 서브탭 2: 산책 기록 목록 및 커뮤니티 공개(is_public) 토글 (US-G2) */}
      {subTab === 'walk_records' && (
        <View>
          <MyWalkHistoryView dogName={dog.name} />
        </View>
      )}

      {/* 서브탭 3: 즐겨찾기, 파일 백업, AI 시뮬레이터 및 데이터 초기화 */}
      {subTab === 'settings' && (
        <View>
          <BookmarkListView key={resetCount} onStartBookmark={onStartBookmark} dogSpeedKmH={dog.speedKmH} />

          <CardWrapper variant="flat" style={{ marginBottom: 12 }}>
            <Text style={[styles.cardHeaderTitle, { color: colors.textMain }]}>💾 반려견 프로필 백업 및 복원</Text>
            <Text style={[styles.backupDesc, { color: colors.textMuted }]}>
              소중한 반려견 프로필을 내 스마트폰 파일로 안전하게 보관합니다.
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleBackupDownload}
              style={[styles.simButton, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint, marginTop: 8 }]}
            >
              <Text style={{ color: colors.primaryDark, fontSize: 12, fontWeight: '700' }}>📥 프로필 파일로 저장</Text>
            </TouchableOpacity>
          </CardWrapper>

          <CardWrapper variant="flat" style={{ marginBottom: 12 }}>
            <Text style={[styles.cardHeaderTitle, { color: colors.textMain }]}>🧪 [테스트] AI 산책로 보정 시뮬레이터</Text>
            {feedbackSummary && (
              <View style={styles.simStatusBadge}>
                <Text style={styles.simStatusText}>
                  최근 {feedbackSummary.recent_walk_count}회 · 경사 불만족 {feedbackSummary.slope_dissatisfaction_count}회 (보정: {feedbackSummary.recommended_max_slope_offset}%)
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => onInjectFeedback(true)}
                style={[styles.simButton, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', flex: 1 }]}
              >
                <Text style={{ color: '#991B1B', fontSize: 11, fontWeight: '600' }}>+ "경사 부담"</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onInjectFeedback(false)}
                style={[styles.simButton, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint, flex: 1 }]}
              >
                <Text style={{ color: colors.primaryDark, fontSize: 11, fontWeight: '600' }}>+ "완만한 길"</Text>
              </TouchableOpacity>
              {onResetFeedback && (
                <TouchableOpacity
                  onPress={onResetFeedback}
                  style={[styles.simButton, { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB', flex: 1 }]}
                >
                  <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '600' }}>↺ 리셋</Text>
                </TouchableOpacity>
              )}
            </View>
          </CardWrapper>

          {/* 📜 약관 및 개인정보 정책 카드 */}
          <CardWrapper variant="flat" style={{ marginBottom: 12 }}>
            <Text style={[styles.cardHeaderTitle, { color: colors.textMain }]}>📜 약관 및 개인정보 정책</Text>
            <Text style={[styles.backupDesc, { color: colors.textMuted }]}>
              편안하개의 Local-First 프라이버시 원칙과 서비스 이용약관을 확인할 수 있습니다.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => { setLegalTab('terms'); setLegalVisible(true); }}
                style={[styles.simButton, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}
              >
                <Text style={{ color: colors.textMain, fontSize: 12, fontWeight: '700' }}>📄 회원가입 약관</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => { setLegalTab('privacy'); setLegalVisible(true); }}
                style={[styles.simButton, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}
              >
                <Text style={{ color: colors.textMain, fontSize: 12, fontWeight: '700' }}>🔒 개인정보보호정책</Text>
              </TouchableOpacity>
            </View>
          </CardWrapper>

          {onOpenOnboarding && (
            <CardWrapper variant="flat" style={{ marginBottom: 12 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onOpenOnboarding}
                style={[styles.simButton, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint }]}
              >
                <Text style={{ color: colors.primaryDark, fontSize: 12, fontWeight: '700' }}>
                  📖 4단계 온보딩 플로우 다시 보기 (가입·등록·위치·지도)
                </Text>
              </TouchableOpacity>
            </CardWrapper>
          )}

          {onResetData && (
            <DataResetCard onReset={onResetData} onCompleted={() => setResetCount((c) => c + 1)} />
          )}
        </View>
      )}

      {/* 약관 및 개인정보보호정책 열람 모달 */}
      <LegalTermsModal
        visible={legalVisible}
        initialTab={legalTab}
        onClose={() => setLegalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: { marginBottom: 10 },
  sectionSubtitle: { fontSize: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  accountCard: { marginBottom: 10, paddingVertical: 10 },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accountTitle: { fontSize: 12, fontWeight: '700' },
  accountSubtitle: { fontSize: 10, marginTop: 2 },
  accountBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  accountBtnText: { fontSize: 10, fontWeight: '700' },
  cardHeaderTitle: { fontSize: 13, fontWeight: '700' },
  backupDesc: { fontSize: 11, marginTop: 2, lineHeight: 16 },
  simButton: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  simStatusBadge: { backgroundColor: '#F3F4F6', padding: 6, borderRadius: 6, marginTop: 6 },
  simStatusText: { fontSize: 10, color: '#6B7280', fontWeight: '600' },
});
