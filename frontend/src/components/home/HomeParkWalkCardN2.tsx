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

const BELL_ICON_IMG = require('../../../assets/images/home/bell_icon.png');

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
              style={[
                styles.bellButton,
                {
                  backgroundColor: isDark ? colors.background : colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                },
              ]}
              activeOpacity={0.75}
              accessibilityLabel="알림"
              accessibilityRole="button"
            >
              <Image source={BELL_ICON_IMG} style={[styles.bellIcon, { tintColor: cardTextColor }]} resizeMode="contain" />
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

        {/* 3. 코스 지도 프리뷰 (flex 채움) */}
        <View style={[styles.mapFrame, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}>
          <RouteMapView
            route={SAMPLE_ROUTE}
            stepPins={SAMPLE_STEP_PINS}
            speedKmH={dog.speedKmH ?? 2.8}
            onStart={onStartWalk}
            showSummaryCard={false}
          />
        </View>

        {/* 4. 카드 하단: 산책 거리/시간 & 시작 버튼 */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onStartWalk}
          style={[
            styles.statsBar,
            {
              backgroundColor: isDark ? colors.background : 'rgba(255, 255, 255, 0.5)',
              borderColor: colors.border,
              borderWidth: 1,
            },
          ]}
          accessibilityLabel="산책 시작하기"
        >
          <View style={styles.statsInfoRow}>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>🚶</Text>
              <Text style={[styles.statLabel, { color: isDark ? colors.textMuted : cardTextColor }]}>산책</Text>
              <Text style={[styles.statValue, { color: cardTextColor }]}>{distanceKm}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>⏱</Text>
              <Text style={[styles.statValue, { color: cardTextColor }]}>{estimatedMinutes}분</Text>
            </View>
          </View>
          <View style={[styles.startActionBadge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.startActionText, { color: colors.textWhite }]}>시작 →</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', alignItems: 'center', marginTop: 28 },
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
  bellButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F5EFE0', alignItems: 'center', justifyContent: 'center' },
  bellIcon: { width: 22, height: 22, tintColor: '#2D3A31' },
  mapFrame: { flex: 1, width: '100%', minHeight: 120, borderRadius: 18, overflow: 'hidden', backgroundColor: '#F5EFE0' },
  statsBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.3)', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, marginTop: 8, minHeight: 48,
  },
  statsInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statIcon: { fontSize: 15 },
  statLabel: { fontSize: 12, fontWeight: '700', color: '#2D3A31' },
  statValue: { fontSize: 13, fontWeight: '800', color: '#2D3A31' },
  statDivider: { width: 1, height: 12, backgroundColor: 'rgba(45, 58, 49, 0.25)' },
  startActionBadge: { backgroundColor: '#5A7361', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  startActionText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
});
