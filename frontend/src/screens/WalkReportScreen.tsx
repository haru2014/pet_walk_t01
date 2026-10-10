/**
 * [편안하개 - PetWalk]
 * 완주 체크인 & 인포그래픽 리포트 화면 (Screen-05, US-E2, Phase 5)
 *
 * 완주 축하 배너, 핵심 보행 통계(거리/시간/속도/완만길 달성률), 3초 피드백 연동
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { WalkRecord, WalkFeedback, SlopeFeedbackLevel } from '../types/storage';
import { QuickFeedbackModal } from '../components/feedback/QuickFeedbackModal';

export interface WalkReportScreenProps {
  record: WalkRecord;
  dogName: string;
  onSaveFeedback: (feedback: WalkFeedback) => void;
  onGoHome: () => void;
}

function getSlopeRatingLabel(rating?: SlopeFeedbackLevel): string {
  if (rating === 'gentle') return '🌿 완만/평지 (관절 편안)';
  if (rating === 'moderate') return '🚶 적당함';
  if (rating === 'steep') return '⛰️ 가파름 (다음 코스 자동 완화)';
  return '';
}

export const WalkReportScreen: React.FC<WalkReportScreenProps> = ({
  record,
  dogName,
  onSaveFeedback,
  onGoHome,
}) => {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const safeRatioPercent = Math.round(record.safeSurfaceRatio * 100);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 완주 축하 배너 */}
        <View style={styles.congratsCard}>
          <Text style={styles.congratsBadge}>WALK COMPLETE 🐾</Text>
          <Text style={styles.congratsTitle}>오늘 산책을 무사히 마쳤어요!</Text>
          <Text style={styles.congratsSubtitle}>
            {dogName}와 함께 발바닥과 관절이 편안한 산책을 완주했습니다.
          </Text>
        </View>

        {/* 핵심 보행 통계 4분할 그리드 */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statIcon}>📍</Text>
            <Text style={styles.statLabel}>총 이동 거리</Text>
            <Text style={styles.statValue}>
              {record.totalDistanceKm.toFixed(2)}
              <Text style={styles.statUnit}> km</Text>
            </Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statIcon}>⏱</Text>
            <Text style={styles.statLabel}>산책 소요 시간</Text>
            <Text style={styles.statValue}>
              {record.durationMinutes}
              <Text style={styles.statUnit}> 분</Text>
            </Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statIcon}>⚡</Text>
            <Text style={styles.statLabel}>평균 속도</Text>
            <Text style={styles.statValue}>
              {record.averageSpeedKmH.toFixed(1)}
              <Text style={styles.statUnit}> km/h</Text>
            </Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statIcon}>🌿</Text>
            <Text style={styles.statLabel}>완만 노면 달성률</Text>
            <Text style={[styles.statValue, { color: TOKENS.colors.primaryDark }]}>
              {safeRatioPercent}
              <Text style={styles.statUnit}> %</Text>
            </Text>
          </View>
        </View>

        {/* 피드백 상태 카드 */}
        <View style={styles.feedbackCard}>
          <View style={styles.feedbackCardHeader}>
            <Text style={styles.feedbackCardTitle}>📝 산책 체감 피드백</Text>
            <TouchableOpacity onPress={() => setShowFeedbackModal(true)}>
              <Text style={styles.feedbackEditBtn}>
                {record.feedback ? '수정하기 ✏️' : '남기기 +'}
              </Text>
            </TouchableOpacity>
          </View>

          {record.feedback ? (
            <View style={styles.feedbackContent}>
              <Text style={styles.feedbackScoreText}>
                만족도: {'⭐'.repeat(record.feedback.comfortScore)} ({record.feedback.comfortScore}점)
              </Text>
              {Boolean(record.feedback.slopeRating) && (
                <Text style={styles.feedbackSlopeText}>
                  경사도: {getSlopeRatingLabel(record.feedback.slopeRating)}
                </Text>
              )}
              <View style={styles.feedbackTagsWrap}>
                {record.feedback.tags.map((t) => (
                  <View key={t} style={styles.tagBadge}>
                    <Text style={styles.tagBadgeText}>#{t}</Text>
                  </View>
                ))}
              </View>
              {Boolean(record.feedback.comment) && (
                <Text style={styles.feedbackComment}>"{record.feedback.comment}"</Text>
              )}
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowFeedbackModal(true)}
              style={styles.noFeedbackNotice}
            >
              <Text style={styles.noFeedbackText}>
                3초 빠른 피드백을 남겨주시면 다음 산책 경로에 반영돼요! 🐾
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 안전 완료 안내 문구 */}
        <Text style={styles.disclaimerText}>
          수집된 이동 궤적은 견주 기기 로컬 스토리지에만 안전하게 보관됩니다.
        </Text>
      </ScrollView>

      {/* 하단 홈으로 돌아가기 버튼 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity activeOpacity={0.88} onPress={onGoHome} style={styles.homeBtn}>
          <Text style={styles.homeBtnText}>홈으로 돌아가기 ✓</Text>
        </TouchableOpacity>
      </View>

      {/* 피드백 모달 */}
      <QuickFeedbackModal
        visible={showFeedbackModal}
        dogName={dogName}
        onSubmit={onSaveFeedback}
        onClose={() => setShowFeedbackModal(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TOKENS.colors.background },
  scrollContent: { padding: 20, paddingBottom: 110 },
  congratsCard: {
    backgroundColor: '#ECFDF5', borderWidth: 1.5, borderColor: TOKENS.colors.primaryMint,
    borderRadius: TOKENS.borderRadius.card, padding: 20, alignItems: 'center', marginBottom: 16,
  },
  congratsBadge: {
    backgroundColor: TOKENS.colors.primary, color: '#FFFFFF', fontSize: 11, fontWeight: '800',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginBottom: 8,
  },
  congratsTitle: { fontSize: 20, fontWeight: '800', color: TOKENS.colors.textMain, marginBottom: 6, textAlign: 'center' },
  congratsSubtitle: { fontSize: 13, color: TOKENS.colors.textMuted, textAlign: 'center', lineHeight: 18 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  statBox: {
    width: '48%', backgroundColor: TOKENS.colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: TOKENS.colors.border, padding: 14,
  },
  statIcon: { fontSize: 18, marginBottom: 4 },
  statLabel: { fontSize: 11, color: TOKENS.colors.textMuted, fontWeight: '600', marginBottom: 2 },
  statValue: { fontSize: 20, fontWeight: '800', color: TOKENS.colors.textMain },
  statUnit: { fontSize: 12, fontWeight: '500', color: TOKENS.colors.textMuted },
  feedbackCard: {
    backgroundColor: TOKENS.colors.surface, borderRadius: TOKENS.borderRadius.card,
    borderWidth: 1, borderColor: TOKENS.colors.border, padding: 16, marginBottom: 16,
  },
  feedbackCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  feedbackCardTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain },
  feedbackEditBtn: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.primary },
  feedbackContent: { gap: 6 },
  feedbackScoreText: { fontSize: 13, fontWeight: '600', color: TOKENS.colors.textMain },
  feedbackSlopeText: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.primaryDark },
  feedbackTagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  tagBadge: { backgroundColor: TOKENS.colors.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tagBadgeText: { fontSize: 11, fontWeight: '600', color: TOKENS.colors.primaryDark },
  feedbackComment: { fontSize: 12, color: TOKENS.colors.textMuted, fontStyle: 'italic', marginTop: 4 },
  noFeedbackNotice: { backgroundColor: TOKENS.colors.background, borderRadius: 10, padding: 12, alignItems: 'center' },
  noFeedbackText: { fontSize: 12, color: TOKENS.colors.primaryDark, fontWeight: '600' },
  disclaimerText: { fontSize: 11, color: TOKENS.colors.textMuted, textAlign: 'center', marginTop: 4 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: TOKENS.colors.surface, borderTopWidth: 1, borderTopColor: TOKENS.colors.border,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  homeBtn: { backgroundColor: TOKENS.colors.primary, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  homeBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

