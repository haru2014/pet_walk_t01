/**
 * [AppScreenHeader 단위 테스트]
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

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

import { AppScreenHeader } from './AppScreenHeader';

describe('AppScreenHeader - 공통 상단 헤더 컴포넌트', () => {
  it('제목과 뒤로가기 버튼을 정상 렌더링한다', () => {
    const html = renderToStaticMarkup(
      <AppScreenHeader title="산책 설정" onBack={vi.fn()} />
    );
    expect(html).toContain('산책 설정');
    expect(html).toContain('뒤로가기');
  });

  it('showBack이 false이면 뒤로가기 버튼이 렌더링되지 않는다', () => {
    const html = renderToStaticMarkup(
      <AppScreenHeader title="홈" showBack={false} />
    );
    expect(html).toContain('홈');
    expect(html).not.toContain('accessibilityLabel="뒤로가기"');
  });
});
