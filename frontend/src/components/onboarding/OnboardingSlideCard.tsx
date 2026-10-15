/**
 * [편안하개 - PetWalk]
 * 온보딩 위저드 개별 슬라이드 카드 컴포넌트 (US-21)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../../theme/tokens';

export interface SlideItem {
  badge: string;
  emoji: string;
  title: string;
  headline: string;
  description: string;
  features: string[];
}

export const ONBOARDING_SLIDES: SlideItem[] = [
  {
    badge: 'Step 1. 안심 보행로',
    emoji: '🌿',
    title: '우리 아이 관절을 지키는 완만길',
    headline: '계단은 0개, 경사는 완만하게',
    description:
      '높은 턱과 가파른 계단 구간을 사전에 배제하고, 아이의 체급과 나이에 맞춘 흙·잔디길 중심의 편안한 코스만 추천합니다.',
    features: ['계단 0회 안심길', '경사도 15도 미만', '흙·잔디 안심 보행'],
  },
  {
    badge: 'Step 2. 시선 해방 (Eyes-Free)',
    emoji: '🎧',
    title: '스마트폰은 주머니에 쏙 넣으세요',
    headline: '화면 대신 30m 전 음성 코칭',
    description:
      '산책 중 화면을 계속 확인할 필요 없이, 코너와 주의 지점 30m 전 친절한 음성으로 안내해 드려 오롯이 아이에게만 집중할 수 있습니다.',
    features: ['30m 사전 음성 안내', '초절전 다크 포켓', '한 손 조작 모드'],
  },
  {
    badge: 'Step 3. 프라이버시 안심',
    emoji: '🔒',
    title: '내 폰에만 안전하게 남는 프라이버시',
    headline: '외부 서버 전송 없는 기기 내 안전 보관',
    description:
      '아이 프로필과 상세 산책 경로는 외부 서버로 전송되지 않고 내 스마트폰에만 보관됩니다. 코스를 이웃과 나눌 때도 집 주변 200m 구간이 자동으로 안심 보호(가림 처리)됩니다.',
    features: ['스마트폰에만 100% 안전 저장', '집 주변 200m 안심 보호', '언제든 전체 기록 삭제 가능'],
  },
];

export interface OnboardingSlideCardProps {
  slide: SlideItem;
}

export const OnboardingSlideCard: React.FC<OnboardingSlideCardProps> = ({ slide }) => {
  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{slide.badge}</Text>
      </View>

      <View style={styles.emojiCircle}>
        <Text style={styles.emojiText}>{slide.emoji}</Text>
      </View>

      <Text style={styles.title}>{slide.title}</Text>
      <Text style={styles.headline}>&quot;{slide.headline}&quot;</Text>
      <Text style={styles.desc}>{slide.description}</Text>

      <View style={styles.featuresRow}>
        {slide.features.map((feat) => (
          <View key={feat} style={styles.featureChip}>
            <Text style={styles.featureText}>✓ {feat}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  badge: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: TOKENS.borderRadius.badge,
    marginBottom: 16,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  emojiCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: TOKENS.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emojiText: {
    fontSize: 36,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  headline: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
    marginBottom: 12,
  },
  desc: {
    fontSize: 13,
    lineHeight: 19,
    color: TOKENS.colors.textMuted,
    textAlign: 'center',
    marginBottom: 18,
  },
  featuresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  featureChip: {
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  featureText: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.textMain,
  },
});
