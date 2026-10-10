/**
 * [편안하개 - PetWalk]
 * 모바일 커뮤니티 탭 화면 (US-G2)
 *
 * 동네 이웃 안심 코스 공유 피드 및 출발/도착지 200m 공간 마스킹 보호
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { CardWrapper } from '../components/common/CardWrapper';

export const CommunityTabScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionSubtitle}>동네 안심 산책로 공유</Text>
        <Text style={styles.sectionTitle}>커뮤니티 코스 피드 👥</Text>
      </View>

      <CardWrapper style={{ marginBottom: 14 }}>
        <Text style={styles.cardHeaderTitle}>🔒 200m 공간 마스킹 보호</Text>
        <Text style={styles.cardBodyText}>
          이웃 견주들이 공유한 안심 산책 코스입니다. 견주의 자택 프라이버시를 위해
          출발지/도착지 200m 구간은 자동으로 마스킹(Jittering)됩니다.
        </Text>
      </CardWrapper>

      <CardWrapper variant="flat">
        <Text style={styles.cardHeaderTitle}>🌿 이번 주 인기 안심 코스</Text>
        <Text style={[styles.cardBodyText, { marginTop: 6 }]}>
          • 서울숲 무장애 흙길 순환 (1.4km / 폭신한 길 85%){'\n'}
          • 응봉산 완만 그늘길 (2.1km / 계단 0회){'\n'}
          • 중랑천 반려견 안심 잔디길 (1.8km / 저온 노면)
        </Text>
      </CardWrapper>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: TOKENS.colors.textMuted,
  },
  sectionTitle: {
    fontSize: 20,
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
});
