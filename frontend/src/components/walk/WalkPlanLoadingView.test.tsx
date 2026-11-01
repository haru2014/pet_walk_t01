import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WALK_PLAN_PAW_STEPS, WalkPlanLoadingView } from './WalkPlanLoadingView';

vi.mock('react-native', () => {
  class MockAnimatedValue {
    constructor(_value: number) { }
    setValue(_value: number) { }
    interpolate() { return 1; }
  }
  const MockView = ({ accessibilityLabel, ...props }: Record<string, unknown>) =>
    React.createElement('div', { ...props, 'aria-label': accessibilityLabel as string | undefined });
  const MockImage = ({ accessibilityLabel, resizeMode: _resizeMode, ...props }: Record<string, unknown>) =>
    React.createElement('img', { ...props, 'aria-label': accessibilityLabel as string | undefined });
  return {
    AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() { } }) },
    ActivityIndicator: 'span',
    Animated: { Value: MockAnimatedValue, View: MockView },
    Easing: { out: () => 0, inOut: () => 0, quad: 0, sin: 0 },
    Image: MockImage,
    StyleSheet: { create: (styles: unknown) => styles },
    TouchableOpacity: 'button',
    View: MockView,
  };
});

vi.mock('../common/AppText', () => ({
  AppText: ({ children, accessibilityRole, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('span', { ...props, role: accessibilityRole as string | undefined }, children),
}));

vi.mock('../common/AppScreenHeader', () => ({
  AppScreenHeader: ({ title }: { title: string }) => React.createElement('header', null,
    title,
    React.createElement('button', { 'aria-label': '뒤로가기' }),
  ),
}));

vi.mock('../../theme/themeManager', () => ({
  useAppTheme: () => ({ colors: {
    background: '#F5EFE0', surface: '#FDFAF4', border: '#E5DCC9', primary: '#5A7361',
    primaryLight: '#E3ECE4', primaryDark: '#3E5244', textMain: '#2D3A31', textMuted: '#566659',
    textWhite: '#FFFFFF', error: '#D9534F',
  } }),
}));

vi.mock('../map/MapLibreMapView', () => ({
  MapLibreMapView: ({ initialCenter }: { initialCenter: readonly number[] }) =>
    React.createElement('div', { 'data-testid': 'loading-map', 'data-center': initialCenter.join(',') }),
}));

const baseProps = {
  parkName: '유림공원',
  mapCenter: [127.3601379, 36.3620608] as const,
  onBack: vi.fn(),
  onRetry: vi.fn(),
};

describe('WalkPlanLoadingView', () => {
  it('실제 선택 공원 중심의 지도와 순차 발자국을 로딩 중에 표시한다', () => {
    const html = renderToStaticMarkup(
      <WalkPlanLoadingView {...baseProps} isLoading error={null} />,
    );

    expect(html).toContain('산책하기 좋은 길을 찾고 있어요');
    expect(html).toContain('유림공원 주변 · 경로 확정 전');
    expect(html).toContain('발자국은 장식용 로딩 애니메이션이에요');
    expect(html).toContain('data-center="127.3601379,36.3620608"');
    expect(html.match(/aria-label="발자국 [1-6]"/g)).toHaveLength(6);
    expect(WALK_PLAN_PAW_STEPS.map((step) => step.delayMs)).toEqual([0, 260, 520, 780, 1040, 1300]);
    const leftPositions = WALK_PLAN_PAW_STEPS.map((step) => Number.parseInt(step.left, 10));
    expect(leftPositions[0]).toBeLessThan(leftPositions[1]);
    expect(leftPositions[2]).toBeLessThan(leftPositions[3]);
    expect(leftPositions[4]).toBeLessThan(leftPositions[5]);
    expect(leftPositions.every((position) => position >= 0 && position <= 100)).toBe(true);
    expect(WALK_PLAN_PAW_STEPS.every((step) => Number.parseInt(step.top, 10) >= 0 && Number.parseInt(step.top, 10) <= 100)).toBe(true);
  });

  it('오류 상태에서는 발자국을 멈추고 오류 안내와 재시도 기능을 표시한다', () => {
    const html = renderToStaticMarkup(
      <WalkPlanLoadingView {...baseProps} isLoading={false} error="네트워크 연결을 확인해 주세요." />,
    );

    expect(html).toContain('경로를 불러오지 못했어요');
    expect(html).toContain('다시 시도하기');
    expect(html).toContain('aria-label="뒤로가기"');
    expect(html).not.toContain('aria-label="발자국 1"');
  });
});
