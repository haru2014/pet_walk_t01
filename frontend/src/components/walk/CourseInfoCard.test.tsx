import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseInfoCard } from './CourseInfoCard';
import { RecommendedCourse } from '../../types/walkSettings';
import { CourseSummary } from '../../types/route';

vi.mock('../bookmark/BookmarkToggleButton', () => ({
  BookmarkToggleButton: () => React.createElement('div', { 'data-testid': 'bookmark-toggle' }),
}));

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Polyline: (props: any) => React.createElement('polyline', props),
  Circle: (props: any) => React.createElement('circle', props),
  Ellipse: (props: any) => React.createElement('ellipse', props),
  Line: (props: any) => React.createElement('line', props),
  Path: (props: any) => React.createElement('path', props),
  Polygon: (props: any) => React.createElement('polygon', props),
  Rect: (props: any) => React.createElement('rect', props),
  G: (props: any) => React.createElement('g', props),
  Text: (props: any) => React.createElement('text', props),
}));

describe('CourseInfoCard (노면 및 경사도 표시 검증)', () => {
  const mockSummary: CourseSummary = {
    totalDistanceKm: 2.1,
    estimatedMinutes: 30,
    maxSlopePercent: 2.1,
    shadeRatioPercent: 50,
  };

  it('노면이 정상 확인되었을 때 폭신한 길 비율을 렌더링한다', () => {
    const course: RecommendedCourse = {
      id: 'c1',
      name: '유림 숲길 코스',
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
        surface_known_ratio: 1.0,
        soft_surface_ratio: 0.72,
        surface_breakdown: { dirt: 0.72, paved: 0.28 },
      },
    };

    const html = renderToStaticMarkup(
      <CourseInfoCard course={course} summary={mockSummary} rank={1} bookmark={null} />
    );

    expect(html).toContain('유림 숲길 코스');
    expect(html).toContain('폭신한 길');
    expect(html).toContain('72%');
  });

  it('노면 태그가 없을 때(알 수 없음) 임의의 비율 대신 "정보 없음"으로 렌더링한다', () => {
    const songgangCourse: RecommendedCourse = {
      id: 'c2',
      name: '송강 둘레 코스',
      distanceKm: '1.8 km',
      estimatedMinutes: 25,
      softRatio: '알 수 없음',
      shadeLevel: '보통',
      stairsCount: '0회',
      maxSlopePercent: 2.5,
      shadePercent: 40,
      softSurfacePercent: null,
      reason: '테스트',
      profile: {
        surface_known_ratio: 0.0,
        soft_surface_ratio: 0.0,
        surface_breakdown: { unknown: 1.0 },
      },
    };

    const html = renderToStaticMarkup(
      <CourseInfoCard course={songgangCourse} summary={mockSummary} rank={1} bookmark={null} />
    );

    expect(html).toContain('송강 둘레 코스');
    expect(html).toContain('폭신한 길');
    expect(html).toContain('정보 없음');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('AI 맞춤 점수와 추천 사유가 제공될 경우 카드에 명확하게 노출된다 (Issue #155)', () => {
    const scoredCourse: RecommendedCourse = {
      id: 'c3',
      name: '세종호수 은빛해변길',
      distanceKm: '2.4 km',
      estimatedMinutes: 35,
      softRatio: '80%',
      shadeLevel: '많음',
      stairsCount: '0회',
      maxSlopePercent: 1.2,
      shadePercent: 65,
      softSurfacePercent: 80,
      score: 93,
      reason: 'AI 맞춤 점수 93점: 은빛해변 광폭 보행데크 중심의 계단 0개 평지 코스예요.',
    };

    const html = renderToStaticMarkup(
      <CourseInfoCard course={scoredCourse} summary={mockSummary} rank={1} bookmark={null} />
    );

    expect(html).toContain('세종호수 은빛해변길');
    expect(html).toContain('AI 맞춤 93점');
    expect(html).toContain('은빛해변 광폭 보행데크 중심의 계단 0개 평지 코스예요');
  });
});
