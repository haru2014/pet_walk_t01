/**
 * [편안하개 - PetWalk]
 * 산책 설정 및 추천 코스 데이터/모델 검증 단위 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  WALK_ENVIRONMENTS,
  DEFAULT_RECOMMENDED_COURSES,
  WalkPreferences,
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
