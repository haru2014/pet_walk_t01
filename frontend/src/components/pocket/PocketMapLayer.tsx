/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 전체 화면 지도 레이어 (따라가기 카메라)
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppIcon } from '../common/AppIcon';
import { MapLibreMapView } from '../map/MapLibreMapView';
import { MapFollowCamera } from '../map/maplibreWebTemplate';
import { LonLat, RouteFeatureCollection, RouteStepPin } from '../../types/route';
import { POCKET_COLORS } from './pocketTheme';

/** 지도 레이어: 위치를 모르면 자리 표시, 오버레이 높이를 재기 전에는 비워 둔다. */
export const PocketMapLayer: React.FC<{
  hasPosition: boolean;
  ready: boolean;
  route: RouteFeatureCollection;
  pins: readonly RouteStepPin[];
  maskingCenter?: LonLat;
  fitPadding: React.ComponentProps<typeof MapLibreMapView>['fitPadding'];
  follow: MapFollowCamera | null;
}> = ({ hasPosition, ready, route, pins, maskingCenter, fitPadding, follow }) => {
  if (!hasPosition) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.mapEmpty]}>
        <AppIcon name="location" size={28} color={POCKET_COLORS.textMuted} />
      </View>
    );
  }
  if (!ready) return null;
  return (
    <View style={StyleSheet.absoluteFill} accessibilityLabel="현재 위치와 진행 경로 지도">
      <MapLibreMapView
        route={route}
        stepPins={pins}
        maskingCenter={maskingCenter}
        width="100%"
        height="100%"
        style={styles.backgroundMap}
        interactive={false}
        fitPadding={fitPadding}
        follow={follow}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  backgroundMap: { borderRadius: 0, borderWidth: 0, backgroundColor: POCKET_COLORS.mapBackground },
  mapEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: POCKET_COLORS.mapBackground },
});
