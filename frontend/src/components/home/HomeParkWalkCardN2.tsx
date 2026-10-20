/**
 * [편안하개 - PetWalk]
 * 디자인 시안 02번 (Dusty Amber & Sage Green) 메인 카드
 * (docs/reference/UI개선/app_design_n2-1.png 기준)
 *
 * 1. 상단 오버랩 강아지 캐릭터 마스코트 (dog_character.png)
 * 2. Dusty Amber (#CFA052) 둥근 테두리 메인 카드
 * 3. 실제 코스 지도 (RouteMapView 연동)
 * 4. 산책 거리(km) & 소요 시간(분) 및 원터치 [산책 시작] 바인딩
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { DogProfile } from '../../types/dogProfile';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from '../../services/sampleRoute';
import { RouteMapView } from '../map/RouteMapView';
import dogMascotImg from '../../../assets/ui_n2/dog_character.png';

export interface HomeParkWalkCardN2Props {
  dog: DogProfile;
  dogs?: readonly DogProfile[];
  onSelectDog?: (dogId: string) => void;
  onPressProfile?: () => void;
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
  onStartWalk,
  estimatedMinutes = 30,
  distanceKm = '2.1 km',
  courseName = 'Park Walk Mode',
}) => {
  const isMultiDog = dogs && dogs.length > 1;

  return (
    <View style={styles.container}>
      {/* 1. 상단에 걸쳐진 강아지 마스코트 (입체적 오버랩) */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPressProfile}
        style={styles.mascotTouchable}
        accessibilityLabel={`${dog.name} 프로필 확인 및 변경`}
      >
        <Image source={dogMascotImg} style={styles.mascotImage} resizeMode="contain" />
      </TouchableOpacity>

      {/* 2. 메인 카드 본체 (Dusty Amber) */}
      <View style={styles.cardBody}>
        {/* 카드 헤더 (타이틀 및 모드) */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{courseName}</Text>
          {isMultiDog && (
            <TouchableOpacity
              onPress={onPressProfile}
              style={styles.dogSwitchBadge}
              activeOpacity={0.7}
            >
              <Text style={styles.dogSwitchText}>{dog.name} ▾</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 3. 실제 인터랙티브 코스 지도 프리뷰 */}
        <View style={styles.mapFrame}>
          <RouteMapView
            route={SAMPLE_ROUTE}
            stepPins={SAMPLE_STEP_PINS}
            speedKmH={dog.speedKmH ?? 2.8}
            onStart={onStartWalk}
            showSummaryCard={false}
          />
        </View>

        {/* 4. 카드 하단: 산책 거리 & 시간 표시 및 시작 버튼 */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onStartWalk}
          style={styles.statsBar}
          accessibilityLabel="산책 시작하기"
        >
          <View style={styles.statsInfoRow}>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>🚶</Text>
              <Text style={styles.statLabel}>산책</Text>
              <Text style={styles.statValue}>{distanceKm}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>⏱</Text>
              <Text style={styles.statValue}>{estimatedMinutes}분</Text>
            </View>
          </View>
          <View style={styles.startActionBadge}>
            <Text style={styles.startActionText}>시작 →</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginTop: 46, // 마스코트 상단 오버랩 공간 확보
    marginBottom: 8,
  },
  mascotTouchable: {
    position: 'absolute',
    top: -44,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotImage: {
    width: 96,
    height: 72,
  },
  cardBody: {
    width: '100%',
    backgroundColor: '#CFA052', // Dusty Amber
    borderRadius: 24,
    paddingTop: 36, // 마스코트 턱 부분 여백
    paddingHorizontal: 14,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#2D3A31', // Deep Charcoal
    letterSpacing: -0.2,
  },
  dogSwitchBadge: {
    position: 'absolute',
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  dogSwitchText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2D3A31',
  },
  mapFrame: {
    width: '100%',
    height: 185,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F5EFE0',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  statsInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 15,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2D3A31',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2D3A31',
  },
  statDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(45, 58, 49, 0.25)',
  },
  startActionBadge: {
    backgroundColor: '#5A7361', // Sage Green
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  startActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
