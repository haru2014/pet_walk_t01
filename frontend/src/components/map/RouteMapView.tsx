/**
 * [편안하개 - PetWalk]
 * 모바일 코스 프리뷰 지도 뷰 (Phase 3, US-C1)
 *
 * react-native-svg 기반의 벡터 경로 렌더러와 react-native-maps 호환 인터페이스
 * 3색 Polyline (완만 초록 / 일반 파랑 / 주의 주황), 발자국 마커, 스텝 핀, 범례
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, Image } from 'react-native';
import Svg, { Polyline, Circle, G, Text as SvgText, Rect, Path, Defs, Pattern } from 'react-native-svg';
import { TOKENS } from '../../theme/tokens';
import { LonLat, RouteFeatureCollection, RouteStepPin, RouteSegmentFeature, SegmentType } from '../../types/route';
import { buildCourseSummary } from '../../services/routeGeometry';
import { calculateOsmTiles } from '../../services/osmTileService';
import { CourseSummaryCard } from './CourseSummaryCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_WIDTH = Math.min(SCREEN_WIDTH - 40, 360);
const MAP_HEIGHT = 380;

const SEGMENT_COLORS: Record<SegmentType, string> = {
  safe: TOKENS.colors.routeSafe,
  normal: TOKENS.colors.routeNormal,
  caution: TOKENS.colors.routeCaution,
};

interface LegendItem {
  readonly type: SegmentType;
  readonly label: string;
}

const LEGEND: readonly LegendItem[] = [
  { type: 'safe', label: '완만/그늘' },
  { type: 'normal', label: '일반 보도' },
  { type: 'caution', label: '주의 구간' },
];

export interface RouteMapViewProps {
  readonly route: RouteFeatureCollection;
  readonly stepPins: readonly RouteStepPin[];
  readonly speedKmH: number;
  readonly onStart?: () => void;
  readonly onPinSelect?: (instruction: string) => void;
}

export const RouteMapView: React.FC<RouteMapViewProps> = ({
  route,
  stepPins,
  speedKmH,
  onStart,
  onPinSelect,
}) => {
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  const allCoords = useMemo<LonLat[]>(
    () => route.features.flatMap((f: RouteSegmentFeature) => [...f.geometry.coordinates]),
    [route],
  );

  const summary = useMemo(() => buildCourseSummary(route, speedKmH), [route, speedKmH]);

  // 좌표 투영 계산
  const project = useMemo(() => {
    if (allCoords.length === 0) return () => ({ x: 0, y: 0 });

    const lons = allCoords.map((c: LonLat) => c[0]), lats = allCoords.map((c: LonLat) => c[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);

    const padding = 40;
    const innerW = MAP_WIDTH - padding * 2, innerH = MAP_HEIGHT - padding * 2;
    const lonSpan = Math.max(maxLon - minLon, 1e-9), latSpan = Math.max(maxLat - minLat, 1e-9);
    const scale = Math.min(innerW / lonSpan, innerH / latSpan);
    const offsetX = padding + (innerW - lonSpan * scale) / 2, offsetY = padding + (innerH - latSpan * scale) / 2;

    return ([lon, lat]: LonLat) => ({
      x: offsetX + (lon - minLon) * scale,
      y: offsetY + (maxLat - lat) * scale,
    });
  }, [allCoords]);

  if (allCoords.length === 0) return null;

  const startPt = project(allCoords[0]);
  const selectedPin = stepPins.find((p: RouteStepPin) => p.id === selectedPinId);
  const tiles = useMemo(() => calculateOsmTiles(allCoords, project, 15), [allCoords, project]);

  const handlePinPress = (pin: RouteStepPin) => {
    setSelectedPinId(pin.id);
    onPinSelect?.(pin.instruction);
  };

  return (
    <View style={styles.container}>
      {/* 지도 캔버스 영역 */}
      <View style={styles.mapCanvas}>
        {/* 실제 OpenStreetMap 도로/공원 배경 타일 레이어 */}
        <View style={StyleSheet.absoluteFill}>
          {tiles.map((tile) => (
            <Image
              key={tile.key}
              source={{ uri: tile.url }}
              style={[styles.osmTile, { left: tile.x, top: tile.y, width: tile.width, height: tile.height }]}
              resizeMode="cover"
            />
          ))}
        </View>

        <Svg width={MAP_WIDTH} height={MAP_HEIGHT}>
          <Defs>
            <Pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <Path d="M 30 0 L 0 0 0 30" fill="none" stroke="#D5E6DB" strokeWidth="0.8" />
            </Pattern>
          </Defs>
          <Rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#grid)" />

          {/* 1. 3색 Polyline 렌더링 */}
          {route.features.map((feature: RouteSegmentFeature) => {
            const color = SEGMENT_COLORS[feature.properties.segmentType];
            const startCoord = feature.geometry.coordinates[0];
            const segKey = `seg_${feature.properties.segmentType}_${startCoord[0]}_${startCoord[1]}`;
            const pointsStr = feature.geometry.coordinates
              .map((c: LonLat) => {
                const pt = project(c);
                return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
              })
              .join(' ');

            return (
              <G key={segKey}>
                <Polyline points={pointsStr} fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                <Polyline points={pointsStr} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              </G>
            );
          })}

          {/* 2. 회전 및 주의 스텝 핀 (시각 그래픽) */}
          {stepPins.map((pin: RouteStepPin) => {
            const pt = project(pin.position);
            const isCaution = pin.kind === 'caution';
            const color = isCaution ? TOKENS.colors.routeCaution : TOKENS.colors.routeNormal;
            const isSelected = pin.id === selectedPinId;

            return (
              <G key={pin.id}>
                <Circle cx={pt.x} cy={pt.y} r={isSelected ? 14 : 11} fill={color} stroke="#FFFFFF" strokeWidth="2.5" />
                <SvgText x={pt.x} y={pt.y + 4} textAnchor="middle" fontSize={isSelected ? '13' : '11'} fontWeight="bold" fill="#FFFFFF">
                  {isCaution ? '!' : '↱'}
                </SvgText>
              </G>
            );
          })}

          {/* 3. 출발/도착 발자국 원형 마커 */}
          <G>
            <Circle cx={startPt.x} cy={startPt.y} r={18} fill={TOKENS.colors.primary} opacity={0.2} />
            <Circle cx={startPt.x} cy={startPt.y} r={13} fill={TOKENS.colors.primary} stroke="#FFFFFF" strokeWidth="2.5" />
            <SvgText x={startPt.x} y={startPt.y - 18} textAnchor="middle" fontSize="10" fontWeight="bold" fill={TOKENS.colors.primaryDark}>
              출발/도착
            </SvgText>
          </G>
        </Svg>

        {/* 핀 터치 인터랙션 오버레이 (Web/Mobile 100% 호환 Thumb Zone) */}
        {stepPins.map((pin: RouteStepPin) => {
          const pt = project(pin.position);
          return (
            <Pressable
              key={`touch_${pin.id}`}
              style={[styles.pinTouchTarget, { left: pt.x - 16, top: pt.y - 16 }]}
              onPress={() => handlePinPress(pin)}
              accessibilityRole="button"
              accessibilityLabel={pin.instruction}
            />
          );
        })}

        {/* 범례 오버레이 */}
        <View style={styles.legend}>
          {LEGEND.map((item: LegendItem) => {
            return (
              <View key={item.type} style={styles.legendItem}>
                <View style={[styles.legendBar, { backgroundColor: SEGMENT_COLORS[item.type] }]} />
                <Text style={styles.legendLabel}>{item.label}</Text>
              </View>
            );
          })}
        </View>

        {/* 스텝 안내 브리핑 배너 */}
        {selectedPin && (
          <View style={styles.briefingBanner}>
            <Text style={styles.briefingText}>🔊 {selectedPin.instruction}</Text>
          </View>
        )}
      </View>

      {/* 코스 요약 카드 */}
      <View style={styles.summaryWrapper}>
        <CourseSummaryCard summary={summary} onStart={onStart} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'column' },
  mapCanvas: {
    borderRadius: TOKENS.borderRadius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    backgroundColor: '#F0F7F3',
    position: 'relative',
    alignSelf: 'center',
  },
  osmTile: { position: 'absolute', opacity: 0.9 },
  pinTouchTarget: { position: 'absolute', width: 32, height: 32, borderRadius: 16, zIndex: 10 },
  legend: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendBar: { width: 14, height: 4, borderRadius: 2 },
  legendLabel: { fontSize: 10, color: TOKENS.colors.textMain, fontWeight: '500' },
  briefingBanner: {
    position: 'absolute', bottom: 10, left: 10, right: 10,
    backgroundColor: TOKENS.colors.textMain, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
  },
  briefingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  summaryWrapper: { marginTop: 12 },
});
