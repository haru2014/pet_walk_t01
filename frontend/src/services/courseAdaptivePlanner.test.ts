/**
 * [편안하개 - PetWalk]
 * courseAdaptivePlanner.ts 단위 테스트 (사용자 설정 기반 적응형 코스 생성 검증)
 */

import { describe, it, expect } from 'vitest';
import { DogProfile, DEFAULT_DOGS } from '../types/dogProfile';
import { WalkPreferences } from '../types/walkSettings';
import {
  generateAdaptiveCourses,
  generateAdaptiveBriefing,
  buildAdaptiveConditionLabels,
} from './courseAdaptivePlanner';

const TEST_DOG: DogProfile = {
  ...DEFAULT_DOGS[0],
  id: 'dog_choco',
  name: '초코',
  speedKmH: 2.8,
  jointCareLevel: 2,
};

describe('courseAdaptivePlanner', () => {
  it('사용자가 20분을 선택했을 때 20분에 맞춘 거리와 소요시간 코스 3종이 산출되어야 한다', () => {
    const prefs: WalkPreferences = {
      durationMinutes: 20,
      environments: ['soft', 'shade', 'stairs'],
      requestText: '',
    };

    const courses = generateAdaptiveCourses(TEST_DOG, prefs);

    expect(courses).toHaveLength(3);
    // 20분 목표 코스 1 (최적)
    expect(courses[0].estimatedMinutes).toBe(20);
    expect(courses[0].distanceKm).toBe('0.9 km');
    expect(courses[0].reason).toContain('20분');

    // 코스 2 (약 90% 가벼운 순환)
    expect(courses[1].estimatedMinutes).toBe(18);
    expect(courses[1].distanceKm).toBe('0.8 km');

    // 코스 3 (약 110% 여유 순환)
    expect(courses[2].estimatedMinutes).toBe(22);
    expect(courses[2].distanceKm).toBe('1.0 km');
  });

  it('사용자가 60분을 선택했을 때 1시간 분량의 코스가 산출되어야 한다', () => {
    const prefs: WalkPreferences = {
      durationMinutes: 60,
      environments: ['soft', 'shade', 'stairs'],
      requestText: '',
    };

    const courses = generateAdaptiveCourses(TEST_DOG, prefs);

    expect(courses[0].estimatedMinutes).toBe(60);
    expect(courses[0].distanceKm).toBe('2.8 km');
    expect(courses[0].reason).toContain('60분');
  });

  it('차가 적은 길, 쉬어가기 좋은 길 등 5대 조건을 선택했을 때 태그와 사유에 온전히 반영되어야 한다 (1011-course3 화면 검증)', () => {
    const prefs: WalkPreferences = {
      durationMinutes: 20,
      environments: ['soft', 'shade', 'stairs', 'traffic', 'rest'],
      requestText: '',
    };

    const labels = buildAdaptiveConditionLabels(TEST_DOG, prefs);

    // 반려견 이름 + 시간 + 5가지 환경 레이블 전수 포함
    expect(labels).toContain('초코');
    expect(labels).toContain('20분');
    expect(labels).toContain('폭신한 길');
    expect(labels).toContain('그늘이 많은 길');
    expect(labels).toContain('계단 피하기');
    expect(labels).toContain('차가 적은 길');
    expect(labels).toContain('쉬어가기 좋은 길');

    const courses = generateAdaptiveCourses(TEST_DOG, prefs);
    // 코스 2 사유에 쉼터/차량통제 키워드 반영
    expect(courses[1].reason).toMatch(/쉬어갈 벤치|차량 통제/);
    // 코스 3 사유에 차량통행 키워드 반영
    expect(courses[2].reason).toContain('차량 통행이 적은 골목길');
  });

  it('맞춤형 브리핑 문구가 생성되어야 한다', () => {
    const prefs: WalkPreferences = {
      durationMinutes: 20,
      environments: ['soft', 'shade'],
      requestText: '',
    };

    const briefing = generateAdaptiveBriefing(TEST_DOG, prefs);
    expect(briefing).toContain('초코');
    expect(briefing).toContain('20분');
    expect(briefing).toContain('폭신한 길');
  });

  it('사용자가 75분(1시간 15분) 및 120분(2시간)을 선택했을 때 적응형 코스 및 라벨이 올바르게 생성되어야 한다 (US-A3, #38)', () => {
    const prefs75: WalkPreferences = {
      durationMinutes: 75,
      environments: ['soft', 'shade'],
      requestText: '',
    };

    const courses75 = generateAdaptiveCourses(TEST_DOG, prefs75);
    expect(courses75[0].estimatedMinutes).toBe(75);
    expect(courses75[0].distanceKm).toBe('3.5 km'); // 2.8 * (75/60) = 3.5 km
    const labels75 = buildAdaptiveConditionLabels(TEST_DOG, prefs75);
    expect(labels75).toContain('1시간 15분');

    const prefs120: WalkPreferences = {
      durationMinutes: 120,
      environments: ['soft', 'shade'],
      requestText: '',
    };
    const labels120 = buildAdaptiveConditionLabels(TEST_DOG, prefs120);
    expect(labels120).toContain('2시간');
  });

  it('자유 산책 모드(isFreeWalk=true) 선택 시 브리핑과 라벨에 자유 산책이 명시되어야 한다 (#38)', () => {
    const freePrefs: WalkPreferences = {
      durationMinutes: null,
      environments: ['soft', 'quiet'],
      requestText: '',
      isFreeWalk: true,
    };

    const labels = buildAdaptiveConditionLabels(TEST_DOG, freePrefs);
    expect(labels).toContain('초코');
    expect(labels).toContain('자유 산책');

    const briefing = generateAdaptiveBriefing(TEST_DOG, freePrefs);
    expect(briefing).toContain('자유 산책');
  });
});
