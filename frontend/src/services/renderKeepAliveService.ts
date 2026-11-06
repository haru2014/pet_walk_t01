/**
 * [편안하개 - PetWalk]
 * Render 백엔드 서버 스마트 하트비트 및 기동 웜업 서비스 (RenderKeepAliveService)
 *
 * 1. 기동 즉시 사전 웜업 (Warm-up on Launch): 앱 켜자마자 GET /health 1회 호출하여 Cold Start 사전 해제
 * 2. 포그라운드 하트비트 (Keep-Alive Heartbeat): 앱 또는 웹 데모가 활성 상태일 때 10분 주기 Ping 전송 (Render 15분 슬립 방지)
 * 3. 백그라운드 절전 보호: AppState / document.visibilityState 감지하여 비활성 시 타이머 정지 (배터리 & Render 750h 크레딧 보존)
 */

import { AppState, AppStateStatus, Platform } from 'react-native';
import { getPrimaryApiBaseUrl } from './apiClient';

export class RenderKeepAliveService {
  private static timer: ReturnType<typeof setInterval> | null = null;
  private static appStateSubscription: { remove: () => void } | null = null;
  private static visibilityListener: (() => void) | null = null;
  private static isRunning = false;

  // Render 무료 인스턴스는 15분(900초) 미활동 시 슬립되므로, 안전하게 10분(600초) 주기로 핑
  public static readonly PING_INTERVAL_MS = 10 * 60 * 1000;

  /**
   * 앱 실행 즉시 1회 사전 웜업 및 포그라운드 주기적 하트비트 시작
   */
  public static start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. 앱 기동 즉시 1회 사전 웜업 (Cold Start 해제 트리거)
    void this.ping();

    // 2. 포그라운드 주기적 하트비트 가동
    this.startInterval();

    // 3. React Native AppState (포그라운드/백그라운드 전환 감지)
    try {
      this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    } catch {
      // Mock / 특정 환경 방어
    }

    // 4. Web 환경 document.visibilityState (브라우저 탭 활성화/비활성화 감지)
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.addEventListener) {
      this.visibilityListener = () => {
        if (document.visibilityState === 'visible') {
          this.resume();
        } else {
          this.pause();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  /**
   * 하트비트 및 리스너 완전 종료
   */
  public static stop(): void {
    this.pause();
    this.isRunning = false;
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.visibilityListener && typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
  }

  private static handleAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState === 'active') {
      this.resume();
    } else {
      this.pause();
    }
  };

  private static startInterval(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.ping();
    }, this.PING_INTERVAL_MS);
  }

  private static resume(): void {
    if (!this.isRunning) return;
    // 포그라운드 복귀 시 즉시 1회 핑 후 주기 타이머 재시작
    void this.ping();
    this.startInterval();
  }

  private static pause(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Render 서버 GET /health 경량 Ping 전송
   */
  public static async ping(): Promise<boolean> {
    const baseUrl = getPrimaryApiBaseUrl();
    if (!baseUrl || !baseUrl.startsWith('http')) return false;

    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });
      return response.ok;
    } catch {
      // 네트워크 오프라인이거나 서버 슬립 중일 때도 조용히 무시 (크래시 방지)
      return false;
    }
  }

  /**
   * 테스트 검증용 내부 상태 조회
   */
  public static getActiveTimerForTest(): ReturnType<typeof setInterval> | null {
    return this.timer;
  }

  public static isRunningForTest(): boolean {
    return this.isRunning;
  }
}
