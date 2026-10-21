/**
 * [편안하개 - PetWalk]
 * 산책 기록 상세 지도 모달 컴포넌트 (Issue #129, US-G2)
 *
 * - 실제 이동한 GPS 경로(LineString)를 MapLibre 지도 위에 시각화
 * - 산책 중 기록된 배변(대변 💩 / 소변 💧) 위치를 지도 핀으로 오버레이
 * - 출발지(🚩) 및 도착지(🏁) 핀 표출
 * - 핵심 보행 지표(거리, 시간, 평균 속도, 완만 노면율, 만족도 피드백) 상세 표시
 */

import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { WalkRecord, PoopEvent } from '../../types/storage';
import { LonLat, RouteFeatureCollection, RouteStepPin } from '../../types/route';
import { MapLibreMapView } from '../map/MapLibreMapView';
import { DogAvatar } from '../common/DogAvatar';

export interface WalkRecordDetailModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly record: WalkRecord | null;
  readonly dogName?: string;
}

/**
 * WalkRecord로부터 MapLibreMapView에 전달할 GeoJSON 및 스텝 핀을 추출/변환합니다.
 */
export function buildWalkRecordMapData(record: WalkRecord | null): {
  route: RouteFeatureCollection;
  stepPins: RouteStepPin[];
  poopCount: number;
  peeCount: number;
} {
  if (!record) {
    const emptyRoute: RouteFeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    return { route: emptyRoute, stepPins: [], poopCount: 0, peeCount: 0 };
  }

  // 1. 좌표열 추출 (gpsTrack 우선, 없을 경우 coordinates 호환)
  let coords: LonLat[] = [];
  if (record.gpsTrack && record.gpsTrack.length > 0) {
    coords = record.gpsTrack.map((pt) => [pt.lon, pt.lat] as LonLat);
  } else if ((record as any).coordinates && Array.isArray((record as any).coordinates)) {
    coords = (record as any).coordinates as LonLat[];
  }

  // 좌표가 없거나 1개뿐인 경우 세종호수공원 중심 디폴트 경로 생성
  if (coords.length < 2) {
    coords = [
      [127.2882, 36.4982],
      [127.2915, 36.5015],
    ];
  }

  // 2. RouteFeatureCollection 생성 (완만 노면율 반영)
  const segmentType = record.safeSurfaceRatio >= 0.7 ? 'safe' : 'normal';
  const route: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          segmentType,
          maxSlopePercent: 3,
          shaded: true,
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      },
    ],
  };

  // 3. 핀 생성: 출발지 🚩, 도착지 🏁
  const stepPins: RouteStepPin[] = [];
  const startCoord = coords[0];
  const endCoord = coords[coords.length - 1];

  stepPins.push({
    id: `pin-start-${record.id}`,
    kind: 'safe',
    position: startCoord,
    instruction: '산책 출발 지점',
    icon: '🚩',
    title: '출발',
    detail: new Date(record.startedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
  });

  stepPins.push({
    id: `pin-finish-${record.id}`,
    kind: 'safe',
    position: endCoord,
    instruction: '산책 완주 지점',
    icon: '🏁',
    title: '완주',
    detail: new Date(record.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
  });

  // 4. 배변 및 소변 마킹 핀 표출
  let poopCount = 0;
  let peeCount = 0;

  if (record.poopEvents && record.poopEvents.length > 0) {
    record.poopEvents.forEach((ev: PoopEvent, idx: number) => {
      const isPoop = ev.type === 'poop';
      if (isPoop) poopCount++;
      else peeCount++;

      // 이벤트에 좌표가 있으면 사용, 없으면 트랙의 적정 위치 매핑
      let pos: LonLat = endCoord;
      if (ev.lon && ev.lat) {
        pos = [ev.lon, ev.lat];
      } else if (coords.length > 2) {
        const ratio = (idx + 1) / (record.poopEvents!.length + 1);
        const mappedIdx = Math.min(coords.length - 1, Math.max(0, Math.floor(coords.length * ratio)));
        pos = coords[mappedIdx];
      }

      const timeStr = new Date(ev.timestamp).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      stepPins.push({
        id: `pin-poop-${ev.id || idx}`,
        kind: isPoop ? 'caution' : 'turn',
        position: pos,
        instruction: isPoop ? '대변 배변 마킹 지점' : '소변 마킹 지점',
        icon: isPoop ? '💩' : '💧',
        title: isPoop ? '대변' : '소변',
        detail: timeStr,
      });
    });
  } else if (typeof record.poopCount === 'number' && record.poopCount > 0) {
    poopCount = record.poopCount;
    // 레거시 기록: 중간 지점에 배변 핀 1개 자동 배치
    const midIdx = Math.floor(coords.length / 2);
    stepPins.push({
      id: `pin-poop-legacy-${record.id}`,
      kind: 'caution',
      position: coords[midIdx],
      instruction: `배변 ${record.poopCount}회 기록`,
      icon: '💩',
      title: '배변',
      detail: `${record.poopCount}회 완료`,
    });
  }

  return { route, stepPins, poopCount, peeCount };
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_WIDTH = Math.min(SCREEN_WIDTH - 48, 480);

export const WalkRecordDetailModal: React.FC<WalkRecordDetailModalProps> = ({
  visible,
  onClose,
  record,
  dogName = '우리 강아지',
}) => {
  const mapData = useMemo(() => buildWalkRecordMapData(record), [record]);

  if (!visible || !record) return null;

  const dateStr = new Date(record.completedAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  const timeRange = `${new Date(record.startedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} ~ ${new Date(record.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
  const safeRatioPercent = Math.round((record.safeSurfaceRatio ?? 0) * 100);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* 1. 상단 모달 헤더 */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={styles.titleRow}>
                <Text style={styles.titleIcon}>🗺️</Text>
                <Text style={styles.titleText}>산책 경로 및 배변 지도</Text>
              </View>
              <Text style={styles.dateSubtitle}>{dateStr} · {timeRange}</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="닫기"
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {/* 2. MapLibre 벡터 지도 뷰어 (실제 경로 및 마커) */}
            <View style={styles.mapContainer}>
              <MapLibreMapView
                route={mapData.route}
                stepPins={mapData.stepPins}
                speedKmH={record.averageSpeedKmH}
                width={MAP_WIDTH}
                height={260}
              />
            </View>

            {/* 3. 지도 마커 범례 칩 바 */}
            <View style={styles.legendRow}>
              <View style={[styles.legendChip, { borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}>
                <Text style={styles.legendChipText}>🚩 출발지</Text>
              </View>
              <View style={[styles.legendChip, { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' }]}>
                <Text style={styles.legendChipText}>🏁 완주지</Text>
              </View>
              {mapData.poopCount > 0 && (
                <View style={[styles.legendChip, { borderColor: '#F59E0B', backgroundColor: '#FEF3C7' }]}>
                  <Text style={styles.legendChipText}>💩 대변 {mapData.poopCount}회</Text>
                </View>
              )}
              {mapData.peeCount > 0 && (
                <View style={[styles.legendChip, { borderColor: '#06B6D4', backgroundColor: '#ECFEFF' }]}>
                  <Text style={styles.legendChipText}>💧 소변 {mapData.peeCount}회</Text>
                </View>
              )}
            </View>

            {/* 4. 산책 핵심 지표 4대 카드 그리드 */}
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statEmoji}>📍</Text>
                <Text style={styles.statLabel}>총 이동 거리</Text>
                <Text style={styles.statValue}>
                  {record.totalDistanceKm.toFixed(2)}<Text style={styles.statUnit}>km</Text>
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statEmoji}>⏱️</Text>
                <Text style={styles.statLabel}>산책 시간</Text>
                <Text style={styles.statValue}>
                  {record.durationMinutes}<Text style={styles.statUnit}>분</Text>
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statEmoji}>⚡</Text>
                <Text style={styles.statLabel}>평균 속도</Text>
                <Text style={styles.statValue}>
                  {record.averageSpeedKmH.toFixed(1)}<Text style={styles.statUnit}>km/h</Text>
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statEmoji}>🌿</Text>
                <Text style={styles.statLabel}>완만 노면율</Text>
                <Text style={[styles.statValue, { color: TOKENS.colors.primaryDark }]}>
                  {safeRatioPercent}<Text style={styles.statUnit}>%</Text>
                </Text>
              </View>
            </View>

            {/* 5. 동반 반려견 정보 및 체감 피드백 */}
            <View style={styles.detailCard}>
              <View style={styles.dogRow}>
                {record.dogSummary ? (
                  <>
                    <DogAvatar photoUri={record.dogSummary.photoUri} size={28} />
                    <View style={{ marginLeft: 8 }}>
                      <Text style={styles.dogNameText}>
                        {record.dogSummary.name} ({record.dogSummary.breed} · {record.dogSummary.weightKg}kg)
                      </Text>
                      <Text style={styles.dogDescText}>관절과 발바닥이 편안한 산책 완주</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.dogNameText}>🐾 {dogName}와 함께한 산책</Text>
                )}
              </View>

              {record.feedback && (
                <View style={styles.feedbackSection}>
                  <View style={styles.feedbackHeader}>
                    <Text style={styles.feedbackLabel}>만족도</Text>
                    <Text style={styles.feedbackStars}>
                      {'★'.repeat(record.feedback.comfortScore)}{'☆'.repeat(5 - record.feedback.comfortScore)} ({record.feedback.comfortScore}점)
                    </Text>
                  </View>
                  {record.feedback.tags && record.feedback.tags.length > 0 && (
                    <View style={styles.tagsContainer}>
                      {record.feedback.tags.map((tag) => (
                        <View key={tag} style={styles.tagBadge}>
                          <Text style={styles.tagBadgeText}>#{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {Boolean(record.feedback.comment) && (
                    <Text style={styles.commentText}>&quot;{record.feedback.comment}&quot;</Text>
                  )}
                </View>
              )}
            </View>
          </ScrollView>

          {/* 6. 하단 닫기 버튼 */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onClose}
              style={styles.doneBtn}
            >
              <Text style={styles.doneBtnText}>확인 완료 ✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '88%',
    backgroundColor: TOKENS.colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.background,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleIcon: {
    fontSize: 16,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
  },
  dateSubtitle: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
  },
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  mapContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    backgroundColor: '#E8F1EC',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  legendChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  legendChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  statEmoji: {
    fontSize: 15,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
  },
  statUnit: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailCard: {
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 12,
    padding: 12,
  },
  dogRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dogNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  dogDescText: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    marginTop: 1,
  },
  feedbackSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedbackLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  feedbackStars: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tagBadge: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  commentText: {
    fontSize: 11.5,
    color: TOKENS.colors.textMuted,
    fontStyle: 'italic',
    marginTop: 6,
  },
  footerRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.background,
  },
  doneBtn: {
    backgroundColor: TOKENS.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
