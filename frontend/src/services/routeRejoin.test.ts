import { describe, it, expect } from 'vitest';
import { LonLat } from '../types/route';
import { haversineMeters } from './routeGeometry';
import { buildRejoinPath, collectRouteProjections, selectRouteProjection } from './routeRejoin';

// 출발점(START)에서 북쪽으로 올라갔다가 동쪽→남쪽으로 돌아오는 순환 코스 (한 바퀴, 시작=끝)
const START: LonLat = [127.0, 36.0];
const LOOP: LonLat[] = [
  START,
  [127.0, 36.002],
  [127.002, 36.002],
  [127.002, 36.0],
  START,
];

describe('routeRejoin - 이탈 후 코스 합류 지점 계산', () => {
  it('정점이 아니라 선분 위의 가장 가까운 점으로 합류한다', () => {
    // 첫 구간(북쪽으로 올라가는 길) 중간에서 동쪽으로 20m 벗어난 위치
    const current: LonLat = [127.0002, 36.001];
    const path = buildRejoinPath(LOOP, current);

    expect(path).not.toBeNull();
    const [from, join] = path!.coordinates;
    expect(from).toEqual(current);
    // 합류점은 x=127.0 선분 위, 위도는 현재 위치와 같은 36.001 부근 (정점 START/북쪽 끝이 아님)
    expect(join[0]).toBeCloseTo(127.0, 6);
    expect(join[1]).toBeCloseTo(36.001, 4);
    expect(path!.joinDistanceM).toBeLessThan(25);
  });

  it('합류 후에는 남은 코스를 이어 붙이고 이미 지난 구간은 포함하지 않는다', () => {
    const path = buildRejoinPath(LOOP, [127.0002, 36.001]);
    const coords = path!.coordinates;

    expect(coords[0]).toEqual([127.0002, 36.001]);
    expect(coords.at(-1)).toEqual(START);
    // 합류 이후 정점: 북쪽 끝 → 북동 → 남동 → 시작점
    expect(coords).toContainEqual([127.002, 36.002]);
    expect(coords).toContainEqual([127.002, 36.0]);
  });

  it('진행 거리 힌트가 있으면 시작점 근처 이탈에서도 순환 코스를 이어서 안내한다', () => {
    // 코스 거의 끝(남동쪽 모서리 → 시작점으로 돌아오는 구간)을 지나다가 시작점 근처에서 이탈
    const nearStartLate: LonLat = [127.00003, 36.0003];
    const totalM = LOOP.slice(1).reduce((sum, c, i) => sum + haversineMeters(LOOP[i], c), 0);

    // 힌트 없음: 시작점 쪽(코스 처음)과 끝 모두 가까워 코스 처음 구간으로 합류할 수 있다.
    const withoutHint = buildRejoinPath(LOOP, nearStartLate);
    // 힌트 있음(거의 한 바퀴 진행): 앞쪽(마지막 구간)으로 합류해 남은 거리가 짧다.
    const withHint = buildRejoinPath(LOOP, nearStartLate, totalM - 30);

    expect(withHint).not.toBeNull();
    expect(withHint!.joinProgressM).toBeGreaterThan(totalM - 60);
    expect(withoutHint!.joinProgressM).toBeLessThan(withHint!.joinProgressM);
  });

  it('여러 바퀴 코스에서 같은 자리가 반복되면 진행 거리보다 앞쪽의 가장 가까운 바퀴를 고른다', () => {
    // 같은 순환로를 3바퀴 도는 좌표열
    const threeLaps: LonLat[] = [START, ...LOOP.slice(1), ...LOOP.slice(1), ...LOOP.slice(1)];
    const lapM = LOOP.slice(1).reduce((sum, c, i) => sum + haversineMeters(LOOP[i], c), 0);
    const current: LonLat = [127.0002, 36.001];

    // 2바퀴째 첫 구간을 걷던 중 이탈한 상황 (진행 거리 ≈ 1바퀴 + 일부)
    const secondLapHint = lapM + 120;
    const candidates = collectRouteProjections([threeLaps], current);
    const join = selectRouteProjection(candidates, secondLapHint);

    expect(join).not.toBeNull();
    expect(join!.progressM).toBeGreaterThan(lapM);
    expect(join!.progressM).toBeLessThan(lapM + 300);
  });

  it('좌표가 2개 미만이면 합류 경로를 만들지 않는다', () => {
    expect(buildRejoinPath([START], [127.0, 36.0])).toBeNull();
    expect(selectRouteProjection([])).toBeNull();
  });
});
