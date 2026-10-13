/**
 * [편안하개 - PetWalk]
 * locationService 웹 환경 안전 폴백 및 GPS 추적 단위 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Platform } from 'react-native';

vi.mock('expo-task-manager', () => ({
  defineTask: vi.fn(),
}));

vi.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'denied' }),
  requestBackgroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'denied' }),
  watchPositionAsync: vi.fn(),
  startLocationUpdatesAsync: vi.fn(),
  stopLocationUpdatesAsync: vi.fn(),
  hasStartedLocationUpdatesAsync: vi.fn().mockResolvedValue(false),
}));

import {
  startWalkTracking,
  stopWalkTracking,
  subscribeToGps,
  getTrackBuffer,
  GpsPoint,
} from './locationService';

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
});
