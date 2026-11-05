import { describe, expect, it } from 'vitest';
import {
  bearingFromRecentPath,
  resolveFollowTargetHeading,
  shortestDeltaDeg,
  smoothHeading,
} from './followHeading';

describe('followHeading', () => {
  it('computes the shortest rotation across north', () => {
    expect(shortestDeltaDeg(350, 10)).toBe(20);
    expect(shortestDeltaDeg(10, 350)).toBe(-20);
    expect(shortestDeltaDeg(0, 180)).toBe(-180);
  });

  it('ignores GPS jitter shorter than the minimum span', () => {
    const jitter: [number, number][] = [[127, 36], [127.00002, 36.00001]];
    expect(bearingFromRecentPath(jitter)).toBeNull();
  });

  it('derives the walking bearing from points far enough apart', () => {
    const north: [number, number][] = [[127, 36], [127, 36.00005], [127, 36.0001], [127.000001, 36.00011]];
    const bearing = bearingFromRecentPath(north)!;
    expect(bearing < 5 || bearing > 355).toBe(true);
  });

  it('keeps the heading inside the deadband and eases larger changes', () => {
    expect(smoothHeading(90, 95)).toBe(90);
    expect(smoothHeading(null, 45)).toBe(45);
    expect(smoothHeading(0, 90)).toBeCloseTo(36);
    expect(smoothHeading(350, 30)).toBeCloseTo(6);
    expect(smoothHeading(120, null)).toBe(120);
  });

  it('uses the route bearing only to initialise while standing still', () => {
    expect(resolveFollowTargetHeading({ speedKmH: 0, routeBearing: 80, hasHeading: false })).toBe(80);
    expect(resolveFollowTargetHeading({ speedKmH: 0, routeBearing: 80, hasHeading: true })).toBeNull();
  });
});
