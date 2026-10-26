import { TYPOGRAPHY } from '../../theme/tokens';
/**
 * [편안하개 - PetWalk]
 * 디자인 시안 02번 (Dusty Amber & Sage Green) 메인 카드
 * (docs/reference/UI개선/app_design_n2-1.png 기준)
 *
 * 1. 상단 오버랩 강아지 캐릭터 마스코트 (dog_character.png)
 * 2. Dusty Amber 메인 카드 + 48px 이상 강아지 드롭다운 & 알림 종 버튼
 * 3. 실제 코스 지도 (RouteMapView flex 반응형)
 * 4. 산책 거리(km) & 소요 시간(분) 및 원터치 [산책 시작] 바인딩
 */

import React, { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { DogProfile } from '../../types/dogProfile';
import { RouteFeatureCollection } from '../../types/route';
import { createCurrentLocationPin } from '../../services/locationPinHelper';
import { RouteMapView } from '../map/RouteMapView';
import { HomeDogDropdownN2 } from './HomeDogDropdownN2';
import { useAppTheme } from '../../theme/themeManager';
import dogMascotImg from '../../../assets/ui_n2/dog_character.png';
import bellIconImg from '../../../assets/ui_n2/bell_icon.png';

const EMPTY_FREE_ROUTE: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export interface HomeParkWalkCardN2Props {
  dog: DogProfile;
  dogs?: readonly DogProfile[];
  onSelectDog?: (dogId: string) => void;
  onPressProfile?: () => void;
  onPressNotification?: () => void;
  onStartWalk?: () => void;
  estimatedMinutes?: number | string;
  distanceKm?: string;
  courseName?: string;
  userCoords?: { lon: number; lat: number } | null;
  hasUnreadNotification?: boolean;
}

function resolveCardTextColor(isDark: boolean, theme: string, textMain: string): string {
  if (isDark) return textMain;
  return theme === 'dusty_amber' ? '#2D3A31' : textMain;
}

function resolveDisplayTime(estimatedMinutes?: number | string): string {
  if (estimatedMinutes == null) return '자율';
  return typeof estimatedMinutes === 'number' ? `${estimatedMinutes}분` : estimatedMinutes;
}

function resolveMetricsCardBg(isDark: boolean, theme: string, background: string): string {
  if (isDark) return background;
  return theme === 'dusty_amber' ? '#F4DFBD' : 'rgba(255, 255, 255, 0.5)';
}

export const HomeParkWalkCardN2: React.FC<HomeParkWalkCardN2Props> = ({
  dog,
  dogs,
  onSelectDog,
  onPressProfile,
  onPressNotification,
  onStartWalk,
  estimatedMinutes,
  distanceKm,
  courseName = '바로 산책하기',
  userCoords,
  hasUnreadNotification = true,
}) => {
  const { theme, colors } = useAppTheme();
  const [showDropdown, setShowDropdown] = useState(false);
  const isMultiDog = Boolean(dogs && dogs.length > 1);

  const hasGps = Boolean(userCoords && typeof userCoords.lon === 'number' && typeof userCoords.lat === 'number');

  const maskingCenter = useMemo<[number, number] | undefined>(() => {
    if (hasGps && userCoords) return [userCoords.lon, userCoords.lat];
    return undefined;
  }, [hasGps, userCoords]);

  const activePins = useMemo(() => {
    if (hasGps && userCoords) {
      return [createCurrentLocationPin(userCoords.lon, userCoords.lat, '(자유 산책 출발)')];
    }
    return [];
  }, [hasGps, userCoords]);

  const cardBgColor = theme === 'dusty_amber' ? colors.accent : colors.surface;
  const isDark = theme === 'dark';
  const cardTextColor = resolveCardTextColor(isDark, theme, colors.textMain);
  const displayDist = distanceKm ?? '자율';
  const displayTime = resolveDisplayTime(estimatedMinutes);
  const metricsCardBg = resolveMetricsCardBg(isDark, theme, colors.background);

  return (
    <View style={styles.container}>
      {/* 1. 상단 오버랩 강아지 마스코트 */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPressProfile}
        style={styles.mascotTouchable}
        accessibilityLabel={`${dog.name} 프로필 확인 및 변경`}
      >
        <Image source={dogMascotImg} style={styles.mascotImage} resizeMode="contain" />
      </TouchableOpacity>

      {/* 2. 메인 카드 본체 */}
      <View style={[styles.cardBody, { backgroundColor: cardBgColor, borderColor: colors.border, borderWidth: 1 }]}>
        {/* 카드 헤더 (타이틀, 강아지 드롭다운, 알림 버튼) */}
        <View style={styles.cardHeader}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.cardTitle, { color: cardTextColor }]}>{courseName}</Text>
            <View style={[styles.freeWalkBadge, { backgroundColor: isDark ? colors.surface : 'rgba(255, 255, 255, 0.45)', borderColor: colors.border }]}>
              <Text style={[styles.freeWalkBadgeText, { color: cardTextColor }]}>자유 산책</Text>
            </View>
          </View>

          <View style={styles.headerRightActions}>
            {Boolean(dog) && (
              <TouchableOpacity
                onPress={() => {
                  if (isMultiDog) {
                    setShowDropdown((prev) => !prev);
                  } else {
                    onPressProfile?.();
                  }
                }}
                style={[
                  styles.dogSwitchButton,
                  {
                    backgroundColor: isDark ? colors.primaryLight : 'rgba(255, 255, 255, 0.45)',
                    borderColor: colors.border,
                    borderWidth: 1,
                  },
                ]}
                activeOpacity={0.7}
                accessibilityLabel={`${dog.name} 반려견 선택 드롭다운`}
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.dogSwitchText, { color: isDark ? colors.primaryDark : cardTextColor }]}
                >
                  {dog.name}
                </Text>
                {isMultiDog && (
                  <Text style={[styles.dogSwitchChevron, { color: isDark ? colors.primaryDark : cardTextColor }]}>▾</Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={onPressNotification}
              style={styles.bellButton}
              activeOpacity={0.75}
              accessibilityLabel="알림"
              accessibilityRole="button"
            >
              <Image source={bellIconImg} style={styles.bellIcon} resizeMode="contain" />
              {hasUnreadNotification && (
                <View
                  style={[
                    styles.unreadDot,
                    { backgroundColor: colors.accent ?? '#EF4444' },
                  ]}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 2-1. 강아지 선택 드롭다운 목록 */}
        {dogs && onSelectDog && (
          <HomeDogDropdownN2
            visible={showDropdown}
            activeDogId={dog.id}
            dogs={dogs}
            onSelectDog={onSelectDog}
            onClose={() => setShowDropdown(false)}
          />
        )}

        {/* 3. 코스 지도 프리뷰 (부모 mapFrame에 100% 꽉 채움) */}
        <View style={[styles.mapFrame, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}>
          {hasGps && maskingCenter ? (
            <RouteMapView
              route={EMPTY_FREE_ROUTE}
              stepPins={activePins}
              maskingCenter={maskingCenter}
              showLegend={false}
              speedKmH={dog.speedKmH ?? 2.8}
              onStart={onStartWalk}
              showSummaryCard={false}
              fillContainer={true}
            />
          ) : (
            <View style={styles.gpsLoadingContainer}>
              <Text style={styles.gpsLoadingIcon}>📍</Text>
              <Text style={[styles.gpsLoadingText, { color: cardTextColor }]}>
                현재 위치(GPS)를 확인하고 있어요
              </Text>
              <Text style={[styles.gpsLoadingSubText, { color: colors.textMuted }]}>
                주변 지도가 준비되면 바로 산책할 수 있어요
              </Text>
            </View>
          )}
        </View>

        {/* 4. 카드 하단: [예상 거리 / 예상 시간] 정보 블록 + [산책 시작 →] 버튼 (와이어프레임 기준) */}
        <View style={styles.bottomActionsRow}>
          {/* 4-1. 좌측 메트릭 카드 (약 60% 비중) */}
          <View
            style={[
              styles.metricsCard,
              {
                backgroundColor: metricsCardBg,
                borderColor: colors.border,
                borderWidth: 1,
              },
            ]}
          >
            {/* 산책 거리 */}
            <View style={styles.metricColumn}>
              <View style={styles.metricValRow}>
                <Text style={styles.metricIcon}>🐾</Text>
                <Text style={[styles.metricValue, { color: cardTextColor }]}>{displayDist}</Text>
              </View>
              <Text style={[styles.metricLabel, { color: cardTextColor }]}>산책 거리</Text>
            </View>

            {/* 중간 얇은 세로 구분선 */}
            <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />

            {/* 산책 시간 */}
            <View style={styles.metricColumn}>
              <View style={styles.metricValRow}>
                <Text style={styles.metricIcon}>⏱</Text>
                <Text style={[styles.metricValue, { color: cardTextColor }]}>{displayTime}</Text>
              </View>
              <Text style={[styles.metricLabel, { color: cardTextColor }]}>산책 시간</Text>
            </View>
          </View>

          {/* 4-2. 우측 산책 시작 버튼 (약 40% 비중, 동일한 높이) */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onStartWalk}
            style={[
              styles.startWalkButton,
              {
                backgroundColor: colors.primaryDark,
                borderColor: colors.border,
                borderWidth: 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="산책 시작하기"
          >
            <Text style={[styles.startWalkButtonText, { color: colors.textWhite }]}>산책 시작 →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', alignItems: 'center', marginTop: 22 },
  mascotTouchable: { position: 'absolute', top: -34, zIndex: 10, alignItems: 'center', justifyContent: 'center' },
  mascotImage: { width: 88, height: 60 },
  cardBody: {
    flex: 1, width: '100%', backgroundColor: '#CFA052', borderRadius: 24,
    paddingTop: 24, paddingHorizontal: 12, paddingBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8, minHeight: 48 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  cardTitle: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '800', color: '#2D3A31', letterSpacing: -0.2, flexShrink: 1 },
  freeWalkBadge: { minHeight: 48, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  freeWalkBadgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '800', letterSpacing: -0.2 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dogSwitchButton: {
    minHeight: 48, minWidth: 72, maxWidth: 124, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, flexShrink: 1,
  },
  dogSwitchText: { fontSize: TYPOGRAPHY.label, fontWeight: '700', color: '#2D3A31', flexShrink: 1, textAlign: 'center' },
  dogSwitchChevron: { fontSize: TYPOGRAPHY.caption, fontWeight: '700', flexShrink: 0 },
  bellButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { width: 42, height: 42 },
  unreadDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  mapFrame: { flex: 1, width: '100%', minHeight: 120, borderRadius: 18, overflow: 'hidden', backgroundColor: '#F5EFE0' },
  gpsLoadingContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  gpsLoadingIcon: { fontSize: 24, marginBottom: 2 },
  gpsLoadingText: { fontSize: TYPOGRAPHY.label, fontWeight: '700', textAlign: 'center' },
  gpsLoadingSubText: { fontSize: TYPOGRAPHY.support, textAlign: 'center' },
  bottomActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 8,
    minHeight: 52,
  },
  metricsCard: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  metricColumn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metricValRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metricIcon: { fontSize: 13 },
  metricValue: { fontSize: TYPOGRAPHY.metricValue, fontWeight: '800', letterSpacing: -0.3 },
  metricLabel: { fontSize: TYPOGRAPHY.label, fontWeight: '600', opacity: 0.75, marginTop: 1 },
  metricDivider: { width: 1, height: 26, opacity: 0.7 },
  startWalkButton: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  startWalkButtonText: { fontSize: TYPOGRAPHY.button, fontWeight: '800', letterSpacing: -0.3 },
});
