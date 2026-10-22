/**
 * [편안하개 - PetWalk]
 * Android Foreground Service 기반 GPS 위치 추적 엔진 (US-E1, Phase 4)
 *
 * - expo-location startLocationUpdatesAsync + TaskManager 백그라운드 태스크
 * - 백그라운드 권한이 거부되면 포그라운드 watchPositionAsync로 안전하게 대체
 * - 수집 좌표는 인메모리 버퍼에만 보관 (서버 전송 없음, Local-First)
 */

import { Platform } from 'react-native';
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

export interface CurrentLocationResult {
  readonly ok: boolean;
  readonly coords?: {
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracy?: number | null;
  };
  readonly reason?: 'permission_denied' | 'timeout' | 'service_disabled' | 'error';
  readonly errorMessage?: string;
}

function getLocationErrorDetails(error: unknown): {
  reason: NonNullable<CurrentLocationResult['reason']>;
  errorMessage: string;
} {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (/GPS_TIMEOUT/i.test(message)) {
    return {
      reason: 'timeout',
      errorMessage: 'GPS 신호 수신 시간이 초과되었습니다. 실외에서 다시 시도해 주세요.',
    };
  }

  if (/location services? (?:are )?disabled|location provider (?:is )?unavailable|location is unavailable|current location is unavailable|unsatisfied device settings|cannot obtain current location/i.test(message)) {
    return {
      reason: 'service_disabled',
      errorMessage: '기기의 위치 서비스를 사용할 수 없습니다. 위치 설정을 켜고 다시 시도해 주세요.',
    };
  }

  if (/permission.*(?:required|denied)|not authorized/i.test(message)) {
    return {
      reason: 'permission_denied',
      errorMessage: '위치 권한이 허용되지 않았습니다. 단말기 설정에서 위치 권한을 허용해 주세요.',
    };
  }

  return {
    reason: 'error',
    errorMessage: '현재 위치를 확인할 수 없습니다. GPS와 위치 설정을 확인한 뒤 다시 시도해 주세요.',
  };
}

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

TaskManager.defineTask(WALK_LOCATION_TASK, ({ data, error }) => {
  if (error) {
    console.warn('[locationService] 백그라운드 위치 오류:', error.message);
    return Promise.resolve();
  }
  const { locations } = (data ?? { locations: [] }) as { locations: Location.LocationObject[] };
  pushLocations(locations);
  return Promise.resolve();
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

let webSimulationTimer: ReturnType<typeof setInterval> | null = null;

function startWebSimulation(): void {
  if (webSimulationTimer) {
    clearInterval(webSimulationTimer);
    webSimulationTimer = null;
  }
  // 기본 시작 좌표 (서울숲 인근 기준 가상 보행)
  const baseLat = 37.5445;
  const baseLon = 127.0374;
  let step = 0;
  const initialLocation: Location.LocationObject = {
    coords: {
      latitude: baseLat,
      longitude: baseLon,
      altitude: 15,
      accuracy: 5,
      altitudeAccuracy: 5,
      heading: 90,
      speed: 1.1, // 약 4.0 km/h
    },
    timestamp: Date.now(),
  };
  pushLocations([initialLocation]);

  webSimulationTimer = setInterval(() => {
    step += 1;
    const simulated: Location.LocationObject = {
      coords: {
        latitude: baseLat + step * 0.00008,
        longitude: baseLon + step * 0.00008,
        altitude: 15,
        accuracy: 5,
        altitudeAccuracy: 5,
        heading: 90,
        speed: 1.1 + Math.sin(step) * 0.1,
      },
      timestamp: Date.now(),
    };
    pushLocations([simulated]);
  }, 3000);
}

async function startForeground(): Promise<void> {
  foregroundSubscription = await Location.watchPositionAsync(TRACKING_OPTIONS, (location) =>
    pushLocations([location]),
  );
}

/** 산책 위치 추적을 시작한다. 권한/오류 상황은 결과 객체로 반환한다. */
export async function startWalkTracking(): Promise<StartTrackingResult> {
  try {
    buffer.length = 0;

    // 🌐 웹 브라우저 환경: 브라우저 위치 권한을 시도하되, GPS 하드웨어 부재나 권한 거부 시에도 웹 보행 세션으로 안전하게 시작
    if (Platform.OS === 'web') {
      try {
        const foreground = await Location.requestForegroundPermissionsAsync();
        if (foreground.status === 'granted') {
          await startForeground();
          return { ok: true, mode: 'foreground' };
        }
      } catch (e) {
        console.warn('[locationService] 웹 브라우저 Geolocation 권한 획득 생략:', e);
      }
      startWebSimulation();
      return { ok: true, mode: 'foreground' };
    }

    // 📱 모바일 네이티브 환경 (Android / iOS): Foreground Service 무중단 수집
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') return { ok: false, reason: 'permission_denied' };

    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status === 'granted') {
      await startBackground();
      return { ok: true, mode: 'background' };
    }
    await startForeground();
    return { ok: true, mode: 'foreground' };
  } catch (error) {
    console.warn('[locationService] 추적 시작 실패:', error);
    if (Platform.OS === 'web') {
      startWebSimulation();
      return { ok: true, mode: 'foreground' };
    }
    return { ok: false, reason: 'error' };
  }
}

/** 위치 추적을 안전하게 종료한다. */
export async function stopWalkTracking(): Promise<void> {
  if (webSimulationTimer) {
    clearInterval(webSimulationTimer);
    webSimulationTimer = null;
  }
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  try {
    if (Platform.OS !== 'web' && (await Location.hasStartedLocationUpdatesAsync(WALK_LOCATION_TASK))) {
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
  if (Platform.OS === 'web') return;
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

/**
 * 경로 생성 전 단말기의 현재 1회성 GPS 좌표를 안전하게 획득한다.
 * - 포그라운드 위치 권한 확인 및 요청
 * - 5초 타임아웃 방어 (실내 음영 지역 등)
 * - 웹 시뮬레이션 환경 자동 호환
 */
export async function getCurrentLocationCoords(timeoutMs = 5000): Promise<CurrentLocationResult> {
  try {
    if (Platform.OS === 'web') {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced ?? Location.Accuracy.High ?? 3,
          });
          return {
            ok: true,
            coords: {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy,
            },
          };
        }
      } catch (e) {
        console.warn('[locationService] 웹 브라우저 위치 획득 실패, 시뮬레이션 좌표 사용:', e);
      }
      // 웹 시뮬레이션 기본 위치 (대전 유림공원 인근)
      return {
        ok: true,
        coords: {
          latitude: 36.3628,
          longitude: 127.3592,
          accuracy: 10,
        },
      };
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return {
        ok: false,
        reason: 'permission_denied',
        errorMessage: '위치 권한이 허용되지 않았습니다. 단말기 설정에서 위치 권한을 허용해 주세요.',
      };
    }

    // 타임아웃 가드 (실내 GPS 음영 지역 대비)
    const positionPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced ?? 3,
    });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('GPS_TIMEOUT')), timeoutMs);
    });

    let loc: Location.LocationObject;
    try {
      loc = (await Promise.race([positionPromise, timeoutPromise])) as Location.LocationObject;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }

    return {
      ok: true,
      coords: {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
      },
    };
  } catch (error) {
    console.warn('[locationService] getCurrentLocationCoords 오류:', error);
    const details = getLocationErrorDetails(error);
    return {
      ok: false,
      ...details,
    };
  }
}

