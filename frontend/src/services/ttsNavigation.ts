/**
 * [편안하개 - PetWalk]
 * expo-speech 기반 시선 해방(Eyes-Free) 핸즈프리 음성 안내 엔진 (US-C2, #37)
 *
 * 4대 보이스 프로필 매핑, 독립 볼륨 슬라이더 제어, 돌발 상황(개 짖음/소음) 퀵 음소거 지원
 */

import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import {
  DEFAULT_SOUND_SETTINGS,
  SoundSettings,
  VOICE_PROFILES,
  VoiceProfileId,
} from '../types/voiceSettings';
import { LocalStorageService } from './storage';
import { STORAGE_KEYS } from '../types/storage';

export class TTSNavigationService {
  private static isSpeaking = false;
  private static settings: SoundSettings = { ...DEFAULT_SOUND_SETTINGS };
  private static isInitialized = false;
  private static isBarkMuted = false;
  private static listeners: Array<(settings: SoundSettings) => void> = [];

  /** 저장된 사운드 설정을 불러와 초기화한다. */
  static async init(): Promise<SoundSettings> {
    if (this.isInitialized) return this.settings;
    try {
      const saved = await LocalStorageService.getItem<SoundSettings>(STORAGE_KEYS.SOUND_SETTINGS);
      if (saved) {
        this.settings = { ...DEFAULT_SOUND_SETTINGS, ...saved };
      }
    } catch {
      // 로컬 스토리지 실패 시 기본값 유지
    }
    this.isInitialized = true;
    return this.settings;
  }

  static getSettings(): SoundSettings {
    return { ...this.settings };
  }

  /** 돌발 짖음/소음 감지에 따른 스마트 자동 음소거 플래그 설정 */
  static setBarkMuted(muted: boolean): void {
    this.isBarkMuted = muted;
    if (muted) {
      void this.stop();
    }
  }

  static getIsBarkMuted(): boolean {
    return this.isBarkMuted;
  }

  /** 사운드 설정을 변경하고 영속 저장 및 구독자에게 알린다. */
  static async updateSettings(partial: Partial<SoundSettings>): Promise<SoundSettings> {
    const updated: SoundSettings = {
      ...this.settings,
      ...partial,
      volume: typeof partial.volume === 'number'
        ? Math.max(0, Math.min(1, partial.volume))
        : this.settings.volume,
    };
    this.settings = updated;

    // 음소거 활성화 시 진행 중인 발화를 즉시 중단
    if (updated.isMuted) {
      await this.stop();
    }

    try {
      await LocalStorageService.setItem(STORAGE_KEYS.SOUND_SETTINGS, updated);
    } catch {
      // 스토리지 에러 무시
    }

    this.notifyListeners();
    return updated;
  }

  /** 돌발 상황(개 짖음, 도로 소음 등) 대비 원터치 음소거/복원 토글 */
  static async toggleMute(): Promise<boolean> {
    const nextMuted = !this.settings.isMuted;
    await this.updateSettings({ isMuted: nextMuted });
    return nextMuted;
  }

  /** 음량 설정 (0.0 ~ 1.0) */
  static async setVolume(volume: number): Promise<void> {
    await this.updateSettings({ volume });
  }

  /** 보이스 프로필 변경 */
  static async setProfile(profileId: VoiceProfileId): Promise<void> {
    await this.updateSettings({ profileId });
  }

  /** 보이스 변경 시 샘플 멘트를 미리 발화한다. */
  static previewVoice(profileId: VoiceProfileId): void {
    const profile = VOICE_PROFILES.find((p) => p.id === profileId) ?? VOICE_PROFILES[0];
    this.speak(profile.sampleMessage, profileId, true);
  }

  /**
   * 한국어 음성으로 길안내 및 위험 경고 브리핑을 발화한다.
   * @param message 발화할 안내 문구
   * @param overrideProfileId 임시 적용할 보이스 프로필 ID (선택)
   * @param isPreview 미리듣기 여부 (음소거 상태여도 미리듣기는 허용할 수 있음)
   */
  static speak(message: string, overrideProfileId?: VoiceProfileId, isPreview = false): void {
    if (!isPreview && (this.settings.isMuted || this.settings.volume <= 0 || this.isBarkMuted)) {
      return;
    }

    const profileId = overrideProfileId ?? this.settings.profileId;
    const profile = VOICE_PROFILES.find((p) => p.id === profileId) ?? VOICE_PROFILES[0];
    const volume = this.settings.volume;

    try {
      void Speech.stop().catch(() => {});
      Speech.speak(message, {
        language: 'ko-KR',
        pitch: profile.pitch,
        rate: profile.rate,
        volume,
        onStart: () => {
          this.isSpeaking = true;
        },
        onDone: () => {
          this.isSpeaking = false;
        },
        onError: (err) => {
          if (Platform.OS === 'web') {
            console.info('[TTSNavigationService] 브라우저 오디오 정책에 따른 대기 상태:', err);
          } else {
            console.warn('[TTSNavigationService] 발화 오류:', err);
          }
          this.isSpeaking = false;
        },
      });
    } catch (e) {
      if (Platform.OS !== 'web') {
        console.warn('[TTSNavigationService] TTS 미지원 환경:', e);
      }
    }
  }

  static async stop(): Promise<void> {
    try {
      await Speech.stop();
      this.isSpeaking = false;
    } catch {
      this.isSpeaking = false;
    }
  }

  static getStatus(): boolean {
    return this.isSpeaking;
  }

  static subscribe(listener: (settings: SoundSettings) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.settings);
      } catch {
        // 리스너 오류 격리
      }
    }
  }
}
