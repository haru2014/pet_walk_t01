/**
 * [편안하개 - PetWalk]
 * 완주 체크인 & 인포그래픽 리포트 화면 (Screen-05, US-E2, US-G2)
 *
 * 완주 축하 배너, 핵심 보행 통계, 이웃 코스 공유(200m 보호), 3초 피드백 연동
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { WalkRecord, WalkFeedback } from '../types/storage';
import { QuickFeedbackModal } from '../components/feedback/QuickFeedbackModal';
import { BookmarkToggleButton } from '../components/bookmark/BookmarkToggleButton';
import { BookmarkedRoute } from '../types/bookmark';
import { AppIcon } from '../components/common/AppIcon';
import { ShareCourseModal } from '../components/community/ShareCourseModal';
import { shareCommunityCourse } from '../services/communityApi';

export interface WalkReportScreenProps {
  record: WalkRecord;
  dogName: string;
  onSaveFeedback: (feedback: WalkFeedback) => void;
  onGoHome: () => void;
  onGoToCommunity?: () => void;
  bookmarkCandidate?: BookmarkedRoute | null;
}

const SLOPE_LABELS: Record<string, string> = {
  gentle: '완만/평지 (관절 편안)',
  moderate: '적당함',
  steep: '가파름 (다음 코스 자동 완화)',
};

export const WalkReportScreen: React.FC<WalkReportScreenProps> = ({
  record,
  dogName,
  onSaveFeedback,
  onGoHome,
  onGoToCommunity,
  bookmarkCandidate = null,
}) => {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const safeRatioPercent = Math.round(record.safeSurfaceRatio * 100);

  const handleShareCourse = async (title: string, rating: number) => {
    setIsSharing(true);
    try {
      const rawCoords: [number, number][] =
        record.gpsTrack && record.gpsTrack.length > 0
          ? record.gpsTrack.map((p) => [p.lon, p.lat] as [number, number])
          : [[127.038, 37.544], [127.040, 37.545], [127.039, 37.543]];
      const res = await shareCommunityCourse(title, rawCoords, rating);
      setIsSharing(false);
      setShowShareModal(false);
      const msg = res.is_supabase
        ? '이웃과 코스를 공유했어요!\n출발·도착지 200m는 교차로로 자동 절단되어 집 위치가 안전해요.'
        : '이웃과 안심 코스를 공유했어요! (200m 사생활 보호 적용)';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`[코스 공유 완료]\n${msg}`);
      } else {
        Alert.alert('코스 공유 완료', msg);
      }
      if (onGoToCommunity) {
        onGoToCommunity();
      }
    } catch (err) {
      // 네트워크 단절 또는 예외 발생 시 모달을 안전하게 닫고 상태를 원복
      console.warn('[WalkReportScreen] 코스 공유 예외 처리:', err);
      setIsSharing(false);
      setShowShareModal(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.congratsCard}>
          <View style={styles.congratsBadge}>
            <Text style={styles.congratsBadgeText}>WALK COMPLETE</Text>
            <AppIcon name="paw" size={14} color="#FFFFFF" />
          </View>
          <Text style={styles.congratsTitle}>오늘 산책을 무사히 마쳤어요!</Text>
          <Text style={styles.congratsSubtitle}>{dogName}와 함께 발바닥과 관절이 편안한 산책을 완주했습니다.</Text>
        </View>

        {bookmarkCandidate && (
          <View style={styles.bookmarkRow}>
            <Text style={styles.bookmarkLabel}>마음에 든 코스라면 보관함에 담아두세요</Text>
            <BookmarkToggleButton bookmark={bookmarkCandidate} />
          </View>
        )}

        {/* US-G2: 이웃과 안심 코스 공유 배너 */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setShowShareModal(true)}
          style={styles.shareBanner}
        >
          <View style={styles.shareBannerLeft}>
            <View style={styles.shareIconBox}>
              <AppIcon name="users" size={16} color={TOKENS.colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shareBannerTitle}>이웃과 안심 코스 공유하기</Text>
              <Text style={styles.shareBannerSubtitle}>자택 200m 자동 보호 · 커뮤니티 피드 등록</Text>
            </View>
          </View>
          <View style={styles.shareBadge}>
            <Text style={styles.shareBadgeText}>공유</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <AppIcon name="location" size={19} color={TOKENS.colors.primary} />
            <Text style={styles.statLabel}>총 이동 거리</Text>
            <Text style={styles.statValue}>{record.totalDistanceKm.toFixed(2)}<Text style={styles.statUnit}> km</Text></Text>
          </View>
          <View style={styles.statBox}>
            <AppIcon name="clock" size={19} color={TOKENS.colors.primary} />
            <Text style={styles.statLabel}>산책 소요 시간</Text>
            <Text style={styles.statValue}>{record.durationMinutes}<Text style={styles.statUnit}> 분</Text></Text>
          </View>
          <View style={styles.statBox}>
            <AppIcon name="speed" size={19} color={TOKENS.colors.primary} />
            <Text style={styles.statLabel}>평균 속도</Text>
            <Text style={styles.statValue}>{record.averageSpeedKmH.toFixed(1)}<Text style={styles.statUnit}> km/h</Text></Text>
          </View>
          <View style={styles.statBox}>
            <AppIcon name="soft" size={19} color={TOKENS.colors.primary} />
            <Text style={styles.statLabel}>완만 노면 달성률</Text>
            <Text style={[styles.statValue, { color: TOKENS.colors.primaryDark }]}>{safeRatioPercent}<Text style={styles.statUnit}> %</Text></Text>
          </View>
        </View>

        <View style={styles.feedbackCard}>
          <View style={styles.feedbackCardHeader}>
            <View style={styles.feedbackTitleRow}>
              <AppIcon name="edit" size={17} color={TOKENS.colors.primaryDark} />
              <Text style={styles.feedbackCardTitle}>산책 체감 피드백</Text>
            </View>
            <TouchableOpacity onPress={() => setShowFeedbackModal(true)} style={styles.feedbackEditAction}>
              <Text style={styles.feedbackEditBtn}>{record.feedback ? '수정하기' : '남기기'}</Text>
              <AppIcon name={record.feedback ? 'edit' : 'plus'} size={14} color={TOKENS.colors.primary} />
            </TouchableOpacity>
          </View>
          {record.feedback ? (
            <View style={styles.feedbackContent}>
              <View style={styles.feedbackScoreRow}>
                <Text style={styles.feedbackScoreText}>만족도:</Text>
                {Array.from({ length: record.feedback.comfortScore }, (_, idx) => (
                  <AppIcon key={idx} name="star" size={15} color={TOKENS.colors.primary} filled />
                ))}
                <Text style={styles.feedbackScoreText}>({record.feedback.comfortScore}점)</Text>
              </View>
              {Boolean(record.feedback.slopeRating) && (
                <Text style={styles.feedbackSlopeText}>경사도: {SLOPE_LABELS[record.feedback.slopeRating!] || ''}</Text>
              )}
              <View style={styles.feedbackTagsWrap}>
                {record.feedback.tags.map((t) => (
                  <View key={t} style={styles.tagBadge}><Text style={styles.tagBadgeText}>#{t}</Text></View>
                ))}
              </View>
              {Boolean(record.feedback.comment) && <Text style={styles.feedbackComment}>"{record.feedback.comment}"</Text>}
            </View>
          ) : (
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowFeedbackModal(true)} style={styles.noFeedbackNotice}>
              <Text style={styles.noFeedbackText}>3초 빠른 피드백을 남겨주시면 다음 산책 경로에 반영돼요.</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.disclaimerText}>기록된 산책 경로는 보호자님의 스마트폰에만 안전하게 보관됩니다.</Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity activeOpacity={0.88} onPress={onGoHome} style={styles.homeBtn}>
          <Text style={styles.homeBtnText}>홈으로 돌아가기</Text>
        </TouchableOpacity>
      </View>

      <QuickFeedbackModal visible={showFeedbackModal} dogName={dogName} onSubmit={onSaveFeedback} onClose={() => setShowFeedbackModal(false)} />
      <ShareCourseModal
        visible={showShareModal}
        defaultTitle={bookmarkCandidate?.title || '성산근린공원 폭신한 둘레길'}
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
  container: { flex: 1, backgroundColor: TOKENS.colors.background },
  scrollContent: { padding: 20, paddingBottom: 110 },
  congratsCard: { backgroundColor: TOKENS.colors.primaryWash, borderWidth: 1.5, borderColor: TOKENS.colors.primaryMint, borderRadius: TOKENS.borderRadius.card, padding: 20, alignItems: 'center', marginBottom: 16 },
  congratsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: TOKENS.colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginBottom: 8 },
  congratsBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  congratsTitle: { fontSize: 20, fontWeight: '800', color: TOKENS.colors.textMain, marginBottom: 6, textAlign: 'center' },
  congratsSubtitle: { fontSize: 13, color: TOKENS.colors.textMuted, textAlign: 'center', lineHeight: 18 },
  bookmarkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: TOKENS.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: TOKENS.colors.border, padding: 12, marginBottom: 12 },
  bookmarkLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: TOKENS.colors.textMain },
  shareBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: TOKENS.colors.primaryWash, borderRadius: 16, borderWidth: 1.5, borderColor: TOKENS.colors.primaryMint, padding: 12, marginBottom: 16 },
  shareBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  shareIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shareBannerTitle: { fontSize: 13, fontWeight: '800', color: TOKENS.colors.primaryDark },
  shareBannerSubtitle: { fontSize: 11, color: TOKENS.colors.textMuted, marginTop: 1 },
  shareBadge: { backgroundColor: TOKENS.colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  shareBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  statBox: { width: '48%', backgroundColor: TOKENS.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: TOKENS.colors.border, padding: 14 },
  statLabel: { fontSize: 11, color: TOKENS.colors.textMuted, fontWeight: '600', marginBottom: 2 },
  statValue: { fontSize: 20, fontWeight: '800', color: TOKENS.colors.textMain },
  statUnit: { fontSize: 12, fontWeight: '500', color: TOKENS.colors.textMuted },
  feedbackCard: { backgroundColor: TOKENS.colors.surface, borderRadius: TOKENS.borderRadius.card, borderWidth: 1, borderColor: TOKENS.colors.border, padding: 16, marginBottom: 16 },
  feedbackCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  feedbackTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedbackCardTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain },
  feedbackEditAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feedbackEditBtn: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.primary },
  feedbackContent: { gap: 6 },
  feedbackScoreText: { fontSize: 13, fontWeight: '600', color: TOKENS.colors.textMain },
  feedbackScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feedbackSlopeText: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.primaryDark },
  feedbackTagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  tagBadge: { backgroundColor: TOKENS.colors.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tagBadgeText: { fontSize: 11, fontWeight: '600', color: TOKENS.colors.primaryDark },
  feedbackComment: { fontSize: 12, color: TOKENS.colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  noFeedbackNotice: { backgroundColor: TOKENS.colors.background, borderRadius: 10, padding: 12, alignItems: 'center' },
  noFeedbackText: { fontSize: 12, color: TOKENS.colors.primaryDark, fontWeight: '600' },
  disclaimerText: { fontSize: 11, color: TOKENS.colors.textMuted, textAlign: 'center', marginTop: 4 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: TOKENS.colors.surface, borderTopWidth: 1, borderTopColor: TOKENS.colors.border, paddingHorizontal: 20, paddingVertical: 12 },
  homeBtn: { backgroundColor: TOKENS.colors.primary, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  homeBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
