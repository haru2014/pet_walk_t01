/**
 * [편안하개 - PetWalk]
 * GoldenTimeWidget 단위 테스트 (Issue #50, US-F1)
 *
 * 1. golden_time_window_day === 'tomorrow' 시 '내일 06:00 ~ 10:00' 표시 검증
 * 2. 내일 구간일 때 진행 막대 0% 검증
 * 3. 고열 위험 문구에 '내일' 접두사 결합 검증
 * 4. 구간이 없을 때의 안내 문구('일몰 후 (19:00 ~ 22:00) 권장') 예외 처리 검증
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GoldenTimeWidget } from './GoldenTimeWidget';
import { HeatRiskResponse } from '../../types/weather';

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

describe('GoldenTimeWidget - Issue #50 골든타임 위젯 오늘/내일 구분 표시', () => {
  it('golden_time_window_day === "tomorrow"인 경우 "내일 06:00 ~ 10:00"으로 표시되어야 한다', () => {
    const weatherTomorrow: HeatRiskResponse = {
      isLiveServer: true,
      current_hour: 21,
      current_air_temp: 22.0,
      current_surface_temp: 22.0,
      current_risk_level: 'SAFE',
      is_current_golden: true,
      golden_time_window: '06:00 ~ 10:00',
      golden_time_window_day: 'tomorrow',
      hourly_forecast: [],
      notice: '기상청 예보 연동',
      fetched_at: new Date().toISOString(),
    };

    const html = renderToStaticMarkup(<GoldenTimeWidget weather={weatherTomorrow} />);

    expect(html).toContain('내일 06:00 ~ 10:00');
    expect(html).toContain('내일 06:00');
  });

  it('내일 구간인 경우 진행 막대(width)가 0%로 유지되어야 한다', () => {
    const weatherTomorrow: HeatRiskResponse = {
      isLiveServer: true,
      current_hour: 21,
      current_air_temp: 22.0,
      current_surface_temp: 22.0,
      current_risk_level: 'SAFE',
      is_current_golden: true,
      golden_time_window: '06:00 ~ 10:00',
      golden_time_window_day: 'tomorrow',
      hourly_forecast: [],
      notice: '기상청 예보 연동',
      fetched_at: new Date().toISOString(),
    };

    const html = renderToStaticMarkup(<GoldenTimeWidget weather={weatherTomorrow} />);

    // 진행 막대 width: 0% 확인
    expect(html).toContain('width:0%');
    expect(html).toContain('left:0%');
  });

  it('고열 위험(DANGER) 및 내일 구간일 때 위험 안내 문구에 "내일"이 포함되어야 한다', () => {
    const weatherDangerTomorrow: HeatRiskResponse = {
      isLiveServer: true,
      current_hour: 15,
      current_air_temp: 33.0,
      current_surface_temp: 48.0,
      current_risk_level: 'DANGER',
      is_current_golden: false,
      golden_time_window: '06:00 ~ 09:00',
      golden_time_window_day: 'tomorrow',
      hourly_forecast: [],
      notice: '기상청 예보 연동',
      fetched_at: new Date().toISOString(),
    };

    const html = renderToStaticMarkup(<GoldenTimeWidget weather={weatherDangerTomorrow} />);

    expect(html).toContain('고열 주의');
    expect(html).toContain('내일 06:00 이후 서늘한 산책을 추천해요');
    expect(html).toContain('고열 위험 · 내일 06:00 권장');
  });

  it('구간이 없을 때의 안내 문구("일몰 후 (19:00 ~ 22:00) 권장")가 주어져도 에러 없이 0%로 건너뛰어야 한다', () => {
    const weatherNotice: HeatRiskResponse = {
      isLiveServer: true,
      current_hour: 14,
      current_air_temp: 30.0,
      current_surface_temp: 42.0,
      current_risk_level: 'CAUTION',
      is_current_golden: false,
      golden_time_window: '일몰 후 (19:00 ~ 22:00) 권장',
      golden_time_window_day: null,
      hourly_forecast: [],
      notice: '기상청 예보 연동',
      fetched_at: new Date().toISOString(),
    };

    const html = renderToStaticMarkup(<GoldenTimeWidget weather={weatherNotice} />);

    // 크래시 없이 렌더링되고 progress는 0%
    expect(html).toContain('width:0%');
    expect(html).toContain('산책하기 좋은 지면온도 시간');
  });

  it('golden_time_window_day === "today"인 경우 정상적으로 당일 시간대로 표출되어야 한다', () => {
    const weatherToday: HeatRiskResponse = {
      isLiveServer: true,
      current_hour: 18,
      current_air_temp: 24.0,
      current_surface_temp: 26.0,
      current_risk_level: 'SAFE',
      is_current_golden: true,
      golden_time_window: '18:00 ~ 20:00',
      golden_time_window_day: 'today',
      hourly_forecast: [],
      notice: '기상청 예보 연동',
      fetched_at: new Date().toISOString(),
    };

    const html = renderToStaticMarkup(<GoldenTimeWidget weather={weatherToday} />);

    expect(html).not.toContain('내일 18:00');
    expect(html).toContain('18:00 ~ 20:00');
  });
});
