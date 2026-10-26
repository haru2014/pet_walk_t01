/**
 * [편안하개 - PetWalk]
 * MapLibre 기반 모바일 코스 프리뷰 지도 뷰 (Phase 3, US-C1)
 *
 * 3색 Polyline 벡터 경로, 발자국 마커, 스텝 핀, 범례를 단일 벡터 지도에 표시합니다.
 */

import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { TOKENS, TYPOGRAPHY } from '../../theme/tokens';
import { useAppTheme } from '../../theme/themeManager';
import { LonLat, RouteFeatureCollection, RouteStepPin, RouteSegmentFeature } from '../../types/route';
import { buildCourseSummary } from '../../services/routeGeometry';
import { CourseSummaryCard } from './CourseSummaryCard';
import { RouteMapLegend } from './RouteMapLegend';
import { MapLibreMapView } from './MapLibreMapView';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_WIDTH = Math.min(SCREEN_WIDTH - 24, 440);
const MAP_HEIGHT = Math.max(300, Math.min(Math.round(SCREEN_HEIGHT * 0.5), 440));

export interface RouteMapViewProps {
  readonly route: RouteFeatureCollection;
  readonly stepPins: readonly RouteStepPin[];
  readonly speedKmH: number;
  readonly stairsCount?: string;
  readonly onStart?: () => void;
  readonly onPinSelect?: (instruction: string) => void;
  /** 단독 뷰일 때만 요약 카드를 표시합니다. */
  readonly showSummaryCard?: boolean;
  /** 지도 높이 직접 지정 */
  readonly mapHeight?: number;
  /** 부모 컨테이너(flex: 1)에 100% 꽉 채우기 */
  readonly fillContainer?: boolean;
  /** 현재 위치 안심 마스킹 중심점 또는 중심 좌표 */
  readonly maskingCenter?: LonLat;
  /** 3색 세그먼트 범례 오버레이 표시 여부 (자유 산책은 기본 false) */
  readonly showLegend?: boolean;
  /** 테스트 및 초기 모달 상태 제어용 */
  readonly defaultLegendOpen?: boolean;
}

export const RouteMapView: React.FC<RouteMapViewProps> = ({
  route,
  stepPins,
  speedKmH,
  stairsCount,
  onStart,
  onPinSelect,
  showSummaryCard = false,
  mapHeight: customMapHeight,
  fillContainer = false,
  maskingCenter,
  showLegend = true,
  defaultLegendOpen = false,
}) => {
  const { colors } = useAppTheme();
  const mapHeight = customMapHeight ?? MAP_HEIGHT;
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [isLegendOpen, setIsLegendOpen] = useState(defaultLegendOpen);

  const allCoords = useMemo<LonLat[]>(
    () => route.features.flatMap((f: RouteSegmentFeature) => [...f.geometry.coordinates]),
    [route],
  );
  const summary = useMemo(() => buildCourseSummary(route, speedKmH), [route, speedKmH]);
  const hasTempData = useMemo(
    () => route.features.some((feature) => feature.properties.surfaceTempC != null),
    [route],
  );
  const hasSlopeData = useMemo(
    () => route.features.some((feature) => feature.properties.slopeSignedPercent != null),
    [route],
  );
  const routeHazardPins = useMemo<readonly RouteStepPin[]>(
    () => route.features.flatMap((feature, index) => {
      const hasStairs = feature.properties.hasStairs === true;
      const hasSlopeWarning = feature.properties.segmentType === 'caution';
      if (!hasStairs && !hasSlopeWarning) return [];

      const coordinates = feature.geometry.coordinates;
      const position = coordinates[Math.floor(coordinates.length / 2)];
      if (!position) return [];

      const slopeText = `${feature.properties.maxSlopePercent}%`;
      const title = hasStairs ? '계단 구간' : '경사 주의';
      const detail = hasStairs && hasSlopeWarning
        ? `경사 ${slopeText} · 계단`
        : hasStairs ? '계단 포함' : `오르막 ${slopeText}`;
      return [{
        id: `route-hazard-${index}`,
        kind: 'caution' as const,
        position,
        instruction: `${title}: ${detail}`,
        icon: '⚠',
        title,
        detail,
      }];
    }),
    [route],
  );
  const mapPins = useMemo(() => [...stepPins, ...routeHazardPins], [stepPins, routeHazardPins]);

  if (allCoords.length === 0 && !maskingCenter && mapPins.length === 0) return null;

  const selectedPin = mapPins.find((pin) => pin.id === selectedPinId);

  return (
    <View style={fillContainer ? styles.fillContainer : styles.container}>
      <View
        style={[
          styles.mapCanvas,
          fillContainer
            ? { width: '100%', height: '100%', flex: 1, borderRadius: 0 }
            : { width: '100%', maxWidth: MAP_WIDTH, height: mapHeight },
        ]}
      >
        <MapLibreMapView
          route={route}
          stepPins={mapPins}
          maskingCenter={maskingCenter}
          width="100%"
          height={fillContainer ? '100%' : mapHeight}
          style={fillContainer ? { flex: 1, width: '100%', height: '100%', borderRadius: 0, borderWidth: 0 } : undefined}
          onPinSelect={(instruction) => {
            const pin = mapPins.find((item) => item.instruction === instruction);
            setSelectedPinId(pin?.id ?? null);
            onPinSelect?.(instruction);
          }}
        />
        {stairsCount != null && (
          <View
            pointerEvents="none"
            style={[
              styles.stairsOverlay,
              { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <Text style={[styles.stairsOverlayText, { color: colors.textMain }]}>
              {stairsCount.includes('계단') ? stairsCount : `계단 ${stairsCount}`}
            </Text>
          </View>
        )}

        {/* 지도 우측 하단 미니멀 플로팅 범례 버튼 (지도 가림 최소화 & 네이버/카카오맵 표준 UX) */}
        {showLegend && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setIsLegendOpen(true)}
            style={[
              styles.floatingLegendBtn,
              selectedPin ? styles.floatingLegendBtnRaised : undefined,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel="지도 범례 안내 보기"
          >
            <Text style={styles.floatingLegendIcon}>🎨</Text>
            <Text style={[styles.floatingLegendText, { color: colors.textMain }]}>범례</Text>
          </TouchableOpacity>
        )}

        {/* 지도 범례 팝업 오버레이 (지도 내부 캔버스 위에 뜨는 레이어 팝업 UX) */}
        {showLegend && isLegendOpen && (
          <View style={styles.legendOverlayBackdrop}>
            <TouchableOpacity
              style={styles.legendOverlayDismissArea}
              activeOpacity={1}
              onPress={() => setIsLegendOpen(false)}
            />
            <View
              style={[
                styles.modalCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderTitleRow}>
                  <Text style={styles.modalHeaderIcon}>🗺️</Text>
                  <Text style={[styles.modalHeaderTitle, { color: colors.textMain }]}>지도 안내 범례</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setIsLegendOpen(false)}
                  style={[styles.modalCloseBtn, { backgroundColor: colors.background }]}
                  accessibilityRole="button"
                  accessibilityLabel="범례 닫기"
                >
                  <Text style={[styles.modalCloseText, { color: colors.textMuted }]}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.modalDivider, { backgroundColor: colors.border }]} />

              <RouteMapLegend
                hasTempData={hasTempData}
                hasSlopeData={hasSlopeData}
                isModalView
              />
            </View>
          </View>
        )}

        {selectedPin && (
          <View
            style={[
              styles.briefingBanner,
              { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <Text style={[styles.briefingText, { color: colors.textMain }]}>🔊 {selectedPin.instruction}</Text>
          </View>
        )}
      </View>

      {showSummaryCard && (
        <View style={styles.summaryWrapper}>
          <CourseSummaryCard summary={summary} onStart={onStart} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', flexDirection: 'column', alignItems: 'center' },
  fillContainer: { flex: 1, width: '100%', height: '100%' },
  mapCanvas: {
    width: '100%',
    maxWidth: MAP_WIDTH,
    height: MAP_HEIGHT,
    borderRadius: TOKENS.borderRadius.card,
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'center',
  },
  stairsOverlay: {
    position: 'absolute', top: 8, right: 8, zIndex: 2,
    borderRadius: 10,
    paddingVertical: 6, paddingHorizontal: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  stairsOverlayText: { fontSize: TYPOGRAPHY.caption, fontWeight: '700' },
  floatingLegendBtn: {
    position: 'absolute',
    bottom: 26,
    right: 28,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingLegendBtnRaised: {
    bottom: 72,
  },
  floatingLegendIcon: {
    fontSize: 12,
  },
  floatingLegendText: {
    fontSize: 11,
    fontWeight: '700',
  },
  briefingBanner: {
    position: 'absolute', bottom: 10, left: 10, right: 10,
    borderRadius: 12,
    paddingVertical: 8, paddingHorizontal: 12, zIndex: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  briefingText: { fontSize: TYPOGRAPHY.label, fontWeight: '600', textAlign: 'center' },
  summaryWrapper: { marginTop: 12, width: '100%', maxWidth: MAP_WIDTH },
  legendOverlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  legendOverlayDismissArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 11,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalHeaderIcon: {
    fontSize: 15,
  },
  modalHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalCloseBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalDivider: {
    height: 1,
    marginVertical: 8,
  },
});
