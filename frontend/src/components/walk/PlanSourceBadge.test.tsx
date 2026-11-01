import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanSourceBadge } from './PlanSourceBadge';

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

describe('PlanSourceBadge - 경로 출처 뱃지 검증', () => {
  it('AI 추천 코스(isLive=true) 안내 문구를 표시한다', () => {
    const html = renderToStaticMarkup(<PlanSourceBadge isLive={true} />);
    expect(html).toContain('맞춤 산책 코스');
  });

  it('기본 코스(isLive=false) 안내 문구를 표시한다', () => {
    const html = renderToStaticMarkup(<PlanSourceBadge isLive={false} />);
    expect(html).toContain('기본 안심 코스');
  });
});
