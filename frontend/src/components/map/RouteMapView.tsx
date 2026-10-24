/**
 * [편안하개 - PetWalk]
 * MapLibre 기반 모바일 코스 프리뷰 지도 뷰 (Phase 3, US-C1)
 *
 * 3색 Polyline 벡터 경로, 발자국 마커, 스텝 핀, 범례를 단일 벡터 지도에 표시합니다.
 */

import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
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
}) => {
  const { colors } = useAppTheme();
  const mapHeight = customMapHeight ?? MAP_HEIGHT;
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  const allCoords = useMemo<LonLat[]>(
    () => route.features.flatMap((f: RouteSegmentFeature) => [...f.geometry.coordinates]),
    [route],
  );
  const summary = useMemo(() => buildCourseSummary(route, speedKmH), [route, speedKmH]);
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
        : hasStairs ? '계단 포함' : `최대 경사 ${slopeText}`;
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
            : { width: MAP_WIDTH, height: mapHeight },
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
        {showLegend && (
          <View pointerEvents="none" style={styles.legendOverlay}>
            <RouteMapLegend />
          </View>
        )}
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
  container: { flexDirection: 'column', alignItems: 'center' },
  fillContainer: { flex: 1, width: '100%', height: '100%' },
  mapCanvas: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    borderRadius: TOKENS.borderRadius.card,
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'center',
  },
  legendOverlay: { position: 'absolute', left: 8, top: 8, zIndex: 2 },
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
  summaryWrapper: { marginTop: 12, width: MAP_WIDTH },
});
