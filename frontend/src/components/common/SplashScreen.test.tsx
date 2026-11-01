import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  SPLASH_BACKGROUND_COLOR,
  SPLASH_FOREGROUND_COLOR,
  SPLASH_STEP_INTERVAL_MS,
  SplashScreen,
} from './SplashScreen';

vi.mock('react-native-svg', () => ({
  default: (props: Record<string, unknown>) => React.createElement('svg', props),
  Ellipse: (props: Record<string, unknown>) => React.createElement('ellipse', props),
  Path: (props: Record<string, unknown>) => React.createElement('path', props),
}));

describe('SplashScreen', () => {
  it('renders the brand splash and paw SVG without a replay control', () => {
    const html = renderToStaticMarkup(
      <SplashScreen onAnimationComplete={vi.fn()} />,
    );

    expect(html).toContain('편안하개');
    expect(html).toContain('반려견 맞춤 완만길 산책');
    expect(html).toContain('#FAF6E9');
    expect(html).toContain('<ellipse');
    expect(html).toContain('<path');
    expect(html).not.toContain('애니메이션 다시보기');
    expect(SPLASH_BACKGROUND_COLOR).toBe('#536A55');
    expect(SPLASH_FOREGROUND_COLOR).toBe('#FAF6E9');
    expect(SPLASH_STEP_INTERVAL_MS).toBe(320);
  });

  it('shows a retry action when startup initialization fails', () => {
    const html = renderToStaticMarkup(
      <SplashScreen
        onAnimationComplete={vi.fn()}
        initializationError="초기화 실패"
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain('초기화 실패');
    expect(html).toContain('다시 시도');
  });
});
