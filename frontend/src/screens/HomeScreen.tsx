/**
 * [편안하개 - PetWalk]
 * 모바일 홈 탭 화면 (Screen-01, US-A1, US-A2, US-B2, US-E3)
 *
 * 환영 인사, 활성 반려견 카드, 지면온도 골든타임 위젯, AI 플래너 배너, 최근 산책 요약
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { DogProfile } from '../types/dogProfile';
import { CardWrapper } from '../components/common/CardWrapper';
import { HomeDogCard } from '../components/home/HomeDogCard';
import { GoldenTimeWidget } from '../components/home/GoldenTimeWidget';
import { AiPlannerBanner } from '../components/home/AiPlannerBanner';
import { RecentWalkCard } from '../components/home/RecentWalkCard';
import { FeedbackContextService, FeedbackSummaryPayload } from '../services/feedbackContext';

export interface HomeScreenProps {
  dog: DogProfile;
  feedbackSummary: FeedbackSummaryPayload | null;
  onPressProfile: () => void;
  onStartWalk: () => void;
  onOpenPlanner: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  dog,
  feedbackSummary,
  onPressProfile,
  onStartWalk,
  onOpenPlanner,
}) => {
  return (
    <View style={styles.container}>
      {/* 환영 인사 */}
      <View style={styles.greetingSection}>
        <Text style={styles.greetingSub}>오늘도 편안하게,</Text>
        <Text style={styles.greetingMain}>우리 아이와 걸어요. 🐾</Text>
      </View>

      {/* 메인 반려견 카드 (Screen-01) */}
      <HomeDogCard
        profile={dog}
        onPressProfile={onPressProfile}
        onStartWalk={onStartWalk}
      />

      {/* 오늘의 산책 골든타임 위젯 (Screen-01) */}
      <GoldenTimeWidget
        currentTimeLabel="15:30"
        startTimeLabel="14:00"
        endTimeLabel="17:00"
        progressPercent={52}
        statusNotice="현재 15:30 · 산책 추천 시간대"
      />

      {/* AI 산책 도우미 배너 (Screen-01) */}
      <AiPlannerBanner
        onPress={onOpenPlanner}
        examplePrompt='"30분 정도 걷고 싶어"'
      />

      {/* 최근 산책 요약 카드 (Screen-01) */}
      <RecentWalkCard
        title="오늘의 산책"
        distanceKm={2.4}
        durationMinutes={38}
        safeRatioPercent={72}
        onPress={onStartWalk}
      />

      {/* 최근 피드백 AI 보정 알림 */}
      {feedbackSummary && (
        <CardWrapper variant="flat" style={{ marginBottom: 14 }}>
          <Text style={styles.cardHeaderTitle}>🤖 최근 피드백 AI 맞춤 보정</Text>
          <Text style={styles.cardBodyText}>
            • 최근 분석: {feedbackSummary.recent_walk_count}회{'\n'}
            • 경사 불만족: {feedbackSummary.slope_dissatisfaction_count}회{'\n'}
            • 최대 경사도 보정치: {feedbackSummary.recommended_max_slope_offset}%
          </Text>
          <Text style={styles.aiQuote}>
            "{FeedbackContextService.generateBriefingNotice(feedbackSummary)}"
          </Text>
        </CardWrapper>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  greetingSection: {
    marginBottom: 16,
    marginTop: 4,
  },
  greetingSub: {
    fontSize: 14,
    color: TOKENS.colors.textMuted,
    marginBottom: 4,
  },
  greetingMain: {
    fontSize: 22,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.5,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  cardBodyText: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    lineHeight: 18,
    marginTop: 6,
  },
  aiQuote: {
    fontSize: 12,
    color: TOKENS.colors.primaryDark,
    fontStyle: 'italic',
    marginTop: 8,
    paddingLeft: 4,
    borderLeftWidth: 2,
    borderLeftColor: TOKENS.colors.primary,
  },
});
