/**
 * [편안하개 - PetWalk]
 * Android Foreground Service 기반 GPS 위치 추적 엔진 (US-E1, Phase 4)
 *
 * - expo-location startLocationUpdatesAsync + TaskManager 백그라운드 태스크
 * - 백그라운드 권한이 거부되면 포그라운드 watchPositionAsync로 안전하게 대체
 * - 수집 좌표는 인메모리 버퍼에만 보관 (서버 전송 없음, Local-First)
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const WALK_LOCATION_TASK = 'PETWALK_BACKGROUND_LOCATION';

export interface GpsPoint {
  readonly latitude: number;
  readonly longitude: number;
  readonly timestamp: number;
  readonly speedMps: number | null;
}

export type TrackingMode = 'background' | 'foreground';
export type StartTrackingResult =
  | { readonly ok: true; readonly mode: TrackingMode }
  | { readonly ok: false; readonly reason: 'permission_denied' | 'error' };

type PointListener = (point: GpsPoint) => void;

const buffer: GpsPoint[] = [];
const listeners = new Set<PointListener>();
let foregroundSubscription: Location.LocationSubscription | null = null;

function toGpsPoint(location: Location.LocationObject): GpsPoint {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: location.timestamp,
    speedMps: location.coords.speed ?? null,
  };
}

function pushLocations(locations: readonly Location.LocationObject[]): void {
  for (const location of locations) {
    const point = toGpsPoint(location);
    buffer.push(point);
    listeners.forEach((listener) => listener(point));
  }
}

TaskManager.defineTask(WALK_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[locationService] 백그라운드 위치 오류:', error.message);
    return;
  }
  const { locations } = (data ?? { locations: [] }) as { locations: Location.LocationObject[] };
  pushLocations(locations);
});

const TRACKING_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 5,
  timeInterval: 3000,
} as const;

async function startBackground(): Promise<void> {
  await Location.startLocationUpdatesAsync(WALK_LOCATION_TASK, {
    ...TRACKING_OPTIONS,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: '🐾 편안하개 안심 산책 중',
      notificationBody: '화면이 꺼져도 안전하게 안내하고 있어요.',
      notificationColor: '#10B981',
    },
  });
}

async function startForeground(): Promise<void> {
  foregroundSubscription = await Location.watchPositionAsync(TRACKING_OPTIONS, (location) =>
    pushLocations([location]),
  );
}

/** 산책 위치 추적을 시작한다. 권한/오류 상황은 결과 객체로 반환한다. */
export async function startWalkTracking(): Promise<StartTrackingResult> {
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') return { ok: false, reason: 'permission_denied' };

    buffer.length = 0;
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status === 'granted') {
      await startBackground();
      return { ok: true, mode: 'background' };
    }
    await startForeground();
    return { ok: true, mode: 'foreground' };
  } catch (error) {
    console.warn('[locationService] 추적 시작 실패:', error);
    return { ok: false, reason: 'error' };
  }
}

/** 위치 추적을 안전하게 종료한다. */
export async function stopWalkTracking(): Promise<void> {
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(WALK_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(WALK_LOCATION_TASK);
    }
  } catch (error) {
    console.warn('[locationService] 추적 종료 실패:', error);
  }
}

/**
 * 포그라운드 노티피케이션 알림 문구 동적 갱신 (US-E1, Phase 4)
 * "🐾 편안하개 안심 산책 중: {distance}km / {duration}분"
 */
export async function updateTrackingNotification(distanceKm: number, durationMinutes: number): Promise<void> {
  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(WALK_LOCATION_TASK);
    if (!isStarted) return;

    await Location.startLocationUpdatesAsync(WALK_LOCATION_TASK, {
      ...TRACKING_OPTIONS,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: `🐾 편안하개 안심 산책 중: ${distanceKm.toFixed(2)}km / ${durationMinutes}분`,
        notificationBody: '화면이 꺼져도 안전하게 안내하고 있어요.',
        notificationColor: '#10B981',
      },
    });
  } catch (error) {
    console.warn('[locationService] 노티피케이션 갱신 실패:', error);
  }
}

/** 새 GPS 좌표 수신 리스너를 등록하고 해제 함수를 반환한다. */
export function subscribeToGps(listener: PointListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 현재까지 수집된 궤적 사본 */
export function getTrackBuffer(): readonly GpsPoint[] {
  return [...buffer];
}
