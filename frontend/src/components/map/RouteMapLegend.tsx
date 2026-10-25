import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { TOKENS, TYPOGRAPHY } from '../../theme/tokens';
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
}

/**
 * 지도 바로 아래에 별도로 항상 표시되는 범례 영역 (사용자 조작 최소화)
 * - 산책길 색상 안내
 * - 길바닥 온도와 오르막·내리막 범례
 */
export const RouteMapLegend: React.FC<RouteMapLegendProps> = ({
  mode = 'course',
  hasTempData = false,
  hasSlopeData = false,
}) => {
  const { theme, colors } = useAppTheme();
  const routeColors = getMapRouteColors(theme);
  if (mode !== 'course') return null;

  return (
    <View style={[styles.legendContainer, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel="지도 범례">
      <ScrollView
        style={styles.legendScroll}
        contentContainerStyle={styles.legendScrollContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {/* 1. 코스 보행로 (경로 선 색상 - 온도 오인 방지) */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>코스 보행로</Text>
            <Text style={[styles.sectionHint, { color: colors.textMuted }]}>경로 선 색상</Text>
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

        <View style={styles.divider} />

        {/* 2. 길바닥 온도 범례 */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>길바닥 온도</Text>
            {!hasTempData && <Text style={[styles.statusBadge, { color: colors.textMuted }]}>아직 정보가 없어요</Text>}
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

        <View style={styles.divider} />

        {/* 3. 오르막·내리막 범례 */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>오르막·내리막</Text>
            {!hasSlopeData && <Text style={[styles.statusBadge, { color: colors.textMuted }]}>아직 정보가 없어요</Text>}
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
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  legendContainer: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  legendScroll: {
    maxHeight: 140,
  },
  legendScrollContent: {
    gap: 7,
    paddingBottom: 2,
  },
  section: {
    gap: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    color: TOKENS.colors.textMuted,
  },
  sectionHint: {
    fontSize: TYPOGRAPHY.label,
    color: TOKENS.colors.textMuted,
    fontWeight: '500',
  },
  statusBadge: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F3F1',
    marginVertical: 1,
  },
  itemsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 4,
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
    width: 14,
    height: 4,
    borderRadius: 2,
  },
  legendSymbol: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '800',
    minWidth: 14,
    textAlign: 'center',
  },
  legendLabel: {
    fontSize: TYPOGRAPHY.label,
    color: TOKENS.colors.textMain,
    fontWeight: '500',
  },
});
