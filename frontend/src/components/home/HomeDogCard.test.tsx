import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import { renderToStaticMarkup } from 'react-dom/server';
import { HomeDogCard } from './HomeDogCard';
import { DogProfile } from '../../types/dogProfile';

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

vi.mock('../../services/photoPickerService', () => ({
  DOG_AVATAR_PRESETS: [
    { id: 'golden', emoji: '🦮', label: '골든', color: '#FDF6E2' },
  ],
  pickDogPhoto: vi.fn(),
}));

describe('HomeDogCard 컴포넌트 및 다견 슬라이더 검증', () => {
  const sampleDog1: DogProfile = {
    id: 'dog_1',
    name: '초코',
    breed: '말티즈',
    ageYears: 3,
    weightKg: 4.5,
    jointCareLevel: 1,
    speedKmH: 2.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleDog2: DogProfile = {
    id: 'dog_2',
    name: '콩이',
    breed: '푸들',
    ageYears: 5,
    weightKg: 5.8,
    jointCareLevel: 2,
    speedKmH: 2.2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('단일 반려견일 때 활성 반려견 정보와 강아지 추가 버튼이 정상 렌더링되어야 한다', () => {
    const html = renderToStaticMarkup(
      <HomeDogCard profile={sampleDog1} dogs={[sampleDog1]} />
    );

    expect(html).toContain('초코');
    expect(html).toContain('말티즈');
    expect(html).toContain('+ 강아지 추가');
    expect(html).toContain('산책 시작');
  });

  it('다견(2마리 이상)일 때 각 반려견 카드와 페이징 인디케이터가 렌더링되어야 한다', () => {
    const html = renderToStaticMarkup(
      <HomeDogCard
        profile={sampleDog1}
        dogs={[sampleDog1, sampleDog2]}
        selectedDogId="dog_1"
      />
    );

    expect(html).toContain('초코');
    expect(html).toContain('콩이');
    expect(html).toContain('1/2 ⇄');
    expect(html).toContain('우리 강아지 한 마리 더 등록하기');
  });
});
