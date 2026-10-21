import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WalkVoiceInputSection } from './WalkVoiceInputSection';

vi.mock('expo-speech', () => ({
  speak: vi.fn(),
  stop: vi.fn().mockResolvedValue(undefined),
  getAvailableVoicesAsync: vi.fn().mockResolvedValue([]),
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

describe('WalkVoiceInputSection (US-A1, 영역 1 & 2)', () => {
  it('renders section title and mic button properly', () => {
    const html = renderToStaticMarkup(
      <WalkVoiceInputSection
        dogName="뽀삐"
        requestText=""
        onChangeText={vi.fn()}
      />
    );

    expect(html).toContain('직접 말해도 좋아요');
    expect(html).toContain('뽀삐랑 25분만 그늘진 흙길로 유림공원 한 바퀴 돌고 싶어');
  });

  it('renders input with initial requestText and AI analyze button when text is present', () => {
    const html = renderToStaticMarkup(
      <WalkVoiceInputSection
        dogName="초코"
        requestText="30분 산책"
        onChangeText={vi.fn()}
      />
    );

    expect(html).toContain('30분 산책');
    expect(html).toContain('AI 분석');
  });

  it('accepts hideResultBadge prop without breaking render', () => {
    const html = renderToStaticMarkup(
      <WalkVoiceInputSection
        dogName="초코"
        requestText="30분 산책"
        onChangeText={vi.fn()}
        hideResultBadge={true}
      />
    );

    expect(html).toContain('30분 산책');
    expect(html).toContain('직접 말해도 좋아요');
  });
});
