import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestWalkPlan } from './api';
import { DogProfile } from '../types/dogProfile';
import { extractLocalVoiceIntent } from './voiceIntentApi';
import { resolveAiEnvironments } from './voiceIntentSettings';

const dummyDog: DogProfile = {
  id: 'dog_test',
  name: '코코',
  breed: '말티즈',
  ageYears: 5,
  weightKg: 4.5,
  jointCareLevel: 1,
  speedKmH: 2.5,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
};

describe('apiService (Live API 및 오프라인 폴백 듀얼 모드)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('음성 조건을 적용한 설정이 산책 API 요청에 그대로 전달된다', async () => {
    const speech = '송강공원에서 그늘 위주로 30분 산책할래';
    const result = extractLocalVoiceIntent(speech);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(requestWalkPlan(dummyDog, {
      originMode: 'park', pilotParkId: result.landmark_park_id!,
      durationMinutes: result.intent.target_duration_minutes,
      environments: resolveAiEnvironments([], result.intent), requestText: speech,
    })).rejects.toMatchObject({ code: 'ROUTING_PROVIDER_TIMEOUT' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/v1/walk/plan');
    expect(JSON.parse(options!.body as string)).toMatchObject({
      pilot_park_id: 'songgang', target_duration_minutes: 30,
      prefer_shade: true, prefer_cushion: true, avoid_stairs: true,
      request_text: speech,
    });
  });

  it('공원 경로 서버가 오프라인이면 검증되지 않은 로컬 코스로 대체하지 않는다', async () => {
    // fetch가 에러를 던지도록 모킹
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    await expect(requestWalkPlan(dummyDog, { durationMinutes: 30, environments: ['soft'], requestText: '' }))
      .rejects.toMatchObject({ code: 'ROUTING_PROVIDER_TIMEOUT' });
  });

  it('서버가 정상 응답할 경우 Live 데이터 결과를 반환해야 한다', async () => {
    const mockApiResponse = {
      courses: [{ id: 'live_1', name: '실시간 생성 코스', durationMinutes: 25, distanceKm: 1.5, safeRatio: 90, slopePercent: 2.0, shadowPercent: 80, tags: ['안심'] }],
      briefing: '실시간 AI 코스가 생성되었습니다.',
      validated_park_id: 'yurim',
      route_validation: { live_1: { passed: true, park_id: 'yurim' } },
      elevation_source: { name: 'Copernicus DEM GLO-30', attribution: 'produced using Copernicus WorldDEM-30 © DLR e.V.' },
      geojson: { type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[127, 36], [127.001, 36]] } }] },
      course_plans: {
        live_1: {
          route: { type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[127, 36], [127.001, 36]] } }] },
          stepPins: [],
        },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse,
    } as Response);

    const result = await requestWalkPlan(dummyDog, { durationMinutes: 25, environments: ['shade'], requestText: '' });

    expect(result.isLiveServer).toBe(true);
    expect(result.courses[0].name).toBe('실시간 생성 코스');
    expect(result.briefingMessage).toBe('실시간 AI 코스가 생성되었습니다.');
    expect(result.coursePlans?.live_1).toBeDefined();
    expect(result.elevationAttribution).toBe('produced using Copernicus WorldDEM-30 © DLR e.V.');
  });

  it('진입 경로 1: 현재 위치 기반(current_location) 요청 시 실측 GPS 좌표를 전송해야 한다', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          courses: [{ id: 'current_1', name: '현위치 안심 코스' }],
          briefing: '현위치 기반 코스',
        }),
      } as Response;
    });

    await requestWalkPlan(dummyDog, {
      originMode: 'current_location',
      durationMinutes: 30,
      environments: ['soft'],
      requestText: '',
      userCoordinates: { lat: 37.5665, lon: 126.978 }, // 서울 시청 GPS 좌표
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.origin_mode).toBe('current_location');
    expect(capturedBody.origin_lat).toBeCloseTo(37.5665);
    expect(capturedBody.origin_lon).toBeCloseTo(126.978);
    expect(capturedBody.park_zone).toBe('현재 위치 주변');
  });

  it('진입 경로 2: 지정 공원 둘레길(park) 요청 시 공원 좌표, pilot_park_id 및 명칭을 전송해야 한다', async () => {
    let capturedBody: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          courses: [{ id: 'park_1', name: '유림공원 코스' }],
          briefing: '유림공원 코스',
          validated_park_id: 'yurim',
          route_validation: { park_1: { passed: true, park_id: 'yurim' } },
          geojson: { features: [{ geometry: { type: 'LineString', coordinates: [[127, 36], [127.001, 36]] } }] },
          course_plans: { park_1: { route: { features: [{ geometry: { type: 'LineString', coordinates: [[127, 36], [127.001, 36]] } }] }, stepPins: [] } },
        }),
      } as Response;
    });

    await requestWalkPlan(dummyDog, {
      originMode: 'park',
      pilotParkId: 'yurim',
      durationMinutes: 30,
      environments: ['soft'],
      requestText: '',
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.origin_mode).toBe('park');
    expect(capturedBody.pilot_park_id).toBe('yurim');
    expect(capturedBody.park_zone).toBe('대전 유림공원');
    expect(capturedBody.origin_lat).toBeCloseTo(36.3620608);
    expect(capturedBody.origin_lon).toBeCloseTo(127.3601379);
  });

  it('현위치 기반 오프라인 폴백 시 실측 좌표 기준 안전 순환 경로를 생성해야 한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await requestWalkPlan(dummyDog, {
      originMode: 'current_location',
      durationMinutes: 20,
      environments: ['soft'],
      requestText: '',
      userCoordinates: { lat: 37.5665, lon: 126.978 },
    });

    expect(result.isLiveServer).toBe(false);
    expect(result.route.type).toBe('FeatureCollection');
    expect(result.route.features.length).toBeGreaterThan(0);
    // 생성된 루프 첫 점이 서울 시청 인근(126.x, 37.x)인지 확인 (대전 유림공원 127.3592가 아님)
    const firstCoord = result.route.features[0].geometry.coordinates[0];
    expect(firstCoord[0]).toBeCloseTo(126.98, 1);
    expect(firstCoord[1]).toBeCloseTo(37.56, 1);
    expect(result.stepPins[0].position[0]).toBeCloseTo(126.978);
    expect(result.stepPins[0].position[1]).toBeCloseTo(37.5665);
  });

  it('서버의 경계 검증 거부를 그대로 전달하고 로컬 코스를 생성하지 않는다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false, status: 422,
      json: async () => ({ code: 'ROUTE_VALIDATION_FAILED', detail: '공원 경계 밖 경로입니다.', request_id: 'trace-test' }),
    } as Response);
    await expect(requestWalkPlan(dummyDog, { originMode: 'park', pilotParkId: 'songgang', durationMinutes: 40, environments: [], requestText: '' }))
      .rejects.toMatchObject({ code: 'ROUTE_VALIDATION_FAILED', requestId: 'trace-test' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('검증 메타데이터가 없는 구버전 성공 응답도 거부한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ courses: [{ id: 'old' }] }) } as Response);
    await expect(requestWalkPlan(dummyDog)).rejects.toMatchObject({ code: 'ROUTE_VALIDATION_FAILED' });
  });

  it('검증된 코스와 검증되지 않은 대안 코스가 섞인 응답을 거부한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({
        validated_park_id: 'yurim', courses: [{ id: 'safe' }, { id: 'unsafe' }],
        geojson: { features: [{}] }, route_validation: { safe: { passed: true, park_id: 'yurim' } },
        course_plans: { safe: { route: { features: [{}] } }, unsafe: { route: { features: [{}] } } },
      })
    } as Response);
    await expect(requestWalkPlan(dummyDog)).rejects.toMatchObject({ code: 'ROUTE_VALIDATION_FAILED' });
  });

  it('미등록 공원 ID를 기본 공원으로 조용히 변경하지 않는다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(requestWalkPlan(dummyDog, {
      originMode: 'park', pilotParkId: 'unknown', durationMinutes: 30, environments: [], requestText: '',
    })).rejects.toMatchObject({ code: 'BOUNDARY_DATA_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
