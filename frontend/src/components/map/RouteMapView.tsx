/**
 * [편안하개 - PetWalk]
 * 모바일 코스 프리뷰 지도 뷰 (Phase 3, US-C1)
 *
 * 3색 Polyline 벡터 경로, 발자국 마커, 스텝 핀, 범례
 * [🗺️ 실제 OSM 지도 / 🧭 안심 코스 뷰] 듀얼 모드 지원
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, Image, TouchableOpacity } from 'react-native';
import Svg, { Polyline, Circle, G, Text as SvgText } from 'react-native-svg';
import { TOKENS } from '../../theme/tokens';
import { LonLat, RouteFeatureCollection, RouteStepPin, RouteSegmentFeature } from '../../types/route';
import { buildCourseSummary } from '../../services/routeGeometry';
import { calculateOsmTiles } from '../../services/osmTileService';
import { CourseSummaryCard } from './CourseSummaryCard';
import { RealOsmWebView } from './RealOsmWebView';
import { RouteMapLegend, SEGMENT_COLORS } from './RouteMapLegend';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_WIDTH = Math.min(SCREEN_WIDTH - 40, 360);
const MAP_HEIGHT = 380;

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
  const [mapMode, setMapMode] = useState<'course' | 'real_osm'>('course');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  const allCoords = useMemo<LonLat[]>(
    () => route.features.flatMap((f: RouteSegmentFeature) => [...f.geometry.coordinates]),
    [route],
  );
  const summary = useMemo(() => buildCourseSummary(route, speedKmH), [route, speedKmH]);

  const project = useMemo(() => {
    if (allCoords.length === 0) return () => ({ x: 0, y: 0 });
    const lons = allCoords.map((c) => c[0]), lats = allCoords.map((c) => c[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const padding = 40, innerW = MAP_WIDTH - padding * 2, innerH = MAP_HEIGHT - padding * 2;
    const lonSpan = Math.max(maxLon - minLon, 1e-9), latSpan = Math.max(maxLat - minLat, 1e-9);
    const scale = Math.min(innerW / lonSpan, innerH / latSpan);
    const offsetX = padding + (innerW - lonSpan * scale) / 2, offsetY = padding + (innerH - latSpan * scale) / 2;
    return ([lon, lat]: LonLat) => ({ x: offsetX + (lon - minLon) * scale, y: offsetY + (maxLat - lat) * scale });
  }, [allCoords]);

  if (allCoords.length === 0) return null;

  const startPt = project(allCoords[0]);
  const selectedPin = stepPins.find((p) => p.id === selectedPinId);
  const tiles = useMemo(() => calculateOsmTiles(allCoords, project, 16, 'osm'), [allCoords, project]);

  return (
    <View style={styles.container}>
      {/* 듀얼 맵 모드 스위치 바 */}
      <View style={styles.modeSwitchBar}>
        <TouchableOpacity
          style={[styles.modeTab, mapMode === 'course' && styles.modeTabActive]}
          onPress={() => setMapMode('course')}
        >
          <Text style={[styles.modeTabText, mapMode === 'course' && styles.modeTabTextActive]}>
            🧭 안심 코스 뷰
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, mapMode === 'real_osm' && styles.modeTabActive]}
          onPress={() => setMapMode('real_osm')}
        >
          <Text style={[styles.modeTabText, mapMode === 'real_osm' && styles.modeTabTextActive]}>
            🗺️ 실제 OSM 지도
          </Text>
        </TouchableOpacity>
      </View>

      {/* 지도 영역 */}
      {mapMode === 'real_osm' ? (
        <RealOsmWebView coords={allCoords} width={MAP_WIDTH} height={MAP_HEIGHT} />
      ) : (
        <View style={styles.mapCanvas}>
          {/* 깨끗한 OSM 실제 타일 배경 */}
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

          <Svg width={MAP_WIDTH} height={MAP_HEIGHT} style={[StyleSheet.absoluteFill, { zIndex: 2 }]}>
            {route.features.map((feature: RouteSegmentFeature) => {
              const color = SEGMENT_COLORS[feature.properties.segmentType];
              const segKey = `seg_${feature.properties.segmentType}_${feature.geometry.coordinates[0].join('_')}`;
              const pointsStr = feature.geometry.coordinates
                .map((c) => `${project(c).x.toFixed(1)},${project(c).y.toFixed(1)}`).join(' ');
              return (
                <G key={segKey}>
                  <Polyline points={pointsStr} fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                  <Polyline points={pointsStr} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                </G>
              );
            })}

            {stepPins.map((pin) => {
              const pt = project(pin.position);
              const color = pin.kind === 'caution' ? TOKENS.colors.routeCaution : TOKENS.colors.routeNormal;
              const isSelected = pin.id === selectedPinId;
              return (
                <G key={pin.id}>
                  <Circle cx={pt.x} cy={pt.y} r={isSelected ? 14 : 11} fill={color} stroke="#FFFFFF" strokeWidth="2.5" />
                  <SvgText x={pt.x} y={pt.y + 4} textAnchor="middle" fontSize={isSelected ? '13' : '11'} fontWeight="bold" fill="#FFFFFF">
                    {pin.kind === 'caution' ? '!' : '↱'}
                  </SvgText>
                </G>
              );
            })}

            <G>
              <Circle cx={startPt.x} cy={startPt.y} r={18} fill={TOKENS.colors.primary} opacity={0.25} />
              <Circle cx={startPt.x} cy={startPt.y} r={13} fill={TOKENS.colors.primary} stroke="#FFFFFF" strokeWidth="2.5" />
              <SvgText x={startPt.x} y={startPt.y - 18} textAnchor="middle" fontSize="10" fontWeight="bold" fill={TOKENS.colors.primaryDark}>
                출발/도착
              </SvgText>
            </G>
          </Svg>

          {stepPins.map((pin) => {
            const pt = project(pin.position);
            return (
              <Pressable
                key={`touch_${pin.id}`}
                style={[styles.pinTouchTarget, { left: pt.x - 16, top: pt.y - 16 }]}
                onPress={() => { setSelectedPinId(pin.id); onPinSelect?.(pin.instruction); }}
                accessibilityRole="button"
                accessibilityLabel={pin.instruction}
              />
            );
          })}

          <RouteMapLegend />

          {selectedPin && (
            <View style={styles.briefingBanner}>
              <Text style={styles.briefingText}>🔊 {selectedPin.instruction}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.summaryWrapper}>
        <CourseSummaryCard summary={summary} onStart={onStart} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'column' },
  modeSwitchBar: {
    flexDirection: 'row',
    backgroundColor: '#E6EFEA',
    borderRadius: 12,
    padding: 3,
    marginBottom: 8,
    alignSelf: 'center',
    width: MAP_WIDTH,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 9,
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  modeTabTextActive: {
    color: TOKENS.colors.primaryDark,
  },
  mapCanvas: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    borderRadius: TOKENS.borderRadius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    backgroundColor: '#F0F7F3',
    position: 'relative',
    alignSelf: 'center',
  },
  osmTile: { position: 'absolute', opacity: 0.95 },
  pinTouchTarget: { position: 'absolute', width: 32, height: 32, borderRadius: 16, zIndex: 10 },
  briefingBanner: {
    position: 'absolute', bottom: 10, left: 10, right: 10,
    backgroundColor: TOKENS.colors.textMain, borderRadius: 12,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  briefingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  summaryWrapper: { marginTop: 12 },
});
