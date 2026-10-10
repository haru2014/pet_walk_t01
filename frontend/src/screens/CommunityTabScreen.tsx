/**
 * [편안하개 - PetWalk]
 * 모바일 커뮤니티 탭 화면 (US-G2)
 *
 * 동네 이웃 안심 코스 공유 피드 및 출발/도착지 200m 공간 마스킹 보호
 * Supabase PostgreSQL 영구 연동 및 오프라인 자동 폴백 듀얼 모드 지원
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { CardWrapper } from '../components/common/CardWrapper';
import { fetchCommunityFeeds, CommunityFeedItem } from '../services/communityApi';

export const CommunityTabScreen: React.FC = () => {
  const [feeds, setFeeds] = useState<readonly CommunityFeedItem[]>([]);
  const [isSupabase, setIsSupabase] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadFeeds = async () => {
    setIsLoading(true);
    const res = await fetchCommunityFeeds();
    setFeeds(res.feeds);
    setIsSupabase(Boolean(res.is_supabase));
    setIsLoading(false);
  };

  useEffect(() => {
    void loadFeeds();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionSubtitle}>동네 안심 산책로 공유</Text>
        <Text style={styles.sectionTitle}>커뮤니티 코스 피드 👥</Text>
      </View>

      {/* Supabase 연동 상태 뱃지 */}
      <View style={styles.badgeRow}>
        <View style={[styles.statusBadge, isSupabase ? styles.badgeSupabase : styles.badgeOffline]}>
          <Text style={[styles.badgeText, isSupabase ? styles.textSupabase : styles.textOffline]}>
            {isSupabase ? '🌐 Supabase PostgreSQL 연동됨' : '🌿 로컬 안심 모드 (오프라인)'}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => void loadFeeds()}
          style={styles.refreshBtn}
          disabled={isLoading}
        >
          <Text style={styles.refreshText}>{isLoading ? '⌛ 로딩 중...' : '🔄 새로고침'}</Text>
        </TouchableOpacity>
      </View>

      {/* 200m 공간 마스킹 안내 카드 */}
      <CardWrapper style={{ marginBottom: 14 }}>
        <Text style={styles.cardHeaderTitle}>🔒 200m 공간 마스킹 보호</Text>
        <Text style={styles.cardBodyText}>
          이웃 견주들이 공유한 안심 산책 코스입니다. 견주의 자택 프라이버시를 위해
          출발지/도착지 200m 구간은 자동으로 마스킹(Spatial Jittering)됩니다.
        </Text>
      </CardWrapper>

      {/* 공유된 안심 코스 피드 목록 */}
      <Text style={styles.feedListTitle}>
        이웃들이 공유한 안심 산책로 ({feeds.length}개)
      </Text>

      {feeds.map((feed) => (
        <CardWrapper key={feed.course_id} variant="elevated" style={styles.feedCard}>
          <View style={styles.feedHeader}>
            <Text style={styles.feedTitle}>{feed.title}</Text>
            {feed.is_origin_masked && (
              <View style={styles.maskedChip}>
                <Text style={styles.maskedChipText}>🔒 마스킹 안심</Text>
              </View>
            )}
          </View>
          <View style={styles.feedMetaRow}>
            <Text style={styles.feedMetaText}>
              📏 {(feed.distance_m / 1000).toFixed(1)}km · ⏱️ 약 {feed.duration_min}분
            </Text>
            <Text style={styles.feedRating}>⭐ {feed.rating.toFixed(1)}</Text>
          </View>
        </CardWrapper>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  sectionHeader: { marginBottom: 12 },
  sectionSubtitle: { fontSize: 13, color: TOKENS.colors.textMuted },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: TOKENS.colors.textMain, letterSpacing: -0.5 },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeSupabase: { backgroundColor: '#E0F2FE' },
  badgeOffline: { backgroundColor: '#E8F5E9' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  textSupabase: { color: '#0369A1' },
  textOffline: { color: '#2E7D32' },
  refreshBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  refreshText: { fontSize: 11, color: TOKENS.colors.textMuted },
  cardHeaderTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain },
  cardBodyText: { fontSize: 12, color: TOKENS.colors.textMuted, lineHeight: 18, marginTop: 6 },
  feedListTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 10, marginTop: 4 },
  feedCard: { marginBottom: 10, paddingVertical: 12, paddingHorizontal: 14 },
  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feedTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain, flex: 1, marginRight: 8 },
  maskedChip: { backgroundColor: '#F0FDF4', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: '#DCFCE7' },
  maskedChipText: { fontSize: 10, color: '#16A34A', fontWeight: '700' },
  feedMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  feedMetaText: { fontSize: 12, color: TOKENS.colors.textMuted, fontWeight: '500' },
  feedRating: { fontSize: 12, color: TOKENS.colors.primaryDark, fontWeight: '700' },
});
