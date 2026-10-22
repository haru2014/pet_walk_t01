/**
 * [편안하개 - PetWalk]
 * locationService 웹 환경 안전 폴백 및 GPS 추적 단위 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Platform } from 'react-native';

import * as Location from 'expo-location';
import {
  startWalkTracking,
  stopWalkTracking,
  subscribeToGps,
  getTrackBuffer,
  getCurrentLocationCoords,
  GpsPoint,
} from './locationService';

vi.mock('expo-task-manager', () => ({
  defineTask: vi.fn(),
}));

vi.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6, Balanced: 3, High: 4 },
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'denied' }),
  requestBackgroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'denied' }),
  watchPositionAsync: vi.fn(),
  startLocationUpdatesAsync: vi.fn(),
  stopLocationUpdatesAsync: vi.fn(),
  hasStartedLocationUpdatesAsync: vi.fn().mockResolvedValue(false),
  getCurrentPositionAsync: vi.fn(),
}));

describe('locationService - 웹 환경 및 GPS 추적 안전 동작 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopWalkTracking();
  });

  it('웹 브라우저(Platform.OS === web) 환경에서 startWalkTracking은 permission_denied 없이 성공(ok: true, mode: foreground)해야 한다', async () => {
    // Platform.OS가 web인 상태에서 호출
    const originalOS = Platform.OS;
    Platform.OS = 'web';

    try {
      const result = await startWalkTracking();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.mode).toBe('foreground');
      }

      // 첫 번째 가상/실제 좌표가 버퍼에 수집되었는지 확인
      const track = getTrackBuffer();
      expect(track.length).toBeGreaterThanOrEqual(1);
      expect(track[0].latitude).toBeDefined();
      expect(track[0].longitude).toBeDefined();
    } finally {
      Platform.OS = originalOS;
    }
  });

  it('subscribeToGps 리스너가 새 위치 좌표를 정상 수신해야 한다', async () => {
    const receivedPoints: GpsPoint[] = [];
    const unsubscribe = subscribeToGps((pt) => {
      receivedPoints.push(pt);
    });

    const originalOS = Platform.OS;
    Platform.OS = 'web';

    try {
      await startWalkTracking();
      expect(receivedPoints.length).toBeGreaterThanOrEqual(1);
    } finally {
      unsubscribe();
      Platform.OS = originalOS;
    }
  });

  it('stopWalkTracking 호출 시 추적 및 타이머가 안전하게 해제되어야 한다', async () => {
    const originalOS = Platform.OS;
    Platform.OS = 'web';

    try {
      await startWalkTracking();
      await expect(stopWalkTracking()).resolves.not.toThrow();
    } finally {
      Platform.OS = originalOS;
    }
  });

  describe('getCurrentLocationCoords - 1회성 GPS 좌표 획득', () => {
    it('웹 브라우저 환경에서는 시뮬레이션 기본 좌표를 안전하게 반환해야 한다', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'web';

      try {
        const result = await getCurrentLocationCoords();
        expect(result.ok).toBe(true);
        expect(result.coords).toBeDefined();
        expect(result.coords?.latitude).toBeCloseTo(36.3628);
        expect(result.coords?.longitude).toBeCloseTo(127.3592);
      } finally {
        Platform.OS = originalOS;
      }
    });

    it('모바일 환경에서 위치 권한 거부 시 permission_denied 실패 결과를 반환해야 한다', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';

      vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce({
        status: Location.PermissionStatus.DENIED,
        canAskAgain: true,
        expires: 'never',
        granted: false,
      } as any);

      try {
        const result = await getCurrentLocationCoords();
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('permission_denied');
        expect(result.errorMessage).toContain('위치 권한');
      } finally {
        Platform.OS = originalOS;
      }
    });

    it('모바일 환경에서 위치 권한 승인 시 실제 GPS 좌표를 반환해야 한다', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';

      vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce({
        status: Location.PermissionStatus.GRANTED,
        canAskAgain: true,
        expires: 'never',
        granted: true,
      } as any);

      vi.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({
        coords: {
          latitude: 37.5665,
          longitude: 126.978,
          altitude: 20,
          accuracy: 5,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: Date.now(),
      } as any);

      try {
        const result = await getCurrentLocationCoords();
        expect(result.ok).toBe(true);
        expect(result.coords?.latitude).toBeCloseTo(37.5665);
        expect(result.coords?.longitude).toBeCloseTo(126.978);
        expect(result.coords?.accuracy).toBe(5);
      } finally {
        Platform.OS = originalOS;
      }
    });

    it.each([
      [
        'Location services are disabled',
        'service_disabled',
        '기기의 위치 서비스를 사용할 수 없습니다. 위치 설정을 켜고 다시 시도해 주세요.',
      ],
      [
        'Location provider is unavailable.',
        'service_disabled',
        '기기의 위치 서비스를 사용할 수 없습니다. 위치 설정을 켜고 다시 시도해 주세요.',
      ],
      [
        'unexpected native failure',
        'error',
        '현재 위치를 확인할 수 없습니다. GPS와 위치 설정을 확인한 뒤 다시 시도해 주세요.',
      ],
    ] as const)('모바일 위치 오류 "%s"는 한국어 안내로 반환해야 한다', async (nativeError, reason, errorMessage) => {
      const originalOS = Platform.OS;
      Platform.OS = 'android';

      vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce({
        status: Location.PermissionStatus.GRANTED,
        canAskAgain: true,
        expires: 'never',
        granted: true,
      } as any);
      vi.mocked(Location.getCurrentPositionAsync).mockRejectedValueOnce(new Error(nativeError));

      try {
        const result = await getCurrentLocationCoords(10_000);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe(reason);
        expect(result.errorMessage).toBe(errorMessage);
        expect(result.errorMessage).not.toContain(nativeError);
        expect(result.errorMessage).not.toMatch(/Location|unavailable|disabled|unexpected/i);
      } finally {
        Platform.OS = originalOS;
      }
    });
  });
});

