/**
 * [편안하개 - PetWalk]
 * sampleRoute.ts 단위 테스트 (코스별 경로 GeoJSON 및 스텝 핀 매핑 검증)
 */

import { describe, it, expect } from 'vitest';
import {
  SAMPLE_ROUTE,
  SAMPLE_STEP_PINS,
  ROUTE_COURSE_2,
  STEP_PINS_COURSE_2,
  ROUTE_COURSE_3,
  STEP_PINS_COURSE_3,
  COURSE_PLANS,
  getCoursePlanById,
} from './sampleRoute';

describe('sampleRoute & getCoursePlanById', () => {
  it('기본 샘플 코스 1(숲길) 데이터 규격이 올바르다', () => {
    expect(SAMPLE_ROUTE.type).toBe('FeatureCollection');
    expect(SAMPLE_ROUTE.features.length).toBeGreaterThanOrEqual(3);
    expect(SAMPLE_STEP_PINS.length).toBeGreaterThanOrEqual(1);
    expect(COURSE_PLANS.course_1.route).toEqual(SAMPLE_ROUTE);
  });

  it('코스 2(공원 한바퀴)와 코스 3(조용한 주택가) 데이터가 정의되어 있다', () => {
    expect(ROUTE_COURSE_2.features.length).toBeGreaterThanOrEqual(3);
    expect(STEP_PINS_COURSE_2.length).toBeGreaterThanOrEqual(1);

    expect(ROUTE_COURSE_3.features.length).toBeGreaterThanOrEqual(3);
    expect(STEP_PINS_COURSE_3.length).toBeGreaterThanOrEqual(1);
  });

  it('getCoursePlanById로 각 코스 ID에 맞는 경로와 핀을 정상 반환한다', () => {
    const course1 = getCoursePlanById('course_1');
    const course2 = getCoursePlanById('course_2');
    const course3 = getCoursePlanById('course_3');

    expect(course1.route).toEqual(SAMPLE_ROUTE);
    expect(course1.stepPins).toEqual(SAMPLE_STEP_PINS);

    expect(course2.route).toEqual(ROUTE_COURSE_2);
    expect(course2.stepPins).toEqual(STEP_PINS_COURSE_2);

    expect(course3.route).toEqual(ROUTE_COURSE_3);
    expect(course3.stepPins).toEqual(STEP_PINS_COURSE_3);

    // 각 코스의 첫 번째 좌표는 동일 출발지(유림공원 부설주차장)지만 중간 경로는 상이해야 함
    expect(course1.route.features[0].geometry.coordinates[0]).toEqual([127.3592, 36.3628]);
    expect(course2.route.features[0].geometry.coordinates[0]).toEqual([127.3592, 36.3628]);
    expect(course3.route.features[0].geometry.coordinates[0]).toEqual([127.3592, 36.3628]);

    // 중간 경로는 서로 다른 경로를 지남
    expect(course2.route).not.toEqual(course1.route);
    expect(course3.route).not.toEqual(course1.route);
    expect(course3.route).not.toEqual(course2.route);
  });

  it('알 수 없는 ID이거나 fallback 전달 시 안전하게 대체된다', () => {
    const fallbackPlan = {
      route: ROUTE_COURSE_2,
      stepPins: STEP_PINS_COURSE_2,
    };
    const unknownWithFallback = getCoursePlanById('unknown_course', fallbackPlan);
    expect(unknownWithFallback.route).toEqual(ROUTE_COURSE_2);

    const unknownWithoutFallback = getCoursePlanById('unknown_course');
    expect(unknownWithoutFallback.route).toEqual(SAMPLE_ROUTE);
  });

  it('AI 에이전트 candidate-loop ID들도 유효한 코스 플랜에 매핑된다', () => {
    const loop1 = getCoursePlanById('candidate-loop-01');
    const loop2 = getCoursePlanById('candidate-loop-02');
    const loop3 = getCoursePlanById('candidate-loop-03');

    expect(loop1.route).toEqual(SAMPLE_ROUTE);
    expect(loop2.route).toEqual(ROUTE_COURSE_2);
    expect(loop3.route).toEqual(ROUTE_COURSE_3);
  });
});
