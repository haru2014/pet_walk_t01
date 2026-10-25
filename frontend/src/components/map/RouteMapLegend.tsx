import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { TOKENS } from '../../theme/tokens';
import { useAppTheme } from '../../theme/themeManager';
import { getMapRouteColors } from '../../constants/mapStyles';
import {
  SLOPE_GRADE_STYLE,
  SURFACE_TEMP_STYLE,
  type SlopeGrade,
  type SurfaceTempBand,
} from './routeConditionLayers';

export type RouteMapLayer = 'course' | 'real_osm' | 'slope' | 'temperature';

const COURSE_LEGEND = [
  { type: 'safe', label: '편안한 길' },
  { type: 'normal', label: '보통 길' },
  { type: 'caution', label: '주의 구간' },
] as const;

const TEMP_ORDER: SurfaceTempBand[] = ['safe', 'cautionLow', 'cautionHigh', 'danger', 'unknown'];
const SLOPE_ORDER: SlopeGrade[] = ['flat', 'gentleUp', 'steepUp', 'gentleDown', 'steepDown', 'unknown'];

export interface RouteMapLegendProps {
  mode?: RouteMapLayer;
  hasTempData?: boolean;
  hasSlopeData?: boolean;
  /** 하위 호환용 (토글 제거됨) */
  temperatureOn?: boolean;
  slopeOn?: boolean;
  onToggleTemperature?: () => void;
  onToggleSlope?: () => void;
  bottomOffset?: number;
  isModalView?: boolean;
}

/**
 * 지도 범례 영역 (단독 표시 또는 모달 팝업 내부 렌더링 지원)
 * - 산책길 색상 안내
 * - 길바닥 온도와 오르막·내리막 범례
 */
export const RouteMapLegend: React.FC<RouteMapLegendProps> = ({
  mode = 'course',
  hasTempData = false,
  hasSlopeData = false,
  isModalView = false,
}) => {
  const { theme, colors } = useAppTheme();
  const routeColors = getMapRouteColors(theme);
  if (mode !== 'course') return null;

  return (
    <View
      style={[
        styles.legendContainer,
        { backgroundColor: isModalView ? 'transparent' : colors.surface, borderColor: colors.border },
        isModalView && styles.modalLegendContainer,
      ]}
      accessibilityLabel="지도 범례"
    >
      <View style={styles.legendContent}>
        {/* 1. 코스 보행로 (경로 선 색상 - 온도 오인 방지) */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>길 종류</Text>
          </View>
          <View style={styles.itemsWrap}>
            {COURSE_LEGEND.map((item) => (
              <View key={item.label} style={styles.legendItem}>
                <View style={[styles.legendBar, { backgroundColor: routeColors[item.type] }]} />
                <Text style={[styles.legendLabel, { color: colors.textMain }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 2. 길바닥 온도 범례 */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>길바닥 온도</Text>
            {!hasTempData && <Text style={[styles.statusBadge, { color: colors.textMuted }]}>정보 없음</Text>}
          </View>
          <View style={styles.itemsWrap}>
            {TEMP_ORDER.map((band) => {
              const item = SURFACE_TEMP_STYLE[band];
              const isUnknown = band === 'unknown';
              return (
                <View
                  key={item.label}
                  style={[
                    styles.legendItem,
                    !hasTempData && isUnknown && styles.activeUnknownItem,
                  ]}
                >
                  <View style={[styles.legendBar, { backgroundColor: item.color }]} />
                  <Text
                    style={[
                      styles.legendLabel,
                      { color: colors.textMain },
                      !hasTempData && isUnknown && styles.activeUnknownText,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* 3. 오르막·내리막 범례 */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>오르막·내리막</Text>
            {!hasSlopeData && <Text style={[styles.statusBadge, { color: colors.textMuted }]}>정보 없음</Text>}
          </View>
          <View style={styles.itemsWrap}>
            {SLOPE_ORDER.map((grade) => {
              const item = SLOPE_GRADE_STYLE[grade];
              const isUnknown = grade === 'unknown';
              return (
                <View
                  key={item.label}
                  style={[
                    styles.legendItem,
                    !hasSlopeData && isUnknown && styles.activeUnknownItem,
                  ]}
                >
                  <Text style={[styles.legendSymbol, { color: item.color }]}>{item.symbol}</Text>
                  <Text
                    style={[
                      styles.legendLabel,
                      { color: colors.textMain },
                      !hasSlopeData && isUnknown && styles.activeUnknownText,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  legendContainer: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 5,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  modalLegendContainer: {
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    maxWidth: '100%',
  },
  legendContent: {
    gap: 3,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 16,
    gap: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 112,
    flexShrink: 0,
    gap: 3,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.textMuted,
  },
  statusBadge: {
    fontSize: 8,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
  },
  itemsWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 6,
    rowGap: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  activeUnknownItem: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  activeUnknownText: {
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  legendBar: {
    width: 12,
    height: 3,
    borderRadius: 2,
  },
  legendSymbol: {
    fontSize: 11,
    fontWeight: '800',
    minWidth: 11,
    textAlign: 'center',
  },
  legendLabel: {
    fontSize: 10,
    color: TOKENS.colors.textMain,
    fontWeight: '500',
  },
});
