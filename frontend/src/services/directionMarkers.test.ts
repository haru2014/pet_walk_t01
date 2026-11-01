import { describe, expect, it } from 'vitest';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { getDirectionMarkers } from './directionMarkers';

function routeWithCoordinates(coordinates: readonly (readonly [number, number])[]): RouteFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 0, shaded: false },
      geometry: { type: 'LineString', coordinates },
    }],
  };
}

describe('getDirectionMarkers', () => {
  it('creates a left-turn marker at a route corner and does not mark straight segments', () => {
    const route = routeWithCoordinates([
      [0, 0],
      [0.00018, 0],
      [0.00036, 0],
      [0.00036, 0.00018],
      [0.00036, 0.00036],
    ]);

    expect(getDirectionMarkers(route, [])).toEqual([
      { id: 'route-turn-0-2', position: [0.00036, 0], maneuver: 'left' },
    ]);
  });

  it('classifies a reversal as a U-turn', () => {
    const route = routeWithCoordinates([
      [0, 0],
      [0.00018, 0],
      [0, 0],
    ]);

    expect(getDirectionMarkers(route, [])[0]?.maneuver).toBe('uturn');
  });

  it('uses explicit turn instructions and avoids duplicating a nearby geometry turn', () => {
    const route = routeWithCoordinates([
      [0, 0],
      [0.00018, 0],
      [0.00036, 0],
      [0.00036, 0.00018],
    ]);
    const pins: RouteStepPin[] = [{
      id: 'turn-1',
      kind: 'turn',
      position: [0.00036, 0],
      instruction: '다음 길에서 우회전하세요',
    }];

    expect(getDirectionMarkers(route, pins)).toEqual([
      { id: 'turn-1', position: [0.00036, 0], maneuver: 'right', stepPin: pins[0] },
    ]);
  });

  it('does not create direction markers for a straight route', () => {
    const route = routeWithCoordinates([
      [0, 0],
      [0.00018, 0],
      [0.00036, 0],
    ]);

    expect(getDirectionMarkers(route, [])).toEqual([]);
  });
});
