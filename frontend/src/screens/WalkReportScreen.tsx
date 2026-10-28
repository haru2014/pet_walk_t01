import { TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../theme/tokens';
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
import { View, StyleSheet, TouchableOpacity, Alert, Platform, Modal, ScrollView, Image, useWindowDimensions } from 'react-native';
import { AppText as Text } from '../components/common/AppText';
import { useAppTheme } from '../theme/themeManager';
import { useAppResponsive } from '../hooks/useAppResponsive';
import { WalkRecord, WalkFeedback } from '../types/storage';
import { QuickFeedbackModal } from '../components/feedback/QuickFeedbackModal';
import { BookmarkedRoute } from '../types/bookmark';
import { ShareCourseModal } from '../components/community/ShareCourseModal';
import { shareCommunityCourse } from '../services/communityApi';
import { SupabaseService } from '../services/supabaseService';
import { DogAvatar } from '../components/common/DogAvatar';
import bushImg from '../../assets/ui_n2/bush.png';

export interface WalkReportScreenProps {
  record: WalkRecord;
  dogName: string;
  dogPhotoUri?: string;
  onSaveFeedback: (feedback: WalkFeedback) => void;
  onGoHome: () => void;
  onGoToCommunity?: () => void;
  bookmarkCandidate?: BookmarkedRoute | null;
  onOpenAuthModal?: (mode?: 'signup' | 'signin') => void;
}

export const WalkReportScreen: React.FC<WalkReportScreenProps> = ({
  record,
  dogName,
  dogPhotoUri,
  onSaveFeedback,
  onGoHome,
  onGoToCommunity,
  bookmarkCandidate = null,
  onOpenAuthModal,
}) => {
  const { theme, colors } = useAppTheme();
  const isDark = theme === 'dark';
  const { walkReport, scale } = useAppResponsive();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [showCompletionModal, setShowCompletionModal] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [completionMessage] = useState(() => {
    const name = record.dogSummary?.name || dogName;
    const distance = record.totalDistanceKm.toFixed(1);
    const messages = [
      `누나! 오빠! 오늘 나랑 산책시켜줘서 고마워! 🐕 킁킁, 냄새를 많이 맡아서 정말 행복했어. 다음에도 같이 가자! 🐾`,
      `오늘 ${name}랑 함께 걸어서 정말 좋았어. 내 발걸음에 맞춰줘서 고마워! 🥰`,
      `내가 킁킁 오래 해도 기다려줘서 고마워, 주인님! 새로운 냄새를 많이 맡아서 신났어 🐾`,
      `나랑 공원 걸어줘서 고마워! 다음에는 새로운 길도 같이 가보자 🐶`,
      `주인님 옆에서 걸으니까 어디든 좋았어. 오늘도 나랑 함께해줘서 고마워! 💖`,
      `내 꼬리 흔드는 거 봤지? 너무 신나서 그랬어! 산책시켜줘서 고마워 🐾`,
      `오늘 같이 걸은 시간이 참 행복했어. 다음 산책도 벌써 기다려져! 🐕`,
      `오늘 ${distance}km나 같이 걸었네! 끝까지 함께해줘서 고마워, 주인님 👏`,
      `좋아하는 냄새도 맡고 바람도 쐬어서 기분이 좋아졌어. 나랑 놀아줘서 고마워!`,
      `천천히 걸어도 재촉하지 않고 기다려줘서 고마워. 주인님이랑 산책하는 게 제일 좋아 🐶`,
      `집에 돌아와 푹 쉴 수 있겠다. 오늘 나랑 함께 걸어줘서 정말 고마워! 🐾`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  });
  const safeRatioPercent = Math.round(record.safeSurfaceRatio * 100);
  const completionPhotoUri = record.dogSummary?.photoUri || dogPhotoUri;
  const hasRegisteredDogPhoto = Boolean(
    completionPhotoUri &&
    completionPhotoUri !== 'mock_photo_url' &&
    !completionPhotoUri.startsWith('preset:'),
  );
  const completionPhotoSize = Math.min(176, windowWidth * 0.46, windowHeight * 0.24);

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

      if (!res.success) {
        const failMsg = res.errorMessage || '지금은 공유할 수 없어요. 잠시 후 다시 시도해 주세요.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(`[코스 공유 실패]\n${failMsg}`);
        } else {
          Alert.alert('코스 공유 실패', failMsg);
        }
        return;
      }

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
      {/* 앰비언트 글로우 오라 (사진 없이 깊이감과 따뜻함을 더하는 은은한 레이어) */}
      <View pointerEvents="none" style={styles.ambientAuraTop} />
      <View pointerEvents="none" style={styles.ambientAuraBottom} />

      {/* 1. 산책 기록 헤더 */}
      <View style={styles.reportHeader}>
        <View style={styles.reportTitleRow}>
          <Text style={styles.reportPaw}>🐾</Text>
          <Text style={[styles.reportTitle, { color: colors.textMain }]}>오늘의 기록</Text>
        </View>
        <View
          style={[
            styles.dogSummaryBadge,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.7)',
            },
          ]}
        >
          <DogAvatar photoUri={completionPhotoUri} size={24} />
          <Text style={[styles.dogSummaryBadgeText, { color: colors.textMain }]} numberOfLines={1}>
            {record.dogSummary?.name || dogName}
          </Text>
        </View>
      </View>

      {/* 2. 중단 4대 핵심 보행 지표 2x2 그리드 (07_walk_report.png 원형 복원 + 귀여운 디테일) */}
      <View style={styles.statsGrid}>
        <View
          style={[
            styles.statBox,
            {
              minHeight: walkReport.statBoxHeight,
              padding: scale(8, 10, 14),
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.7)',
            },
          ]}
        >
          <Text pointerEvents="none" style={styles.statBoxPawWatermark}>🐾</Text>
          <Text style={styles.statIcon}>📍</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>총 이동 거리</Text>
          <Text style={[styles.statValue, { fontSize: walkReport.statValueFontSize, color: colors.textMain }]}>
            {record.totalDistanceKm.toFixed(2)} <Text style={styles.statUnit}>km</Text>
          </Text>
        </View>
        <View
          style={[
            styles.statBox,
            {
              minHeight: walkReport.statBoxHeight,
              padding: scale(8, 10, 14),
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.7)',
            },
          ]}
        >
          <Text pointerEvents="none" style={styles.statBoxPawWatermark}>🐾</Text>
          <Text style={styles.statIcon}>⏱️</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>산책 소요 시간</Text>
          <Text style={[styles.statValue, { fontSize: walkReport.statValueFontSize, color: colors.textMain }]}>
            {record.durationMinutes} <Text style={styles.statUnit}>분</Text>
          </Text>
        </View>
        <View
          style={[
            styles.statBox,
            {
              minHeight: walkReport.statBoxHeight,
              padding: scale(8, 10, 14),
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.7)',
            },
          ]}
        >
          <Text pointerEvents="none" style={styles.statBoxPawWatermark}>🐾</Text>
          <Text style={styles.statIcon}>⚡</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>평균 속도</Text>
          <Text style={[styles.statValue, { fontSize: walkReport.statValueFontSize, color: colors.textMain }]}>
            {record.averageSpeedKmH.toFixed(1)} <Text style={styles.statUnit}>km/h</Text>
          </Text>
        </View>
        <View
          style={[
            styles.statBox,
            {
              minHeight: walkReport.statBoxHeight,
              padding: scale(8, 10, 14),
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.7)',
            },
          ]}
        >
          <Text pointerEvents="none" style={styles.statBoxPawWatermark}>🐾</Text>
          <Text style={styles.statIcon}>🌿</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>편안한 길 비율</Text>
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

      {/* 3. 산책 체감 피드백 카드 (07_walk_report.png 원형 복원 + 은은한 식생 데코) */}
      <View
        style={[
          styles.feedbackCard,
          {
            padding: walkReport.feedbackCardPadding,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.7)',
          },
        ]}
      >
        <View pointerEvents="none" style={styles.feedbackDecoArt}>
          <Image
            source={bushImg}
            style={[styles.feedbackDecoImage, { opacity: isDark ? 0.08 : 0.15 }]}
            resizeMode="contain"
          />
        </View>

        <View style={styles.feedbackCardHeader}>
          <View style={styles.feedbackTitleRow}>
            <Text style={{ fontSize: TYPOGRAPHY.body }}>📝</Text>
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

      {/* 4. 사생활 보호 고지 문구 및 데이터 보관 안내 (US-G2 / Issue #128) */}
      <Text style={[styles.disclaimerText, { color: colors.textMuted }]}>
        기록된 산책 경로는 보호자님의 스마트폰에 안전하게 보관되며, 마이페이지에서 언제든지 백업하거나 복원할 수 있습니다.
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
      <Modal
        visible={showCompletionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCompletionModal(false)}
      >
        <View style={styles.completionOverlay}>
          <View
            style={[
              styles.completionModalCard,
              { backgroundColor: '#F7F0DF', maxHeight: windowHeight * 0.9 },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.completionModalContent}
            >
              <Text style={styles.completionPaw}>🐾</Text>
              <Text style={[styles.completionModalTitle, { color: colors.primaryDark }]}>
                {record.dogSummary?.name || dogName}의 마음
              </Text>
              {hasRegisteredDogPhoto ? (
                <DogAvatar
                  photoUri={completionPhotoUri}
                  size={completionPhotoSize}
                  style={styles.completionModalPhoto}
                />
              ) : (
                <View
                  style={[
                    styles.completionModalPhoto,
                    styles.completionFallbackFrame,
                    {
                      width: completionPhotoSize,
                      height: completionPhotoSize,
                      borderRadius: completionPhotoSize / 2,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  <Image
                    source={require('../../assets/ui_n2/dog_character.png')}
                    style={styles.completionFallbackImage}
                    resizeMode="contain"
                    accessibilityLabel="편안하개 대표 강아지"
                  />
                </View>
              )}
              <Text style={[styles.completionModalMessage, { color: '#4B3824' }]}>
                {completionMessage}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setShowCompletionModal(false)}
                style={[styles.completionModalButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.completionModalButtonText}>산책 기록 보기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    position: 'relative',
    overflow: 'hidden',
  },
  ambientAuraTop: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(207, 160, 82, 0.08)',
  },
  ambientAuraBottom: {
    position: 'absolute',
    bottom: -50,
    left: -30,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(90, 115, 97, 0.07)',
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    minHeight: 36,
  },
  reportTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportPaw: {
    fontSize: 18,
  },
  reportTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '800',
  },
  dogSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  dogSummaryBadgeText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    color: '#334155',
  },
  completionOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(29, 43, 34, 0.62)',
  },
  completionModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 30,
    padding: 22,
    shadowColor: '#1D2B22',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 12,
  },
  completionModalContent: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  completionPaw: {
    fontSize: 34,
    marginBottom: 4,
  },
  completionModalTitle: {
    fontSize: TYPOGRAPHY.sectionTitle,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 14,
  },
  completionModalPhoto: {
    marginBottom: 14,
  },
  completionFallbackFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E7D8B9',
  },
  completionFallbackImage: {
    width: '92%',
    height: '92%',
  },
  completionModalMessage: {
    width: '100%',
    fontSize: TYPOGRAPHY.body,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.body,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 18,
  },
  completionModalButton: {
    width: '100%',
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  completionModalButtonText: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.button,
    fontWeight: '800',
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
    borderRadius: 16,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statBoxPawWatermark: {
    position: 'absolute',
    right: 8,
    bottom: 2,
    fontSize: 26,
    opacity: 0.10,
  },
  statIcon: {
    fontSize: 15,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    marginBottom: 2,
  },
  statValue: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
  },
  statUnit: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '500',
  },
  poopBar: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 4,
  },
  poopText: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '700',
  },
  feedbackCard: {
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 4,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  feedbackDecoArt: {
    position: 'absolute',
    top: 6,
    right: 12,
    width: 68,
    height: 40,
  },
  feedbackDecoImage: {
    width: '100%',
    height: '100%',
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
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '700',
  },
  editBtn: {},
  editText: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '700',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  starsLabel: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
  },
  starsText: {
    color: '#FFB800',
    fontSize: TYPOGRAPHY.label,
    letterSpacing: 2,
  },
  scoreNumber: {
    fontSize: TYPOGRAPHY.metricValue,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
  },
  commentText: {
    fontSize: TYPOGRAPHY.caption,
    fontStyle: 'italic',
  },
  disclaimerText: {
    fontSize: TYPOGRAPHY.caption,
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
    fontSize: TYPOGRAPHY.button,
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
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
  },
});
