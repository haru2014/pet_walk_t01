/**
 * [편안하개 - PetWalk]
 * 온보딩 4단계: 주변 안심 코스 & 인근 산책견 탐색 지도 (T2-ONBOARD-FLOW)
 *
 * - 내 주변 안심 산책 코스 3선 및 인근 산책견 위치 마커 표시
 * - 프라이버시 200m 보호 안내 배너
 * - 첫 산책 시작 Thumb Zone 액션
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { LonLat, RouteFeatureCollection, RouteStepPin } from '../../types/route';
import { TOKENS, TYPOGRAPHY } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';
import { GradientButton } from '../common/GradientButton';
import { MapLibreMapView } from '../map/MapLibreMapView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_WIDTH = Math.min(SCREEN_WIDTH - 48, 420);
const MAP_HEIGHT = 150;

export interface NearbyDogMarker {
  id: string;
  name: string;
  breed: string;
  distanceM: number;
  position: LonLat;
}

export interface NearbyCoursePin {
  id: string;
  title: string;
  distanceKm: number;
  durationMinutes: number;
  position: LonLat;
}

const DEMO_MAP_CENTER: LonLat = [127.3805, 36.4315];

function offsetFromCenter(center: LonLat, distanceM: number, bearingDegrees: number): LonLat {
  const bearing = (bearingDegrees * Math.PI) / 180;
  const [longitude, latitude] = center;
  const eastM = distanceM * Math.sin(bearing);
  const northM = distanceM * Math.cos(bearing);
  return [
    longitude + eastM / (111_320 * Math.cos((latitude * Math.PI) / 180)),
    latitude + northM / 110_540,
  ];
}

const MOCK_NEARBY_DOGS: NearbyDogMarker[] = [
  { id: 'dog1', name: '콩이', breed: '골든리트리버', distanceM: 180, position: offsetFromCenter(DEMO_MAP_CENTER, 180, 315) },
  { id: 'dog2', name: '보리', breed: '말티즈', distanceM: 320, position: offsetFromCenter(DEMO_MAP_CENTER, 320, 45) },
  { id: 'dog3', name: '초코', breed: '푸들', distanceM: 450, position: offsetFromCenter(DEMO_MAP_CENTER, 450, 180) },
];

const MOCK_NEARBY_COURSES: NearbyCoursePin[] = [
  { id: 'c1', title: '갑천 수변 그늘길', distanceKm: 1.8, durationMinutes: 25, position: offsetFromCenter(DEMO_MAP_CENTER, 260, 270) },
  { id: 'c2', title: '반도지 폭신 흙길', distanceKm: 2.3, durationMinutes: 35, position: offsetFromCenter(DEMO_MAP_CENTER, 340, 25) },
];

const EMPTY_ROUTE: RouteFeatureCollection = { type: 'FeatureCollection', features: [] };

function createDemoPins(dogName: string): RouteStepPin[] {
  return [
    { id: 'my-location', kind: 'safe', icon: '🐾', title: `${dogName} (나)`, position: DEMO_MAP_CENTER, instruction: '내 위치 (데모)' },
    ...MOCK_NEARBY_COURSES.map((course) => ({
      id: course.id,
      kind: 'safe' as const,
      icon: '🌳',
      title: course.title,
      detail: `${course.distanceKm}km · ${course.durationMinutes}분`,
      position: course.position,
      instruction: `${course.title} · 데모 위치`,
    })),
    ...MOCK_NEARBY_DOGS.map((dog) => ({
      id: dog.id,
      kind: 'turn' as const,
      icon: '🐕',
      title: dog.name,
      detail: `${dog.distanceM}m 앞 · ${dog.breed}`,
      position: dog.position,
      instruction: `${dog.name} · 데모 위치`,
    })),
  ];
}

export interface NearbyExploreMapViewProps {
  dogName: string;
  onStartFirstWalk: () => void;
}

export const NearbyExploreMapView: React.FC<NearbyExploreMapViewProps> = ({
  dogName,
  onStartFirstWalk,
}) => {
  const demoPins = createDemoPins(dogName);

  return (
    <View style={styles.container}>
      {/* 상단 브리핑 카드 */}
      <View style={styles.briefingHeader}>
        <View style={styles.sparkleBadge}>
          <AppIcon name="sparkle" size={16} color={TOKENS.colors.primaryDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.briefingTitle}>
            {dogName} 주변 안심 코스를 찾았어요!
          </Text>
          <Text style={styles.briefingDesc}>
            대전을 중심으로 주변 산책 코스를 살펴보는 예시 지도예요.
          </Text>
        </View>
      </View>

      {/* 탐색 지도 캔버스 */}
      <View style={[styles.mapCanvas, { width: MAP_WIDTH, height: MAP_HEIGHT }]}>
        <MapLibreMapView route={EMPTY_ROUTE} stepPins={demoPins} width="100%" height={MAP_HEIGHT} />
      </View>

      {/* 200m 프라이버시 안심 보호 고지 */}
      <View style={styles.privacyNoticeBar}>
        <AppIcon name="map" size={14} color={TOKENS.colors.primaryDark} />
        <Text style={styles.privacyNoticeText}>
          지도와 산책견 핀은 실제 위치가 아닌 데모 데이터입니다.
        </Text>
      </View>

      {/* 하단 첫 산책 시작 액션 버튼 */}
      <View style={styles.actionWrap}>
        <GradientButton fullWidth onPress={onStartFirstWalk}>
          {`🐾 ${dogName}와 첫 산책 시작하기`}
        </GradientButton>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  briefingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: TOKENS.colors.surface,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    marginBottom: 8,
    width: '100%',
  },
  sparkleBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: TOKENS.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefingTitle: {
    fontSize: TYPOGRAPHY.sectionTitle,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.3,
  },
  briefingDesc: {
    fontSize: TYPOGRAPHY.support,
    color: TOKENS.colors.textMuted,
    marginTop: 2,
  },
  mapCanvas: {
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 8,
  },
  privacyNoticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TOKENS.colors.primary,
    marginBottom: 8,
    width: '100%',
  },
  privacyNoticeText: {
    fontSize: TYPOGRAPHY.support,
    fontWeight: '600',
    color: TOKENS.colors.primaryDark,
    flex: 1,
  },
  actionWrap: {
    width: '100%',
  },
});
