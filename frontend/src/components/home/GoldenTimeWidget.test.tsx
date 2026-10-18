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
import { GoldenTimeWidget, WeatherDetailModal } from './GoldenTimeWidget';
import { HeatRiskResponse } from '../../types/weather';

vi.mock('react-native', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Modal: ({ visible, children }: any) =>
      visible ? React.createElement('div', { 'data-testid': 'mock-modal' }, children) : null,
  };
});

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

  describe('Issue #57 - Open-Meteo 일사량 출처 표기 (attribution, CC BY 4.0)', () => {
    it('attribution이 문자열로 주어지면 골든타임 위젯 하단에 출처 문구가 렌더링되어야 한다', () => {
      const weatherWithAttribution: HeatRiskResponse = {
        isLiveServer: true,
        current_hour: 14,
        current_air_temp: 28.0,
        current_surface_temp: 34.0,
        current_risk_level: 'SAFE',
        is_current_golden: true,
        golden_time_window: '17:00 ~ 19:00',
        golden_time_window_day: 'today',
        hourly_forecast: [],
        notice: '기상청 예보 연동',
        attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
        insolation_source: 'open_meteo',
        fetched_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(<GoldenTimeWidget weather={weatherWithAttribution} />);

      expect(html).toContain('Weather data by Open-Meteo.com (CC BY 4.0)');
    });

    it('attribution이 null이거나 undefined이면 출처 문구가 렌더링되지 않아야 한다', () => {
      const weatherWithoutAttribution: HeatRiskResponse = {
        isLiveServer: true,
        current_hour: 14,
        current_air_temp: 28.0,
        current_surface_temp: 34.0,
        current_risk_level: 'SAFE',
        is_current_golden: true,
        golden_time_window: '17:00 ~ 19:00',
        golden_time_window_day: 'today',
        hourly_forecast: [],
        notice: '기상청 예보 연동',
        attribution: null,
        insolation_source: 'sky_fallback',
        fetched_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(<GoldenTimeWidget weather={weatherWithoutAttribution} />);

      expect(html).not.toContain('Weather data by Open-Meteo.com');
    });

    it('weather가 null이어도 오류 없이 안전하게 렌더링되어야 한다', () => {
      const html = renderToStaticMarkup(<GoldenTimeWidget weather={null} />);

      expect(html).toContain('산책하기 좋은 지면온도 시간');
      expect(html).not.toContain('Weather data by Open-Meteo.com');
    });

    it('surface_temps와 solar_radiation_w_m2가 주어지면 노면별 온도 비교와 일사량이 표시되어야 한다', () => {
      const weatherWithSurface: HeatRiskResponse = {
        isLiveServer: true,
        current_hour: 14,
        current_air_temp: 28.0,
        current_surface_temp: 38.8,
        solar_radiation_w_m2: 720.0,
        surface_temps: {
          asphalt: 41.0,
          paved: 38.1,
          dirt: 33.8,
          grass: 29.0,
        },
        current_risk_level: 'CAUTION',
        is_current_golden: false,
        golden_time_window: '18:00 ~ 20:00',
        golden_time_window_day: 'today',
        hourly_forecast: [],
        notice: '기상청 예보 모델 기반 추정치',
        fetched_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(<GoldenTimeWidget weather={weatherWithSurface} />);

      expect(html).toContain('노면별 발바닥 체감온도 비교');
      expect(html).toContain('아스팔트');
      expect(html).toContain('41°C');
      expect(html).toContain('흙길 / 잔디');
      expect(html).toContain('29°C');
      expect(html).toContain('아스팔트 대비 잔디밭이 약 12℃ 더 시원해요!');
      expect(html).toContain('일사 720W/m²');
    });

    it('일사량이 0이고 모든 노면이 22.1°C일 때 모든 노면 상태가 시원·안전으로 동적 표시되어야 한다', () => {
      const cloudyRainWeather: HeatRiskResponse = {
        isLiveServer: true,
        current_hour: 17,
        current_air_temp: 22.1,
        current_surface_temp: 22.1,
        solar_radiation_w_m2: 0,
        surface_temps: {
          asphalt: 22.1,
          paved: 22.1,
          dirt: 22.1,
          grass: 22.1,
        },
        current_risk_level: 'SAFE',
        is_current_golden: true,
        golden_time_window: '17:00 ~ 23:00',
        golden_time_window_day: 'today',
        pop: 60,
        hourly_forecast: [],
        notice: '기상청 예보 모델 기반 추정치',
        fetched_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(
        <WeatherDetailModal
          visible={true}
          onClose={vi.fn()}
          colors={{ surface: '#fff', border: '#eee', textMain: '#111', textMuted: '#666', background: '#fafafa' }}
          quotient={{
            score: 100,
            ringColor: '#10B981',
            badgeBg: '#D1FAE5',
            badgeColor: '#065F46',
            statusLabel: '좋음',
            statusTitle: '산책하기 편한 시간이 있어요.',
          }}
          subtitleText="지면온도 22.1℃로 발바닥이 편안하고 안전해요."
          currentAirTemp={22.1}
          roundedSurfaceTemp={22.1}
          riskLevel="SAFE"
          popPercent={60}
          airQualityColor="#059669"
          airQualityLabel="좋음"
          isTomorrow={false}
          timeRangeDisplay="17:00 ~ 23:00"
          weather={cloudyRainWeather}
        />
      );

      expect(html).toContain('노면별 발바닥 체감온도 비교');
      expect(html).toContain('22.1°C');
      expect(html).toContain('🌱 시원·안전');
      expect(html).toContain('직사광선이 없어 모든 노면이 시원하고 안전해요!');
      expect(html).toContain('비 예보 · 우산 필수');
      // 22.1도인데 아스팔트에 '고열 주의'가 붙지 않아야 함
      expect(html).not.toContain('🔥 고열 주의');
    });

    it('강수확률이 60%일 때 지면이 서늘해도 100점이 아닌 65점(비 예보)으로 산정되어야 한다', () => {
      const rainForecastWeather: HeatRiskResponse = {
        isLiveServer: true,
        current_hour: 17,
        current_air_temp: 22.1,
        current_surface_temp: 22.1,
        solar_radiation_w_m2: 0,
        surface_temps: {
          asphalt: 22.1,
          paved: 22.1,
          dirt: 22.1,
          grass: 22.1,
        },
        current_risk_level: 'SAFE',
        is_current_golden: true,
        golden_time_window: '17:00 ~ 23:00',
        golden_time_window_day: 'today',
        pop: 60,
        hourly_forecast: [],
        notice: '기상청 예보 모델 기반 추정치',
        fetched_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(<GoldenTimeWidget weather={rainForecastWeather} />);

      // 100점이 아니라 65점 및 비 예보로 감점 반영
      expect(html).toContain('65');
      expect(html).toContain('✓ 비 예보');
      expect(html).toContain('비 예보(우산 필수)가 있어요');
      expect(html).not.toContain('100');
    });

    it('현재 비가 내리는 중(pty=1)일 때는 우천 주의(42점)로 강등되어야 한다', () => {
      const activeRainWeather: HeatRiskResponse = {
        isLiveServer: true,
        current_hour: 17,
        current_air_temp: 20.0,
        current_surface_temp: 20.0,
        solar_radiation_w_m2: 0,
        current_risk_level: 'SAFE',
        is_current_golden: true,
        golden_time_window: '17:00 ~ 23:00',
        golden_time_window_day: 'today',
        pop: 100,
        pty: 1, // 비
        condition: 'rainy',
        hourly_forecast: [],
        notice: '기상청 예보 모델 기반 추정치',
        fetched_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(<GoldenTimeWidget weather={activeRainWeather} />);

      expect(html).toContain('42');
      expect(html).toContain('✓ 우천 주의');
      expect(html).toContain('실내 놀이를 추천해요');
    });

    it('현재 눈이 내리는 중(pty=3)일 때는 강설 주의(38점)로 강등되어야 한다', () => {
      const activeSnowWeather: HeatRiskResponse = {
        isLiveServer: true,
        current_hour: 17,
        current_air_temp: -1.0,
        current_surface_temp: -1.0,
        solar_radiation_w_m2: 0,
        current_risk_level: 'SAFE',
        is_current_golden: true,
        golden_time_window: '17:00 ~ 23:00',
        golden_time_window_day: 'today',
        pop: 90,
        pty: 3, // 눈
        condition: 'snowy',
        hourly_forecast: [],
        notice: '기상청 예보 모델 기반 추정치',
        fetched_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(<GoldenTimeWidget weather={activeSnowWeather} />);

      expect(html).toContain('38');
      expect(html).toContain('✓ 강설 주의');
      expect(html).toContain('동상 위험');
    });
  });
});
