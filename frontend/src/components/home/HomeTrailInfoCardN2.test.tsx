/**
 * [편안하개 - PetWalk]
 * 홈 '산책 정보' 위젯 점수가 상세보기 모달(WeatherDetailModal)과 일치하는지 검증
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeTrailInfoCardN2 } from './HomeTrailInfoCardN2';
import { computeWeatherModalProps } from './GoldenTimeWidget';
import { DEFAULT_DOGS } from '../../types/dogProfile';
import { HeatRiskResponse } from '../../types/weather';

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Circle: (props: any) => React.createElement('circle', props),
  Path: (props: any) => React.createElement('path', props),
  G: (props: any) => React.createElement('g', props),
  Rect: (props: any) => React.createElement('rect', props),
  Text: (props: any) => React.createElement('text', props),
}));

const baseWeather: HeatRiskResponse = {
  isLiveServer: true,
  current_hour: 9,
  current_air_temp: 22,
  current_surface_temp: 24,
  current_risk_level: 'SAFE',
  is_current_golden: true,
  golden_time_window: '06:00 ~ 10:00',
  pop: 10,
  hourly_forecast: [],
  notice: '',
  fetched_at: '2026-11-04T00:00:00Z',
};

function renderCard(weather: HeatRiskResponse | null): string {
  return renderToStaticMarkup(
    <HomeTrailInfoCardN2
      weather={weather}
      dog={DEFAULT_DOGS[0]}
      feedbackSummary={null}
      weeklyStats={null}
    />,
  );
}

describe('HomeTrailInfoCardN2 - 상세보기와 같은 산책 점수', () => {
  const cases: [string, HeatRiskResponse | null][] = [
    ['날씨 없음', null],
    ['골든타임 맑음', baseWeather],
    ['비 오는 중', { ...baseWeather, pty: 1 }],
    ['미세먼지 매우나쁨', { ...baseWeather, air_quality: { grade_label: '매우나쁨' } }],
    ['강수확률 45%', { ...baseWeather, pop: 45 }],
    ['노면 31℃', { ...baseWeather, current_surface_temp: 31, is_current_golden: false }],
  ];

  it.each(cases)('%s: 홈 위젯 점수·상태가 상세 모달과 같다', (_label, weather) => {
    const { quotient } = computeWeatherModalProps(weather);
    const html = renderCard(weather);
    expect(html).toContain(`>${quotient.score}<`);
    expect(html).toContain(`>${quotient.statusLabel}<`);
  });
});

describe('HomeTrailInfoCardN2 - 안내 배지·문구도 산책 점수 기준', () => {
  it('비가 와서 점수가 낮으면 골든타임이어도 "지금 산책하기 좋아요"를 띄우지 않는다', () => {
    const html = renderCard({ ...baseWeather, is_current_golden: true, pty: 1 });
    expect(html).not.toContain('지금 산책하기 좋아요');
    expect(html).toContain('⚠️ 우천 주의');
    expect(html).toContain('비가 와서 길이 젖어 있어요');
  });

  it('점수가 좋으면 골든타임이 아니어도 "지금 산책하기 좋아요"를 띄운다', () => {
    const html = renderCard({ ...baseWeather, is_current_golden: false, current_surface_temp: 26 });
    expect(html).toContain('✨ 지금 산책하기 좋아요');
  });

  it('미세먼지 나쁨(75점)은 주의 배지를 띄운다', () => {
    const html = renderCard({ ...baseWeather, air_quality: { grade_label: '나쁨' } });
    expect(html).toContain('⚠️ 미세먼지 나쁨');
  });
});
