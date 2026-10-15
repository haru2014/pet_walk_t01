import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RENDER_API_BASE_URL,
  LOCAL_API_BASE_URL,
  getPrimaryApiBaseUrl,
  getFallbackApiBaseUrl,
  fetchWithServerFallback,
} from './apiClient';

describe('apiClient - 탄력적 멀티 타깃 API 통신', () => {
  const originalEnv = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.EXPO_PUBLIC_API_URL = originalEnv;
    } else {
      delete process.env.EXPO_PUBLIC_API_URL;
    }
    vi.restoreAllMocks();
  });

  it('기본 1순위 주소는 Render 서버여야 한다', () => {
    expect(getPrimaryApiBaseUrl()).toBe(RENDER_API_BASE_URL);
  });

  it('환경 변수가 설정되어 있으면 해당 주소가 1순위 주소가 되어야 한다', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://custom-api.example.com';
    expect(getPrimaryApiBaseUrl()).toBe('https://custom-api.example.com');
  });

  it('1순위가 Render일 때 2순위 폴백 주소는 127.0.0.1:8000이어야 한다', () => {
    expect(getFallbackApiBaseUrl()).toBe(LOCAL_API_BASE_URL);
  });

  it('1순위가 127.0.0.1일 때는 2순위 폴백 주소가 null이어야 한다', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:8000';
    expect(getFallbackApiBaseUrl()).toBeNull();
  });

  it('1순위 Render 서버가 정상 응답할 경우 즉시 반환해야 한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    const res = await fetchWithServerFallback('/api/v1/health');
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${RENDER_API_BASE_URL}/api/v1/health`,
      expect.anything()
    );
  });

  it('1순위 Render 서버가 연결 실패(네트워크 오류) 시 2순위 127.0.0.1 로컬 백엔드로 자동 폴백해야 한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      // 1순위 Render 실패
      .mockRejectedValueOnce(new Error('Network error (Render down/timeout)'))
      // 2순위 127.0.0.1 성공
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ source: 'local_127' }),
      } as Response);

    const res = await fetchWithServerFallback('/api/v1/walk/plan');
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      `${RENDER_API_BASE_URL}/api/v1/walk/plan`,
      expect.anything()
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      `${LOCAL_API_BASE_URL}/api/v1/walk/plan`,
      expect.anything()
    );
  });

  it('Render 서버와 로컬 백엔드 모두 실패할 경우 예외를 발생시켜 오프라인 폴백을 유도해야 한다', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Render offline'))
      .mockRejectedValueOnce(new Error('Local offline'));

    await expect(fetchWithServerFallback('/api/v1/weather/heat-risk')).rejects.toThrow(
      /All API endpoints failed/
    );
  });
});
