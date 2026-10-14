/**
 * [편안하개 - PetWalk]
 * AmbientNoiseMonitorService 단위 테스트 (US-C2, #37)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const memoryStore = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => memoryStore.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      memoryStore.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      memoryStore.delete(key);
    }),
  },
}));

vi.mock('expo-speech', () => ({
  speak: vi.fn(),
  stop: vi.fn().mockResolvedValue(undefined),
  getAvailableVoicesAsync: vi.fn().mockResolvedValue([]),
}));

import { AmbientNoiseMonitorService } from './ambientNoiseMonitor';
import { TTSNavigationService } from './ttsNavigation';

describe('AmbientNoiseMonitorService - 돌발 짖음 감지 및 스마트 자동 음소거', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    AmbientNoiseMonitorService.resetForTesting();
    await TTSNavigationService.init();
    await TTSNavigationService.updateSettings({
      smartBarkMuteEnabled: true,
      barkNoiseThresholdDb: 73,
      noiseCooldownSec: 3,
      isMuted: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    AmbientNoiseMonitorService.resetForTesting();
  });

  it('평상시 조용한 산책 소음(50dB)에서는 자동 음소거가 발동하지 않는다', () => {
    AmbientNoiseMonitorService.processDecibel(50);
    const state = AmbientNoiseMonitorService.getState();

    expect(state.isAutoMuted).toBe(false);
    expect(state.currentNoiseDb).toBe(50);
    expect(TTSNavigationService.getIsBarkMuted()).toBe(false);
  });

  it('임계치 이상의 돌발 짖음(82dB) 감지 시 즉시 자동 음소거(isAutoMuted=true)되고 발화가 차단된다', () => {
    AmbientNoiseMonitorService.processDecibel(82);
    const state = AmbientNoiseMonitorService.getState();

    expect(state.isAutoMuted).toBe(true);
    expect(state.currentNoiseDb).toBe(82);
    expect(state.cooldownRemainingSec).toBe(3);
    expect(TTSNavigationService.getIsBarkMuted()).toBe(true);
  });

  it('소음이 멈추고 쿨다운(3초)이 지나면 자동으로 원래 안내 상태로 복구(Auto-Resume)된다', () => {
    // 1. 개 짖음 발생
    AmbientNoiseMonitorService.processDecibel(80);
    expect(AmbientNoiseMonitorService.getState().isAutoMuted).toBe(true);

    // 2. 조용해짐 (48dB)
    AmbientNoiseMonitorService.processDecibel(48);

    // 1초 경과 (아직 쿨다운 중)
    vi.advanceTimersByTime(1000);
    expect(AmbientNoiseMonitorService.getState().isAutoMuted).toBe(true);
    expect(TTSNavigationService.getIsBarkMuted()).toBe(true);

    // 추가 2.5초 경과 (총 3.5초 > 3초)
    vi.advanceTimersByTime(2500);

    // 3. 복구 완료 검증
    const recoveredState = AmbientNoiseMonitorService.getState();
    expect(recoveredState.isAutoMuted).toBe(false);
    expect(recoveredState.cooldownRemainingSec).toBe(0);
    expect(TTSNavigationService.getIsBarkMuted()).toBe(false);
  });

  it('쿨다운 진행 중 다시 개가 짖으면 쿨다운 타이머가 리셋되고 음소거가 유지된다', () => {
    // 1. 1차 짖음
    AmbientNoiseMonitorService.processDecibel(85);
    expect(AmbientNoiseMonitorService.getState().isAutoMuted).toBe(true);

    // 2. 잠시 조용해짐 (1.5초 경과)
    AmbientNoiseMonitorService.processDecibel(45);
    vi.advanceTimersByTime(1500);

    // 3. 2차 짖음 (다시 80dB)
    AmbientNoiseMonitorService.processDecibel(80);
    expect(AmbientNoiseMonitorService.getState().cooldownRemainingSec).toBe(3);
    expect(AmbientNoiseMonitorService.getState().isAutoMuted).toBe(true);

    // 추가 2초 경과 (총 3.5초가 지났으나 2차 짖음으로부터는 2초이므로 여전히 차단 유지)
    AmbientNoiseMonitorService.processDecibel(45);
    vi.advanceTimersByTime(2000);
    expect(AmbientNoiseMonitorService.getState().isAutoMuted).toBe(true);

    // 1.5초 더 경과 후 완전 복구
    vi.advanceTimersByTime(1500);
    expect(AmbientNoiseMonitorService.getState().isAutoMuted).toBe(false);
  });

  it('smartBarkMuteEnabled가 false로 비활성화되면 85dB 소음이 발생해도 자동 음소거되지 않는다', async () => {
    await TTSNavigationService.updateSettings({ smartBarkMuteEnabled: false });

    AmbientNoiseMonitorService.processDecibel(88);
    const state = AmbientNoiseMonitorService.getState();

    expect(state.isAutoMuted).toBe(false);
    expect(TTSNavigationService.getIsBarkMuted()).toBe(false);
  });
});
