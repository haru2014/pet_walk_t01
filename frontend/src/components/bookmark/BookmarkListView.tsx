/**
 * [편안하개 - PetWalk]
 * 내 보관함: 저장된 안심 코스 목록 + 아코디언 미니 지도 + 바로 산책 시작 (US-29)
 *
 * - 카드 터치 시 인라인 미니 지도(RouteMapView) 아코디언 펼치기
 * - [🐾 이 코스로 바로 산책 시작] 원터치 다크 포켓 모드 연동
 * - [🔍 큰 화면으로 확인] 전체화면 모달 팝업 지원
 * - 중복 없는 정돈된 액션 버튼 UX
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { BookmarkedRoute } from '../../types/bookmark';
import { BookmarkService } from '../../services/bookmarkService';
import { CardWrapper } from '../common/CardWrapper';
import { AppIcon } from '../common/AppIcon';
import { RouteMapView } from '../map/RouteMapView';


export interface BookmarkListViewProps {
  readonly onStartBookmark: (bookmark: BookmarkedRoute) => void;
  readonly dogSpeedKmH?: number;
}

export const BookmarkListView: React.FC<BookmarkListViewProps> = ({
  onStartBookmark,
  dogSpeedKmH = 4.0,
}) => {
  const [bookmarks, setBookmarks] = useState<BookmarkedRoute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalBookmark, setModalBookmark] = useState<BookmarkedRoute | null>(null);

  const reload = useCallback(async () => {
    setBookmarks(await BookmarkService.getBookmarks());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRemove = async (id: string) => {
    await BookmarkService.removeBookmark(id);
    if (expandedId === id) setExpandedId(null);
    if (modalBookmark?.id === id) setModalBookmark(null);
    await reload();
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <CardWrapper variant="flat" style={{ marginBottom: 16 }}>
      <View style={styles.titleRow}>
        <AppIcon name="star" size={16} color={TOKENS.colors.primary} filled />
        <Text style={styles.title}>내가 찜한 안심 코스 ({bookmarks.length})</Text>
      </View>
      <Text style={styles.desc}>
        오프라인에서도 열람할 수 있고, 지도를 펼쳐 확인한 뒤 바로 산책을 시작해요.
      </Text>

      {!isLoading && bookmarks.length === 0 && (
        <Text style={styles.empty}>
          코스 프리뷰나 산책 리포트에서 찜하기를 눌러 보관해 보세요.
        </Text>
      )}

      {bookmarks.map((bm) => {
        const isExpanded = expandedId === bm.id;

        return (
          <View key={bm.id} style={[styles.itemCard, isExpanded && styles.itemCardExpanded]}>
            {/* 카드 헤더 (터치 시 아코디언 토글) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => toggleExpand(bm.id)}
              style={styles.cardHeaderTouchable}
            >
              <View style={styles.headerTitleRow}>
                <View style={styles.titleBadgeRow}>
                  <Text style={styles.itemTitle}>{bm.title}</Text>
                  <View style={styles.expandTag}>
                    <Text style={styles.expandTagText}>
                      {isExpanded ? '경로 접기 ▴' : '경로 보기 ▾'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    void handleRemove(bm.id);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="즐겨찾기 삭제"
                  style={styles.deleteBtn}
                >
                  <Text style={styles.removeText}>삭제</Text>
                </TouchableOpacity>
              </View>

              {/* 4대 보행 메타 요약 */}
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <AppIcon name="map" size={13} color={TOKENS.colors.textMuted} />
                  <Text style={styles.meta}>{bm.totalDistanceKm.toFixed(1)}km</Text>
                </View>
                <View style={styles.metaItem}>
                  <AppIcon name="clock" size={13} color={TOKENS.colors.textMuted} />
                  <Text style={styles.meta}>약 {bm.estimatedMinutes}분</Text>
                </View>
                <View style={styles.metaItem}>
                  <AppIcon name="mountain" size={13} color={TOKENS.colors.textMuted} />
                  <Text style={styles.meta}>최대 {bm.maxSlopePercent}%</Text>
                </View>
                <View style={styles.metaItem}>
                  <AppIcon name="shade" size={13} color={TOKENS.colors.textMuted} />
                  <Text style={styles.meta}>그늘 {bm.shadePercent}%</Text>
                </View>
              </View>

              {/* 태그 목록 */}
              <View style={styles.tagRow}>
                {bm.tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>

            {/* 접힌 상태의 간편 산책 시작 버튼 */}
            {!isExpanded && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onStartBookmark(bm)}
                style={styles.collapsedStartBtn}
              >
                <Text style={styles.collapsedStartBtnText}>🐾 바로 산책 시작</Text>
              </TouchableOpacity>
            )}

            {/* 아코디언 펼침 콘텐츠 (인라인 지도 + 액션 버튼) */}
            {isExpanded && (
              <View style={styles.accordionBody}>
                <View style={styles.divider} />

                <Text style={styles.previewNotice}>
                  🗺️ 3색 안심 도로망 미리보기 (초록: 완만길 / 파랑: 보통길 / 주황: 주의길)
                </Text>

                <View style={styles.miniMapContainer}>
                  <RouteMapView
                    route={bm.routeGeoJson}
                    stepPins={bm.stepPins}
                    speedKmH={dogSpeedKmH}
                  />
                </View>

                {/* 정돈된 액션 버튼 그룹 (중복 없이 1세트 제공) */}
                <View style={styles.actionButtonGroup}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => onStartBookmark(bm)}
                    style={styles.startWalkButton}
                  >
                    <Text style={styles.startWalkButtonText}>🐾 이 코스로 바로 산책 시작</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setModalBookmark(bm)}
                    style={styles.fullScreenButton}
                  >
                    <Text style={styles.fullScreenButtonText}>🔍 큰 화면으로 확인</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      {/* 전체화면 코스 상세 모달 팝업 */}
      {modalBookmark && (
        <Modal
          visible={Boolean(modalBookmark)}
          transparent
          animationType="fade"
          onRequestClose={() => setModalBookmark(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalSubtitle}>내가 찜한 안심 코스</Text>
                  <Text style={styles.modalTitle}>{modalBookmark.title}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setModalBookmark(null)}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalMetaBar}>
                <Text style={styles.modalMetaItem}>📏 {modalBookmark.totalDistanceKm.toFixed(1)}km</Text>
                <Text style={styles.modalMetaItem}>⏱️ 약 {modalBookmark.estimatedMinutes}분</Text>
                <Text style={styles.modalMetaItem}>⛰️ 최대 {modalBookmark.maxSlopePercent}%</Text>
                <Text style={styles.modalProtectedBadge}>⭐ 보관된 코스</Text>
              </View>

              <View style={styles.modalMapWrapper}>
                <RouteMapView
                  route={modalBookmark.routeGeoJson}
                  stepPins={modalBookmark.stepPins}
                  speedKmH={dogSpeedKmH}
                />
              </View>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setModalBookmark(null)}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelText}>닫기</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    const candidate = modalBookmark;
                    setModalBookmark(null);
                    onStartBookmark(candidate);
                  }}
                  style={styles.modalConfirmBtn}
                >
                  <Text style={styles.modalConfirmText}>🐾 이 코스로 산책 시작</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </CardWrapper>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  desc: { fontSize: 12, color: TOKENS.colors.textMuted, lineHeight: 16, marginTop: 4 },
  empty: { fontSize: 12, color: TOKENS.colors.primaryDark, marginTop: 12, textAlign: 'center' },

  itemCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.background,
  },
  itemCardExpanded: {
    borderColor: TOKENS.colors.primary,
    backgroundColor: TOKENS.colors.surface,
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },

  cardHeaderTouchable: {
    width: '100%',
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.3,
  },
  expandTag: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  expandTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  deleteBtn: {
    padding: 4,
  },
  removeText: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
  },

  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tag: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.primaryDark,
  },

  collapsedStartBtn: {
    marginTop: 10,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.colors.primary,
  },
  collapsedStartBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  accordionBody: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: TOKENS.colors.border,
    marginBottom: 10,
  },
  previewNotice: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
    marginBottom: 8,
  },
  miniMapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.background,
  },

  actionButtonGroup: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  startWalkButton: {
    flex: 1.5,
    backgroundColor: TOKENS.colors.primary,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startWalkButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  fullScreenButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenButtonText: {
    color: TOKENS.colors.textMain,
    fontSize: 12,
    fontWeight: '600',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    ...(Platform.OS === 'web'
      ? ({
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
      } as any)
      : {}),
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    padding: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 12,
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
    marginBottom: 2,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 16,
    color: TOKENS.colors.textMuted,
    fontWeight: '700',
  },
  modalMetaBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
  },
  modalMetaItem: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  modalProtectedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  modalMapWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    backgroundColor: TOKENS.colors.surface,
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  modalConfirmBtn: {
    flex: 1.8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: TOKENS.colors.primary,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
