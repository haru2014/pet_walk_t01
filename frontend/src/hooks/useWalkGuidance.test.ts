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
