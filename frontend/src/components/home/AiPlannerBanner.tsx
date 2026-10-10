/**
 * [편안하개 - PetWalk]
 * 모바일 홈 AI 산책 도우미 배너 (Screen-01, US-A1)
 *
 * 자연어 대화형 산책 플래너 진입 배너
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TOKENS } from '../../theme/tokens';

export interface AiPlannerBannerProps {
  onPress?: () => void;
  examplePrompt?: string;
}

export const AiPlannerBanner: React.FC<AiPlannerBannerProps> = ({
  onPress,
  examplePrompt = '"30분 정도 걷고 싶어"',
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={styles.banner}
    >
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.sparkleIcon}>✨</Text>
          <Text style={styles.title}>오늘 어디로 산책할까요?</Text>
        </View>

        <View style={styles.speechBubble}>
          <Text style={styles.bubbleText}>{examplePrompt}</Text>
        </View>

        <Text style={styles.helperText}>원하는 산책을 말해주세요</Text>
      </View>

      <View style={styles.arrowCircle}>
        <Text style={styles.arrowText}>→</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#ECFDF5',
    borderRadius: TOKENS.borderRadius.card,
    padding: 18,
    borderWidth: 1,
    borderColor: TOKENS.colors.primaryMint,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: TOKENS.colors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sparkleIcon: {
    fontSize: 15,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  speechBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 6,
    shadowColor: TOKENS.colors.primaryDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleText: {
    fontSize: 13,
    fontWeight: '600',
    color: TOKENS.colors.textMain,
  },
  helperText: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
  },
  arrowCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: TOKENS.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  arrowText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: -2,
  },
});
