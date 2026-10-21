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

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { DogProfile } from '../../types/dogProfile';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from '../../services/sampleRoute';
import { RouteMapView } from '../map/RouteMapView';
import { HomeDogDropdownN2 } from './HomeDogDropdownN2';
import { useAppTheme } from '../../theme/themeManager';
import dogMascotImg from '../../../assets/ui_n2/dog_character.png';
import bellIconImg from '../../../assets/ui_n2/bell_icon.png';

export interface HomeParkWalkCardN2Props {
  dog: DogProfile;
  dogs?: readonly DogProfile[];
  onSelectDog?: (dogId: string) => void;
  onPressProfile?: () => void;
  onPressNotification?: () => void;
  onStartWalk?: () => void;
  estimatedMinutes?: number;
  distanceKm?: string;
  courseName?: string;
}

export const HomeParkWalkCardN2: React.FC<HomeParkWalkCardN2Props> = ({
  dog,
  dogs,
  onSelectDog,
  onPressProfile,
  onPressNotification,
  onStartWalk,
  estimatedMinutes = 30,
  distanceKm = '2.1 km',
  courseName = '바로 산책하기',
}) => {
  const { theme, colors } = useAppTheme();
  const [showDropdown, setShowDropdown] = useState(false);
  const isMultiDog = Boolean(dogs && dogs.length > 1);

  const cardBgColor = theme === 'dusty_amber' ? colors.accent : colors.surface;
  const isDark = theme === 'dark';
  const cardTextColor = isDark ? colors.textMain : (theme === 'dusty_amber' ? '#2D3A31' : colors.textMain);

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
          <Text style={[styles.cardTitle, { color: cardTextColor }]}>{courseName}</Text>

          <View style={styles.headerRightActions}>
            {isMultiDog && (
              <TouchableOpacity
                onPress={() => setShowDropdown((prev) => !prev)}
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
                <Text style={[styles.dogSwitchText, { color: isDark ? colors.primaryDark : cardTextColor }]}>
                  {dog.name} ▾
                </Text>
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
          <RouteMapView
            route={SAMPLE_ROUTE}
            stepPins={SAMPLE_STEP_PINS}
            speedKmH={dog.speedKmH ?? 2.8}
            onStart={onStartWalk}
            showSummaryCard={false}
            fillContainer={true}
          />
        </View>

        {/* 4. 카드 하단: [예상 거리 / 예상 시간] 정보 블록 + [산책 시작 →] 버튼 (와이어프레임 기준) */}
        <View style={styles.bottomActionsRow}>
          {/* 4-1. 좌측 메트릭 카드 (약 60% 비중) */}
          <View
            style={[
              styles.metricsCard,
              {
                backgroundColor: isDark ? colors.background : (theme === 'dusty_amber' ? '#F4DFBD' : 'rgba(255, 255, 255, 0.5)'),
                borderColor: colors.border,
                borderWidth: 1,
              },
            ]}
          >
            {/* 예상 거리 */}
            <View style={styles.metricColumn}>
              <View style={styles.metricValRow}>
                <Text style={styles.metricIcon}>🐾</Text>
                <Text style={[styles.metricValue, { color: cardTextColor }]}>{distanceKm}</Text>
              </View>
              <Text style={[styles.metricLabel, { color: cardTextColor }]}>예상 거리</Text>
            </View>

            {/* 중간 얇은 세로 구분선 */}
            <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />

            {/* 예상 시간 */}
            <View style={styles.metricColumn}>
              <View style={styles.metricValRow}>
                <Text style={styles.metricIcon}>⏱</Text>
                <Text style={[styles.metricValue, { color: cardTextColor }]}>{estimatedMinutes}분</Text>
              </View>
              <Text style={[styles.metricLabel, { color: cardTextColor }]}>예상 시간</Text>
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, minHeight: 48 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#2D3A31', letterSpacing: -0.2 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dogSwitchButton: {
    minHeight: 48, minWidth: 48, paddingHorizontal: 12, backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 24, alignItems: 'center', justifyContent: 'center',
  },
  dogSwitchText: { fontSize: 13, fontWeight: '700', color: '#2D3A31' },
  bellButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { width: 42, height: 42 },
  mapFrame: { flex: 1, width: '100%', minHeight: 120, borderRadius: 18, overflow: 'hidden', backgroundColor: '#F5EFE0' },
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
  metricValue: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3 },
  metricLabel: { fontSize: 10.5, fontWeight: '600', opacity: 0.75, marginTop: 1 },
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
  startWalkButtonText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3 },
});
