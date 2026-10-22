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

vi.mock('./apiClient', () => ({
  fetchWithServerFallback: vi.fn().mockRejectedValue(new Error('offline')),
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
      expect(profile.pitch).toBeGreaterThanOrEqual(0.5);
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
    await TTSNavigationService.stop(); // 이전 테스트의 미완료 발화/대기열 정리
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

  it('Gemini 요청 실패 시 기기 음성이 선택된 프로필 설정으로 대체되어야 한다', async () => {
    await TTSNavigationService.updateSettings({
      profileId: 'bright_female',
      volume: 0.9,
      isMuted: false,
    });

    TTSNavigationService.speak('안녕하세요, 산책 안내입니다');
    await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(1));
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

  describe('음성 성별(남성/여성) 보이스 매핑 및 발화 검증 (이슈 #127)', () => {
    it('기기 보이스 목록 중 한국어 남성 및 여성 보이스 식별자를 올바르게 찾아낸다', () => {
      const mockVoices: any[] = [
        { identifier: 'en-US-Jenny', name: 'Jenny', language: 'en-US' },
        { identifier: 'ko-kr-x-kfb-local', name: '한국어 (대한민국)', language: 'ko-KR' },
        { identifier: 'ko-kr-x-ism-local', name: '한국어 남성 (대한민국)', language: 'ko-KR' },
        { identifier: 'ko-KR-InJoon', name: 'Microsoft InJoon Online (Natural) - Korean', language: 'ko-KR' },
      ];

      const maleVoice = TTSNavigationService.findVoiceForGender('male', mockVoices);
      expect(maleVoice).toBe('ko-kr-x-ism-local');

      const femaleVoice = TTSNavigationService.findVoiceForGender('female', mockVoices);
      expect(femaleVoice).toBe('ko-kr-x-kfb-local');
    });

    it('남성 프로필(calm_male) 선택 시 남성 보이스 identifier 및 저음 피치(0.70)가 발화 옵션에 적용되어야 한다', async () => {
      const mockVoices: any[] = [
        { identifier: 'ko-kr-x-kfb-local', name: 'ko-female', language: 'ko-KR' },
        { identifier: 'ko-kr-x-ism-local', name: 'ko-male', language: 'ko-KR' },
      ];
      TTSNavigationService.setCachedVoicesForTesting(mockVoices);

      await TTSNavigationService.setProfile('calm_male');
      TTSNavigationService.speak('전방 100m 앞 좌회전입니다');
      await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(1));

      expect(Speech.speak).toHaveBeenCalledWith(
        '전방 100m 앞 좌회전입니다',
        expect.objectContaining({
          language: 'ko-KR',
          voice: 'ko-kr-x-ism-local',
          pitch: 0.50,
          rate: 0.92,
        })
      );
    });

    it('기기에 별도 남성 보이스가 없는 환경에서도 남성 전용 저음 피치(0.50/0.58)로 발화되어야 한다', async () => {
      TTSNavigationService.setCachedVoicesForTesting([]); // 보이스 없음

      await TTSNavigationService.setProfile('friendly_male');
      TTSNavigationService.speak('잠시 벤치에서 쉬어가요');
      await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(1));

      expect(Speech.speak).toHaveBeenCalledWith(
        '잠시 벤치에서 쉬어가요',
        expect.objectContaining({
          language: 'ko-KR',
          pitch: 0.58,
          rate: 0.95,
        })
      );
    });
  });
});

describe('TTSNavigationService 발화 큐 (시작 멘트가 다른 안내에 끊기지 않음)', () => {
  const doneOf = (callIndex: number): (() => void) =>
    (vi.mocked(Speech.speak).mock.calls[callIndex][1] as { onDone: () => void }).onDone;

  beforeEach(async () => {
    await TTSNavigationService.stop();
    await TTSNavigationService.updateSettings({ ...DEFAULT_SOUND_SETTINGS });
    vi.clearAllMocks();
  });

  it('진행 중인 발화를 끊지 않고 끝난 뒤 다음 안내를 순서대로 재생한다', async () => {
    TTSNavigationService.speak('산책을 시작합니다');
    TTSNavigationService.speak('출발지에서 직진하세요');

    await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(1));
    expect(Speech.stop).not.toHaveBeenCalled();

    doneOf(0)();
    await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(2));
    expect(Speech.speak).toHaveBeenCalledTimes(2);
    expect(vi.mocked(Speech.speak).mock.calls[1][0]).toBe('출발지에서 직진하세요');
  });

  it('high 우선순위는 진행 중인 발화는 끊지 않고 대기열 맨 앞에서 재생된다', async () => {
    TTSNavigationService.speak('A');
    TTSNavigationService.speak('B');
    TTSNavigationService.speak('C', undefined, false, 'high');

    await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(1));
    doneOf(0)();
    await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(2));
    expect(vi.mocked(Speech.speak).mock.calls[1][0]).toBe('C');
    doneOf(1)();
    await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(3));
    expect(vi.mocked(Speech.speak).mock.calls[2][0]).toBe('B');
  });

  it('같은 문구가 대기 중이면 중복 등록하지 않는다', async () => {
    TTSNavigationService.speak('A');
    TTSNavigationService.speak('B');
    TTSNavigationService.speak('B');

    await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(1));
    doneOf(0)();
    await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(2));
    doneOf(1)();
    expect(Speech.speak).toHaveBeenCalledTimes(2);
  });

  it('stop()은 대기열을 비워 이후 발화가 재생되지 않게 한다', async () => {
    TTSNavigationService.speak('A');
    TTSNavigationService.speak('B');
    await TTSNavigationService.stop();

    await Promise.resolve();
    expect(Speech.speak).not.toHaveBeenCalled();

    TTSNavigationService.speak('C');
    await vi.waitFor(() => expect(Speech.speak).toHaveBeenCalledTimes(1));
  });
});
