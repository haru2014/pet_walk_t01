import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reportHazard,
  generateLocalDetourRoute,
  requestRerouteAroundHazard,
  createEmergencyReturnRoute,
  requestDeviationReroute,
  generateLocalDeviationReroute,
  HAZARD_TYPE_LABELS,
  getForwardHazardReports,
  getNearbyHazardReports,
} from './hazardApi';
import * as apiClient from './apiClient';

describe('hazardApi - 현장 위험 제보 및 안전 우회 / 돌아가기 테스트', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('자유 산책 전방 위험 조회', () => {
    it('위치 기반 제보를 조회하고 이동 방향 앞에 있는 제보만 가까운 순으로 반환한다', async () => {
      vi.spyOn(apiClient, 'fetchWithServerFallback').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reports: [
            { report_id: 'ahead', lat: 0, lon: 0.001, hazard_type: 'stairs', severity: 'danger', distance_m: 111 },
            { report_id: 'behind', lat: 0, lon: -0.001, hazard_type: 'construction', severity: 'warning', distance_m: 111 },
            { report_id: 'side', lat: 0.001, lon: 0, hazard_type: 'high_curb', severity: 'warning', distance_m: 111 },
          ]
        }),
      } as any);

      const reports = await getNearbyHazardReports(0, 0);
      const ahead = getForwardHazardReports(reports, 0, 0, 90);

      expect(apiClient.fetchWithServerFallback).toHaveBeenCalledWith(expect.stringContaining('/api/v1/hazards?'));
      expect(ahead.map((report) => report.report_id)).toEqual(['ahead']);
    });

    it('조회 응답 형식이 잘못되면 위험 없음으로 취급하지 않고 실패 처리한다', async () => {
      vi.spyOn(apiClient, 'fetchWithServerFallback').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reports: null }),
      } as any);

      await expect(getNearbyHazardReports(0, 0)).rejects.toThrow('응답 형식');
    });
  });

  describe('reportHazard', () => {
    it('서버 응답 성공 시 성공 메시지를 반환한다', async () => {
      vi.spyOn(apiClient, 'fetchWithServerFallback').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success' }),
      } as any);

      const res = await reportHazard({
        lat: 36.35,
        lon: 127.38,
        hazardType: 'construction',
        severity: 'danger',
        description: '도로 공사 중',
      });

      expect(res.ok).toBe(true);
      expect(res.message).toContain('성공적으로 제보');
    });

    it('서버 장애 시 오프라인 로컬 기록 메시지를 반환하며 예외가 전파되지 않는다', async () => {
      vi.spyOn(apiClient, 'fetchWithServerFallback').mockRejectedValueOnce(
        new Error('Network error')
      );

      const res = await reportHazard({
        lat: 36.35,
        lon: 127.38,
        hazardType: 'high_curb',
        severity: 'warning',
      });

      expect(res.ok).toBe(true);
      expect(res.message).toContain('오프라인');
    });

    it('dog_danger 위험 종류를 construction으로 치환하지 않고 그대로 전송한다 (#228)', async () => {
      const fetchSpy = vi.spyOn(apiClient, 'fetchWithServerFallback').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success' }),
      } as any);

      const res = await reportHazard({
        lat: 36.35,
        lon: 127.38,
        hazardType: 'dog_danger',
        severity: 'danger',
        description: '공격적인 들개 출몰',
      });

      expect(res.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/v1/hazards',
        expect.objectContaining({
          body: expect.stringContaining('"hazard_type":"dog_danger"'),
        })
      );
    });
  });

  describe('generateLocalDetourRoute', () => {
    it('위험 지점(60m 이내)을 배제하고 우회 좌표를 추가한 경로를 생성한다', () => {
      const currentLat = 36.374;
      const currentLon = 127.382;
      const destLat = 36.378;
      const destLon = 127.382;
      const hazardLat = 36.376;
      const hazardLon = 127.382;

      const existingCoords: [number, number][] = [
        [currentLon, currentLat],
        [hazardLon, hazardLat], // 위험 지점과 정확히 일치
        [destLon, destLat],
      ];

      const detourCoords = generateLocalDetourRoute(
        currentLat,
        currentLon,
        destLat,
        destLon,
        hazardLat,
        hazardLon,
        existingCoords
      );

      expect(detourCoords.length).toBeGreaterThanOrEqual(3);
      // 시작점과 도착점 유지 확인
      expect(detourCoords[0]).toEqual([currentLon, currentLat]);
      expect(detourCoords[detourCoords.length - 1]).toEqual([destLon, destLat]);

      // 위험 지점 좌표 [hazardLon, hazardLat]는 완전히 배제되었거나 우회점으로 대체되어야 함
      const containsHazardPoint = detourCoords.some(
        ([lon, lat]) => Math.abs(lon - hazardLon) < 0.00001 && Math.abs(lat - hazardLat) < 0.00001
      );
      expect(containsHazardPoint).toBe(false);
    });
  });

  describe('requestRerouteAroundHazard', () => {
    it('서버 REROUTED 응답 시 새 GeoJSON 및 안내 핀을 구성한다', async () => {
      vi.spyOn(apiClient, 'fetchWithServerFallback').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'REROUTED',
          voice_alert: '전방 공사 구역을 우회하여 새로운 경로를 안내합니다.',
          new_distance_m: 650,
          hazard_clearance_m: 60.0,
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { segmentType: 'safe' },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [127.382, 36.374],
                    [127.383, 36.376],
                    [127.382, 36.378],
                  ],
                },
              },
            ],
          },
        }),
      } as any);

      const result = await requestRerouteAroundHazard({
        currentLat: 36.374,
        currentLon: 127.382,
        destinationLat: 36.378,
        destinationLon: 127.382,
        hazardLat: 36.376,
        hazardLon: 127.382,
        hazardType: 'construction',
      });

      expect(result.status).toBe('REROUTED');
      expect(result.needsReroute).toBe(true);
      expect(result.voiceAlert).toContain('우회하여');
      expect(result.newRoute.features[0].geometry.coordinates).toHaveLength(3);
      expect(result.stepPins.length).toBeGreaterThanOrEqual(2);
      expect(result.isEmergencyReturn).toBe(false);
    });

    it('서버 오류 시 로컬 기하 기반 안전 우회 경로로 즉시 폴백한다', async () => {
      vi.spyOn(apiClient, 'fetchWithServerFallback').mockRejectedValueOnce(
        new Error('Reroute server 500')
      );

      const result = await requestRerouteAroundHazard({
        currentLat: 36.374,
        currentLon: 127.382,
        destinationLat: 36.378,
        destinationLon: 127.382,
        hazardLat: 36.376,
        hazardLon: 127.382,
        hazardType: 'broken_glass',
      });

      expect(result.status).toBe('REROUTED');
      expect(result.needsReroute).toBe(true);
      expect(result.voiceAlert).toContain(HAZARD_TYPE_LABELS.broken_glass);
      expect(result.newRoute.features[0].geometry.coordinates.length).toBeGreaterThanOrEqual(3);
      expect(result.hazardClearanceM).toBe(80.0);
    });

    it('dog_danger 위험 종류 우회 요청 시 construction으로 치환하지 않고 dog_danger로 요청한다 (#228)', async () => {
      const fetchSpy = vi.spyOn(apiClient, 'fetchWithServerFallback').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'REROUTED',
          voice_alert: '전방 들개/맹견 출몰 구간을 우회하여 새로운 경로를 안내합니다.',
          new_distance_m: 650,
          hazard_clearance_m: 60.0,
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { segmentType: 'safe' },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [127.382, 36.374],
                    [127.383, 36.376],
                    [127.382, 36.378],
                  ],
                },
              },
            ],
          },
        }),
      } as any);

      const result = await requestRerouteAroundHazard({
        currentLat: 36.374,
        currentLon: 127.382,
        destinationLat: 36.378,
        destinationLon: 127.382,
        hazardLat: 36.376,
        hazardLon: 127.382,
        hazardType: 'dog_danger',
      });

      expect(result.status).toBe('REROUTED');
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/v1/walk/reroute',
        expect.objectContaining({
          body: expect.stringContaining('"hazard_type":"dog_danger"'),
        })
      );
    });
  });

  describe('createEmergencyReturnRoute', () => {
    it('출발지로의 돌아가기 경로와 음성 안내를 생성한다', () => {
      const currentLat = 36.376;
      const currentLon = 127.385;
      const startLat = 36.370;
      const startLon = 127.380;

      const existingCoords: [number, number][] = [
        [startLon, startLat],
        [127.382, 36.373],
        [currentLon, currentLat],
      ];

      const result = createEmergencyReturnRoute(
        currentLat,
        currentLon,
        startLat,
        startLon,
        existingCoords
      );

      expect(result.status).toBe('REROUTED');
      expect(result.isEmergencyReturn).toBe(true);
      expect(result.voiceAlert).toContain('출발지로 복귀하는 긴급 경로');
      expect(result.stepPins.some((p) => p.instruction.includes('출발'))).toBe(true);
      const coords = result.newRoute.features[0].geometry.coordinates;
      expect(coords[0]).toEqual([currentLon, currentLat]);
      expect(coords[coords.length - 1]).toEqual([startLon, startLat]);
    });
  });

  describe('requestDeviationReroute & generateLocalDeviationReroute (경로 이탈 재탐색)', () => {
    it('서버 응답 성공 시 서버의 재탐색 경로와 음성 안내를 반환한다', async () => {
      vi.spyOn(apiClient, 'fetchWithServerFallback').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'REROUTED',
          needs_reroute: true,
          voice_alert: '경로를 재탐색했습니다. 안전한 새 경로로 안내합니다.',
          new_distance_m: 350,
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { segmentType: 'reroute' },
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [127.3825, 36.3745],
                    [127.383, 36.376],
                    [127.382, 36.378],
                  ],
                },
              },
            ],
          },
        }),
      } as any);

      const result = await requestDeviationReroute({
        currentLat: 36.3745,
        currentLon: 127.3825,
        destinationLat: 36.378,
        destinationLon: 127.382,
        routeCoordinates: [
          [127.382, 36.374],
          [127.382, 36.378],
        ],
      });

      expect(result.status).toBe('REROUTED');
      expect(result.needsReroute).toBe(true);
      expect(result.voiceAlert).toContain('현재 위치에서');
      expect(result.voiceAlert).toContain('미터 이동해 기존 산책 경로에 다시 합류');
      expect(result.newRoute.features[0].geometry.coordinates[0]).toEqual([127.3825, 36.3745]);
      expect(result.stepPins.length).toBeGreaterThanOrEqual(2);
    });

    it('서버 오류 시 로컬 기하 기반 복귀 경로로 즉시 폴백한다', async () => {
      vi.spyOn(apiClient, 'fetchWithServerFallback').mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await requestDeviationReroute({
        currentLat: 36.3745,
        currentLon: 127.3825,
        destinationLat: 36.378,
        destinationLon: 127.382,
        routeCoordinates: [
          [127.382, 36.374],
          [127.382, 36.376],
          [127.382, 36.378],
        ],
      });

      expect(result.status).toBe('REROUTED');
      expect(result.needsReroute).toBe(true);
      expect(result.voiceAlert).toContain('현재 위치에서');
      expect(result.voiceAlert).toContain('미터 이동해 기존 산책 경로에 다시 합류');
      const coords = result.newRoute.features[0].geometry.coordinates;
      expect(coords[0]).toEqual([127.3825, 36.3745]);
      expect(coords[coords.length - 1]).toEqual([127.382, 36.378]);
    });

    it('generateLocalDeviationReroute는 현재 위치에서 가장 가까운 전방 지점을 연결한 경로를 반환한다', () => {
      const local = generateLocalDeviationReroute({
        currentLat: 36.375,
        currentLon: 127.383,
        destinationLat: 36.378,
        destinationLon: 127.382,
        routeCoordinates: [
          [127.382, 36.374],
          [127.382, 36.376],
          [127.382, 36.378],
        ],
      });

      expect(local.status).toBe('REROUTED');
      expect(local.needsReroute).toBe(true);
      expect(local.voiceAlert).toContain('현재 위치에서');
      expect(local.voiceAlert).toContain('미터 이동해 기존 산책 경로에 다시 합류');
      expect(local.newRoute.features[0].geometry.coordinates[0]).toEqual([127.383, 36.375]);
      expect(local.stepPins).toHaveLength(2);
    });
  });
});
