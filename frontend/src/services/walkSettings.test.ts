/**
 * [편안하개 - PetWalk]
 * 산책 설정 및 추천 코스 데이터/모델 검증 단위 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  WALK_ENVIRONMENTS,
  DEFAULT_RECOMMENDED_COURSES,
  WalkPreferences,
  DURATION_OPTIONS_15MIN,
  BREED_DURATION_GUIDES,
  formatDurationLabel,
} from '../types/walkSettings';
import {
  calculateRecommendedSpeedKmH,
  getJointCareLabel,
} from '../types/dogProfile';

describe('산책 설정 및 환경 옵션 (Screen-03)', () => {
  it('6대 산책 환경 옵션이 올바르게 정의되어 있어야 한다', () => {
    expect(WALK_ENVIRONMENTS).toHaveLength(6);
    const ids = WALK_ENVIRONMENTS.map((e) => e.id);
    expect(ids).toContain('soft');
    expect(ids).toContain('shade');
    expect(ids).toContain('stairs');
    expect(ids).toContain('traffic');
    expect(ids).toContain('quiet');
    expect(ids).toContain('rest');
  });

  it('기본 선호 조건 설정 객체가 유효해야 한다', () => {
    const prefs: WalkPreferences = {
      durationMinutes: 30,
      environments: ['soft', 'shade'],
      requestText: '천천히 걷고 싶어',
    };
    expect(prefs.durationMinutes).toBe(30);
    expect(prefs.environments).toContain('soft');
  });
});

describe('AI 추천 코스 및 3대 안심 지표 (Screen-04)', () => {
  it('기본 3대 추천 코스에 경사/노면/그늘 지표가 포함되어야 한다', () => {
    expect(DEFAULT_RECOMMENDED_COURSES.length).toBeGreaterThanOrEqual(3);

    for (const course of DEFAULT_RECOMMENDED_COURSES) {
      expect(course.maxSlopePercent).toBeLessThanOrEqual(5.0); // 완만 경사 보장
      expect(course.softSurfacePercent).toBeGreaterThanOrEqual(50); // 푹신 노면 50% 이상
      expect(course.shadePercent).toBeGreaterThanOrEqual(40); // 그늘 40% 이상
      expect(course.reason).toBeTruthy();
    }
  });
});

describe('반려견 권장 속도 및 관절 안심 케어 모델 (US-A3)', () => {
  it('소형견/노령견/적극보호 케어 적용 시 감속되어야 한다', () => {
    // 4.2kg 소형견, 9살 노령견, 관절 적극보호(level 2)
    const chocoSpeed = calculateRecommendedSpeedKmH(4.2, 9, 2);
    // 2.8 * 0.85 * 0.80 = 1.904 => 1.9 km/h
    expect(chocoSpeed).toBeLessThanOrEqual(2.2);
    expect(chocoSpeed).toBeGreaterThanOrEqual(1.5);
  });

  it('관절 안심 케어 레이블이 올바르게 반환되어야 한다', () => {
    expect(getJointCareLabel(0)).toBe('일반 활력 보행');
    expect(getJointCareLabel(1)).toBe('관절 안심 케어 (주의)');
    expect(getJointCareLabel(2)).toBe('관절 집중 안심 케어 (적극보호)');
  });
});

describe('15분 단위 세분화 산책 시간 및 자유 산책 모드 (US-A3, #38)', () => {
  it('15분 단위 세분화 옵션이 15분부터 120분까지 정의되어 있어야 한다', () => {
    expect(DURATION_OPTIONS_15MIN).toEqual([15, 30, 45, 60, 75, 90, 105, 120]);
    expect(DURATION_OPTIONS_15MIN.every((m) => m % 15 === 0)).toBe(true);
  });

  it('체급별 산책 시간 가이드 3종이 올바르게 정의되어 있어야 한다', () => {
    expect(BREED_DURATION_GUIDES).toHaveLength(3);
    const [small, large, trekking] = BREED_DURATION_GUIDES;

    // 소형견: 20~30분 (권장 25분)
    expect(small.id).toBe('small');
    expect(small.minMinutes).toBe(20);
    expect(small.maxMinutes).toBe(30);
    expect(small.recommendedMinutes).toBe(25);

    // 중/대형견: 40~60분 (권장 50분)
    expect(large.id).toBe('large');
    expect(large.minMinutes).toBe(40);
    expect(large.maxMinutes).toBe(60);
    expect(large.recommendedMinutes).toBe(50);

    // 장거리/트레킹: 60~120분 (권장 90분)
    expect(trekking.id).toBe('trekking');
    expect(trekking.minMinutes).toBe(60);
    expect(trekking.maxMinutes).toBe(120);
    expect(trekking.recommendedMinutes).toBe(90);
  });

  it('formatDurationLabel이 분/시간/자유산책 레이블을 올바르게 포맷팅해야 한다', () => {
    expect(formatDurationLabel(15)).toBe('15분');
    expect(formatDurationLabel(30)).toBe('30분');
    expect(formatDurationLabel(45)).toBe('45분');
    expect(formatDurationLabel(60)).toBe('1시간');
    expect(formatDurationLabel(75)).toBe('1시간 15분');
    expect(formatDurationLabel(90)).toBe('1시간 30분');
    expect(formatDurationLabel(105)).toBe('1시간 45분');
    expect(formatDurationLabel(120)).toBe('2시간');
    expect(formatDurationLabel(null, true)).toBe('자유 산책');
    expect(formatDurationLabel(null, false)).toBe('시간 미설정');
  });

  it('WalkPreferences에 isFreeWalk 플래그가 지원되어야 한다', () => {
    const freeWalkPref: WalkPreferences = {
      durationMinutes: null,
      environments: ['soft', 'shade'],
      requestText: '',
      isFreeWalk: true,
    };
    expect(freeWalkPref.isFreeWalk).toBe(true);
    expect(freeWalkPref.durationMinutes).toBeNull();
  });
});
