import { describe, it, expect, vi } from 'vitest';
import {
  extractLocalVoiceIntent,
  analyzeVoiceIntent,
  normalizeToFrontendParkId,
} from './voiceIntentApi';

describe('voiceIntentApi (docs/implementation_plan/gemini_api_적용_계획.md)', () => {
  it('extractLocalVoiceIntent extracts time, shade, cushion, avoid stairs, and landmark correctly', () => {
    const text = '날씨가 더우니까 뽀삐랑 25분만 그늘진 흙길로 유림공원 한 바퀴 돌고 싶어';
    const result = extractLocalVoiceIntent(text, '뽀삐');

    expect(result.status).toBe('success');
    expect(result.intent.target_duration_minutes).toBe(25);
    expect(result.intent.prefer_shade).toBe(true);
    expect(result.intent.prefer_cushion).toBe(true);
    expect(result.intent.avoid_stairs).toBe(true);
    expect(result.intent.destination_landmark).toBe('유림공원');
    expect(result.landmark_park_id).toBe('yurim');
    expect(result.data_source).toBe('local_fallback');
  });

  it('extractLocalVoiceIntent handles stairs allowed and 40 min', () => {
    const text = '세종호수공원에서 계단 괜찮으니까 40분 산책하자';
    const result = extractLocalVoiceIntent(text, '코코');

    expect(result.intent.target_duration_minutes).toBe(40);
    expect(result.intent.avoid_stairs).toBe(false);
    expect(result.landmark_park_id).toBe('sejong');
  });

  it('analyzeVoiceIntent falls back smoothly to local parser when fetch fails', async () => {
    // global fetch mock throwing error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const result = await analyzeVoiceIntent('30분 폭신한 길', '초코');
    expect(result.status).toBe('success');
    expect(result.intent.target_duration_minutes).toBe(30);
    expect(result.intent.prefer_cushion).toBe(true);
    expect(result.data_source).toBe('local_fallback');

    globalThis.fetch = originalFetch;
  });

  it('normalizeToFrontendParkId normalizes various landmark IDs and names to 4 pilot parks', () => {
    expect(normalizeToFrontendParkId('daejeon_yulim')).toBe('yurim');
    expect(normalizeToFrontendParkId('yurim')).toBe('yurim');
    expect(normalizeToFrontendParkId('유림공원')).toBe('yurim');
    expect(normalizeToFrontendParkId('갑천')).toBe('yurim');
    expect(normalizeToFrontendParkId('sejong_lake')).toBe('sejong');
    expect(normalizeToFrontendParkId('세종호수공원')).toBe('sejong');
    expect(normalizeToFrontendParkId('daejeon_songgang')).toBe('songgang');
    expect(normalizeToFrontendParkId('송강근린공원')).toBe('songgang');
    expect(normalizeToFrontendParkId('daejeon_boramae')).toBe('yurim');
    expect(normalizeToFrontendParkId('도안호수공원')).toBe('doan');
    expect(normalizeToFrontendParkId(null)).toBe('yurim');
  });
});
