/**
 * [편안하개 - PetWalk]
 * 모바일 커뮤니티 탭 화면 (US-G2)
 *
 * 동네 이웃 안심 코스 공유 피드 및 출발/도착지 200m 공간 마스킹 보호
 * - 카드 터치 시 인라인 미니 지도(RouteMapView) 아코디언 펼치기
 * - 전체화면 상세 경로 모달 및 '이 코스로 산책 시작' 원터치 연동
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal, Image } from 'react-native';
import { AppText as Text } from '../components/common/AppText';
import { TOKENS, TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../theme/tokens';
import { useAppTheme } from '../theme/themeManager';
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
import dogWalkingImg from '../../assets/ui_n2/dog_walking.png';
import grassImg from '../../assets/ui_n2/grass.png';

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

export function filterCommunityFeeds(
  feeds: readonly CommunityFeedItem[],
  category: LandmarkCategoryCode,
  period: StatsPeriodType,
  now: number,
): CommunityFeedItem[] {
  let result = [...feeds];

  if (category !== 'ALL') {
    result = result.filter((feed) => feed.landmark_code === category);
  }

  const periodDays = period === '7days' ? 7 : period === '30days' ? 30 : null;
  if (periodDays !== null) {
    const cutoff = now - periodDays * 24 * 60 * 60 * 1000;
    result = result.filter((feed) => !feed.created_at || new Date(feed.created_at).getTime() >= cutoff);
  }

  return result;
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
  dogSpeedKmH = 4.0,
  onOpenAuthModal,
  initialFeeds,
  initialPeriod = 'all',
  initialCategory = 'ALL',
}) => {
  const { theme, colors } = useAppTheme();
  const isDark = theme === 'dark';
  const { community } = useAppResponsive();
  const [feeds, setFeeds] = useState<readonly CommunityFeedItem[]>(initialFeeds ?? []);
  const [filterTime, setFilterTime] = useState(() => Date.now());
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

  const filteredFeeds = useMemo(
    () => filterCommunityFeeds(feeds, selectedCategory, selectedPeriod, filterTime),
    [feeds, selectedCategory, selectedPeriod, filterTime],
  );

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

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent}>
      {/* 앰비언트 글로우 오라 (자연스러운 깊이감 형성) */}
      <View pointerEvents="none" style={styles.ambientAuraTop} />

      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTextWrap}>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>동네 이웃 안심 산책로 공유</Text>
          <Text style={[styles.sectionTitle, { color: colors.textMain }]}>커뮤니티 코스 피드 👥</Text>
        </View>
        <View pointerEvents="none" style={styles.headerMascotWrap}>
          <Image source={dogWalkingImg} style={styles.headerMascotImg} resizeMode="contain" />
        </View>
      </View>

      {/* 연동 상태 뱃지 */}
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: isSupabase ? colors.primaryWash : colors.background,
              borderColor: isSupabase ? colors.primaryMint : colors.border,
              borderWidth: 1,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: isSupabase ? colors.primaryDark : colors.textMuted }]}>
            {isSupabase ? '🌐 이웃 코스를 불러왔어요' : '🌿 예시 코스를 보고 있어요'}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => void loadFeeds()}
          style={styles.refreshBtn}
          disabled={isLoading}
        >
          <Text style={[styles.refreshText, { color: colors.textMuted }]}>{isLoading ? '⌛ 로딩 중...' : '🔄 새로고침'}</Text>
        </TouchableOpacity>
      </View>

      {/* 비회원 안내 배너 및 회원가입 링크 */}
      {!currentUser && (
        <View style={[styles.guestBanner, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <View style={styles.guestBannerTextWrap}>
          <Text style={[styles.guestBannerTitle, { color: colors.primaryDark }]}>👥 회원가입 없이 둘러보는 중</Text>
            <Text style={[styles.guestBannerDesc, { color: colors.textMuted }]}>
              회원가입 시 나만의 안심 코스를 동네 이웃과 공유할 수 있습니다.
            </Text>
          </View>
          {onOpenAuthModal && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onOpenAuthModal('signup')}
              style={[styles.guestBannerBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.guestBannerBtnText, { color: colors.textWhite }]}>회원가입</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* 200m 자택 위치 안심 보호 안내 카드 */}
      <CardWrapper style={{ marginBottom: 14 }}>
        <Text style={[styles.cardHeaderTitle, { color: colors.textMain }]}>🔒 자택 위치 안심 보호 (출발·도착지 200m)</Text>
        <Text style={[styles.cardBodyText, { color: colors.textMuted }]}>
          이웃 보호자들이 공유한 안심 산책 코스입니다. 집 위치 노출을 방지하기 위해
        출발지와 도착지의 집 근처 200m는 보이지 않도록 처리한 경로만 보여드려요.
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
                onPress={() => {
                  setSelectedCategory(chip.code);
                  setFilterTime(Date.now());
                }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: isSelected ? colors.primaryDark : colors.textMuted },
                    isSelected && { fontWeight: '700' },
                  ]}
                >
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
                onPress={() => {
                  setSelectedPeriod(chip.period);
                  setFilterTime(Date.now());
                }}
                style={[
                  styles.periodFilterChip,
                  {
                    backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.periodFilterChipText,
                    { color: isSelected ? colors.primaryDark : colors.textMuted },
                    isSelected && { fontWeight: '700' },
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 공유된 안심 코스 피드 목록 */}
      <Text style={[styles.feedListTitle, { color: colors.textMain }]}>
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
            style={[
              styles.feedCard,
              {
                paddingVertical: community.feedCardPaddingV,
                paddingHorizontal: community.feedCardPaddingH,
                borderTopColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.65)',
              },
            ]}
          >
            {/* 은은한 공원 잔디 식생 일러스트 데코 레이어 */}
            <View pointerEvents="none" style={styles.cardGrassDeco}>
              <Image
                source={grassImg}
                style={[styles.cardGrassImg, { opacity: isDark ? 0.08 : 0.14 }]}
                resizeMode="contain"
              />
            </View>

            {/* 카드 상단 클릭 시 아코디언 토글 */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => handleToggleAccordion(feed.course_id)}
            >
              {/* 랜드마크 및 안심 뱃지 행 + 찜하기 버튼 */}
              <View style={styles.topActionRow}>
                <View style={styles.landmarkRow}>
                  {feed.landmark_name && (
                    <View style={[styles.landmarkChip, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint }]}>
                      <Text style={[styles.landmarkChipText, { fontSize: community.metricBadgeFont, color: colors.primaryDark }]}>
                        📍 {feed.landmark_name}{feed.region_name ? ` · ${feed.region_name}` : ''}
                      </Text>
                    </View>
                  )}
                  {feed.is_origin_masked && (
                    <View style={[styles.maskedChip, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint }]}>
                      <Text style={[styles.maskedChipText, { fontSize: Math.max(9, community.metricBadgeFont - 1), color: colors.primaryDark }]}>
                        🔒 200m 보호
                      </Text>
                    </View>
                  )}
                  {!isSupabase && (
                    <View style={[styles.demoBadge, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                      <Text style={[styles.demoBadgeText, { fontSize: Math.max(9, community.metricBadgeFont - 1), color: colors.primaryDark }]}>
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
                <Text style={[styles.feedTitle, { color: colors.textMain }]}>{feed.title}</Text>
              </View>
              <View style={styles.feedMetaRow}>
                <Text style={[styles.feedMetaText, { color: colors.textMuted }]}>
                  📏 {(feed.distance_m / 1000).toFixed(1)}km · ⏱️ 약 {feed.duration_min}분
                </Text>
                <View style={styles.toggleRow}>
                  <Text style={[styles.feedRating, { color: colors.primaryDark }]}>⭐ {feed.rating.toFixed(1)}</Text>
                  <Text style={[styles.chevronText, { color: colors.primary }]}>
                    {isExpanded ? ' ▲ 경로 접기' : ' ▼ 경로 지도 보기'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* 1번 방안: 카드 내부 인라인 미니 경로 지도 아코디언 펼침 */}
            {isExpanded && (
              <View style={styles.expandedContent}>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <Text style={[styles.previewNotice, { color: colors.textMuted }]}>
                  🗺️ 안심 코스 미리보기 (초록: 완만길 · 파랑: 보통길)
                </Text>

                <View style={[styles.miniMapContainer, { minHeight: community.inlineMapHeight, backgroundColor: colors.background, borderColor: colors.border }]}>
                  <RouteMapView
                    route={feedRoute}
                    stepPins={feedPins}
                    speedKmH={dogSpeedKmH}
                  />
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setModalFeed(feed)}
                    style={[
                      styles.mapExpandBtn,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="코스 지도 크게 보기"
                  >
                    <Text style={[styles.mapExpandIcon, { color: colors.textMain }]}>⤢</Text>
                    <Text style={[styles.mapExpandText, { color: colors.textMain }]}>크게 보기</Text>
                  </TouchableOpacity>
                </View>

                {/* 하단 단일 Primary 산책 시작 버튼 (100% Full Width) */}
                {onStartCommunityWalk && (
                  <View style={styles.actionButtonGroup}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => handleStartWalkFromFeed(feed)}
                      style={[styles.startWalkButton, { paddingVertical: community.actionBtnPaddingV, backgroundColor: colors.primary }]}
                      accessibilityRole="button"
                      accessibilityLabel="이 코스로 바로 산책 시작하기"
                    >
                      <Text style={[styles.startWalkButtonText, { color: colors.textWhite }]}>🐾 이 코스로 바로 산책 시작</Text>
                    </TouchableOpacity>
                  </View>
                )}
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
            <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>이웃 공유 안심 산책로</Text>
                  <Text style={[styles.modalTitle, { color: colors.textMain }]}>{modalFeed.title}</Text>
                </View>
                <View style={styles.modalHeaderActions}>
                  <BookmarkToggleButton bookmark={convertFeedToBookmark(modalFeed)} />
                  <TouchableOpacity
                    onPress={() => setModalFeed(null)}
                    style={styles.closeBtn}
                    accessibilityLabel="모달 닫기"
                  >
                    <Text style={[styles.closeBtnText, { color: colors.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.modalMetaBar}>
                <Text style={[styles.modalMetaItem, { color: colors.textMuted }]}>📏 {(modalFeed.distance_m / 1000).toFixed(1)}km</Text>
                <Text style={[styles.modalMetaItem, { color: colors.textMuted }]}>⏱️ 약 {modalFeed.duration_min}분</Text>
                <Text style={[styles.modalMetaItem, { color: colors.textMuted }]}>⭐ {modalFeed.rating.toFixed(1)} 만족도</Text>
                <Text style={[styles.modalProtectedBadge, { backgroundColor: colors.primaryWash, color: colors.primaryDark }]}>
                  🔒 집 근처 200m 보호
                </Text>
              </View>

              <View style={[styles.modalMapWrapper, { borderColor: colors.border }]}>
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
                  style={[styles.modalCancelBtn, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}
                >
                  <Text style={[styles.modalCancelText, { color: colors.textMain }]}>닫기</Text>
                </TouchableOpacity>
                {onStartCommunityWalk && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleStartWalkFromFeed(modalFeed)}
                    style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={[styles.modalConfirmText, { color: colors.textWhite }]}>🐾 산책 시작하기</Text>
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
  container: { flex: 1, position: 'relative', overflow: 'hidden' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  ambientAuraTop: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(90, 115, 97, 0.08)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderTextWrap: {
    flex: 1,
  },
  headerMascotWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMascotImg: {
    width: 42,
    height: 42,
  },
  sectionSubtitle: { fontSize: TYPOGRAPHY.support, color: TOKENS.colors.textMuted },
  sectionTitle: { fontSize: TYPOGRAPHY.sectionTitle, fontWeight: '800', color: TOKENS.colors.textMain, letterSpacing: -0.5 },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 14 },
  badgeSupabase: { backgroundColor: '#E0F2FE' },
  badgeOffline: { backgroundColor: '#E8F5E9' },
  badgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '600' },
  textSupabase: { color: '#0369A1' },
  textOffline: { color: '#2E7D32' },
  refreshBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  refreshText: { fontSize: TYPOGRAPHY.caption, color: TOKENS.colors.textMuted },
  cardHeaderTitle: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '700', color: TOKENS.colors.textMain },
  cardBodyText: { fontSize: TYPOGRAPHY.support, color: TOKENS.colors.textMuted, lineHeight: TYPOGRAPHY_LINE_HEIGHT.support, marginTop: 6 },
  filterChipContainer: { marginBottom: 8 },
  filterChipScroll: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  filterChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
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
    fontSize: TYPOGRAPHY.label,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  periodFilterChipActive: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderColor: TOKENS.colors.primary,
  },
  periodFilterChipText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  periodFilterChipTextActive: {
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  feedListTitle: { fontSize: TYPOGRAPHY.sectionTitle, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 10, marginTop: 4 },
  feedCard: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  cardGrassDeco: {
    position: 'absolute',
    top: 4,
    right: 40,
    width: 72,
    height: 40,
  },
  cardGrassImg: {
    width: '100%',
    height: '100%',
  },
  topActionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  bookmarkWrapper: { padding: 2 },
  landmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, marginRight: 8 },
  landmarkChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  landmarkChipText: { fontSize: TYPOGRAPHY.label, color: '#1D4ED8', fontWeight: '700' },
  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feedTitle: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '700', color: TOKENS.colors.textMain, flex: 1, marginRight: 8 },
  maskedChip: {
    backgroundColor: '#F0FDF4',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  maskedChipText: { fontSize: TYPOGRAPHY.label, color: '#16A34A', fontWeight: '700' },
  demoBadge: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  demoBadgeText: {
    fontSize: TYPOGRAPHY.label,
    color: '#92400E',
    fontWeight: '700',
  },
  feedMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  feedMetaText: { fontSize: TYPOGRAPHY.caption, color: TOKENS.colors.textMuted, fontWeight: '500' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedRating: { fontSize: TYPOGRAPHY.label, color: TOKENS.colors.primaryDark, fontWeight: '700' },
  chevronText: { fontSize: TYPOGRAPHY.caption, color: TOKENS.colors.primary, fontWeight: '600' },
  divider: { height: 1, backgroundColor: TOKENS.colors.border, marginVertical: 12 },
  expandedContent: { marginTop: 4 },
  previewNotice: { fontSize: TYPOGRAPHY.support, color: TOKENS.colors.textMuted, marginBottom: 8, fontWeight: '600' },
  miniMapContainer: {
    borderRadius: TOKENS.borderRadius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  mapExpandBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  mapExpandIcon: {
    fontSize: 13,
    fontWeight: '700',
  },
  mapExpandText: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  actionButtonGroup: { width: '100%', marginTop: 12 },
  startWalkButton: {
    width: '100%',
    backgroundColor: TOKENS.colors.primary,
    paddingVertical: 12,
    borderRadius: TOKENS.borderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  startWalkButtonText: { color: '#FFFFFF', fontSize: TYPOGRAPHY.button, fontWeight: '700' },
  fullScreenButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: TOKENS.borderRadius.button,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  fullScreenButtonText: { color: '#334155', fontSize: TYPOGRAPHY.button, fontWeight: '600' },

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
  modalSubtitle: { fontSize: TYPOGRAPHY.support, color: TOKENS.colors.textMuted },
  modalTitle: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '800', color: TOKENS.colors.textMain, marginTop: 2 },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: TYPOGRAPHY.button, color: TOKENS.colors.textMuted, fontWeight: '600' },
  modalMetaBar: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  modalMetaItem: { fontSize: TYPOGRAPHY.caption, color: TOKENS.colors.textMuted, fontWeight: '600' },
  modalProtectedBadge: {
    fontSize: TYPOGRAPHY.label,
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
  modalCancelText: { fontSize: TYPOGRAPHY.button, fontWeight: '600', color: '#475569' },
  modalConfirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: TOKENS.borderRadius.button,
    backgroundColor: TOKENS.colors.primary,
    alignItems: 'center',
  },
  modalConfirmText: { fontSize: TYPOGRAPHY.button, fontWeight: '700', color: '#FFFFFF' },
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
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '800',
    color: TOKENS.colors.primaryDark,
  },
  guestBannerDesc: {
    fontSize: TYPOGRAPHY.support,
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
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
  },
});
