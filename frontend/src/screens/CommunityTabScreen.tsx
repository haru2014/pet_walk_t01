/**
 * [편안하개 - PetWalk]
 * 모바일 커뮤니티 탭 화면 (US-G2)
 *
 * 동네 이웃 안심 코스 공유 피드 및 출발/도착지 200m 공간 마스킹 보호
 * - 카드 터치 시 인라인 미니 지도(RouteMapView) 아코디언 펼치기
 * - 전체화면 상세 경로 모달 및 '이 코스로 산책 시작' 원터치 연동
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { TOKENS } from '../theme/tokens';
import { CardWrapper } from '../components/common/CardWrapper';
import { fetchCommunityFeeds, CommunityFeedItem } from '../services/communityApi';
import { RouteMapView } from '../components/map/RouteMapView';
import { RouteFeatureCollection, RouteStepPin, LonLat } from '../types/route';
import { LandmarkCategoryCode } from '../types/landmarkCategory';
import { SupabaseService } from '../services/supabaseService';
import { useAppResponsive } from '../hooks/useAppResponsive';
import { BookmarkToggleButton } from '../components/bookmark/BookmarkToggleButton';
import { BookmarkedRoute } from '../types/bookmark';
import { StatsPeriodType } from '../services/walkStatisticsService';

export interface CommunityTabScreenProps {
  readonly onStartCommunityWalk?: (
    title: string,
    route: RouteFeatureCollection,
    stepPins: readonly RouteStepPin[],
  ) => void;
  readonly dogSpeedKmH?: number;
  readonly onOpenAuthModal?: (mode?: 'signup' | 'signin') => void;
  readonly initialFeeds?: readonly CommunityFeedItem[];
  readonly initialPeriod?: StatsPeriodType;
  readonly initialCategory?: LandmarkCategoryCode;
}

/** 이웃이 공유한 마스킹 좌표열을 3대 안심 등급 GeoJSON FeatureCollection 규격으로 변환 */
function buildRouteFromMaskedPolyline(coords: readonly (readonly [number, number])[]): RouteFeatureCollection {
  const safeCoords: LonLat[] = coords.map((c) => [c[0], c[1]]);
  if (safeCoords.length < 2) {
    const single: LonLat = safeCoords[0] || [127.038, 37.544];
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { segmentType: 'safe', maxSlopePercent: 2.0, shaded: true },
          geometry: { type: 'LineString', coordinates: [single, [single[0] + 0.001, single[1] + 0.001]] },
        },
      ],
    };
  }

  const mid = Math.max(1, Math.floor(safeCoords.length / 2));
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segmentType: 'safe', maxSlopePercent: 2.1, shaded: true },
        geometry: { type: 'LineString', coordinates: safeCoords.slice(0, mid + 1) },
      },
      {
        type: 'Feature',
        properties: { segmentType: 'normal', maxSlopePercent: 4.2, shaded: false },
        geometry: { type: 'LineString', coordinates: safeCoords.slice(mid) },
      },
    ],
  };
}

/** 코스 출발/도착 안내 핀 생성 */
function buildPinsFromCoords(coords: readonly (readonly [number, number])[]): readonly RouteStepPin[] {
  if (coords.length === 0) return [];
  const startPos: LonLat = [coords[0][0], coords[0][1]];
  const lastCoord = coords.at(-1) ?? coords[0];
  const endPos: LonLat = [lastCoord[0], lastCoord[1]];
  return [
    { id: 'pin_start', kind: 'turn', position: startPos, instruction: '이웃 공유 코스 출발점 (200m 안심 보호)' },
    { id: 'pin_end', kind: 'caution', position: endPos, instruction: '코스 도착 지점' },
  ];
}

/** 커뮤니티 피드 아이템을 즐겨찾기(BookmarkedRoute) 객체로 변환하여 찜하기(북마크) 지원 */
function convertFeedToBookmark(feed: CommunityFeedItem): BookmarkedRoute {
  const route = buildRouteFromMaskedPolyline(feed.masked_polyline);
  const stepPins = buildPinsFromCoords(feed.masked_polyline);
  return {
    id: `community_${feed.course_id}`,
    title: feed.title,
    dogName: '이웃 반려견',
    totalDistanceKm: Math.round((feed.distance_m / 1000) * 10) / 10,
    estimatedMinutes: feed.duration_min,
    maxSlopePercent: 3.5,
    shadePercent: 70,
    tags: feed.tags && feed.tags.length > 0 ? [...feed.tags] : ['이웃추천', '안심코스'],
    routeGeoJson: route,
    stepPins,
    savedAt: new Date().toISOString(),
    landmarkCode: feed.landmark_code,
    landmarkName: feed.landmark_name,
    regionName: feed.region_name,
  };
}

export const CommunityTabScreen: React.FC<CommunityTabScreenProps> = ({
  onStartCommunityWalk,
  dogSpeedKmH = 2.8,
  onOpenAuthModal,
  initialFeeds,
  initialPeriod = 'all',
  initialCategory = 'ALL',
}) => {
  const { community } = useAppResponsive();
  const [feeds, setFeeds] = useState<readonly CommunityFeedItem[]>(initialFeeds ?? []);
  const [isSupabase, setIsSupabase] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialFeeds);
  const currentUser = SupabaseService.getCurrentUser();

  // 1번 인터랙션: 카드 아코디언 확장 선택 ID
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  // 2번 인터랙션: 전체화면 상세 경로 모달 대상
  const [modalFeed, setModalFeed] = useState<CommunityFeedItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<LandmarkCategoryCode>(initialCategory);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriodType>(initialPeriod);

  const loadFeeds = async () => {
    setIsLoading(true);
    const res = await fetchCommunityFeeds();
    setFeeds(res.feeds);
    setIsSupabase(Boolean(res.is_supabase));
    setIsLoading(false);
  };

  useEffect(() => {
    if (!initialFeeds) {
      void fetchCommunityFeeds().then((res) => {
        setFeeds(res.feeds);
        setIsSupabase(Boolean(res.is_supabase));
        setIsLoading(false);
      });
    }
  }, [initialFeeds]);

  const handleToggleAccordion = (courseId: string) => {
    setExpandedCourseId((prev) => (prev === courseId ? null : courseId));
  };

  const handleStartWalkFromFeed = (feed: CommunityFeedItem) => {
    const route = buildRouteFromMaskedPolyline(feed.masked_polyline);
    const pins = buildPinsFromCoords(feed.masked_polyline);
    if (onStartCommunityWalk) {
      onStartCommunityWalk(feed.title, route, pins);
    }
    setModalFeed(null);
  };

  const CATEGORY_CHIPS: readonly { code: LandmarkCategoryCode; label: string }[] = [
    { code: 'ALL', label: '전체' },
    { code: 'LM_SEJONG', label: '🏞️ 세종호수' },
    { code: 'LM_YURIM', label: '🌿 유림공원 · 대전' },
    { code: 'LM_SEONGSAN', label: '🌲 성산공원 · 마포' },
    { code: 'LM_SEOUL_FOREST', label: '🌳 서울숲 · 성동' },
    { code: 'LM_CITY_HALL', label: '🏛️ 시청 · 중구' },
  ];

  const PERIOD_CHIPS: readonly { period: StatsPeriodType; label: string }[] = [
    { period: 'all', label: '전체 기간' },
    { period: '7days', label: '최근 7일' },
    { period: '30days', label: '최근 30일' },
  ];

  // 랜드마크 필터와 기간 필터 복합(AND) 적용
  const filteredFeeds = useMemo(() => {
    let result = [...feeds];

    if (selectedCategory !== 'ALL') {
      result = result.filter((f) => f.landmark_code === selectedCategory);
    }

    if (selectedPeriod === '7days') {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      result = result.filter((f) => !f.created_at || new Date(f.created_at).getTime() >= cutoff);
    } else if (selectedPeriod === '30days') {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      result = result.filter((f) => !f.created_at || new Date(f.created_at).getTime() >= cutoff);
    }

    return result;
  }, [feeds, selectedCategory, selectedPeriod]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionSubtitle}>동네 이웃 안심 산책로 공유</Text>
        <Text style={styles.sectionTitle}>커뮤니티 코스 피드 👥</Text>
      </View>

      {/* 연동 상태 뱃지 */}
      <View style={styles.badgeRow}>
        <View style={[styles.statusBadge, isSupabase ? styles.badgeSupabase : styles.badgeOffline]}>
          <Text style={[styles.badgeText, isSupabase ? styles.textSupabase : styles.textOffline]}>
            {isSupabase ? '🌐 실시간 커뮤니티 연결됨' : '🌿 오프라인 [가상 데모 코스]'}
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

      {/* 비회원 안내 배너 및 회원가입 링크 */}
      {!currentUser && (
        <View style={styles.guestBanner}>
          <View style={styles.guestBannerTextWrap}>
            <Text style={styles.guestBannerTitle}>👥 비회원 둘러보기 모드</Text>
            <Text style={styles.guestBannerDesc}>
              회원가입 시 나만의 안심 코스를 동네 이웃과 공유할 수 있습니다.
            </Text>
          </View>
          {onOpenAuthModal && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onOpenAuthModal('signup')}
              style={styles.guestBannerBtn}
            >
              <Text style={styles.guestBannerBtnText}>회원가입</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* 200m 자택 위치 안심 보호 안내 카드 */}
      <CardWrapper style={{ marginBottom: 14 }}>
        <Text style={styles.cardHeaderTitle}>🔒 자택 위치 안심 보호 (출발·도착지 200m)</Text>
        <Text style={styles.cardBodyText}>
          이웃 보호자들이 공유한 안심 산책 코스입니다. 집 위치 노출을 방지하기 위해
          출발지와 도착지 반경 200m 구간은 자동으로 가림 처리(블러링)된 안전 경로만 표시됩니다.
        </Text>
      </CardWrapper>

      {/* 행정구역 및 랜드마크 필터 칩 바 */}
      <View style={styles.filterChipContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipScroll}>
          {CATEGORY_CHIPS.map((chip) => {
            const isSelected = selectedCategory === chip.code;
            return (
              <TouchableOpacity
                key={chip.code}
                activeOpacity={0.75}
                onPress={() => setSelectedCategory(chip.code)}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 기간 필터 칩 바 (전체 기간 / 최근 7일 / 최근 30일) */}
      <View style={styles.periodFilterContainer}>
        <View style={styles.periodChipRow}>
          {PERIOD_CHIPS.map((chip) => {
            const isSelected = selectedPeriod === chip.period;
            return (
              <TouchableOpacity
                key={chip.period}
                activeOpacity={0.75}
                onPress={() => setSelectedPeriod(chip.period)}
                style={[styles.periodFilterChip, isSelected && styles.periodFilterChipActive]}
              >
                <Text style={[styles.periodFilterChipText, isSelected && styles.periodFilterChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 공유된 안심 코스 피드 목록 */}
      <Text style={styles.feedListTitle}>
        이웃들이 공유한 안심 산책로 ({filteredFeeds.length}개)
      </Text>

      {filteredFeeds.map((feed) => {
        const isExpanded = expandedCourseId === feed.course_id;
        const feedRoute = buildRouteFromMaskedPolyline(feed.masked_polyline);
        const feedPins = buildPinsFromCoords(feed.masked_polyline);
        const bookmarkObj = convertFeedToBookmark(feed);

        return (
          <CardWrapper
            key={feed.course_id}
            variant="elevated"
            style={[styles.feedCard, { paddingVertical: community.feedCardPaddingV, paddingHorizontal: community.feedCardPaddingH }]}
          >
            {/* 카드 상단 클릭 시 아코디언 토글 */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => handleToggleAccordion(feed.course_id)}
            >
              {/* 랜드마크 및 안심 뱃지 행 + 찜하기 버튼 */}
              <View style={styles.topActionRow}>
                <View style={styles.landmarkRow}>
                  {feed.landmark_name && (
                    <View style={styles.landmarkChip}>
                      <Text style={[styles.landmarkChipText, { fontSize: community.metricBadgeFont }]}>
                        📍 {feed.landmark_name} · {feed.region_name}
                      </Text>
                    </View>
                  )}
                  {feed.is_origin_masked && (
                    <View style={styles.maskedChip}>
                      <Text style={[styles.maskedChipText, { fontSize: Math.max(9, community.metricBadgeFont - 1) }]}>🔒 200m 보호</Text>
                    </View>
                  )}
                  {!isSupabase && (
                    <View style={styles.demoBadge}>
                      <Text style={[styles.demoBadgeText, { fontSize: Math.max(9, community.metricBadgeFont - 1) }]}>
                        가상 데모
                      </Text>
                    </View>
                  )}
                </View>

                {/* 코스 찜하기 (북마크) 복원 */}
                <View style={styles.bookmarkWrapper}>
                  <BookmarkToggleButton bookmark={bookmarkObj} />
                </View>
              </View>

              <View style={styles.feedHeader}>
                <Text style={styles.feedTitle}>{feed.title}</Text>
              </View>
              <View style={styles.feedMetaRow}>
                <Text style={styles.feedMetaText}>
                  📏 {(feed.distance_m / 1000).toFixed(1)}km · ⏱️ 약 {feed.duration_min}분
                </Text>
                <View style={styles.toggleRow}>
                  <Text style={styles.feedRating}>⭐ {feed.rating.toFixed(1)}</Text>
                  <Text style={styles.chevronText}>{isExpanded ? ' ▲ 경로 접기' : ' ▼ 경로 지도 보기'}</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* 1번 방안: 카드 내부 인라인 미니 경로 지도 아코디언 펼침 */}
            {isExpanded && (
              <View style={styles.expandedContent}>
                <View style={styles.divider} />

                <Text style={styles.previewNotice}>
                  🗺️ 3색 안심 도로망 미리보기 (초록: 완만길 / 파랑: 보통길)
                </Text>

                <View style={[styles.miniMapContainer, { minHeight: community.inlineMapHeight }]}>
                  <RouteMapView
                    route={feedRoute}
                    stepPins={feedPins}
                    speedKmH={dogSpeedKmH}
                  />
                </View>

                {/* 2번 방안 혼합: 바로 산책 시작 및 큰 화면 모달 버튼 */}
                <View style={styles.actionButtonGroup}>
                  {onStartCommunityWalk && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleStartWalkFromFeed(feed)}
                      style={[styles.startWalkButton, { paddingVertical: community.actionBtnPaddingV }]}
                    >
                      <Text style={styles.startWalkButtonText}>🐾 이 코스로 바로 산책 시작</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setModalFeed(feed)}
                    style={[styles.fullScreenButton, { paddingVertical: community.actionBtnPaddingV }]}
                  >
                    <Text style={styles.fullScreenButtonText}>🔍 큰 화면으로 확인</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </CardWrapper>
        );
      })}

      {/* 2번 방안: 전체화면 코스 상세 모달 팝업 */}
      {modalFeed && (
        <Modal
          visible={Boolean(modalFeed)}
          transparent
          animationType="fade"
          onRequestClose={() => setModalFeed(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.modalSubtitle}>이웃 공유 안심 산책로</Text>
                  <Text style={styles.modalTitle}>{modalFeed.title}</Text>
                </View>
                <View style={styles.modalHeaderActions}>
                  <BookmarkToggleButton bookmark={convertFeedToBookmark(modalFeed)} />
                  <TouchableOpacity
                    onPress={() => setModalFeed(null)}
                    style={styles.closeBtn}
                    accessibilityLabel="모달 닫기"
                  >
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.modalMetaBar}>
                <Text style={styles.modalMetaItem}>📏 {(modalFeed.distance_m / 1000).toFixed(1)}km</Text>
                <Text style={styles.modalMetaItem}>⏱️ 약 {modalFeed.duration_min}분</Text>
                <Text style={styles.modalMetaItem}>⭐ {modalFeed.rating.toFixed(1)} 만족도</Text>
                <Text style={styles.modalProtectedBadge}>🔒 200m 안심 마스킹</Text>
              </View>

              <View style={styles.modalMapWrapper}>
                <RouteMapView
                  route={buildRouteFromMaskedPolyline(modalFeed.masked_polyline)}
                  stepPins={buildPinsFromCoords(modalFeed.masked_polyline)}
                  speedKmH={dogSpeedKmH}
                />
              </View>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setModalFeed(null)}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelText}>닫기</Text>
                </TouchableOpacity>
                {onStartCommunityWalk && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleStartWalkFromFeed(modalFeed)}
                    style={styles.modalConfirmBtn}
                  >
                    <Text style={styles.modalConfirmText}>🐾 산책 시작하기</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
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
  filterChipContainer: { marginBottom: 8 },
  filterChipScroll: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  filterChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  filterChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: TOKENS.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  filterChipTextActive: {
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  periodFilterContainer: { marginBottom: 12 },
  periodChipRow: { flexDirection: 'row', gap: 6 },
  periodFilterChip: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  periodFilterChipActive: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderColor: TOKENS.colors.primary,
  },
  periodFilterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  periodFilterChipTextActive: {
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  feedListTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 10, marginTop: 4 },
  feedCard: { marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14 },
  topActionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  bookmarkWrapper: { padding: 2 },
  landmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, marginRight: 8 },
  landmarkChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  landmarkChipText: { fontSize: 11, color: '#1D4ED8', fontWeight: '700' },
  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feedTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain, flex: 1, marginRight: 8 },
  maskedChip: { backgroundColor: '#F0FDF4', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: '#DCFCE7' },
  maskedChipText: { fontSize: 10, color: '#16A34A', fontWeight: '700' },
  demoBadge: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  demoBadgeText: {
    fontSize: 10,
    color: '#92400E',
    fontWeight: '700',
  },
  feedMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  feedMetaText: { fontSize: 12, color: TOKENS.colors.textMuted, fontWeight: '500' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedRating: { fontSize: 12, color: TOKENS.colors.primaryDark, fontWeight: '700' },
  chevronText: { fontSize: 11, color: TOKENS.colors.primary, fontWeight: '600' },
  divider: { height: 1, backgroundColor: TOKENS.colors.border, marginVertical: 12 },
  expandedContent: { marginTop: 4 },
  previewNotice: { fontSize: 11, color: TOKENS.colors.textMuted, marginBottom: 8, fontWeight: '600' },
  miniMapContainer: {
    borderRadius: TOKENS.borderRadius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 4,
  },
  actionButtonGroup: { flexDirection: 'row', gap: 8, marginTop: 12 },
  startWalkButton: {
    flex: 2,
    backgroundColor: TOKENS.colors.primary,
    paddingVertical: 10,
    borderRadius: TOKENS.borderRadius.button,
    alignItems: 'center',
  },
  startWalkButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  fullScreenButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: TOKENS.borderRadius.button,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  fullScreenButtonText: { color: '#334155', fontSize: 12, fontWeight: '600' },

  // 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalSubtitle: { fontSize: 12, color: TOKENS.colors.textMuted },
  modalTitle: { fontSize: 16, fontWeight: '800', color: TOKENS.colors.textMain, marginTop: 2 },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18, color: TOKENS.colors.textMuted, fontWeight: '600' },
  modalMetaBar: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  modalMetaItem: { fontSize: 12, color: TOKENS.colors.textMuted, fontWeight: '600' },
  modalProtectedBadge: {
    fontSize: 10,
    color: '#16A34A',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    fontWeight: '700',
  },
  modalMapWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    marginBottom: 16,
  },
  modalActionRow: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: TOKENS.borderRadius.button,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  modalConfirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: TOKENS.borderRadius.button,
    backgroundColor: TOKENS.colors.primary,
    alignItems: 'center',
  },
  modalConfirmText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.colors.primaryLight,
    borderWidth: 1,
    borderColor: TOKENS.colors.primary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  guestBannerTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  guestBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TOKENS.colors.primaryDark,
  },
  guestBannerDesc: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    marginTop: 2,
  },
  guestBannerBtn: {
    backgroundColor: TOKENS.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  guestBannerBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
