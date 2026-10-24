/**
 * [편안하개 - PetWalk]
 * 모바일 코스 프리뷰 지도 뷰 (Phase 3, US-C1)
 *
 * 3색 Polyline 벡터 경로, 발자국 마커, 스텝 핀, 범례
 * [🗺️ 실제 OSM 지도 / 🧭 안심 코스 뷰] 듀얼 모드 지원
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, Image, TouchableOpacity, Platform } from 'react-native';
import NativeSvg, { Polyline as NativePolyline, Circle as NativeCircle, G as NativeG, Text as NativeSvgText, Polygon as NativePolygon, Rect as NativeRect } from 'react-native-svg';
import { TOKENS } from '../../theme/tokens';

const isWeb = Platform.OS === 'web';
const cleanWebProps = ({ accessible, style, ...props }: any) => {
  const flat = Array.isArray(style) ? StyleSheet.flatten(style) : style;
  return flat ? { style: flat, ...props } : props;
};

const Svg: React.ComponentType<any> = isWeb ? (props: any) => <svg {...cleanWebProps(props)} /> : NativeSvg;
const Polyline: React.ComponentType<any> = isWeb ? (props: any) => <polyline {...cleanWebProps(props)} /> : NativePolyline;
const Circle: React.ComponentType<any> = isWeb ? (props: any) => <circle {...cleanWebProps(props)} /> : NativeCircle;
const G: React.ComponentType<any> = isWeb ? (props: any) => <g {...cleanWebProps(props)} /> : NativeG;
const SvgText: React.ComponentType<any> = isWeb ? (props: any) => <text {...cleanWebProps(props)} /> : NativeSvgText;
const Polygon: React.ComponentType<any> = isWeb ? (props: any) => <polygon {...cleanWebProps(props)} /> : NativePolygon;
const Rect: React.ComponentType<any> = isWeb ? (props: any) => <rect {...cleanWebProps(props)} /> : NativeRect;

function getTurnArrowSymbol(instruction?: string): string {
  if (!instruction) return '↱';
  if (instruction.includes('좌회전') || instruction.includes('좌측')) return '↰';
  if (instruction.includes('우회전') || instruction.includes('우측')) return '↱';
  if (instruction.includes('직진')) return '↑';
  if (instruction.includes('유턴')) return '↶';
  return '↱';
}
import { LonLat, RouteFeatureCollection, RouteStepPin, RouteSegmentFeature } from '../../types/route';
import { buildCourseSummary } from '../../services/routeGeometry';
import { calculateOsmTiles } from '../../services/osmTileService';
import { CourseSummaryCard } from './CourseSummaryCard';
import { RealOsmWebView } from './RealOsmWebView';
import { RouteMapLegend, SEGMENT_COLORS } from './RouteMapLegend';
import { AppIcon } from '../common/AppIcon';
import {
  buildSlopeArrowMarks,
  classifySlopeSignedPercent,
  classifySurfaceTempC,
  resolveSegmentCondition,
  slopeArrowPolygonPoints,
  slopeFlatBarPoints,
  SLOPE_GRADE_STYLE,
  SURFACE_TEMP_STYLE,
  type SegmentConditionValues,
} from './routeConditionLayers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_WIDTH = Math.min(SCREEN_WIDTH - 40, 360);
const MAP_HEIGHT = 380;

export interface RouteMapViewProps {
  readonly route: RouteFeatureCollection;
  readonly stepPins: readonly RouteStepPin[];
  readonly speedKmH: number;
  readonly onStart?: () => void;
  readonly onPinSelect?: (instruction: string) => void;
  /** 세그먼트 인덱스 순. 없으면 GeoJSON properties.surfaceTempC / slopeSignedPercent 사용 */
  readonly segmentConditions?: readonly SegmentConditionValues[];
}

export const RouteMapView: React.FC<RouteMapViewProps> = ({
  route,
  stepPins,
  speedKmH,
  onStart,
  onPinSelect,
  segmentConditions,
}) => {
  const [mapMode, setMapMode] = useState<'course' | 'real_osm'>('course');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const hasTempData = useMemo(() => {
    return route.features.some((feature, index) => {
      const condition = resolveSegmentCondition(feature.properties, segmentConditions?.[index]);
      return condition.surfaceTempC != null && !Number.isNaN(condition.surfaceTempC);
    });
  }, [route.features, segmentConditions]);

  const hasSlopeData = useMemo(() => {
    return route.features.some((feature, index) => {
      const condition = resolveSegmentCondition(feature.properties, segmentConditions?.[index]);
      return condition.slopeSignedPercent != null && !Number.isNaN(condition.slopeSignedPercent);
    });
  }, [route.features, segmentConditions]);

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
  const endPt = project(allCoords[allCoords.length - 1]);
  const isLoop = Math.hypot(startPt.x - endPt.x, startPt.y - endPt.y) < 20;
  const selectedPin = stepPins.find((p) => p.id === selectedPinId);
  const tiles = useMemo(() => calculateOsmTiles(allCoords, project, 16, 'osm'), [allCoords, project]);

  const overlaySegments = useMemo(() => {
    return route.features.map((feature, index) => {
      const condition = resolveSegmentCondition(feature.properties, segmentConditions?.[index]);
      const projected = feature.geometry.coordinates.map((c) => project(c));
      const hasValidTemp = condition.surfaceTempC != null && !Number.isNaN(condition.surfaceTempC);
      const hasValidSlope = condition.slopeSignedPercent != null && !Number.isNaN(condition.slopeSignedPercent);
      const tempBand = classifySurfaceTempC(condition.surfaceTempC);
      const slopeGrade = classifySlopeSignedPercent(condition.slopeSignedPercent);
      const segKey = `seg_${index}_${feature.geometry.coordinates[0].join('_')}`;
      return {
        segKey,
        pointsStr: projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
        courseColor: SEGMENT_COLORS[feature.properties.segmentType],
        hasValidTemp,
        tempColor: SURFACE_TEMP_STYLE[tempBand].color,
        hasValidSlope,
        slopeGrade,
        slopeMarks: hasValidSlope ? buildSlopeArrowMarks(projected, slopeGrade, segKey) : [],
      };
    });
  }, [project, route.features, segmentConditions]);

  return (
    <View style={styles.container}>
      {/* 듀얼 맵 모드 스위치 바 */}
      <View style={styles.modeSwitchBar}>
        <TouchableOpacity
          style={[styles.modeTab, mapMode === 'course' && styles.modeTabActive]}
          onPress={() => setMapMode('course')}
        >
          <View style={styles.modeTabContent}>
            <AppIcon name="map" size={15} color={mapMode === 'course' ? TOKENS.colors.primaryDark : TOKENS.colors.textMuted} />
            <Text style={[styles.modeTabText, mapMode === 'course' && styles.modeTabTextActive]}>안심 코스 뷰</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, mapMode === 'real_osm' && styles.modeTabActive]}
          onPress={() => setMapMode('real_osm')}
        >
          <View style={styles.modeTabContent}>
            <AppIcon name="map" size={15} color={mapMode === 'real_osm' ? TOKENS.colors.primaryDark : TOKENS.colors.textMuted} />
            <Text style={[styles.modeTabText, mapMode === 'real_osm' && styles.modeTabTextActive]}>실제 OSM 지도</Text>
          </View>
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
            {overlaySegments.map((segment) => {
              // 실제 온도 데이터가 있을 때만 온도 색상을 적용하고, 없으면 코스 보행로 색상 유지 (오인 방지)
              const color = segment.hasValidTemp ? segment.tempColor : segment.courseColor;
              return (
                <G key={segment.segKey}>
                  <Polyline points={segment.pointsStr} fill="none" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                  <Polyline points={segment.pointsStr} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                </G>
              );
            })}
            {overlaySegments.flatMap((segment) =>
              segment.slopeMarks.map((mark) => {
                const style = SLOPE_GRADE_STYLE[mark.grade];
                const alongTravel = mark.grade === 'gentleUp' || mark.grade === 'steepUp' || mark.grade === 'unknown' || mark.grade === 'flat';
                const size = mark.grade === 'steepUp' || mark.grade === 'steepDown' ? 7.5 : 6;
                const points =
                  mark.grade === 'flat'
                    ? slopeFlatBarPoints(mark, 5)
                    : slopeArrowPolygonPoints(mark, size, mark.grade === 'unknown' ? true : alongTravel);
                return (
                  <G key={mark.id}>
                    <Polygon points={points} fill={style.color} stroke="#FFFFFF" strokeWidth="0.8" />
                    {mark.grade === 'steepUp' || mark.grade === 'steepDown' ? (
                      <Polygon
                        points={slopeArrowPolygonPoints(
                          {
                            ...mark,
                            x: mark.x - Math.cos(mark.headingRad) * 7,
                            y: mark.y - Math.sin(mark.headingRad) * 7,
                          },
                          size,
                          alongTravel,
                        )}
                        fill={style.color}
                        stroke="#FFFFFF"
                        strokeWidth="0.8"
                      />
                    ) : null}
                  </G>
                );
              }),
            )}

            {stepPins.map((pin) => {
              const pt = project(pin.position);
              const isCaution = pin.kind === 'caution';
              const isSelected = pin.id === selectedPinId;
              const symbol = isCaution ? '!' : getTurnArrowSymbol(pin.instruction);

              // 짙은 초록색 계열(TOKENS.colors.primaryDark) 테마 색상 적용 및 명확한 테두리 대비
              const strokeColor = isCaution ? TOKENS.colors.routeCaution : TOKENS.colors.primaryDark;
              const textColor = isCaution ? TOKENS.colors.routeCaution : TOKENS.colors.primaryDark;

              const outerR = isSelected ? 15 : 12;
              const innerR = isSelected ? 13 : 10.5;

              return (
                <G key={pin.id}>
                  {/* 외곽 대비 테두리 (지도 배경과 확실히 분리) */}
                  <Circle cx={pt.x} cy={pt.y} r={outerR} fill="#FFFFFF" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
                  {/* 테마 색상 보더 원형 */}
                  <Circle cx={pt.x} cy={pt.y} r={innerR} fill="#FFFFFF" stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 2} />
                  {/* 짙은 초록색 계열 방향 전환 화살표 / 주의 마커 */}
                  <SvgText
                    x={pt.x}
                    y={pt.y + (isCaution ? 4 : 3.5)}
                    textAnchor="middle"
                    fontSize={isSelected ? '13' : '11'}
                    fontWeight="bold"
                    fill={textColor}
                  >
                    {symbol}
                  </SvgText>
                </G>
              );
            })}

            {isLoop ? (
              <G key="marker_start_loop">
                {/* 은은한 연민트 외곽 헤일로 */}
                <Circle cx={startPt.x} cy={startPt.y} r={18} fill={TOKENS.colors.primaryLight} opacity={0.35} stroke="#FFFFFF" strokeWidth="1.5" />
                {/* 짙은 초록색 메인 마커 원형 */}
                <Circle cx={startPt.x} cy={startPt.y} r={12} fill={TOKENS.colors.primaryDark} stroke="#FFFFFF" strokeWidth="2.5" />
                <Circle cx={startPt.x} cy={startPt.y} r={3.5} fill="#FFFFFF" />

                {/* 텍스트 가독성을 위한 최소형 반투명 배경 알약 라벨 */}
                <Rect
                  x={startPt.x - 28}
                  y={startPt.y - 33}
                  width={56}
                  height={17}
                  rx={8.5}
                  ry={8.5}
                  fill="rgba(255, 255, 255, 0.94)"
                  stroke="rgba(8, 127, 91, 0.3)"
                  strokeWidth="1"
                />
                <SvgText
                  x={startPt.x}
                  y={startPt.y - 20}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="bold"
                  fill={TOKENS.colors.primaryDark}
                >
                  출발/도착
                </SvgText>
              </G>
            ) : (
              <G key="marker_start_end_group">
                {/* 출발지 마커 */}
                <Circle cx={startPt.x} cy={startPt.y} r={18} fill={TOKENS.colors.primaryLight} opacity={0.35} stroke="#FFFFFF" strokeWidth="1.5" />
                <Circle cx={startPt.x} cy={startPt.y} r={12} fill={TOKENS.colors.primaryDark} stroke="#FFFFFF" strokeWidth="2.5" />
                <Circle cx={startPt.x} cy={startPt.y} r={3.5} fill="#FFFFFF" />

                <Rect
                  x={startPt.x - 18}
                  y={startPt.y - 33}
                  width={36}
                  height={17}
                  rx={8.5}
                  ry={8.5}
                  fill="rgba(255, 255, 255, 0.94)"
                  stroke="rgba(8, 127, 91, 0.3)"
                  strokeWidth="1"
                />
                <SvgText
                  x={startPt.x}
                  y={startPt.y - 20}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="bold"
                  fill={TOKENS.colors.primaryDark}
                >
                  출발
                </SvgText>

                {/* 도착지 마커 (형태, 색상, 라벨로 명확히 분리) */}
                <Circle cx={endPt.x} cy={endPt.y} r={18} fill="rgba(239, 68, 68, 0.15)" stroke="#FFFFFF" strokeWidth="1.5" />
                <Circle cx={endPt.x} cy={endPt.y} r={12} fill={TOKENS.colors.error} stroke="#FFFFFF" strokeWidth="2.5" />
                <Circle cx={endPt.x} cy={endPt.y} r={3.5} fill="#FFFFFF" />

                <Rect
                  x={endPt.x - 18}
                  y={endPt.y - 33}
                  width={36}
                  height={17}
                  rx={8.5}
                  ry={8.5}
                  fill="rgba(255, 255, 255, 0.94)"
                  stroke="rgba(239, 68, 68, 0.3)"
                  strokeWidth="1"
                />
                <SvgText
                  x={endPt.x}
                  y={endPt.y - 20}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="bold"
                  fill={TOKENS.colors.error}
                >
                  도착
                </SvgText>
              </G>
            )}
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

          {selectedPin && (
            <View style={styles.briefingBanner}>
              <Text style={styles.briefingText}>🔊 {selectedPin.instruction}</Text>
            </View>
          )}
        </View>
      )}

      {/* 지도 바로 아래 별도 범례 영역 (토글 없이 지면온도/경사도 상시 표시) */}
      {mapMode === 'course' ? (
        <RouteMapLegend
          mode={mapMode}
          hasTempData={hasTempData}
          hasSlopeData={hasSlopeData}
        />
      ) : null}

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
  modeTabContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  mapCanvas: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    borderRadius: TOKENS.borderRadius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.mapGround,
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
  summaryWrapper: { marginTop: 8 },
});
