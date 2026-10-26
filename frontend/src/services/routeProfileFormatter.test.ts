import { describe, it, expect } from 'vitest';
import {
  formatSlopeDisplay,
  formatSurfaceDisplay,
  formatCourseSlope,
  formatCourseSurface,
  resolveSurfaceName,
  getDominantSurfaceType,
} from './routeProfileFormatter';
import { CourseProfile, RecommendedCourse } from '../types/walkSettings';

describe('routeProfileFormatter (경사도·노면 알 수 없음 처리)', () => {
  describe('1. 경사도 표시 검증', () => {
    it('1) 정상적인 경사도 수치 표시 (DEM 기반)', () => {
      const result = formatSlopeDisplay(2.1, 'dem');
      expect(result.isUnknown).toBe(false);
      expect(result.isApproximation).toBe(false);
      expect(result.text).toBe('최대 2.1%');
      expect(result.valueText).toBe('최대 2.1%');
      expect(result.label).toBe('오르막 경사');
      expect(result.subText).toContain('지도에 표시된 높낮이');
      expect(result.numericValue).toBe(2.1);
    });

    it('2) 근사값에 예상 또는 이에 준하는 표현 표시', () => {
      const result = formatSlopeDisplay(7.0, 'approximation');
      expect(result.isUnknown).toBe(false);
      expect(result.isApproximation).toBe(true);
      expect(result.text).toBe('예상 약 7%');
      expect(result.valueText).toBe('약 7%');
      expect(result.label).toBe('예상 오르막');
      expect(result.subText).toContain('예상했어요');

      // verbose 옵션 테스트
      const verboseResult = formatSlopeDisplay(7.0, 'approximation', { verbose: true });
      expect(verboseResult.text).toBe('예상 오르막 약 7%');
    });

    it('3) 경사도 미확인 상태 표시 (null, undefined, NaN, unknown)', () => {
      const nullResult = formatSlopeDisplay(null, null);
      expect(nullResult.isUnknown).toBe(true);
      expect(nullResult.text).toBe('경사도 정보가 없어요');
      expect(nullResult.valueText).toBe('정보 없음');
      expect(nullResult.label).toBe('길의 높낮이');
      expect(nullResult.numericValue).toBeNull();

      const nanResult = formatSlopeDisplay(NaN, 'dem');
      expect(nanResult.isUnknown).toBe(true);
      expect(nanResult.text).toBe('경사도 정보가 없어요');

      const explicitUnknown = formatSlopeDisplay(0, 'unknown');
      expect(explicitUnknown.isUnknown).toBe(true);
      expect(explicitUnknown.text).toBe('경사도 정보가 없어요');
      expect(explicitUnknown.text).not.toContain('0%');
      expect(explicitUnknown.text).not.toContain('평탄함');
    });

    it('6-1) 미확인 경사도에서 undefined, NaN, 0%가 잘못 노출되지 않음', () => {
      const samples = [
        formatSlopeDisplay(undefined, undefined),
        formatSlopeDisplay(null, 'dem'),
        formatSlopeDisplay(NaN, 'approximation'),
        formatSlopeDisplay(null, 'unknown'),
      ];

      for (const s of samples) {
        expect(s.text).not.toContain('undefined');
        expect(s.text).not.toContain('NaN');
        expect(s.text).not.toContain('0%');
        expect(s.text).not.toContain('평탄함');
        expect(s.text).toBe('경사도 정보가 없어요');
      }
    });
  });

  describe('2. 노면 표시 검증', () => {
    it('4) 노면 유형 확인 시 해당 유형 및 비율 표시 (전체 확인)', () => {
      const profile: CourseProfile = {
        surface_known_ratio: 1.0,
        soft_surface_ratio: 0.85,
        surface_breakdown: {
          grass: 0.5,
          dirt: 0.35,
          paved: 0.15,
        },
      };

      const result = formatSurfaceDisplay(profile);
      expect(result.isUnknown).toBe(false);
      expect(result.isPartial).toBe(false);
      expect(result.text).toBe('85%');
      expect(result.valueText).toBe('85%');
      expect(result.dominantSurfaceType).toBe('잔디');
      expect(result.subText).toContain('잔디 등 발바닥 안심');
    });

    it('5) 노면 미확인 상태 표시 (공원 밖 경로, 송강 공원처럼 surface 태그 없음)', () => {
      // 케이스 A: 송강처럼 surface_breakdown: {"unknown": 1.0}, surface_known_ratio: 0.0
      const songgangProfile: CourseProfile = {
        surface_known_ratio: 0.0,
        soft_surface_ratio: 0.0,
        surface_breakdown: { unknown: 1.0 },
      };
      const songgangResult = formatSurfaceDisplay(songgangProfile);
      expect(songgangResult.isUnknown).toBe(true);
      expect(songgangResult.text).toBe('길 정보가 없어요');
      expect(songgangResult.valueText).toBe('정보 없음');
      expect(songgangResult.dominantSurfaceType).toBeNull();

      // 케이스 B: 공원 밖 경로 (no_osm_tags, surface_breakdown: null)
      const outsideProfile: CourseProfile = {
        surface_known_ratio: null,
        soft_surface_ratio: null,
        surface_breakdown: null,
      };
      const outsideResult = formatSurfaceDisplay(outsideProfile);
      expect(outsideResult.isUnknown).toBe(true);
      expect(outsideResult.text).toBe('길 정보가 없어요');

      // 케이스 C: fallback 문자열이 '알 수 없음'인 경우
      const fallbackUnknown = formatSurfaceDisplay(null, '알 수 없음');
      expect(fallbackUnknown.isUnknown).toBe(true);
      expect(fallbackUnknown.text).toBe('길 정보가 없어요');
    });

    it('6-2) 미확인 노면에서 undefined, NaN, 임의 노면 유형으로 왜곡되지 않음', () => {
      const samples = [
        formatSurfaceDisplay(null, null),
        formatSurfaceDisplay(null, ''),
        formatSurfaceDisplay(null, 'unknown'),
        formatSurfaceDisplay({ surface_known_ratio: 0, surface_breakdown: {} }),
      ];

      for (const s of samples) {
        expect(s.text).not.toContain('undefined');
        expect(s.text).not.toContain('NaN');
        expect(s.text).not.toContain('포장도로');
        expect(s.text).not.toContain('흙길');
        expect(s.text).toBe('길 정보가 없어요');
      }
    });

    it('7) 부분적으로만 확인된 노면 정보가 과장되어 표시되지 않음', () => {
      const partialProfile: CourseProfile = {
        surface_known_ratio: 0.6, // 60%만 확인됨
        soft_surface_ratio: 0.45,
        surface_breakdown: {
          dirt: 0.45,
          paved: 0.15,
          unknown: 0.4,
        },
      };

      const result = formatSurfaceDisplay(partialProfile);
      expect(result.isUnknown).toBe(false);
      expect(result.isPartial).toBe(true);
      expect(result.text).toBe('45% (확인 60%)');
      expect(result.valueText).toBe('45%');
      expect(result.subText).toBe('정보가 있는 길(60%) 기준');
      expect(result.dominantSurfaceType).toBe('흙길');
    });
  });

  describe('3. RecommendedCourse 통합 포맷터 검증', () => {
    it('코스 객체에 profile이 있을 때 정확히 파싱', () => {
      const course: RecommendedCourse = {
        id: 'c1',
        name: '유림공원 둘레길',
        distanceKm: '2.1 km',
        estimatedMinutes: 30,
        softRatio: '72%',
        shadeLevel: '많음',
        stairsCount: '0회',
        maxSlopePercent: 2.1,
        shadePercent: 50,
        softSurfacePercent: 72,
        reason: '테스트',
        profile: {
          slope_source: 'dem',
          max_slope_percent: 2.1,
          surface_known_ratio: 1.0,
          soft_surface_ratio: 0.72,
          surface_breakdown: { dirt: 0.72, paved: 0.28 },
        },
      };

      const slope = formatCourseSlope(course);
      expect(slope.text).toBe('최대 2.1%');
      expect(slope.source).toBe('dem');

      const surface = formatCourseSurface(course);
      expect(surface.text).toBe('72%');
      expect(surface.dominantSurfaceType).toBe('흙길');
    });

    it('코스 객체에 데이터가 결손되어 있을 때 안전한 기본 폴백', () => {
      const emptyCourse: RecommendedCourse = {
        id: 'c2',
        name: '미확인 코스',
        distanceKm: '1.0 km',
        estimatedMinutes: 15,
        softRatio: '알 수 없음',
        shadeLevel: '보통',
        stairsCount: '0회',
        maxSlopePercent: null,
        shadePercent: 30,
        softSurfacePercent: null,
        reason: '테스트',
        profile: null,
        slopeSource: 'unknown',
      };

      const slope = formatCourseSlope(emptyCourse);
      expect(slope.isUnknown).toBe(true);
      expect(slope.text).toBe('경사도 정보가 없어요');

      const surface = formatCourseSurface(emptyCourse);
      expect(surface.isUnknown).toBe(true);
      expect(surface.text).toBe('길 정보가 없어요');
    });
  });

  describe('4. 한국어 태그 매핑 유틸리티', () => {
    it('OSM surface 태그를 정확한 한국어로 변환', () => {
      expect(resolveSurfaceName('dirt')).toBe('흙길');
      expect(resolveSurfaceName('grass')).toBe('잔디');
      expect(resolveSurfaceName('asphalt')).toBe('아스팔트');
      expect(resolveSurfaceName('paved')).toBe('포장도로');
      expect(resolveSurfaceName('wood')).toBe('목재 데크');
      expect(resolveSurfaceName('unknown')).toBe('노면 종류 정보가 없어요');
      expect(resolveSurfaceName(null)).toBe('노면 종류 정보가 없어요');
    });

    it('dominantSurfaceType 추출 검증', () => {
      expect(getDominantSurfaceType({ unknown: 0.8, dirt: 0.2 })).toBe('흙길');
      expect(getDominantSurfaceType({ unknown: 1.0 })).toBeNull();
      expect(getDominantSurfaceType(null)).toBeNull();
    });
  });
});
