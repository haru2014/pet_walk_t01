/**
 * [편안하개 - PetWalk]
 * 온보딩 4단계: 주변 안심 코스 & 인근 산책견 탐색 지도 (T2-ONBOARD-FLOW)
 *
 * - 내 주변 안심 산책 코스 3선 및 인근 산책견 위치 마커 표시
 * - 프라이버시 200m 보호 안내 배너
 * - 첫 산책 시작 Thumb Zone 액션
 */

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';
import { GradientButton } from '../common/GradientButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_WIDTH = Math.min(SCREEN_WIDTH - 48, 420);
const MAP_HEIGHT = 150;

export interface NearbyDogMarker {
  id: string;
  name: string;
  breed: string;
  distanceM: number;
  x: number;
  y: number;
}

export interface NearbyCoursePin {
  id: string;
  title: string;
  distanceKm: number;
  durationMinutes: number;
  x: number;
  y: number;
}

const MOCK_NEARBY_DOGS: NearbyDogMarker[] = [
  { id: 'dog1', name: '콩이 (골든리트리버)', breed: '대형견', distanceM: 180, x: MAP_WIDTH * 0.35, y: MAP_HEIGHT * 0.28 },
  { id: 'dog2', name: '보리 (말티즈)', breed: '소형견', distanceM: 320, x: MAP_WIDTH * 0.72, y: MAP_HEIGHT * 0.42 },
  { id: 'dog3', name: '초코 (푸들)', breed: '중형견', distanceM: 450, x: MAP_WIDTH * 0.48, y: MAP_HEIGHT * 0.72 },
];

const MOCK_NEARBY_COURSES: NearbyCoursePin[] = [
  { id: 'c1', title: '🌿 갑천 수변 그늘길', distanceKm: 1.8, durationMinutes: 25, x: MAP_WIDTH * 0.22, y: MAP_HEIGHT * 0.52 },
  { id: 'c2', title: '🐾 반도지 폭신 흙길', distanceKm: 2.3, durationMinutes: 35, x: MAP_WIDTH * 0.62, y: MAP_HEIGHT * 0.2 },
];

export interface NearbyExploreMapViewProps {
  dogName: string;
  onStartFirstWalk: () => void;
}

export const NearbyExploreMapView: React.FC<NearbyExploreMapViewProps> = ({
  dogName,
  onStartFirstWalk,
}) => {
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
            현재 반경 500m 내에 3마리의 친구들이 안심 산책 중이에요.
          </Text>
        </View>
      </View>

      {/* 탐색 지도 캔버스 */}
      <View style={[styles.mapCanvas, { width: MAP_WIDTH, height: MAP_HEIGHT }]}>
        {/* 모의 지도 격자 배경 */}
        <View style={styles.mapGridLineH} />
        <View style={styles.mapGridLineV} />
        <View style={styles.waterFeature} />

        {/* 내 위치 (출발점) */}
        <View style={[styles.myLocationCircle, { left: MAP_WIDTH / 2 - 12, top: MAP_HEIGHT / 2 - 12 }]}>
          <View style={styles.myLocationPulse} />
          <View style={styles.myLocationCenter} />
          <Text style={styles.myLocationLabel}>{dogName} (나)</Text>
        </View>

        {/* 주변 안심 코스 핀 */}
        {MOCK_NEARBY_COURSES.map((course) => (
          <View key={course.id} style={[styles.coursePinWrap, { left: course.x, top: course.y }]}>
            <View style={styles.coursePinBadge}>
              <Text style={styles.coursePinIcon}>📍</Text>
              <Text style={styles.coursePinText}>{course.title}</Text>
            </View>
            <Text style={styles.coursePinSub}>{course.distanceKm}km · {course.durationMinutes}분</Text>
          </View>
        ))}

        {/* 주변 산책견 마커 */}
        {MOCK_NEARBY_DOGS.map((other) => (
          <View key={other.id} style={[styles.dogMarkerWrap, { left: other.x, top: other.y }]}>
            <View style={styles.dogMarkerCircle}>
              <Text style={styles.dogMarkerIcon}>🐕</Text>
            </View>
            <View style={styles.dogMarkerTag}>
              <Text style={styles.dogMarkerName}>{other.name}</Text>
              <Text style={styles.dogMarkerDist}>{other.distanceM}m 앞</Text>
            </View>
          </View>
        ))}
      </View>

      {/* 200m 프라이버시 안심 보호 고지 */}
      <View style={styles.privacyNoticeBar}>
        <AppIcon name="lock" size={14} color={TOKENS.colors.primaryDark} />
        <Text style={styles.privacyNoticeText}>
          이웃 산책견의 위치와 집 주변 200m는 자동 안심 가림 처리되어 안전합니다.
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
    fontSize: 14,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.3,
  },
  briefingDesc: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    marginTop: 2,
  },
  mapCanvas: {
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 8,
  },
  mapGridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  mapGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  waterFeature: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 120,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(129, 212, 250, 0.45)',
  },
  myLocationCircle: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  myLocationPulse: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  myLocationCenter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: TOKENS.colors.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  myLocationLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TOKENS.colors.primaryDark,
    marginTop: 24,
    width: 80,
    textAlign: 'center',
  },
  coursePinWrap: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 5,
  },
  coursePinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TOKENS.colors.primary,
    gap: 3,
  },
  coursePinIcon: { fontSize: 11 },
  coursePinText: { fontSize: 10, fontWeight: '700', color: TOKENS.colors.primaryDark },
  coursePinSub: { fontSize: 9, color: TOKENS.colors.textMuted, marginTop: 1 },
  dogMarkerWrap: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 6,
  },
  dogMarkerCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dogMarkerIcon: { fontSize: 11 },
  dogMarkerTag: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
  },
  dogMarkerName: { fontSize: 9, fontWeight: '700', color: TOKENS.colors.textMain },
  dogMarkerDist: { fontSize: 8, color: '#D97706' },
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
    fontSize: 10,
    fontWeight: '600',
    color: TOKENS.colors.primaryDark,
    flex: 1,
  },
  actionWrap: {
    width: '100%',
  },
});
