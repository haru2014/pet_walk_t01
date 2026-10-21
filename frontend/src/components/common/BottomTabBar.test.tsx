import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BottomTabBar } from './BottomTabBar';

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Svg: (props: any) => React.createElement('svg', props),
  Path: (props: any) => React.createElement('path', props),
  Rect: (props: any) => React.createElement('rect', props),
  Circle: (props: any) => React.createElement('circle', props),
  G: (props: any) => React.createElement('g', props),
  Line: (props: any) => React.createElement('line', props),
  Polyline: (props: any) => React.createElement('polyline', props),
}));

vi.mock('../../theme/themeManager', () => ({
  useAppTheme: () => ({
    theme: 'dusty_amber',
    colors: {
      surface: '#FDFAF4',
      border: '#E5DCC9',
      primaryDark: '#3E5244',
      primaryLight: '#E3ECE4',
      textMuted: '#566659',
    },
  }),
}));

describe('BottomTabBar - 하단 내비게이션 바', () => {
  it('4개 탭(홈, 산책, 커뮤니티, 마이)과 접근성 라벨을 렌더링한다', () => {
    const html = renderToStaticMarkup(
      <BottomTabBar activeTab="홈" onTabChange={vi.fn()} />
    );

    expect(html).toContain('홈');
    expect(html).toContain('산책');
    expect(html).toContain('커뮤니티');
    expect(html).toContain('마이');
    expect(html).toContain('aria-label="홈 탭"');
  });

  it('활성 탭에 알약형 배경 및 활성 색상이 적용된다', () => {
    const html = renderToStaticMarkup(
      <BottomTabBar activeTab="산책" onTabChange={vi.fn()} />
    );

    expect(html).toContain('aria-label="산책 탭"');
    // activeBg (rgba(227,236,228,1.00)) 및 active 텍스트 font-weight:600 확인
    expect(html).toContain('rgba(227,236,228,1.00)');
    expect(html).toContain('font-weight:600');
    expect(html).toContain('stroke="#3E5244"');
  });
});
