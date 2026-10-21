/**
 * [편안하개 - PetWalk]
 * 디자인 시안 02번 개편 홈 화면 (HomeScreen.tsx) 단위 테스트
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeScreen } from './HomeScreen';
import { DEFAULT_DOGS } from '../types/dogProfile';

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Polyline: (props: any) => React.createElement('polyline', props),
  Circle: (props: any) => React.createElement('circle', props),
  G: (props: any) => React.createElement('g', props),
  Text: (props: any) => React.createElement('text', props),
}));
vi.mock('react-native-webview', () => ({
  WebView: (props: any) => React.createElement('div', { 'data-testid': 'mock-webview', ...props }),
  default: (props: any) => React.createElement('div', { 'data-testid': 'mock-webview', ...props }),
}));
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      fitBounds: vi.fn(),
      remove: vi.fn(),
      setStyle: vi.fn(),
    })),
  },
}));

describe('HomeScreen - 디자인 시안 02번 (Dusty Amber & Sage Green)', () => {
  const mockDog = DEFAULT_DOGS[0];

  it('바로 산책하기 메인 카드와 Trail info 섹션을 정상 렌더링한다', () => {
    const html = renderToStaticMarkup(
      <HomeScreen
        dog={mockDog}
        dogs={DEFAULT_DOGS}
        selectedDogId={mockDog.id}
        onSelectDog={vi.fn()}
        onAddDog={vi.fn()}
        feedbackSummary={null}
        onPressProfile={vi.fn()}
        onStartWalk={vi.fn()}
        onOpenPlanner={vi.fn()}
      />
    );

    // 1. 메인 카드 타이틀 & 통계 ("바로 산책하기")
    expect(html).toContain('바로 산책하기');
    expect(html).toContain('산책');
    expect(html).toContain('2.1 km');
    expect(html).toContain('30분');
    expect(html).toContain('시작 →');

    // 2. Trail info & 이번 주 산책 달성도 정보 카드
    expect(html).toContain('Trail info');
    expect(html).toContain('이번 주 산책 달성도');
    expect(html).toContain('골든타임');
  });

  it('다견 등록 시 현재 선택된 반려견 이름 뱃지가 메인 카드 헤더에 노출된다', () => {
    const html = renderToStaticMarkup(
      <HomeScreen
        dog={mockDog}
        dogs={DEFAULT_DOGS}
        selectedDogId={mockDog.id}
        onSelectDog={vi.fn()}
        onAddDog={vi.fn()}
        feedbackSummary={null}
        onPressProfile={vi.fn()}
        onStartWalk={vi.fn()}
        onOpenPlanner={vi.fn()}
      />
    );

    expect(html).toContain(`${mockDog.name} ▾`);
  });

  it('갈색 카드 헤더에 알림 버튼이 정상 포함된다', () => {
    const html = renderToStaticMarkup(
      <HomeScreen
        dog={mockDog}
        dogs={DEFAULT_DOGS}
        selectedDogId={mockDog.id}
        onSelectDog={vi.fn()}
        onAddDog={vi.fn()}
        feedbackSummary={null}
        onPressProfile={vi.fn()}
        onStartWalk={vi.fn()}
        onOpenPlanner={vi.fn()}
        onOpenNotification={vi.fn()}
      />
    );

    expect(html).toContain('알림');
  });
});
