/**
 * [편안하개 - PetWalk]
 * 모바일 마이 프로필 탭 화면 (US-A2, US-E3, US-G2, US-THEME)
 *
 * 3대 테마 선택(숲길/비비드 바이올렛/다크), 컴팩트 세그먼트 탭(스크롤 배제), 산책 기록 및 프로필 관리
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { DogProfile } from '../types/dogProfile';
import { CardWrapper } from '../components/common/CardWrapper';
import { BookmarkListView } from '../components/bookmark/BookmarkListView';
import { BookmarkedRoute } from '../types/bookmark';
import { DataResetCard } from '../components/privacy/DataResetCard';
import { FeedbackSummaryPayload } from '../services/feedbackContext';
import { DogProfileEditCard } from '../components/profile/DogProfileEditCard';
import { DataBackupRestoreCard } from '../components/profile/DataBackupRestoreCard';
import { MyWalkHistoryView } from '../components/profile/MyWalkHistoryView';
import { ThemeSelectorCard } from '../components/profile/ThemeSelectorCard';
import { SupabaseService } from '../services/supabaseService';
import { useAppTheme } from '../theme/themeManager';
import { useAppResponsive } from '../hooks/useAppResponsive';
import { LegalTermsModal, LegalTabType } from '../components/common/LegalTermsModal';
import { VoiceSettingCard } from '../components/voice/VoiceSettingCard';
import { WeeklyWalkReportCard, RecentWalkInfo } from '../components/home/WeeklyWalkReportCard';
import { WalkStatisticsService, WeeklyWalkStats } from '../services/walkStatisticsService';
import { LocalStorageService } from '../services/storage';

export interface MyProfileTabScreenProps {
  dog: DogProfile;
  dogs?: readonly DogProfile[];
  selectedDogId?: string;
  onSelectDog?: (dogId: string) => void;
  onAddDog?: (newDog: DogProfile) => void;
  feedbackSummary?: FeedbackSummaryPayload | null;
  onSaveDog: (fields: Partial<DogProfile>) => void;
  onDeleteDog?: (dogId: string) => void | Promise<void>;
  onInjectFeedback: (dissatisfied: boolean) => void;
  onResetFeedback?: () => void;
  onStartBookmark: (bookmark: BookmarkedRoute) => void;
  onResetData?: () => Promise<void>;
  onOpenOnboarding?: () => void;
  onOpenAuthModal?: (mode?: 'signup' | 'signin') => void;
  initialSubTab?: SubTabKey;
}

export type SubTabKey = 'dog_profile' | 'theme_account' | 'walk_records' | 'settings';

interface AccountAuthActionsProps {
  currentUser: ReturnType<typeof SupabaseService.getCurrentUser>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  onOpenAuthModal?: (mode?: 'signup' | 'signin') => void;
  onSignOut?: () => void;
}

const AccountAuthActions: React.FC<AccountAuthActionsProps> = ({
  currentUser,
  colors,
  onOpenAuthModal,
  onSignOut,
}) => {
  if (currentUser) {
    return (
      <View style={styles.authBtnGroup}>
        {onOpenAuthModal && (
          <TouchableOpacity
            onPress={() => onOpenAuthModal('signin')}
            style={[styles.accountBtn, { backgroundColor: colors.primaryLight }]}
            accessibilityRole="button"
            accessibilityLabel="계정 전환"
          >
            <Text style={[styles.accountBtnText, { color: colors.primaryDark }]}>계정 전환</Text>
          </TouchableOpacity>
        )}
        {onSignOut && (
          <TouchableOpacity
            onPress={onSignOut}
            style={[styles.accountBtn, styles.logoutBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="로그아웃"
          >
            <Text style={[styles.accountBtnText, { color: colors.textMuted }]}>로그아웃</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (!onOpenAuthModal) return null;

  return (
    <View style={styles.authBtnGroup}>
      <TouchableOpacity
        onPress={() => onOpenAuthModal('signup')}
        style={[styles.accountBtn, { backgroundColor: colors.primary }]}
        accessibilityRole="button"
        accessibilityLabel="회원가입"
      >
        <Text style={[styles.accountBtnText, { color: '#FFFFFF' }]}>회원가입</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onOpenAuthModal('signin')}
        style={[styles.accountBtn, { backgroundColor: colors.primaryLight }]}
        accessibilityRole="button"
        accessibilityLabel="로그인"
      >
        <Text style={[styles.accountBtnText, { color: colors.primaryDark }]}>로그인</Text>
      </TouchableOpacity>
    </View>
  );
};

interface SettingsSubTabSectionProps {
  colors: ReturnType<typeof useAppTheme>['colors'];
  feedbackSummary?: FeedbackSummaryPayload | null;
  onInjectFeedback: (dissatisfied: boolean) => void;
  onResetFeedback?: () => void;
  onOpenOnboarding?: () => void;
  onResetData?: () => Promise<void>;
  onOpenLegal: (tab: LegalTabType) => void;
  onResetCompleted: () => void;
}

const SettingsSubTabSection: React.FC<SettingsSubTabSectionProps> = ({
  colors,
  feedbackSummary,
  onInjectFeedback,
  onResetFeedback,
  onOpenOnboarding,
  onResetData,
  onOpenLegal,
  onResetCompleted,
}) => (
  <ScrollView
    style={styles.tabScrollContainer}
    contentContainerStyle={styles.scrollContent}
    showsVerticalScrollIndicator={false}
    nestedScrollEnabled={true}
  >
    {/* 🎙️ AI 음성 가이드 보이스 프로필 & 미리듣기 (US-C2, #37) */}
    <VoiceSettingCard style={{ marginBottom: 10 }} />

    <CardWrapper variant="flat" style={{ marginBottom: 8 }}>
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
          <Text style={{ color: '#991B1B', fontSize: 11, fontWeight: '600' }}>+ &quot;경사 부담&quot;</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onInjectFeedback(false)}
          style={[styles.simButton, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint, flex: 1 }]}
        >
          <Text style={{ color: colors.primaryDark, fontSize: 11, fontWeight: '600' }}>+ &quot;완만한 길&quot;</Text>
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
    <CardWrapper variant="flat" style={{ marginBottom: 8 }}>
      <Text style={[styles.cardHeaderTitle, { color: colors.textMain }]}>📜 약관 및 개인정보 정책</Text>
      <Text style={[styles.backupDesc, { color: colors.textMuted }]}>
        편안하개의 Local-First 프라이버시 원칙과 서비스 이용약관을 확인할 수 있습니다.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onOpenLegal('terms')}
          style={[styles.simButton, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}
        >
          <Text style={{ color: colors.textMain, fontSize: 12, fontWeight: '700' }}>📄 회원가입 약관</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onOpenLegal('privacy')}
          style={[styles.simButton, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}
        >
          <Text style={{ color: colors.textMain, fontSize: 12, fontWeight: '700' }}>🔒 개인정보보호정책</Text>
        </TouchableOpacity>
      </View>
    </CardWrapper>

    {onOpenOnboarding && (
      <CardWrapper variant="flat" style={{ marginBottom: 8 }}>
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
      <DataResetCard onReset={onResetData} onCompleted={onResetCompleted} />
    )}

  </ScrollView>
);

const confirmAndSignOut = (onSuccess: () => void) => {
  const title = '로그아웃';
  const message = '로그아웃하시겠습니까?\n\n💡 기기에 저장된 우리 강아지 프로필과 최근 산책 기록은 로컬에 안전하게 유지됩니다.';

  const performSignOut = async () => {
    try {
      await SupabaseService.signOut();
      onSuccess();
      const successMsg = '정상적으로 로그아웃되었습니다.\n오프라인 안심 게스트 모드로 계속 이용하실 수 있습니다.';
      if (Platform.OS === 'web') {
        window.alert(successMsg);
      } else {
        Alert.alert('로그아웃 완료', successMsg);
      }
    } catch {
      const errMsg = '로그아웃 처리 중 오류가 발생했습니다.';
      if (Platform.OS === 'web') {
        window.alert(errMsg);
      } else {
        Alert.alert('오류', errMsg);
      }
    }
  };

  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      void performSignOut();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    {
      text: '로그아웃',
      style: 'destructive',
      onPress: () => {
        void performSignOut();
      },
    },
  ]);
};

export const MyProfileTabScreen: React.FC<MyProfileTabScreenProps> = ({
  dog,
  dogs,
  selectedDogId,
  onSelectDog,
  onAddDog,
  feedbackSummary,
  onSaveDog,
  onDeleteDog,
  onInjectFeedback,
  onResetFeedback,
  onStartBookmark,
  onResetData,
  onOpenOnboarding,
  onOpenAuthModal,
  initialSubTab,
}) => {
  const [subTab, setSubTab] = useState<SubTabKey>(initialSubTab || 'dog_profile');

  const [walkSubFilter, setWalkSubFilter] = useState<'history' | 'bookmarks'>('history');
  const [resetCount, setResetCount] = useState(0);
  const [legalVisible, setLegalVisible] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTabType>('terms');
  const [currentUser, setCurrentUser] = useState(() => SupabaseService.getCurrentUser());
  const { colors } = useAppTheme();
  const { myProfile } = useAppResponsive();

  const [weeklyStats, setWeeklyStats] = useState<WeeklyWalkStats>(() =>
    WalkStatisticsService.getWeeklyStats([])
  );
  const [recentStats, setRecentStats] = useState<RecentWalkInfo | null>(null);

  useEffect(() => {
    let isMounted = true;
    void LocalStorageService.getWalkHistory().then((history) => {
      if (!isMounted) return;
      if (history.length === 0) {
        setWeeklyStats(WalkStatisticsService.getWeeklyStats([]));
        setRecentStats(null);
        return;
      }
      setWeeklyStats(WalkStatisticsService.getWeeklyStats(history));
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayList = history.filter((r) => r.completedAt.slice(0, 10) === todayStr);

      if (todayList.length > 0) {
        const totalDist = todayList.reduce((acc, r) => acc + r.totalDistanceKm, 0);
        const totalDur = todayList.reduce((acc, r) => acc + r.durationMinutes, 0);
        const avgSafe = Math.round(
          (todayList.reduce((acc, r) => acc + r.safeSurfaceRatio, 0) / todayList.length) * 100
        );
        setRecentStats({
          title: `오늘의 완주 (${todayList.length}회)`,
          distanceKm: Math.round(totalDist * 10) / 10,
          durationMinutes: totalDur,
          safeRatioPercent: avgSafe,
        });
      } else {
        const latest = history[0];
        const dateStr = new Date(latest.completedAt).toLocaleDateString('ko-KR', {
          month: 'numeric',
          day: 'numeric',
        });
        setRecentStats({
          title: `직전 완주 (${dateStr})`,
          distanceKm: Math.round(latest.totalDistanceKm * 10) / 10,
          durationMinutes: latest.durationMinutes,
          safeRatioPercent: Math.round(latest.safeSurfaceRatio * 100),
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [resetCount, subTab]);

  const handleSubTabChange = (nextSubTab: SubTabKey) => {
    setSubTab(nextSubTab);
    setCurrentUser(SupabaseService.getCurrentUser());
  };

  const handleSignOut = () => {
    confirmAndSignOut(() => {
      setCurrentUser(null);
    });
  };
  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: myProfile.containerPaddingH }]}>
      {/* 상단 헤더 */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>반려견 안심 케어 프로필</Text>
        <Text style={[styles.sectionTitle, { color: colors.textMain }]}>우리 강아지 정보 & 테마 설정 🐾</Text>
      </View>

      {/* 🚀 Rule 11 컴팩트 세그먼트 네비게이션 (단일 뷰포트 / 스크롤 배제 4단 세그먼트) */}
      <View style={[styles.segmentContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => handleSubTabChange('dog_profile')}
          style={[styles.segmentBtn, { paddingVertical: myProfile.segmentPaddingV }, subTab === 'dog_profile' && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.segmentText,
              { fontSize: myProfile.segmentFontSize, color: subTab === 'dog_profile' ? colors.primaryDark : colors.textMuted },
              subTab === 'dog_profile' && { fontWeight: '700' },
            ]}
          >
            🐾 프로필
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleSubTabChange('theme_account')}
          style={[styles.segmentBtn, { paddingVertical: myProfile.segmentPaddingV }, subTab === 'theme_account' && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.segmentText,
              { fontSize: myProfile.segmentFontSize, color: subTab === 'theme_account' ? colors.primaryDark : colors.textMuted },
              subTab === 'theme_account' && { fontWeight: '700' },
            ]}
          >
            🎨 테마·계정
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleSubTabChange('walk_records')}
          style={[styles.segmentBtn, { paddingVertical: myProfile.segmentPaddingV }, subTab === 'walk_records' && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.segmentText,
              { fontSize: myProfile.segmentFontSize, color: subTab === 'walk_records' ? colors.primaryDark : colors.textMuted },
              subTab === 'walk_records' && { fontWeight: '700' },
            ]}
          >
            📜 활동
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleSubTabChange('settings')}
          style={[styles.segmentBtn, { paddingVertical: myProfile.segmentPaddingV }, subTab === 'settings' && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.segmentText,
              { fontSize: myProfile.segmentFontSize, color: subTab === 'settings' ? colors.primaryDark : colors.textMuted },
              subTab === 'settings' && { fontWeight: '700' },
            ]}
          >
            ⚙️ 설정
          </Text>
        </TouchableOpacity>
      </View>

      {/* 서브탭 1: 반려견 프로필 편집 카드 단독 렌더링 (단일 뷰포트 최적화) */}
      {subTab === 'dog_profile' && (
        <ScrollView
          style={styles.tabScrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
          <DogProfileEditCard
            dog={dog}
            dogs={dogs}
            selectedDogId={selectedDogId}
            onSelectDog={onSelectDog}
            onAddDog={onAddDog}
            onSaveDog={onSaveDog}
            onDeleteDog={onDeleteDog}
          />
          <DataBackupRestoreCard
            dog={dog}
            onRestoreCompleted={(result) => {
              if (result.profile) {
                onSaveDog(result.profile);
              }
              setResetCount((c) => c + 1);
            }}
          />
        </ScrollView>
      )}

      {/* 서브탭 2: 3대 테마 선택 & 계정 상태 (단일 뷰포트 / 스크롤 완전 배제) */}
      {subTab === 'theme_account' && (
        <View style={styles.tabScrollContainer}>
          <CardWrapper variant="flat" style={styles.accountCard}>
            <View style={styles.accountRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.accountTitle, { color: colors.textMain }]}>☁️ Supabase 클라우드 계정</Text>
                <Text style={[styles.accountSubtitle, { color: colors.textMuted }]}>
                  {currentUser ? `${currentUser.email} (로그인됨)` : '로컬 게스트 모드 (비로그인)'}
                </Text>
                {!currentUser && (
                  <Text style={[styles.guestNotice, { color: colors.primaryDark }]}>
                    회원가입 시 산책 기록 동기화 및 커뮤니티 코스 공유가 가능합니다.
                  </Text>
                )}
              </View>
              <AccountAuthActions
                currentUser={currentUser}
                colors={colors}
                onOpenAuthModal={onOpenAuthModal}
                onSignOut={handleSignOut}
              />
            </View>
          </CardWrapper>

          {/* 🎨 3대 컬러 테마 선택기 */}
          <ThemeSelectorCard />
        </View>
      )}

      {/* 서브탭 3: 산책 활동 (이번 주 산책 달성도 & 완주 산책 기록 ｜ 찜한 안심 코스 2단 서브 필터 칩 토글) */}
      {subTab === 'walk_records' && (
        <ScrollView
          style={styles.tabScrollContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
          {/* 🌟 이번 주 산책 달성도 & 직전 완주 통계 위젯 */}
          <WeeklyWalkReportCard
            stats={weeklyStats}
            recentWalk={recentStats}
            onPress={() => setWalkSubFilter('history')}
            onPressRecent={() => setWalkSubFilter('history')}
            style={{ marginBottom: 10 }}
          />

          <View style={[styles.filterChipContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setWalkSubFilter('history')}
              style={[
                styles.filterChip,
                { paddingVertical: myProfile.segmentPaddingV },
                walkSubFilter === 'history' && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  {
                    fontSize: myProfile.segmentFontSize,
                    color: walkSubFilter === 'history' ? colors.primaryDark : colors.textMuted,
                  },
                  walkSubFilter === 'history' && { fontWeight: '700' },
                ]}
              >
                🐾 완주 산책 기록
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setWalkSubFilter('bookmarks')}
              style={[
                styles.filterChip,
                { paddingVertical: myProfile.segmentPaddingV },
                walkSubFilter === 'bookmarks' && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  {
                    fontSize: myProfile.segmentFontSize,
                    color: walkSubFilter === 'bookmarks' ? colors.primaryDark : colors.textMuted,
                  },
                  walkSubFilter === 'bookmarks' && { fontWeight: '700' },
                ]}
              >
                ⭐ 찜한 안심 코스
              </Text>
            </TouchableOpacity>
          </View>

          {walkSubFilter === 'history' ? (
            <MyWalkHistoryView dogName={dog.name} onOpenAuthModal={onOpenAuthModal} />
          ) : (
            <BookmarkListView
              key={`${resetCount}_${walkSubFilter}_${subTab}`}
              onStartBookmark={onStartBookmark}
              dogSpeedKmH={dog.speedKmH}
            />
          )}
        </ScrollView>
      )}

      {/* 서브탭 4: 안내 음성 설정 및 미리듣기, AI 시뮬레이터, 약관 및 데이터 초기화 */}
      {subTab === 'settings' && (
        <SettingsSubTabSection
          colors={colors}
          feedbackSummary={feedbackSummary}
          onInjectFeedback={onInjectFeedback}
          onResetFeedback={onResetFeedback}
          onOpenOnboarding={onOpenOnboarding}
          onResetData={onResetData}
          onOpenLegal={(tab) => {
            setLegalTab(tab);
            setLegalVisible(true);
          }}
          onResetCompleted={() => setResetCount((c) => c + 1)}
        />
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
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tabScrollContainer: { flex: 1 },
  scrollContent: { paddingBottom: 64 },
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
  segmentText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  filterChipContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  accountCard: { marginBottom: 10, paddingVertical: 10 },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accountTitle: { fontSize: 12, fontWeight: '700' },
  accountSubtitle: { fontSize: 10, marginTop: 2 },
  guestNotice: { fontSize: 9.5, marginTop: 4, fontWeight: '600' },
  authBtnGroup: { flexDirection: 'row', gap: 6 },
  accountBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  accountBtnText: { fontSize: 10, fontWeight: '700' },
  logoutBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  cardHeaderTitle: { fontSize: 13, fontWeight: '700' },
  backupDesc: { fontSize: 11, marginTop: 2, lineHeight: 16 },
  simButton: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  simStatusBadge: { backgroundColor: '#F3F4F6', padding: 6, borderRadius: 6, marginTop: 6 },
  simStatusText: { fontSize: 10, color: '#6B7280', fontWeight: '600' },
});
