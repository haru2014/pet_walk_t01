import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WalkSettingsView } from './WalkSettingsView';
import { DogProfile } from '../../types/dogProfile';
import { WalkPreferences } from '../../types/walkSettings';

vi.mock('../../theme/themeManager', () => ({
  useAppTheme: () => ({
    colors: new Proxy({}, { get: () => '#000000' }),
  }),
}));

vi.mock('../../hooks/useAppResponsive', () => ({
  useAppResponsive: () => ({
    walkSettings: {
      containerPaddingH: 16,
      sectionGap: 12,
      envCardHeight: 52,
      findButtonFontSize: 15,
    },
    scale: (_compact: number, standard: number) => standard,
  }),
}));

vi.mock('./WalkVoiceInputSection', () => ({
  WalkVoiceInputSection: () => React.createElement('div', null, 'VOICE_INPUT'),
}));

vi.mock('./WalkDurationSlider', () => ({
  WalkDurationSlider: () => React.createElement('div', null, 'DETAIL_DURATION_CONTENT'),
}));

vi.mock('../common/AppIcon', () => ({
  AppIcon: () => React.createElement('span'),
}));

vi.mock('../common/AppScreenHeader', () => ({
  AppScreenHeader: () => React.createElement('header', null, '산책 설정'),
}));

vi.mock('../../services/locationService', () => ({
  getCurrentLocationCoords: vi.fn(),
}));

const dog: DogProfile = {
  id: 'dog_1',
  name: '뽀삐',
  breed: '말티즈',
  ageYears: 4,
  weightKg: 4.5,
  speedKmH: 2.8,
  jointCareLevel: 1,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
};

const renderSettings = (initialPreferences?: WalkPreferences) =>
  renderToStaticMarkup(
    <WalkSettingsView
      dog={dog}
      initialPreferences={initialPreferences}
      onBack={vi.fn()}
      onFindRoute={vi.fn()}
    />
  );

describe('WalkSettingsView 상세 시간 설정 아코디언', () => {
  it.each([
    ['자유 산책', { durationMinutes: null, isFreeWalk: true }],
    ['사용자 지정 시간', { durationMinutes: 45, isFreeWalk: false }],
  ])('%s 설정이 저장되어 있어도 처음에는 접힌 상태로 표시한다', (_label, preference) => {
    const preferences: WalkPreferences = {
      originMode: 'park',
      pilotParkId: 'yurim',
      environments: ['soft'],
      requestText: '',
      ...preference,
    };

    const html = renderSettings(preferences);

    expect(html).toContain('맞춤 설정(최대 2시간)');
    expect(html).not.toContain('DETAIL_DURATION_CONTENT');
  });
});
