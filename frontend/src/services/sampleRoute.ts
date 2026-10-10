/**
 * [편안하개 - PetWalk]
 * 모바일 데모용 샘플 코스 (서버 응답 GeoJSON 목업)
 * 좌표: [lon, lat] (서울숲 인근 순환 루프)
 */

import { RouteFeatureCollection, RouteStepPin } from '../types/route';

export const SAMPLE_ROUTE: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 2.1, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.0374, 37.5443],
          [127.0381, 37.5449],
          [127.0390, 37.5455],
          [127.0399, 37.5459],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'normal', maxSlopePercent: 3.4, shaded: false },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.0399, 37.5459],
          [127.0409, 37.5456],
          [127.0416, 37.5449],
          [127.0419, 37.5441],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'caution', maxSlopePercent: 7.8, shaded: false },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.0419, 37.5441],
          [127.0414, 37.5434],
          [127.0406, 37.5430],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.8, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.0406, 37.5430],
          [127.0396, 37.5430],
          [127.0385, 37.5434],
          [127.0374, 37.5443],
        ],
      },
    },
  ],
};

export const SAMPLE_STEP_PINS: readonly RouteStepPin[] = [
  { id: 'turn_1', kind: 'turn', position: [127.0399, 37.5459], instruction: '50m 앞 완만한 길입니다. 우회전하세요' },
  { id: 'turn_2', kind: 'turn', position: [127.0419, 37.5441], instruction: '우측 보행로로 진입하세요' },
  { id: 'caution_1', kind: 'caution', position: [127.0414, 37.5434], instruction: '전방 높은 턱 주의 구간입니다. 서행하세요' },
];
