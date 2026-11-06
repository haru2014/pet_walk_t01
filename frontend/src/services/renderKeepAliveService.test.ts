import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppState, AppStateStatus } from 'react-native';
import { RenderKeepAliveService } from './renderKeepAliveService';
import * as apiClient from './apiClient';

describe('RenderKeepAliveService - Render 서버 웜업 및 스마트 하트비트', () => {
  let appStateCallback: ((state: AppStateStatus) => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    RenderKeepAliveService.stop();
    vi.spyOn(apiClient, 'getPrimaryApiBaseUrl').mockReturnValue('https://pet-walk-t01-z095.onrender.com');

    // AppState mock
    vi.spyOn(AppState, 'addEventListener').mockImplementation((event: string, callback: any) => {
      if (event === 'change') {
        appStateCallback = callback;
      }
      return { remove: vi.fn() } as any;
    });

    // global.fetch mock
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
  });

  afterEach(() => {
    RenderKeepAliveService.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
    appStateCallback = null;
  });

  it('start() 호출 시 기동 즉시 /health 핑(사전 웜업)을 1회 호출하고 타이머를 가동해야 한다', async () => {
    RenderKeepAliveService.start();

    expect(RenderKeepAliveService.isRunningForTest()).toBe(true);
    expect(RenderKeepAliveService.getActiveTimerForTest()).not.toBeNull();

    // 즉시 1회 ping 호출 검증
    expect(global.fetch).toHaveBeenCalledWith(
      'https://pet-walk-t01-z095.onrender.com/health',
      expect.objectContaining({ method: 'GET' })
    );

    // 10분 경과 시 2번째 ping 호출
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // 20분 경과 시 3번째 ping 호출
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('앱이 백그라운드로 전환되면 하트비트 타이머를 정지하고, 포그라운드로 복귀하면 즉시 재가동해야 한다', async () => {
    RenderKeepAliveService.start();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // 백그라운드 전환
    appStateCallback?.('background');
    expect(RenderKeepAliveService.getActiveTimerForTest()).toBeNull();

    // 백그라운드에서는 10분이 지나도 핑이 나가지 않아야 함
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // 포그라운드 복귀
    appStateCallback?.('active');
    expect(RenderKeepAliveService.getActiveTimerForTest()).not.toBeNull();
    // 복귀 즉시 1회 ping 호출되어 총 2회
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // 이후 10분 주기 정상 작동
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('stop() 호출 시 타이머와 실행 상태가 완전히 정리되어야 한다', () => {
    RenderKeepAliveService.start();
    expect(RenderKeepAliveService.isRunningForTest()).toBe(true);

    RenderKeepAliveService.stop();
    expect(RenderKeepAliveService.isRunningForTest()).toBe(false);
    expect(RenderKeepAliveService.getActiveTimerForTest()).toBeNull();
  });
});
