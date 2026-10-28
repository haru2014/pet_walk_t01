import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGuidancePoint, speakGuidanceEvent } from './useWalkGuidance';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { INITIAL_GUIDANCE_STATE, GuidanceEvent } from '../services/guidanceEngine';
import { TTSNavigationService } from '../services/ttsNavigation';
import { GpsPoint } from '../services/locationService';

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
  requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  requestBackgroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  watchPositionAsync: vi.fn(),
  startLocationUpdatesAsync: vi.fn(),
  stopLocationUpdatesAsync: vi.fn(),
  hasStartedLocationUpdatesAsync: vi.fn().mockResolvedValue(false),
  getCurrentPositionAsync: vi.fn(),
}));

vi.mock('../services/ttsNavigation', () => ({
  TTSNavigationService: {
    speak: vi.fn(),
    stop: vi.fn(),
  },
}));

const TEST_ROUTE: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.0, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.382, 36.374],
          [127.382, 36.376],
          [127.382, 36.378],
        ],
      },
    },
  ],
};

const TEST_PINS: RouteStepPin[] = [
  {
    id: 'pin_1',
    kind: 'turn',
    position: [127.382, 36.376],
    instruction: '직진하세요',
  },
];

describe('handleGuidancePoint - 경로 이탈 시 서버 재탐색 연동 및 음성 발화 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('경로 상 정상 이동 시 이탈이 발생하지 않고 재탐색을 요청하지 않는다', async () => {
    const speakSpy = vi.fn();
    const applyRerouteSpy = vi.fn();
    const requestRerouteSpy = vi.fn();

    const normalPoint: GpsPoint = {
      latitude: 36.374,
      longitude: 127.382,
      timestamp: Date.now(),
      speedMps: 1.2,
    };

    const res = await handleGuidancePoint(
      normalPoint,
      TEST_ROUTE,
      TEST_PINS,
      INITIAL_GUIDANCE_STATE,
      {
        speak: speakSpy,
        applyReroute: applyRerouteSpy,
        requestReroute: requestRerouteSpy,
      },
      false
    );

    expect(res.triggeredReroute).toBe(false);
    expect(requestRerouteSpy).not.toHaveBeenCalled();
    expect(applyRerouteSpy).not.toHaveBeenCalled();
  });

  it('경로에서 200m 이상 이탈 시 이탈 안내를 발화하고 서버에 재탐색을 요청하여 경로를 교체한다', async () => {
    const speakSpy = vi.fn();
    const applyRerouteSpy = vi.fn();

    const reroutedRoute: RouteFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { segmentType: 'safe', maxSlopePercent: 1.0, shaded: true },
          geometry: {
            type: 'LineString',
            coordinates: [
              [127.385, 36.375],
              [127.382, 36.378],
            ],
          },
        },
      ],
    };

    const requestRerouteSpy = vi.fn().mockResolvedValueOnce({
      status: 'REROUTED',
      needsReroute: true,
      voiceAlert: '경로를 재탐색했습니다. 안전한 새 경로로 안내합니다.',
      newRoute: reroutedRoute,
      stepPins: [
        {
          id: 'dev_pin_1',
          kind: 'turn',
          position: [127.385, 36.375],
          instruction: '새 경로로 직진하세요',
        },
      ],
    });

    // 출발지 점검 완료된 상태에서 크게 벗어난 좌표 수신
    const stateWithStartChecked = {
      ...INITIAL_GUIDANCE_STATE,
      startChecked: true,
      prevPosition: [127.382, 36.374] as [number, number],
    };

    const offRoutePoint: GpsPoint = {
      latitude: 36.375,
      longitude: 127.385, // 경로에서 약 270m 벗어남
      timestamp: Date.now(),
      speedMps: 1.2,
    };

    const res = await handleGuidancePoint(
      offRoutePoint,
      TEST_ROUTE,
      TEST_PINS,
      stateWithStartChecked,
      {
        speak: speakSpy,
        applyReroute: applyRerouteSpy,
        requestReroute: requestRerouteSpy,
      },
      false
    );

    // 1. 이탈 이벤트 발화 확인
    expect(speakSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'off_route',
        message: expect.stringContaining('경로를 이탈했습니다'),
      })
    );

    // 2. 서버 재탐색 요청 확인
    expect(res.triggeredReroute).toBe(true);
    expect(requestRerouteSpy).toHaveBeenCalledTimes(1);
    expect(requestRerouteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentLat: 36.375,
        currentLon: 127.385,
        destinationLat: 36.378,
        destinationLon: 127.382,
      })
    );

    // 3. 재탐색 경로 적용 확인
    expect(applyRerouteSpy).toHaveBeenCalledTimes(1);
    expect(applyRerouteSpy).toHaveBeenCalledWith(
      reroutedRoute,
      expect.any(Array),
      '경로를 재탐색했습니다. 안전한 새 경로로 안내합니다.'
    );
  });

  it('이미 재탐색이 진행 중(isRerouting=true)이면 중복으로 재탐색을 요청하지 않는다', async () => {
    const speakSpy = vi.fn();
    const applyRerouteSpy = vi.fn();
    const requestRerouteSpy = vi.fn();

    const stateWithStartChecked = {
      ...INITIAL_GUIDANCE_STATE,
      startChecked: true,
      prevPosition: [127.382, 36.374] as [number, number],
    };

    const offRoutePoint: GpsPoint = {
      latitude: 36.375,
      longitude: 127.385,
      timestamp: Date.now(),
      speedMps: 1.2,
    };

    const res = await handleGuidancePoint(
      offRoutePoint,
      TEST_ROUTE,
      TEST_PINS,
      stateWithStartChecked,
      {
        speak: speakSpy,
        applyReroute: applyRerouteSpy,
        requestReroute: requestRerouteSpy,
      },
      true // isRerouting = true
    );

    expect(res.triggeredReroute).toBe(false);
    expect(requestRerouteSpy).not.toHaveBeenCalled();
    expect(applyRerouteSpy).not.toHaveBeenCalled();
  });

  it('rerouteContext 전달 시 originMode, pilotParkId, 남은 산책 거리(remainingDistanceM)를 포함해 재탐색을 요청한다', async () => {
    const speakSpy = vi.fn();
    const applyRerouteSpy = vi.fn();
    const requestRerouteSpy = vi.fn().mockResolvedValueOnce({
      status: 'REROUTED',
      needsReroute: true,
      voiceAlert: '현재 위치에서 출발지로 돌아오는 새로운 산책 경로를 안내합니다.',
      newRoute: TEST_ROUTE,
      stepPins: TEST_PINS,
    });

    const stateWithStartChecked = {
      ...INITIAL_GUIDANCE_STATE,
      startChecked: true,
      prevPosition: [127.382, 36.374] as [number, number],
      routeProgressM: 120,
    };

    const offRoutePoint: GpsPoint = {
      latitude: 36.375,
      longitude: 127.385,
      timestamp: 100_000,
      speedMps: 1.1,
      accuracyM: 12,
    };

    const res = await handleGuidancePoint(
      offRoutePoint,
      TEST_ROUTE,
      TEST_PINS,
      stateWithStartChecked,
      {
        speak: speakSpy,
        applyReroute: applyRerouteSpy,
        requestReroute: requestRerouteSpy,
      },
      false,
      {
        originMode: 'current_location',
        targetMinutes: 30,
        elapsedSec: 600, // 10분 경과 -> 20분 남음
        speedKmH: 3.6, // 분당 60m -> 남은 거리 약 1200m
        lastRerouteAtMs: null,
      },
    );

    expect(res.triggeredReroute).toBe(true);
    expect(requestRerouteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        originMode: 'current_location',
        remainingDistanceM: 1200,
        progressM: 120,
      }),
    );
  });

  it('직전 재탐색으로부터 30초 쿨다운 이내이거나 GPS 오차(accuracyM > 45m)가 크면 자동 재탐색을 건너뛴다', async () => {
    const speakSpy = vi.fn();
    const applyRerouteSpy = vi.fn();
    const requestRerouteSpy = vi.fn();

    const stateWithStartChecked = {
      ...INITIAL_GUIDANCE_STATE,
      startChecked: true,
      prevPosition: [127.382, 36.374] as [number, number],
    };

    // 1. 쿨다운(30초) 이내
    const cooldownPoint: GpsPoint = {
      latitude: 36.375,
      longitude: 127.385,
      timestamp: 115_000,
      speedMps: 1.2,
      accuracyM: 10,
    };
    const resCooldown = await handleGuidancePoint(
      cooldownPoint,
      TEST_ROUTE,
      TEST_PINS,
      stateWithStartChecked,
      { speak: speakSpy, applyReroute: applyRerouteSpy, requestReroute: requestRerouteSpy },
      false,
      { originMode: 'current_location', lastRerouteAtMs: 100_000 },
    );
    expect(resCooldown.triggeredReroute).toBe(false);
    expect(requestRerouteSpy).not.toHaveBeenCalled();

    // 2. GPS 튀는 현상 (accuracyM = 65m > 45m)
    const lowAccuracyPoint: GpsPoint = {
      latitude: 36.375,
      longitude: 127.385,
      timestamp: 200_000,
      speedMps: 1.2,
      accuracyM: 65,
    };
    const resLowAcc = await handleGuidancePoint(
      lowAccuracyPoint,
      TEST_ROUTE,
      TEST_PINS,
      stateWithStartChecked,
      { speak: speakSpy, applyReroute: applyRerouteSpy, requestReroute: requestRerouteSpy },
      false,
      { originMode: 'park', pilotParkId: 'yurim', lastRerouteAtMs: null },
    );
    expect(resLowAcc.triggeredReroute).toBe(false);
    expect(requestRerouteSpy).not.toHaveBeenCalled();
  });

  it('다중 세그먼트 코스에서 이탈 시 모든 조각의 연결 좌표(routeCoordinates)를 재탐색 파라미터로 전송한다 (#290)', async () => {
    const speakSpy = vi.fn();
    const applyRerouteSpy = vi.fn();
    const requestRerouteSpy = vi.fn().mockResolvedValueOnce({
      status: 'REROUTED',
      needsReroute: true,
      voiceAlert: '경로를 재탐색했습니다.',
      newRoute: TEST_ROUTE,
      stepPins: TEST_PINS,
    });

    const multiSegmentRoute: RouteFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { segmentType: 'safe', maxSlopePercent: 1.0, shaded: true },
          geometry: {
            type: 'LineString',
            coordinates: [
              [127.380, 36.370],
              [127.382, 36.372],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { segmentType: 'caution', maxSlopePercent: 4.0, shaded: false },
          geometry: {
            type: 'LineString',
            coordinates: [
              [127.382, 36.372],
              [127.384, 36.374],
            ],
          },
        },
      ],
    };

    const stateWithStartChecked = {
      ...INITIAL_GUIDANCE_STATE,
      startChecked: true,
      prevPosition: [127.380, 36.370] as [number, number],
    };

    const offRoutePoint: GpsPoint = {
      latitude: 36.380,
      longitude: 127.390,
      timestamp: Date.now(),
      speedMps: 1.2,
      accuracyM: 10,
    };

    const res = await handleGuidancePoint(
      offRoutePoint,
      multiSegmentRoute,
      TEST_PINS,
      stateWithStartChecked,
      { speak: speakSpy, applyReroute: applyRerouteSpy, requestReroute: requestRerouteSpy },
      false,
    );

    expect(res.triggeredReroute).toBe(true);
    expect(requestRerouteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        routeCoordinates: [
          [127.380, 36.370],
          [127.382, 36.372],
          [127.384, 36.374],
        ],
      }),
    );
  });

  it('첫 이탈 순간 쿨다운으로 건너뛰었으나 코스 밖 상태(offRouteActive=true)가 지속될 때 쿨다운 경과 후 자동 재탐색을 수행한다 (#290)', async () => {
    const speakSpy = vi.fn();
    const applyRerouteSpy = vi.fn();
    const requestRerouteSpy = vi.fn().mockResolvedValueOnce({
      status: 'REROUTED',
      needsReroute: true,
      voiceAlert: '경로를 재탐색했습니다.',
      newRoute: TEST_ROUTE,
      stepPins: TEST_PINS,
    });

    // 이미 이탈 상태(offRouteActive = true)이므로 guidanceEngine에서는 off_route 이벤트를 새로 내지 않음
    const stateAlreadyOffRoute = {
      ...INITIAL_GUIDANCE_STATE,
      startChecked: true,
      offRouteActive: true,
      prevPosition: [127.385, 36.375] as [number, number],
    };

    // 직전 재탐색이 100,000ms였고 현재 135,000ms (35초 경과 -> 쿨다운 30초 초과)
    const nextPoint: GpsPoint = {
      latitude: 36.375,
      longitude: 127.385,
      timestamp: 135_000,
      speedMps: 1.2,
      accuracyM: 15,
    };

    const res = await handleGuidancePoint(
      nextPoint,
      TEST_ROUTE,
      TEST_PINS,
      stateAlreadyOffRoute,
      { speak: speakSpy, applyReroute: applyRerouteSpy, requestReroute: requestRerouteSpy },
      false,
      { originMode: 'park', pilotParkId: 'yurim', lastRerouteAtMs: 100_000 },
    );

    expect(res.triggeredReroute).toBe(true);
    expect(requestRerouteSpy).toHaveBeenCalledTimes(1);
    expect(applyRerouteSpy).toHaveBeenCalledTimes(1);
  });
});

describe('speakGuidanceEvent - 우선순위 발화 테스트', () => {
  it('이탈 안내는 high 우선순위로 발화되어 시작 멘트 뒤 최우선으로 재생된다', () => {
    const event: GuidanceEvent = {
      kind: 'off_route',
      message: '경로를 이탈했습니다. 안전하게 안내를 재탐색합니다.',
    };

    speakGuidanceEvent(event);

    expect(TTSNavigationService.speak).toHaveBeenCalledWith(
      event.message,
      undefined,
      false,
      'high'
    );
  });
});
