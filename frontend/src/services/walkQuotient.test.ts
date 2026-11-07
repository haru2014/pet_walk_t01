/**
 * [편안하개 - PetWalk]
 * 산책 지수 SSOT(computeWalkQuotient) 단위 테스트
 *
 * 홈 '산책 정보' 위젯과 상세보기 모달이 같은 점수를 보여야 한다.
 * (예전 홈 위젯은 별도 계산식을 써서 날씨 없음 92점 / 상세 100점, 비 85점 / 상세 42점처럼 어긋났다.)
 */
import { describe, expect, it } from 'vitest';
import { computeWalkQuotient } from './walkQuotient';
import { HeatRiskResponse } from '../types/weather';

function weather(overrides: Partial<HeatRiskResponse> = {}): HeatRiskResponse {
  return {
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
    ...overrides,
  };
}

describe('computeWalkQuotient - 산책 지수 단일 계산', () => {
  it('날씨 정보가 없으면 기본 노면 23℃ 기준 100점(좋음)', () => {
    expect(computeWalkQuotient(null)).toMatchObject({ score: 100, statusLabel: '좋음' });
    expect(computeWalkQuotient(undefined).score).toBe(100);
  });

  it('골든타임 24℃ 맑음은 100점', () => {
    expect(computeWalkQuotient(weather()).score).toBe(100);
  });

  it('비가 오는 중(pty=1)이면 42점(우천 주의)', () => {
    expect(computeWalkQuotient(weather({ pty: 1 }))).toMatchObject({ score: 42, statusLabel: '우천 주의' });
  });

  it('미세먼지 매우나쁨이면 45점', () => {
    expect(computeWalkQuotient(weather({ air_quality: { grade_label: '매우나쁨' } })).score).toBe(45);
  });

  it('노면 고열 위험(DANGER)이면 35점', () => {
    expect(computeWalkQuotient(weather({ current_surface_temp: 48, current_risk_level: 'DANGER' })).score).toBe(35);
  });

  it('서버 위험도가 없으면 노면 온도로 위험도를 정한다 (40℃ → CAUTION 65점)', () => {
    const w = { ...weather({ current_surface_temp: 40 }), current_risk_level: undefined } as unknown as HeatRiskResponse;
    expect(computeWalkQuotient(w).score).toBe(65);
  });

  it('강수확률이 없으면 20%로 본다 (40% 미만이므로 감점 없음)', () => {
    expect(computeWalkQuotient(weather({ pop: undefined })).score).toBe(100);
  });
});
