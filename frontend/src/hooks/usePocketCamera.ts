/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 지도 카메라 훅
 * - usePocketLayout: 오버레이 높이를 재서 지도 여백을 만든다
 * - usePocketFollowCamera: 현재 위치를 따라가며 진행 방향이 위로 오게 회전한다
 * - usePocketManeuver: 다음 회전 계산 + 30m 이내 진입 시 한 번 진동
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';
import { MapFitPadding, MapFollowCamera } from '../components/map/maplibreWebTemplate';
import {
  bearingFromLastTwoPoints,
  bearingFromRecentPath,
  resolveFollowTargetHeading,
  smoothHeading,
  toScreenBearing,
} from '../services/followHeading';
import { hapticTurnApproach } from '../services/haptics';
import {
  computePocketManeuver,
  MANEUVER_IMMINENT_DISTANCE_M,
  PocketManeuver,
  routeBearingAt,
} from '../services/pocketManeuver';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';

type Coords = { lat: number; lon: number } | null | undefined;
type Path = readonly (readonly [number, number])[] | undefined;
type EdgePadding = Exclude<MapFitPadding, number>;

/** 걷기용 따라가기 줌 */
const FOLLOW_ZOOM = 17;
/** 위치 마커 위쪽(진행 방향)으로 보이는 지도 영역 비율 */
const FOLLOW_LOOK_AHEAD_RATIO = 0.35;
const MAP_EDGE_GAP = 16;

export interface PocketLayout {
  readonly sheetHeight: number;
  readonly layoutReady: boolean;
  readonly fitPadding: EdgePadding;
  readonly onTopLayout: (event: LayoutChangeEvent) => void;
  readonly onSheetLayout: (event: LayoutChangeEvent) => void;
}

/** 첫 측정값만 지도 여백에 써서 안내 문구 길이나 시트 펼침에 지도가 흔들리지 않게 한다. */
export function usePocketLayout(overlayTop: number, sheetExpanded: boolean): PocketLayout {
  const [topHeight, setTopHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [collapsedSheetHeight, setCollapsedSheetHeight] = useState(0);

  const fitPadding = useMemo<EdgePadding>(() => ({
    top: Math.round(overlayTop + topHeight + MAP_EDGE_GAP),
    bottom: Math.round(collapsedSheetHeight + MAP_EDGE_GAP),
    left: 28,
    right: 72,
  }), [overlayTop, topHeight, collapsedSheetHeight]);

  const onTopLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    setTopHeight((prev) => prev || next);
  };
  const onSheetLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    setSheetHeight(next);
    if (!sheetExpanded) setCollapsedSheetHeight((prev) => prev || next);
  };

  return { sheetHeight, layoutReady: topHeight > 0 && collapsedSheetHeight > 0, fitPadding, onTopLayout, onSheetLayout };
}

interface FollowCameraInput {
  readonly currentCoords: Coords;
  readonly walkedCoords: Path;
  readonly speedKmH: number;
  readonly mapRoute: RouteFeatureCollection;
  readonly mapPins: readonly RouteStepPin[];
  readonly layout: PocketLayout;
  readonly viewportHeight: number;
}

/** 걷는 방향을 부드럽게 반영한 카메라 방향. 멈추면 마지막 방향을 유지한다. */
function useCameraHeading(input: FollowCameraInput): number | null {
  const [cameraHeading, setCameraHeading] = useState<number | null>(null);
  const { walkedCoords, speedKmH, mapRoute } = input;
  const lon = input.currentCoords?.lon;
  const lat = input.currentCoords?.lat;

  useEffect(() => {
    if (lon == null || lat == null) return undefined;
    const routeBearing = routeBearingAt([lon, lat], mapRoute);
    const frameId = requestAnimationFrame(() => {
      setCameraHeading((prev) => smoothHeading(prev, resolveFollowTargetHeading({
        walkedCoords,
        speedKmH,
        routeBearing,
        hasHeading: prev != null,
      })));
    });
    return () => cancelAnimationFrame(frameId);
  }, [lon, lat, walkedCoords, speedKmH, mapRoute]);

  return cameraHeading;
}

export function usePocketFollowCamera(input: FollowCameraInput) {
  const cameraHeading = useCameraHeading(input);
  const { currentCoords, walkedCoords, mapPins, layout, viewportHeight } = input;

  const walkBearing = useMemo(
    () => bearingFromRecentPath(walkedCoords) ?? bearingFromLastTwoPoints(walkedCoords),
    [walkedCoords],
  );

  const mapDisplayPins = useMemo<readonly RouteStepPin[]>(() => {
    if (!currentCoords) return mapPins;
    return [...mapPins, {
      id: 'current-location-pin',
      kind: 'safe',
      position: [currentCoords.lon, currentCoords.lat],
      instruction: '현재 위치',
      icon: '➤',
      bearingDeg: toScreenBearing(walkBearing, cameraHeading),
    }];
  }, [currentCoords, walkBearing, cameraHeading, mapPins]);

  const followCamera = useMemo<MapFollowCamera | null>(() => {
    if (!currentCoords || !layout.layoutReady) return null;
    const pad = layout.fitPadding;
    const visibleHeight = Math.max(0, viewportHeight - pad.top - pad.bottom);
    return {
      center: [currentCoords.lon, currentCoords.lat],
      bearing: cameraHeading ?? 0,
      zoom: FOLLOW_ZOOM,
      padding: { ...pad, top: Math.round(pad.top + visibleHeight * FOLLOW_LOOK_AHEAD_RATIO) },
    };
  }, [currentCoords, layout.layoutReady, layout.fitPadding, viewportHeight, cameraHeading]);

  return { mapDisplayPins, followCamera };
}

interface ManeuverInput {
  readonly isFreeWalk: boolean;
  readonly isOffRoute: boolean;
  readonly currentCoords: Coords;
  readonly mapRoute: RouteFeatureCollection;
  readonly mapPins: readonly RouteStepPin[];
}

export function usePocketManeuver({ isFreeWalk, isOffRoute, currentCoords, mapRoute, mapPins }: ManeuverInput): PocketManeuver | null {
  const maneuver = useMemo(() => {
    if (isFreeWalk || !currentCoords) return null;
    return computePocketManeuver([currentCoords.lon, currentCoords.lat], mapRoute, mapPins);
  }, [isFreeWalk, currentCoords, mapRoute, mapPins]);

  // 회전 지점 30m 이내에 처음 들어오면 한 번 진동 (주머니 속에서도 알 수 있도록)
  const buzzedPinIdRef = useRef<string | null>(null);
  useEffect(() => {
    const step = maneuver?.current;
    if (!step?.pinId || isOffRoute) return;
    if (step.distanceM > MANEUVER_IMMINENT_DISTANCE_M || buzzedPinIdRef.current === step.pinId) return;
    buzzedPinIdRef.current = step.pinId;
    void hapticTurnApproach();
  }, [maneuver, isOffRoute]);

  return maneuver;
}
