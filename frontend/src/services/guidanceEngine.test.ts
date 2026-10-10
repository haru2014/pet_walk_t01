/**
 * [편안하개 - PetWalk]
 * 음성 안내 판정 엔진 단위 테스트 (US-C2, US-D2)
 */

import { describe, it, expect } from 'vitest';
import {
  INITIAL_GUIDANCE_STATE,
  OFF_ROUTE_MESSAGE,
  distanceToRouteMeters,
  evaluateGuidance,
} from './guidanceEngine';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from './sampleRoute';
import { LonLat } from '../types/route';

const ON_ROUTE_START: LonLat = [127.0374, 37.5443];
const NEAR_TURN_1: LonLat = [127.03992, 37.54592]; // turn_1 약 2m 이내
const FAR_AWAY: LonLat = [127.05, 37.56];

describe('경로까지의 거리 계산', () => {
  it('경로 위의 점은 거리가 거의 0이어야 한다', () => {
    expect(distanceToRouteMeters(ON_ROUTE_START, SAMPLE_ROUTE)).toBeLessThan(1);
  });

  it('멀리 떨어진 점은 40m를 크게 초과해야 한다', () => {
    expect(distanceToRouteMeters(FAR_AWAY, SAMPLE_ROUTE)).toBeGreaterThan(500);
  });

  it('경로가 비어 있으면 무한대를 반환해야 한다', () => {
    const empty = { type: 'FeatureCollection', features: [] } as const;
    expect(distanceToRouteMeters(ON_ROUTE_START, empty)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('30m 전 사전 음성 브리핑', () => {
  it('스텝 핀 30m 이내 진입 시 해당 안내 문구를 발화해야 한다', () => {
    const { events } = evaluateGuidance(NEAR_TURN_1, SAMPLE_ROUTE, SAMPLE_STEP_PINS, INITIAL_GUIDANCE_STATE);
    const brief = events.find((e) => e.kind === 'pre_brief');
    expect(brief?.pinId).toBe('turn_1');
    expect(brief?.message).toBe('50m 앞 완만한 길입니다. 우회전하세요');
  });

  it('같은 핀은 한 번만 안내해야 한다', () => {
    const first = evaluateGuidance(NEAR_TURN_1, SAMPLE_ROUTE, SAMPLE_STEP_PINS, INITIAL_GUIDANCE_STATE);
    const second = evaluateGuidance(NEAR_TURN_1, SAMPLE_ROUTE, SAMPLE_STEP_PINS, first.nextState);
    expect(second.events.filter((e) => e.kind === 'pre_brief')).toHaveLength(0);
  });

  it('핀에서 멀면 안내하지 않아야 한다', () => {
    const { events } = evaluateGuidance(ON_ROUTE_START, SAMPLE_ROUTE, SAMPLE_STEP_PINS, INITIAL_GUIDANCE_STATE);
    expect(events).toHaveLength(0);
  });
});

describe('40m 이상 경로 이탈 경고', () => {
  it('이탈 시 재탐색 안내를 1회만 발화해야 한다', () => {
    const first = evaluateGuidance(FAR_AWAY, SAMPLE_ROUTE, SAMPLE_STEP_PINS, INITIAL_GUIDANCE_STATE);
    expect(first.events.some((e) => e.kind === 'off_route' && e.message === OFF_ROUTE_MESSAGE)).toBe(true);

    const second = evaluateGuidance(FAR_AWAY, SAMPLE_ROUTE, SAMPLE_STEP_PINS, first.nextState);
    expect(second.events.some((e) => e.kind === 'off_route')).toBe(false);
  });

  it('경로 재진입 후 다시 이탈하면 다시 경고해야 한다', () => {
    const away = evaluateGuidance(FAR_AWAY, SAMPLE_ROUTE, SAMPLE_STEP_PINS, INITIAL_GUIDANCE_STATE);
    const back = evaluateGuidance(ON_ROUTE_START, SAMPLE_ROUTE, SAMPLE_STEP_PINS, away.nextState);
    expect(back.nextState.offRouteActive).toBe(false);

    const awayAgain = evaluateGuidance(FAR_AWAY, SAMPLE_ROUTE, SAMPLE_STEP_PINS, back.nextState);
    expect(awayAgain.events.some((e) => e.kind === 'off_route')).toBe(true);
  });
});
