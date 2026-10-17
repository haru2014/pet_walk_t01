/**
 * [편안하개 - PetWalk]
 * 완주 체크인 & 인포그래픽 리포트 화면 (Screen-07, docs/screenshots/07_walk_report.png 원형 복원 및 스크롤 방지 최적화)
 *
 * 1. 상단: WALK COMPLETE 🐾 뱃지 + "오늘 산책을 무사히 마쳤어요!" 축하 카드
 * 2. 중단: 4대 핵심 보행 지표 2x2 그리드 (총 이동 거리, 산책 소요 시간, 평균 속도, 완만 노면 달성률)
 * 3. 피드백 카드: 산책 체감 피드백 (만족도 별점 5개, 태그 칩, 한줄평, 수정하기 ✏️)
 * 4. 사생활 보호 안내: "기록된 산책 경로는 보호자님의 스마트폰에만 안전하게 보관됩니다."
 * 5. 하단 Thumb Zone: [홈으로 돌아가기 ✓]
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useAppTheme } from '../theme/themeManager';
import { useAppResponsive } from '../hooks/useAppResponsive';
import { WalkRecord, WalkFeedback } from '../types/storage';
import { QuickFeedbackModal } from '../components/feedback/QuickFeedbackModal';
import { BookmarkedRoute } from '../types/bookmark';
import { ShareCourseModal } from '../components/community/ShareCourseModal';
import { shareCommunityCourse } from '../services/communityApi';
import { SupabaseService } from '../services/supabaseService';
import { DogAvatar } from '../components/common/DogAvatar';

export interface WalkReportScreenProps {
  record: WalkRecord;
  dogName: string;
  onSaveFeedback: (feedback: WalkFeedback) => void;
  onGoHome: () => void;
  onGoToCommunity?: () => void;
  bookmarkCandidate?: BookmarkedRoute | null;
  onOpenAuthModal?: (mode?: 'signup' | 'signin') => void;
}

export const WalkReportScreen: React.FC<WalkReportScreenProps> = ({
  record,
  dogName,
  onSaveFeedback,
  onGoHome,
  onGoToCommunity,
  bookmarkCandidate = null,
  onOpenAuthModal,
}) => {
  const { colors } = useAppTheme();
  const { walkReport, scale } = useAppResponsive();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const safeRatioPercent = Math.round(record.safeSurfaceRatio * 100);

  const handleOpenShareModal = () => {
    const user = SupabaseService.getCurrentUser();
    if (!user) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const goSignUp = window.confirm(
          '[회원 전용 기능]\n커뮤니티 산책 경로 공유는 회원만 가능합니다.\n회원가입 페이지로 이동하시겠습니까?'
        );
        if (goSignUp && onOpenAuthModal) onOpenAuthModal('signup');
      } else {
        Alert.alert(
          '회원 전용 기능',
          '커뮤니티 산책 경로 공유는 회원만 가능합니다.\n회원가입 후 동네 이웃들에게 우리 아이 안심 코스를 공유해 보세요!',
          [
            { text: '취소', style: 'cancel' },
            { text: '회원가입하기', onPress: () => onOpenAuthModal?.('signup') },
          ]
        );
      }
      return;
    }
    setShowShareModal(true);
  };

  const handleShareCourse = async (title: string, rating: number) => {
    const user = SupabaseService.getCurrentUser();
    if (!user) {
      Alert.alert('회원 전용 기능', '커뮤니티 코스 공유는 회원만 가능합니다.');
      return;
    }
    setIsSharing(true);
    try {
      const rawCoords: [number, number][] =
        record.gpsTrack && record.gpsTrack.length > 0
          ? record.gpsTrack.map((p) => [p.lon, p.lat] as [number, number])
          : [[127.038, 37.544], [127.040, 37.545], [127.039, 37.543]];
      const res = await shareCommunityCourse(title, rawCoords, rating, user.id);
      setIsSharing(false);
      setShowShareModal(false);
      const msg = res.is_supabase
        ? '이웃과 코스를 공유했어요!\n출발·도착지 200m는 자동 보호되어 집 위치가 안전해요.'
        : '이웃과 안심 코스를 공유했어요! (200m 사생활 보호 적용)';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`[코스 공유 완료]\n${msg}`);
      } else {
        Alert.alert('코스 공유 완료', msg);
      }
      if (onGoToCommunity) onGoToCommunity();
    } catch (err) {
      console.warn('[WalkReportScreen] 코스 공유 예외 처리:', err);
      setIsSharing(false);
      setShowShareModal(false);
    }
  };

  const feedback = record.feedback;
  const comfortScore = feedback?.comfortScore ?? 5;
  const tags = feedback?.tags && feedback.tags.length > 0 ? feedback.tags : ['완만해요', '그늘많아요'];
  const comment = feedback?.comment || '발바닥 열감 없이 정말 쾌적하게 다녀왔어요!';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 1. 상단: WALK COMPLETE 🐾 축하 카드 (07_walk_report.png 원형 복원) */}
      <View style={[styles.congratsCard, { padding: walkReport.congratsCardPadding, backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
        <View style={styles.congratsTopRow}>
          <View style={[styles.completeCapsule, { backgroundColor: colors.primary }]}>
            <Text style={styles.completeCapsuleText}>WALK COMPLETE 🐾</Text>
          </View>
          {record.dogSummary && (
            <View style={styles.dogSummaryBadge}>
              <DogAvatar photoUri={record.dogSummary.photoUri} size={20} />
              <Text style={styles.dogSummaryBadgeText} numberOfLines={1}>
                {record.dogSummary.name} ({record.dogSummary.breed} · {record.dogSummary.weightKg}kg)
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.congratsTitle, { color: colors.textMain }]}>
          오늘 산책을 무사히 마쳤어요!
        </Text>
        <Text style={[styles.congratsSubtitle, { color: colors.textMuted }]}>
          {record.dogSummary?.name || dogName}와 함께 발바닥과 관절이 편안한 산책을 완주했습니다.
        </Text>
      </View>

      {/* 2. 중단 4대 핵심 보행 지표 2x2 그리드 (07_walk_report.png 원형 복원) */}
      <View style={styles.statsGrid}>
        <View style={[styles.statBox, { minHeight: walkReport.statBoxHeight, padding: scale(8, 10, 14), backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.statIcon}>📍</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>총 이동 거리</Text>
          <Text style={[styles.statValue, { fontSize: walkReport.statValueFontSize, color: colors.textMain }]}>
            {record.totalDistanceKm.toFixed(2)} <Text style={styles.statUnit}>km</Text>
          </Text>
        </View>
        <View style={[styles.statBox, { minHeight: walkReport.statBoxHeight, padding: scale(8, 10, 14), backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.statIcon}>⏱️</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>산책 소요 시간</Text>
          <Text style={[styles.statValue, { fontSize: walkReport.statValueFontSize, color: colors.textMain }]}>
            {record.durationMinutes} <Text style={styles.statUnit}>분</Text>
          </Text>
        </View>
        <View style={[styles.statBox, { minHeight: walkReport.statBoxHeight, padding: scale(8, 10, 14), backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.statIcon}>⚡</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>평균 속도</Text>
          <Text style={[styles.statValue, { fontSize: walkReport.statValueFontSize, color: colors.textMain }]}>
            {record.averageSpeedKmH.toFixed(1)} <Text style={styles.statUnit}>km/h</Text>
          </Text>
        </View>
        <View style={[styles.statBox, { minHeight: walkReport.statBoxHeight, padding: scale(8, 10, 14), backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.statIcon}>🌿</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>완만 노면 달성률</Text>
          <Text style={[styles.statValue, { fontSize: walkReport.statValueFontSize, color: colors.primary }]}>
            {safeRatioPercent} <Text style={styles.statUnit}>%</Text>
          </Text>
        </View>
      </View>

      {/* 배변 마킹 결과 (US-18 원터치 마킹 완료 알림) */}
      {typeof record.poopCount === 'number' && record.poopCount > 0 && (
        <View style={[styles.poopBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.poopText, { color: colors.primaryDark }]}>
            💩 산책 중 배변 {record.poopCount}회 기록 완료
          </Text>
        </View>
      )}

      {/* 3. 산책 체감 피드백 카드 (07_walk_report.png 원형 복원) */}
      <View style={[styles.feedbackCard, { padding: walkReport.feedbackCardPadding, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.feedbackCardHeader}>
          <View style={styles.feedbackTitleRow}>
            <Text style={{ fontSize: 14 }}>📝</Text>
            <Text style={[styles.feedbackTitle, { color: colors.textMain }]}>산책 체감 피드백</Text>
          </View>
          <TouchableOpacity onPress={() => setShowFeedbackModal(true)} style={styles.editBtn}>
            <Text style={[styles.editText, { color: colors.primary }]}>수정하기 ✏️</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.starsRow}>
          <Text style={[styles.starsLabel, { color: colors.textMain }]}>만족도: </Text>
          <Text style={styles.starsText}>{'★'.repeat(comfortScore)}{'☆'.repeat(5 - comfortScore)}</Text>
          <Text style={[styles.scoreNumber, { color: colors.textMuted }]}> ({comfortScore}점)</Text>
        </View>

        <View style={styles.tagsRow}>
          {tags.map((t) => (
            <View key={t} style={[styles.tagChip, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.tagText, { color: colors.primaryDark }]}>#{t}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.commentText, { color: colors.textMuted }]} numberOfLines={1}>
          &quot;{comment}&quot;
        </Text>
      </View>

      {/* 4. 사생활 보호 고지 문구 (07_walk_report.png 원형 복원) */}
      <Text style={[styles.disclaimerText, { color: colors.textMuted }]}>
        기록된 산책 경로는 보호자님의 스마트폰에만 안전하게 보관됩니다.
      </Text>

      {/* 5. 하단 Thumb Zone 버튼 (홈 복귀 & 회원 전용 코스 공유) */}
      <View style={styles.bottomArea}>
        <View style={styles.actionBtnRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleOpenShareModal}
            style={[styles.shareBtn, { height: walkReport.buttonHeight, backgroundColor: colors.surface, borderColor: colors.primary }]}
          >
            <Text style={[styles.shareBtnText, { color: colors.primaryDark }]}>이웃과 코스 공유 👥</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={onGoHome}
            style={[styles.homeBtn, { height: walkReport.buttonHeight, backgroundColor: colors.primary }]}
          >
            <Text style={styles.homeBtnText}>홈으로 돌아가기 ✓</Text>
          </TouchableOpacity>
        </View>
      </View>

      <QuickFeedbackModal visible={showFeedbackModal} dogName={dogName} onSubmit={onSaveFeedback} onClose={() => setShowFeedbackModal(false)} />
      <ShareCourseModal
        visible={showShareModal}
        defaultTitle={bookmarkCandidate?.title || '세종호수공원 은빛해변 둘레길'}
        distanceKm={record.totalDistanceKm}
        durationMinutes={record.durationMinutes}
        safeSurfaceRatio={record.safeSurfaceRatio}
        isSubmitting={isSharing}
        onShare={handleShareCourse}
        onClose={() => setShowShareModal(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: 'space-between', // 스크롤 없이 한 화면에 균형 배치
  },
  congratsCard: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 6,
  },
  congratsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  completeCapsule: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  completeCapsuleText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dogSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dogSummaryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  congratsTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  congratsSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  statBox: {
    width: '48.5%',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  statIcon: {
    fontSize: 14,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statUnit: {
    fontSize: 11,
    fontWeight: '500',
  },
  poopBar: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 4,
  },
  poopText: {
    fontSize: 11,
    fontWeight: '700',
  },
  feedbackCard: {
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  feedbackCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  feedbackTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedbackTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  editBtn: {},
  editText: {
    fontSize: 11,
    fontWeight: '700',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  starsLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  starsText: {
    color: '#FFB800',
    fontSize: 13,
    letterSpacing: 2,
  },
  scoreNumber: {
    fontSize: 11,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  tagChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  commentText: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  disclaimerText: {
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 4,
  },
  bottomArea: {
    marginTop: 'auto',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shareBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  homeBtn: {
    flex: 1.2,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
