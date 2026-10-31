/**
 * [편안하개 - PetWalk]
 * 마이페이지 산책 기록 목록 및 커뮤니티 후기 공개(is_public) 토글 뷰 (US-G2, PR #42)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { TOKENS, TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import { useAppTheme } from '../../theme/themeManager';
import { CardWrapper } from '../common/CardWrapper';
import { AppIcon } from '../common/AppIcon';
import { DogAvatar } from '../common/DogAvatar';
import { WalkRecord } from '../../types/storage';
import { LocalStorageService } from '../../services/storage';
import { SIMULATED_TRACK_SHARE_MESSAGE } from '../../services/communityApi';
import { SupabaseService } from '../../services/supabaseService';
import {
  WalkStatisticsService,
  StatsPeriodType,
} from '../../services/walkStatisticsService';
import { WalkRecordDetailModal, buildWalkRecordMapData } from '../walk/WalkRecordDetailModal';
import { BookmarkToggleButton } from '../bookmark/BookmarkToggleButton';
import { BookmarkedRoute } from '../../types/bookmark';

/** 산책 기록을 즐겨찾기(BookmarkedRoute) 규격으로 변환하여 찜하기 지원 */
function convertRecordToBookmark(rec: WalkRecord, fallbackDogName: string): BookmarkedRoute {
  const { route, stepPins } = buildWalkRecordMapData(rec);

  return {
    id: `walk_record_${rec.id}`,
    title: `${rec.dogSummary?.name ?? fallbackDogName}와의 완주 코스`,
    dogName: rec.dogSummary?.name ?? fallbackDogName,
    totalDistanceKm: rec.totalDistanceKm,
    estimatedMinutes: rec.durationMinutes,
    maxSlopePercent: 3.2,
    shadePercent: 75,
    tags: rec.feedback?.tags && rec.feedback.tags.length > 0 ? [...rec.feedback.tags] : ['완주코스', '안심산책'],
    routeGeoJson: route,
    stepPins,
    savedAt: new Date().toISOString(),
    dogSummary: rec.dogSummary,
  };
}

export interface MyWalkHistoryViewProps {
  readonly dogName: string;
  readonly initialRecords?: WalkRecord[];
  readonly onOpenAuthModal?: (mode?: 'signup' | 'signin') => void;
}

export const MyWalkHistoryView: React.FC<MyWalkHistoryViewProps> = ({
  dogName,
  initialRecords,
  onOpenAuthModal,
}) => {
  const { colors } = useAppTheme();
  const [records, setRecords] = useState<WalkRecord[]>(initialRecords ?? []);
  const [publicMap, setPublicMap] = useState<Record<string, boolean>>({});
  const [period, setPeriod] = useState<StatsPeriodType>('7days');
  const [visibleCount, setVisibleCount] = useState<number>(5);
  const [selectedRecord, setSelectedRecord] = useState<WalkRecord | null>(null);

  useEffect(() => {
    if (!initialRecords) {
      void LocalStorageService.getWalkHistory().then(setRecords);
    }
  }, [initialRecords]);

  const periodStats = WalkStatisticsService.getPeriodStats(records, period);

  const filteredRecords = useMemo(
    () => WalkStatisticsService.filterRecordsByPeriod(records, period),
    [records, period]
  );

  const handlePeriodChange = (nextPeriod: StatsPeriodType) => {
    setPeriod(nextPeriod);
    setVisibleCount(5);
  };

  const handleTogglePublic = async (record: WalkRecord) => {
    // 가상 보행 기록은 공개로 바꿀 수 없다. 비공개로 되돌리는 것은 허용 (#297)
    if (record.isSimulated && !(publicMap[record.id] ?? false)) {
      Alert.alert('공개할 수 없는 기록이에요', SIMULATED_TRACK_SHARE_MESSAGE);
      return;
    }
    await SupabaseService.initSession();
    const shareAccess = SupabaseService.getWalkShareAccess();
    if (!shareAccess.ok) {
      if (shareAccess.code === 'AUTH_REQUIRED') {
        Alert.alert(
          '회원 전용 기능',
          '커뮤니티 후기 공유는 회원만 가능합니다. 회원 계정으로 로그인한 뒤 다시 시도해 주세요.',
          [
            { text: '취소', style: 'cancel' },
            { text: '로그인하기', onPress: () => onOpenAuthModal?.('signin') },
          ]
        );
      } else if (shareAccess.code === 'CLOUD_ACCOUNT_REQUIRED') {
        Alert.alert(
          '회원 로그인이 필요해요',
          shareAccess.message,
          [
            { text: '취소', style: 'cancel' },
            { text: '로그인하기', onPress: () => onOpenAuthModal?.('signin') },
          ]
        );
      } else {
        Alert.alert('클라우드 연결을 확인해 주세요', shareAccess.message);
      }
      return;
    }

    const user = SupabaseService.getCurrentUser();
    if (!user) {
      Alert.alert(
        '회원 전용 기능',
        '커뮤니티 후기 공유는 회원만 가능합니다. 회원 계정으로 로그인한 뒤 다시 시도해 주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '로그인하기', onPress: () => onOpenAuthModal?.('signin') },
        ]
      );
      return;
    }

    const current = publicMap[record.id] ?? false;
    const nextState = !current;

    let remoteId: string;
    try {
      remoteId = await SupabaseService.ensureWalkRecordSynced(record);
      if (record.remoteId !== remoteId) {
        const saved = await LocalStorageService.updateWalkRecordRemoteId(record.id, remoteId);
        if (!saved) throw new Error('산책 기록 연결 정보를 저장하지 못했어요. 다시 시도해 주세요.');
        setRecords((currentRecords) => currentRecords.map((current) =>
          current.id === record.id ? { ...current, remoteId } : current
        ));
      }
    } catch (error) {
      Alert.alert(
        '산책 기록을 준비하지 못했어요',
        error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.'
      );
      return;
    }

    const result = await SupabaseService.setWalkRecordPublic(remoteId, nextState);
    if (!result.ok) {
      Alert.alert('공개 설정을 바꾸지 못했어요', result.message);
      return;
    }
    setPublicMap((prev) => ({ ...prev, [record.id]: nextState }));

    const message = nextState
      ? '🌐 이 산책 기록이 커뮤니티 공개 후기로 전환되었어요. 집 주변 200m는 자동으로 가려서 공개돼요.'
      : '🔒 공개가 해제되어 나만의 비공개 기록으로 보관됩니다.';
    Alert.alert(nextState ? '후기 공개 설정' : '비공개 전환', message);
  };

  if (records.length === 0) {
    return (
      <CardWrapper variant="flat" style={{ marginBottom: 16 }}>
        <View style={styles.headerRow}>
          <View style={styles.titleLine}>
            <Text style={[styles.title, { color: colors.textMain }]}>🐾 나의 산책 기록 목록</Text>
            <View style={[styles.badge, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint }]}>
            <Text style={[styles.badgeText, { color: colors.primaryDark }]}>온라인 저장</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          아직 완주한 산책 기록이 없습니다. {dogName}와 첫 안심 산책을 시작해보세요!
        </Text>
      </CardWrapper>
    );
  }

  const displayedRecords = filteredRecords.slice(0, visibleCount);
  const hasMore = filteredRecords.length > visibleCount;
  const remainingCount = filteredRecords.length - visibleCount;

  return (
    <CardWrapper variant="flat" style={{ marginBottom: 16 }}>
      {/* 1. 상단 타이틀 및 DB동기화 뱃지 (제목 바로 옆에 나란히 배치) */}
      <View style={styles.headerRow}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, { color: colors.textMain }]}>
            🐾 산책 통계 및 기록 ({periodStats.periodLabel} {filteredRecords.length}회)
          </Text>
          <View style={[styles.badge, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint }]}>
            <Text style={[styles.badgeText, { color: colors.primaryDark }]}>계정에 저장</Text>
          </View>
        </View>
        <Text style={[styles.subDesc, { color: colors.textMuted }]}>
          {dogName}와 함께한 산책 정보와 완주 기록이에요 (누적 {records.length}회)
        </Text>
      </View>

      {/* 2. 기간 선택 필터 칩 (최근 7일 / 최근 30일 / 전체) */}
      <View style={styles.periodRow}>
        {(['7days', '30days', 'all'] as const).map((p) => {
          const isSelected = period === p;
          const labels = { '7days': '최근 7일', '30days': '최근 30일', all: '전체 기록' };
          return (
            <TouchableOpacity
              key={p}
              activeOpacity={0.8}
              onPress={() => handlePeriodChange(p)}
              style={[
                styles.periodChip,
                {
                  backgroundColor: isSelected ? colors.primaryLight : colors.background,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.periodChipText,
                  { color: isSelected ? colors.primaryDark : colors.textMuted },
                  isSelected && { fontWeight: '700' },
                ]}
              >
                {labels[p]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 3. 기간별 헬스케어 통계 요약 박스 (시각적 카드) */}
      <View style={[styles.statsSummaryBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryEmoji}>🐾</Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>산책 횟수</Text>
          <Text style={[styles.summaryValue, { color: colors.textMain }]}>{periodStats.totalWalks}회</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryEmoji}>📍</Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>총 거리</Text>
          <Text style={[styles.summaryValue, { color: colors.textMain }]}>{periodStats.totalDistanceKm}km</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryEmoji}>⏱️</Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>총 시간</Text>
          <Text style={[styles.summaryValue, { color: colors.textMain }]}>{periodStats.totalDurationMinutes}분</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryEmoji}>🌿</Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>편안한 길 비율</Text>
          <Text style={[styles.summaryValue, { color: colors.primaryDark }]}>
            {periodStats.averageSafeRatioPercent}%
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryEmoji}>💩</Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>총 배변</Text>
          <Text style={[styles.summaryValue, { color: colors.textMain }]}>{periodStats.totalPoopCount}회</Text>
        </View>
      </View>

      {/* 4. 누적된 산책 기록 목록 (최근 1주일 우선 + 페이징 더보기) */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        {filteredRecords.length === 0 ? (
          <View style={styles.emptyPeriodBox}>
            <Text style={styles.emptyPeriodEmoji}>🍃</Text>
            <Text style={styles.emptyPeriodText}>
              {periodStats.periodLabel} 동안의 산책 기록이 없습니다.
            </Text>
            <Text style={styles.emptyPeriodSub}>
              상단 필터를 [전체 기록]으로 변경하거나 새로운 산책을 시작해보세요!
            </Text>
          </View>
        ) : (
          displayedRecords.map((rec) => {
            const isPublic = publicMap[rec.id] ?? false;
            const dateStr = new Date(rec.completedAt).toLocaleDateString('ko-KR', {
              month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            const bookmarkObj = convertRecordToBookmark(rec, dogName);
            const petName = rec.dogSummary?.name ?? dogName;

            return (
              <View key={rec.id} style={[styles.recordCard, isPublic && styles.recordCardPublic]}>
                {/* 1. 상단 뱃지 행 + 찜하기(북마크) 버튼 */}
                <View style={styles.recordTopActionRow}>
                  <View style={styles.badgeGroup}>
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedBadgeText}>🏅 완주 인증</Text>
                    </View>
                    {rec.dogSummary ? (
                      <View style={styles.dogBadge}>
                        <DogAvatar photoUri={rec.dogSummary.photoUri} size={15} />
                        <Text style={styles.dogBadgeText}>
                          {rec.dogSummary.name} ({rec.dogSummary.breed})
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.dogBadge}>
                        <Text style={styles.dogBadgeText}>🐾 {dogName}</Text>
                      </View>
                    )}
                    {isPublic && (
                      <View style={styles.publicBadge}>
                        <Text style={styles.publicBadgeText}>🌐 커뮤니티 공개 중</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.bookmarkWrapper}>
                    <BookmarkToggleButton bookmark={bookmarkObj} />
                  </View>
                </View>

                {/* 2. 카드 타이틀 */}
                <View style={styles.recordHeader}>
                  <Text style={styles.recordTitle}>
                    🐾 {petName}와의 안심 산책 ({dateStr})
                  </Text>
                </View>

                {/* 3. 보행 메타 수치 행 */}
                <View style={styles.recordMetaRow}>
                  <Text style={styles.recordMetaText}>
                    📏 {rec.totalDistanceKm.toFixed(1)}km · ⏱️ {rec.durationMinutes}분 · 🌿 편안한 길 {Math.round(rec.safeSurfaceRatio * 100)}%
                  </Text>
                  <Text style={styles.recordRating}>
                    ⭐ {(rec.feedback?.comfortScore ?? 5.0).toFixed(1)}
                  </Text>
                </View>

                {/* 4. 피드백 태그 및 후기 코멘트 */}
                {rec.feedback && (
                  <View style={styles.feedbackSection}>
                    {rec.feedback.tags.length > 0 && (
                      <View style={styles.tagRow}>
                        {rec.feedback.tags.map((t) => (
                          <View key={t} style={styles.tagChip}>
                            <Text style={styles.tagText}>#{t}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {Boolean(rec.feedback.comment) && (
                      <Text style={styles.feedbackComment}>&quot;{rec.feedback.comment}&quot;</Text>
                    )}
                  </View>
                )}

                {/* 5. 액션 버튼 행 (경로 지도 보기 #129 모달 연동 + 후기 공개 토글) */}
                <View style={styles.actionButtonGroup}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedRecord(rec)}
                    style={styles.mapViewBtn}
                    accessibilityLabel="경로 지도 보기"
                  >
                    <Text style={styles.mapViewBtnText}>🗺️ 경로 지도 보기</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => void handleTogglePublic(rec)}
                    style={[styles.publicBtn, isPublic ? styles.publicBtnActive : styles.publicBtnInactive]}
                  >
                    <AppIcon name="users" size={13} color={isPublic ? '#047857' : TOKENS.colors.textMuted} />
                    <Text style={[styles.publicBtnText, isPublic && styles.publicBtnTextActive]}>
                      {isPublic ? '공개 중 ✓' : '이웃 후기 공유'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* 4-1. 페이징 더보기 버튼 */}
        {hasMore && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setVisibleCount((prev) => prev + 5)}
            style={styles.loadMoreBtn}
            accessibilityLabel="과거 기록 더보기"
          >
            <Text style={styles.loadMoreBtnText}>
              과거 기록 더보기 ▾ (+{remainingCount}건 남음)
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* 5. 산책 기록 상세 지도 모달 (Issue #129 실제 이동 경로 및 배변 마킹) */}
      <WalkRecordDetailModal
        visible={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        record={selectedRecord}
        dogName={dogName}
      />
    </CardWrapper>
  );
};

const styles = StyleSheet.create({
  headerRow: { marginBottom: 4 },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '700', color: TOKENS.colors.textMain },
  badge: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignSelf: 'center',
  },
  badgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '700', color: TOKENS.colors.primaryDark },
  subDesc: { fontSize: TYPOGRAPHY.support, color: TOKENS.colors.textMuted, marginTop: 4, lineHeight: TYPOGRAPHY_LINE_HEIGHT.support },
  emptyText: { fontSize: TYPOGRAPHY.label, color: TOKENS.colors.textMuted, marginTop: 8 },
  recordCard: {
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 4,
  },
  recordCardPublic: { borderColor: '#10B981', backgroundColor: '#F0FDF4' },
  recordTopActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 8,
  },
  verifiedBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  verifiedBadgeText: {
    fontSize: TYPOGRAPHY.label,
    color: '#1D4ED8',
    fontWeight: '700',
  },
  publicBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  publicBadgeText: {
    fontSize: TYPOGRAPHY.label,
    color: '#047857',
    fontWeight: '700',
  },
  bookmarkWrapper: {
    padding: 2,
  },
  recordHeader: {
    marginBottom: 4,
  },
  recordTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  recordMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 6,
  },
  recordMetaText: {
    fontSize: TYPOGRAPHY.caption,
    color: TOKENS.colors.textMuted,
    fontWeight: '500',
  },
  recordRating: {
    fontSize: TYPOGRAPHY.label,
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  feedbackSection: {
    marginTop: 4,
    marginBottom: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  tagChip: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: TOKENS.colors.primaryDark,
  },
  actionButtonGroup: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  mapViewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    paddingVertical: 8,
    borderRadius: 10,
  },
  mapViewBtnText: {
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  recordHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  dogBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  dogBadgeText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  recordDate: { fontSize: TYPOGRAPHY.label, fontWeight: '700', color: TOKENS.colors.textMain },
  recordMetrics: { fontSize: TYPOGRAPHY.label, color: TOKENS.colors.textMuted, marginTop: 2 },
  publicBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  publicBtnInactive: {
    backgroundColor: TOKENS.colors.surface,
    borderColor: TOKENS.colors.border,
  },
  publicBtnActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#34D399',
  },
  publicBtnText: { fontSize: TYPOGRAPHY.button, fontWeight: '600', color: TOKENS.colors.textMuted },
  publicBtnTextActive: { color: '#047857', fontWeight: '700' },
  feedbackRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
  },
  feedbackComfort: { fontSize: TYPOGRAPHY.caption, fontWeight: '600', color: TOKENS.colors.primaryDark },
  feedbackComment: { fontSize: TYPOGRAPHY.caption, color: TOKENS.colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 8,
  },
  periodChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  periodChipActive: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderColor: TOKENS.colors.primary,
  },
  periodChipText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  periodChipTextActive: {
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  statsSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryEmoji: {
    fontSize: 13,
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '500',
    color: TOKENS.colors.textMuted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: TYPOGRAPHY.support,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
  },
  scrollArea: {
    maxHeight: 460,
    marginTop: 4,
  },
  scrollContent: {
    gap: 10,
    paddingRight: 4,
    paddingBottom: 4,
  },
  emptyPeriodBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    padding: 20,
    alignItems: 'center',
    marginVertical: 8,
  },
  emptyPeriodEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  emptyPeriodText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    textAlign: 'center',
  },
  emptyPeriodSub: {
    fontSize: TYPOGRAPHY.caption,
    color: TOKENS.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  loadMoreBtn: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  loadMoreBtnText: {
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
    color: '#475569',
  },
});
