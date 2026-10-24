/**
 * [편안하개 - PetWalk]
 * 음성 안내 판정 엔진 단위 테스트 (US-C2, US-D2)
 */

import { describe, it, expect } from 'vitest';
import {
  ARRIVAL_MESSAGE,
  GuidanceState,
  INITIAL_GUIDANCE_STATE,
  OFF_ROUTE_MESSAGE,
  distanceToRouteMeters,
  evaluateGuidance,
  resetGuidanceForNewRoute,
} from './guidanceEngine';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from './sampleRoute';
import { LonLat, RouteFeatureCollection, RouteStepPin } from '../types/route';

const ON_ROUTE_START: LonLat = [127.3592, 36.3628];
const NEAR_TURN_1: LonLat = [127.35921, 36.36281]; // yurim_pin_1 약 2m 이내
const FAR_AWAY: LonLat = [127.40, 36.40];

/** 출발지 거리 점검을 이미 마친 상태 (출발지 이동 안내와 무관한 규칙을 검증할 때 사용) */
const STARTED_STATE: GuidanceState = { ...INITIAL_GUIDANCE_STATE, startChecked: true };

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

const ON_ROUTE_FAR_FROM_PINS: LonLat = [127.3565, 36.3633];

describe('30m 전 사전 음성 브리핑', () => {
  it('스텝 핀 30m 이내 진입 시 해당 안내 문구를 발화해야 한다', () => {
    const { events } = evaluateGuidance(NEAR_TURN_1, SAMPLE_ROUTE, SAMPLE_STEP_PINS, INITIAL_GUIDANCE_STATE);
    const brief = events.find((e) => e.kind === 'pre_brief');
    expect(brief?.pinId).toBe('yurim_pin_1');
    expect(brief?.message).toBe('유림공원 부설주차장에서 갑천 둔치 흙길로 진입합니다');
  });

  it('같은 핀은 한 번만 안내해야 한다', () => {
    const first = evaluateGuidance(NEAR_TURN_1, SAMPLE_ROUTE, SAMPLE_STEP_PINS, INITIAL_GUIDANCE_STATE);
    const second = evaluateGuidance(NEAR_TURN_1, SAMPLE_ROUTE, SAMPLE_STEP_PINS, first.nextState);
    expect(second.events.filter((e) => e.kind === 'pre_brief')).toHaveLength(0);
  });

  it('핀에서 멀면 안내하지 않아야 한다', () => {
    const { events } = evaluateGuidance(ON_ROUTE_FAR_FROM_PINS, SAMPLE_ROUTE, SAMPLE_STEP_PINS, STARTED_STATE);
    expect(events).toHaveLength(0);
  });
});

describe('40m 이상 경로 이탈 경고', () => {
  it('이탈 시 재탐색 안내를 1회만 발화해야 한다', () => {
    const first = evaluateGuidance(FAR_AWAY, SAMPLE_ROUTE, SAMPLE_STEP_PINS, STARTED_STATE);
    expect(first.events.some((e) => e.kind === 'off_route' && e.message === OFF_ROUTE_MESSAGE)).toBe(true);

    const second = evaluateGuidance(FAR_AWAY, SAMPLE_ROUTE, SAMPLE_STEP_PINS, first.nextState);
    expect(second.events.some((e) => e.kind === 'off_route')).toBe(false);
  });

  it('경로 재진입 후 다시 이탈하면 다시 경고해야 한다', () => {
    const away = evaluateGuidance(FAR_AWAY, SAMPLE_ROUTE, SAMPLE_STEP_PINS, STARTED_STATE);
    const back = evaluateGuidance(ON_ROUTE_START, SAMPLE_ROUTE, SAMPLE_STEP_PINS, away.nextState);
    expect(back.nextState.offRouteActive).toBe(false);

    const awayAgain = evaluateGuidance(FAR_AWAY, SAMPLE_ROUTE, SAMPLE_STEP_PINS, back.nextState);
    expect(awayAgain.events.some((e) => e.kind === 'off_route')).toBe(true);
  });
});

// 경도 127.0 위를 북쪽으로 약 500m 뻗은 직선 코스 (위도 0.0005° ≈ 55m)
const LAT0 = 37.0;
const STEP_DEG = 0.0005;
const lat = (steps: number): number => LAT0 + steps * STEP_DEG;
const NORTH_ROUTE: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1, shaded: false },
      geometry: {
        type: 'LineString',
        coordinates: Array.from({ length: 10 }, (_, i) => [127.0, lat(i)] as LonLat),
      },
    },
  ],
};
const NORTH_END_STEPS = 9;
const pt = (steps: number): LonLat => [127.0, lat(steps)];

function walkSteps(
  from: number,
  to: number,
  route: RouteFeatureCollection,
  pins: readonly RouteStepPin[],
  initial: GuidanceState,
) {
  let state = initial;
  const all: { step: number; kind: string }[] = [];
  for (let s = from; s <= to; s += 1) {
    const result = evaluateGuidance(pt(s), route, pins, state);
    result.events.forEach((e) => all.push({ step: s, kind: e.kind }));
    state = result.nextState;
  }
  return { events: all, state };
}

describe('출발지에서 먼 경우 출발지 이동 안내', () => {
  it('첫 GPS가 출발지에서 30m보다 멀면 출발지 이동을 안내하고 이탈 경고는 중복하지 않는다', () => {
    const farFromStart: LonLat = [127.0, LAT0 - 0.001]; // 출발지에서 약 110m 남쪽
    const { events, nextState } = evaluateGuidance(farFromStart, NORTH_ROUTE, [], INITIAL_GUIDANCE_STATE);
    expect(events.map((e) => e.kind)).toEqual(['to_start']);
    expect(events[0].message).toContain('출발지로 이동');
    expect(nextState.startChecked).toBe(true);
  });

  it('출발지 근처에서 시작하면 출발지 이동을 안내하지 않는다', () => {
    const { events } = evaluateGuidance(pt(0), NORTH_ROUTE, [], INITIAL_GUIDANCE_STATE);
    expect(events.some((e) => e.kind === 'to_start')).toBe(false);
  });

  it('출발지 이동 안내는 산책 중 한 번만 한다', () => {
    const farFromStart: LonLat = [127.0, LAT0 - 0.001];
    const first = evaluateGuidance(farFromStart, NORTH_ROUTE, [], INITIAL_GUIDANCE_STATE);
    const second = evaluateGuidance(farFromStart, NORTH_ROUTE, [], first.nextState);
    expect(second.events).toHaveLength(0);
  });
});

describe('듬성듬성한 GPS에서도 선분 기준으로 핀 안내', () => {
  const pin: RouteStepPin = {
    id: 'mid_pin',
    kind: 'turn',
    position: [127.0, lat(4)],
    instruction: '중간 지점입니다',
  };

  it('핀 옆을 지나쳐 GPS 점이 반경 밖에 찍혀도 선분이 통과했으면 안내한다', () => {
    const first = evaluateGuidance(pt(2), NORTH_ROUTE, [pin], STARTED_STATE); // 핀에서 약 110m
    expect(first.events).toHaveLength(0);
    const second = evaluateGuidance(pt(6), NORTH_ROUTE, [pin], first.nextState); // 핀 반대편 약 110m
    expect(second.events.map((e) => e.pinId)).toEqual(['mid_pin']);
  });

  it('선분이 핀 반경에서 멀리 떨어져 지나가면 안내하지 않는다', () => {
    const farPin: RouteStepPin = { ...pin, position: [127.001, lat(4)] }; // 경로에서 약 90m 옆
    const first = evaluateGuidance(pt(2), NORTH_ROUTE, [farPin], STARTED_STATE);
    const second = evaluateGuidance(pt(6), NORTH_ROUTE, [farPin], first.nextState);
    expect(second.events.filter((e) => e.kind === 'pre_brief')).toHaveLength(0);
  });
});

describe('회전 안내는 다음 방향 전환을 경로상 거리로 묶는다', () => {
  const route: RouteFeatureCollection = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1, shaded: false },
      geometry: { type: 'LineString', coordinates: [[127, 0], [127.001, 0]] },
    }],
  };
  const pins: RouteStepPin[] = [
    { id: 'turn-left', kind: 'turn', position: [127.0003, 0], instruction: '좌회전하여 보행로를 따라 이동하세요.' },
    { id: 'turn-right', kind: 'turn', position: [127.00033, 0], instruction: '우회전하여 보행로를 따라 이동하세요.' },
    { id: 'turn-u', kind: 'turn', position: [127.00045, 0], instruction: '유턴하여 반대 방향으로 이동하세요.' },
  ];

  it('5m 안에 이어지는 방향 전환은 한 번의 순서 안내로 묶는다', () => {
    const result = evaluateGuidance([127.00026, 0], route, pins, STARTED_STATE);
    const turnEvent = result.events.find((event) => event.category === 'turn');

    expect(turnEvent?.message).toBe('5미터 전방에서 좌회전하십시오. 이어서 우회전하십시오.');
    expect(turnEvent?.pinIds).toEqual(['turn-left', 'turn-right']);
    expect(result.nextState.announcedPinIds).toContain('turn-right');
    expect(result.nextState.announcedPinIds).not.toContain('turn-u');
  });

  it('아직 5m보다 멀리 있는 다음 회전은 미리 안내하지 않는다', () => {
    const result = evaluateGuidance([127.0001, 0], route, pins, STARTED_STATE);
    expect(result.events.filter((event) => event.category === 'turn')).toHaveLength(0);
  });
});

describe('핀이 없어도 일정 거리마다 진행 안내', () => {
  it('약 200m를 걸으면 경로를 잘 따라가고 있다고 안내하고 이후 다시 누적한다', () => {
    const { events } = walkSteps(0, 8, NORTH_ROUTE, [], INITIAL_GUIDANCE_STATE);
    const progress = events.filter((e) => e.kind === 'progress');
    expect(progress.map((e) => e.step)).toEqual([4, 8]);
  });

  it('이탈 중에는 진행 안내를 하지 않는다', () => {
    let state: GuidanceState = STARTED_STATE;
    const kinds: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const p: LonLat = [127.003, lat(i)]; // 경로에서 약 270m 옆을 나란히 이동
      const result = evaluateGuidance(p, NORTH_ROUTE, [], state);
      result.events.forEach((e) => kinds.push(e.kind));
      state = result.nextState;
    }
    expect(kinds).toEqual(['off_route']);
  });
});

describe('도착 안내', () => {
  it('코스 끝까지 충분히 걸어 도착하면 도착 안내를 한 번만 한다', () => {
    const { events } = walkSteps(0, NORTH_END_STEPS + 3, NORTH_ROUTE, [], INITIAL_GUIDANCE_STATE);
    const arrivals = events.filter((e) => e.kind === 'arrival');
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0].step).toBe(NORTH_END_STEPS);
  });

  it('도착 안내 문구에 종료 방법이 포함된다', () => {
    expect(ARRIVAL_MESSAGE).toContain('도착');
  });

  it('출발지와 도착지가 같은 순환 코스는 시작 직후에는 도착으로 판정하지 않는다', () => {
    const loop: RouteFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { segmentType: 'safe', maxSlopePercent: 1, shaded: false },
          geometry: {
            type: 'LineString',
            coordinates: [pt(0), pt(4), [127.002, lat(4)], [127.002, lat(0)], pt(0)],
          },
        },
      ],
    };
    const { events } = evaluateGuidance(pt(0), loop, [], INITIAL_GUIDANCE_STATE);
    expect(events.some((e) => e.kind === 'arrival')).toBe(false);
  });

  it('코스를 거의 걷지 않고 끝 지점 근처를 지나가도 도착으로 보지 않는다', () => {
    const result = evaluateGuidance(pt(NORTH_END_STEPS), NORTH_ROUTE, [], STARTED_STATE);
    expect(result.events.some((e) => e.kind === 'arrival')).toBe(false);
  });
});

describe('우회 경로 교체 시 안내 상태', () => {
  it('걸은 거리와 직전 위치는 유지하고 핀·이탈·도착 상태는 초기화하며 출발지 안내는 다시 하지 않는다', () => {
    const walked = walkSteps(0, 4, NORTH_ROUTE, [], INITIAL_GUIDANCE_STATE).state;
    const reset = resetGuidanceForNewRoute({ ...walked, announcedPinIds: ['x'], offRouteActive: true, arrived: true });
    expect(reset.walkedM).toBe(walked.walkedM);
    expect(reset.prevPosition).toEqual(walked.prevPosition);
    expect(reset.announcedPinIds).toHaveLength(0);
    expect(reset.offRouteActive).toBe(false);
    expect(reset.arrived).toBe(false);
    expect(reset.startChecked).toBe(true);
  });
});
