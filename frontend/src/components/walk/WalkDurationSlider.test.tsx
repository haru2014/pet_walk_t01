import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WalkDurationSlider } from './WalkDurationSlider';

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

describe('WalkDurationSlider', () => {
  it('renders section header when hideHeader is false', () => {
    const html = renderToStaticMarkup(
      <WalkDurationSlider
        duration={25}
        isFreeWalk={false}
        onChangeDuration={vi.fn()}
        onChangeFreeWalk={vi.fn()}
        hideHeader={false}
      />
    );

    expect(html).toContain('얼마나 걸을까요?');
    expect(html).toContain('25분');
    expect(html).toContain('자유 산책 모드');
  });

  it('hides duplicate section header when hideHeader is true', () => {
    const html = renderToStaticMarkup(
      <WalkDurationSlider
        duration={25}
        isFreeWalk={false}
        onChangeDuration={vi.fn()}
        onChangeFreeWalk={vi.fn()}
        hideHeader={true}
      />
    );

    expect(html).not.toContain('얼마나 걸을까요?');
    expect(html).toContain('자유 산책 모드');
    expect(html).toContain('체급별 맞춤 권장 시간');
  });

  it('renders free walk mode info properly when isFreeWalk is true', () => {
    const html = renderToStaticMarkup(
      <WalkDurationSlider
        duration={null}
        isFreeWalk={true}
        onChangeDuration={vi.fn()}
        onChangeFreeWalk={vi.fn()}
        hideHeader={true}
      />
    );

    expect(html).toContain('자유 산책 모드');
    expect(html).toContain('시간 제한 없이 편안하게 걷고');
    expect(html).not.toContain('체급별 맞춤 권장 시간');
  });
});
