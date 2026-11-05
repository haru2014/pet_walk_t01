import { describe, expect, it } from 'vitest';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import {
  classifyTurnAngle,
  computePocketManeuver,
  directionFromInstruction,
  formatManeuverDistance,
} from './pocketManeuver';

// 약 1e-4도 ≈ 위도 11m. 북쪽으로 올라간 뒤 동쪽(오른쪽)으로 꺾는 L자 경로
const ROUTE: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: [[127.0, 36.0], [127.0, 36.001], [127.001, 36.001], [127.001, 36.002]],
    },
  }] as never,
};

const turnPin = (id: string, position: [number, number], instruction: string): RouteStepPin => ({
  id, kind: 'turn', position, instruction,
});

describe('pocketManeuver', () => {
  it('classifies turn angles', () => {
    expect(classifyTurnAngle(5)).toBe('straight');
    expect(classifyTurnAngle(90)).toBe('right');
    expect(classifyTurnAngle(-90)).toBe('left');
    expect(classifyTurnAngle(30)).toBe('slightRight');
    expect(classifyTurnAngle(170)).toBe('uturn');
    expect(classifyTurnAngle(270)).toBe('left');
  });

  it('reads direction words from instructions', () => {
    expect(directionFromInstruction('30미터 앞 우회전입니다')).toBe('right');
    expect(directionFromInstruction('크게 좌회전하세요')).toBe('left');
    expect(directionFromInstruction('그늘 쉼터 구간입니다')).toBeNull();
  });

  it('formats distances for the card', () => {
    expect(formatManeuverDistance(42)).toEqual({ value: '40', unit: 'm' });
    expect(formatManeuverDistance(127)).toEqual({ value: '130', unit: 'm' });
    expect(formatManeuverDistance(1260)).toEqual({ value: '1.3', unit: 'km' });
  });

  it('finds the next turn and infers its direction from geometry', () => {
    const pins = [
      turnPin('a', [127.0, 36.001], '쉼터 방향으로 진행합니다'),
      turnPin('b', [127.001, 36.001], '공원 입구 방향'),
    ];
    const result = computePocketManeuver([127.0, 36.0005], ROUTE, pins);
    expect(result?.current.pinId).toBe('a');
    expect(result?.current.direction).toBe('right');
    expect(result?.current.distanceM).toBeGreaterThan(45);
    expect(result?.current.distanceM).toBeLessThan(65);
    expect(result?.following?.pinId).toBe('b');
    expect(result?.following?.direction).toBe('left');
    expect(result?.progressRatio).toBeGreaterThan(0.4);
  });

  it('moves on after passing a turn and falls back to arrival', () => {
    const pins = [turnPin('a', [127.0, 36.001], '우회전')];
    const result = computePocketManeuver([127.0006, 36.001], ROUTE, pins);
    expect(result?.current.direction).toBe('arrive');
    expect(result?.following).toBeNull();
  });

  it('returns null without position or geometry', () => {
    expect(computePocketManeuver(null, ROUTE, [])).toBeNull();
    expect(computePocketManeuver([127, 36], { type: 'FeatureCollection', features: [] }, [])).toBeNull();
  });
});
