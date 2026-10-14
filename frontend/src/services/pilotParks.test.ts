import { describe, it, expect, vi } from 'vitest';
import { PILOT_PARKS, getPilotParkById } from '../types/pilotParks';
import { generateAdaptiveCourses, generateAdaptiveBriefing } from './courseAdaptivePlanner';
import { getCoursePlanByParkId } from './sampleRoute';
import { requestWalkPlan } from './api';
import { DogProfile } from '../types/dogProfile';

describe('US-A1 & US-G1 대전 3대 공원 & 세종호수공원 플래너 연동 검증', () => {
  const mockDog: DogProfile = {
    id: 'dog_test',
    name: '뽀삐',
    breed: '말티즈',
    ageYears: 4,
    weightKg: 4.5,
    speedKmH: 2.8,
    jointCareLevel: 1,
    createdAt: '2026-10-13T00:00:00.000Z',
    updatedAt: '2026-10-13T00:00:00.000Z',
  };

  it('4대 파일럿 거점 공원 메타데이터가 정상 정의되어 있어야 한다', () => {
    expect(PILOT_PARKS).toHaveLength(4);

    const yurim = getPilotParkById('yurim');
    expect(yurim.name).toBe('대전 유림공원');
    expect(yurim.center.lat).toBeCloseTo(36.3628, 3);
    expect(yurim.center.lon).toBeCloseTo(127.3592, 3);

    const sejong = getPilotParkById('sejong');
    expect(sejong.name).toBe('세종호수공원');
    expect(sejong.center.lat).toBeCloseTo(36.5020, 3);

    const songgang = getPilotParkById('songgang');
    expect(songgang.name).toBe('대전 송강근린공원');

    const doan = getPilotParkById('doan');
    expect(doan.name).toBe('대전 도안호수공원');
  });

  it('유림공원 선택 시 유림공원 전용 코스명과 ID(yurim_course_1)를 생성해야 한다', () => {
    const courses = generateAdaptiveCourses(mockDog, {
      durationMinutes: 30,
      environments: ['soft', 'shade'],
      requestText: '',
      pilotParkId: 'yurim',
    });

    expect(courses).toHaveLength(3);
    expect(courses[0].id).toBe('yurim_course_1');
    expect(courses[0].name).toContain('유림공원');
    expect(courses[0].reason).toContain('유림공원 부설 공영주차장');

    const briefing = generateAdaptiveBriefing(mockDog, {
      durationMinutes: 30,
      environments: ['soft'],
      requestText: '',
      pilotParkId: 'yurim',
    });
    expect(briefing).toContain('[유림공원]');
  });

  it('세종호수공원 선택 시 세종호수 전용 코스명과 ID(sejong_course_1)를 생성해야 한다', () => {
    const courses = generateAdaptiveCourses(mockDog, {
      durationMinutes: 40,
      environments: ['soft', 'shade'],
      requestText: '',
      pilotParkId: 'sejong',
    });

    expect(courses[0].id).toBe('sejong_course_1');
    expect(courses[0].name).toContain('세종호수공원');
    expect(courses[0].reason).toContain('세종호수공원 제1주차장');
  });

  it('getCoursePlanByParkId로 각 공원의 실제 둘레길 GeoJSON 및 턴바이턴 핀을 반환해야 한다', () => {
    const yurimPlan = getCoursePlanByParkId('yurim');
    expect(yurimPlan.route.features.length).toBeGreaterThanOrEqual(3);
    expect(yurimPlan.stepPins.length).toBeGreaterThanOrEqual(3);
    expect(yurimPlan.stepPins[0].instruction).toContain('유림공원');

    const sejongPlan = getCoursePlanByParkId('sejong');
    expect(sejongPlan.route.features.length).toBeGreaterThanOrEqual(2);
    expect(sejongPlan.stepPins[0].instruction).toContain('제1주차장');

    const songgangPlan = getCoursePlanByParkId('songgang');
    expect(songgangPlan.stepPins[0].instruction).toContain('송강공원');

    const doanPlan = getCoursePlanByParkId('doan');
    expect(doanPlan.stepPins[0].instruction).toContain('도안호수공원');
  });

  it('requestWalkPlan 오프라인 폴백 시 선택한 공원의 경로와 코스가 반환되어야 한다', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    try {
      const result = await requestWalkPlan(mockDog, {
        durationMinutes: 25,
        environments: ['soft'],
        requestText: '',
        pilotParkId: 'yurim',
      });

      expect(result.isLiveServer).toBe(false);
      expect(result.courses[0].id).toBe('yurim_course_1');
      expect(result.courses[0].name).toContain('유림공원');
      expect(result.stepPins[0].instruction).toContain('유림공원');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
