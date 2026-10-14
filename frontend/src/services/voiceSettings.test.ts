/**
 * [편안하개 - PetWalk]
 * US-C2, #37 AI 음성 가이드 보이스 프로필 및 사운드 설정 단위 테스트
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Speech from 'expo-speech';
import {
  DEFAULT_SOUND_SETTINGS,
  VOICE_PROFILES,
} from '../types/voiceSettings';
import { TTSNavigationService } from './ttsNavigation';

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

describe('AI 음성 가이드 보이스 프로필 데이터 (US-C2, #37)', () => {
  it('4종 AI 목소리 프로필이 올바른 톤과 성별로 정의되어 있어야 한다', () => {
    expect(VOICE_PROFILES).toHaveLength(4);
    const ids = VOICE_PROFILES.map((p) => p.id);
    expect(ids).toContain('calm_female');
    expect(ids).toContain('bright_female');
    expect(ids).toContain('calm_male');
    expect(ids).toContain('friendly_male');

    for (const profile of VOICE_PROFILES) {
      expect(profile.pitch).toBeGreaterThanOrEqual(0.7);
      expect(profile.pitch).toBeLessThanOrEqual(1.5);
      expect(profile.rate).toBeGreaterThanOrEqual(0.7);
      expect(profile.rate).toBeLessThanOrEqual(1.3);
      expect(profile.sampleMessage).toBeTruthy();
    }
  });

  it('기본 사운드 설정이 올바르게 정의되어 있어야 한다', () => {
    expect(DEFAULT_SOUND_SETTINGS.profileId).toBe('calm_female');
    expect(DEFAULT_SOUND_SETTINGS.volume).toBe(0.8);
    expect(DEFAULT_SOUND_SETTINGS.isMuted).toBe(false);
  });
});

describe('TTSNavigationService 음량 및 퀵 음소거 제어 엔진 (US-C2, #37)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TTSNavigationService.updateSettings({ ...DEFAULT_SOUND_SETTINGS });
  });

  it('음량 조절 시 0.0 ~ 1.0 범위로 클램핑되어야 한다', async () => {
    await TTSNavigationService.setVolume(0.5);
    expect(TTSNavigationService.getSettings().volume).toBe(0.5);

    await TTSNavigationService.setVolume(-0.2);
    expect(TTSNavigationService.getSettings().volume).toBe(0);

    await TTSNavigationService.setVolume(1.5);
    expect(TTSNavigationService.getSettings().volume).toBe(1);
  });

  it('보이스 프로필 변경이 정상 반영되어야 한다', async () => {
    await TTSNavigationService.setProfile('bright_female');
    expect(TTSNavigationService.getSettings().profileId).toBe('bright_female');

    await TTSNavigationService.setProfile('calm_male');
    expect(TTSNavigationService.getSettings().profileId).toBe('calm_male');
  });

  it('돌발 상황 원터치 음소거(toggleMute) 시 발화가 정지되고 음소거 상태가 토글되어야 한다', async () => {
    expect(TTSNavigationService.getSettings().isMuted).toBe(false);

    const muted = await TTSNavigationService.toggleMute();
    expect(muted).toBe(true);
    expect(TTSNavigationService.getSettings().isMuted).toBe(true);
    expect(Speech.stop).toHaveBeenCalled();

    const unmuted = await TTSNavigationService.toggleMute();
    expect(unmuted).toBe(false);
    expect(TTSNavigationService.getSettings().isMuted).toBe(false);
  });

  it('음소거 상태일 때는 speak 호출 시 Speech.speak가 호출되지 않아야 한다', async () => {
    await TTSNavigationService.updateSettings({ isMuted: true });
    TTSNavigationService.speak('테스트 발화');
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('음소거 해제 상태에서는 선택된 프로필의 pitch/rate와 함께 발화되어야 한다', async () => {
    await TTSNavigationService.updateSettings({
      profileId: 'bright_female',
      volume: 0.9,
      isMuted: false,
    });

    TTSNavigationService.speak('안녕하세요, 산책 안내입니다');
    expect(Speech.speak).toHaveBeenCalledWith(
      '안녕하세요, 산책 안내입니다',
      expect.objectContaining({
        language: 'ko-KR',
        pitch: 1.15,
        rate: 1.0,
        volume: 0.9,
      })
    );
  });

  it('구독자(listener)가 설정 변경을 정상 수신해야 한다', async () => {
    let receivedVolume = -1;
    const unsubscribe = TTSNavigationService.subscribe((s) => {
      receivedVolume = s.volume;
    });

    await TTSNavigationService.setVolume(0.65);
    expect(receivedVolume).toBe(0.65);

    unsubscribe();
    await TTSNavigationService.setVolume(0.4);
    expect(receivedVolume).toBe(0.65); // 더 이상 갱신되지 않음
  });
});
