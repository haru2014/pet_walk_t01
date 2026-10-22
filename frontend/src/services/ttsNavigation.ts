/**
 * [편안하개 - PetWalk]
 * expo-speech 기반 시선 해방(Eyes-Free) 핸즈프리 음성 안내 엔진 (US-C2, #37)
 *
 * 4대 보이스 프로필 매핑, 독립 볼륨 슬라이더 제어, 돌발 상황(개 짖음/소음) 퀵 음소거 지원
 */

import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import {
  DEFAULT_SOUND_SETTINGS,
  SoundSettings,
  VOICE_PROFILES,
  VoiceProfileId,
} from '../types/voiceSettings';
import { LocalStorageService } from './storage';
import { STORAGE_KEYS } from '../types/storage';
import { fetchWithServerFallback } from './apiClient';

export type SpeakPriority = 'normal' | 'high';

interface QueuedUtterance {
  readonly message: string;
  readonly profileId?: VoiceProfileId;
  readonly priority: SpeakPriority;
}

/** 대기열 최대 길이: 오래된 일반 안내는 버려 지나간 안내가 뒤늦게 나오지 않게 한다. */
const MAX_QUEUE_LENGTH = 3;

export class TTSNavigationService {
  private static isSpeaking = false;
  private static settings: SoundSettings = { ...DEFAULT_SOUND_SETTINGS };
  private static isInitialized = false;
  private static isBarkMuted = false;
  private static listeners: ((settings: SoundSettings) => void)[] = [];
  private static cachedVoices: Speech.Voice[] | null = null;
  private static isLoadingVoices = false;
  private static queue: QueuedUtterance[] = [];
  private static isBusy = false;
  private static utteranceId = 0;
  private static watchdog: ReturnType<typeof setTimeout> | null = null;
  private static currentPlayer: ReturnType<typeof createAudioPlayer> | null = null;
  private static currentAudioFile: { delete: () => void } | null = null;
  private static currentWebAudio: HTMLAudioElement | null = null;
  private static currentWebAudioUrl: string | null = null;
  private static playbackSubscription: { remove: () => void } | null = null;
  private static requestController: AbortController | null = null;

  private static readonly geminiVoices: Record<VoiceProfileId, { voice: string; style: string }> = {
    calm_female: { voice: 'Kore', style: 'Speak Korean calmly, gently, and reassuringly at a natural, measured pace.' },
    bright_female: { voice: 'Aoede', style: 'Speak Korean brightly, warmly, and cheerfully at a natural pace.' },
    calm_male: { voice: 'Charon', style: 'Speak Korean in a calm, steady, trustworthy, and measured manner.' },
    friendly_male: { voice: 'Puck', style: 'Speak Korean in a friendly, warm, and natural manner.' },
  };

  /** 기기에 설치된 TTS 보이스 목록을 비동기 조회하여 캐싱한다. */
  static async loadAvailableVoices(): Promise<Speech.Voice[]> {
    if (this.cachedVoices) return this.cachedVoices;
    if (this.isLoadingVoices) return [];
    this.isLoadingVoices = true;
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      this.cachedVoices = voices || [];
      return this.cachedVoices;
    } catch {
      return [];
    } finally {
      this.isLoadingVoices = false;
    }
  }

  /**
   * 한국어 음성 중 남성/여성 성별에 일치하는 보이스 identifier 탐색
   */
  static findVoiceForGender(gender: 'male' | 'female', voices: Speech.Voice[]): string | undefined {
    if (!voices || voices.length === 0) return undefined;
    const koreanVoices = voices.filter(
      (v) => v.language && (v.language.startsWith('ko') || v.language.toLowerCase() === 'kor')
    );
    if (koreanVoices.length === 0) return undefined;

    if (gender === 'male') {
      const maleVoice = koreanVoices.find((v) => {
        const idLower = (v.identifier || '').toLowerCase();
        const nameLower = (v.name || '').toLowerCase();

        // female / woman / 여성 단어 제외
        if (
          idLower.includes('female') ||
          idLower.includes('woman') ||
          nameLower.includes('female') ||
          nameLower.includes('woman') ||
          nameLower.includes('여성')
        ) {
          return false;
        }

        return (
          idLower.includes('ism') || // Android ko-kr-x-ism
          idLower.includes('male') ||
          idLower.includes('man') ||
          nameLower.includes('남성') ||
          nameLower.includes('male') ||
          nameLower.includes('injoon') || // Windows / Edge 한국어 남성
          nameLower.includes('bongjin')
        );
      });
      return maleVoice?.identifier;
    } else {
      const femaleVoice = koreanVoices.find((v) => {
        const idLower = (v.identifier || '').toLowerCase();
        const nameLower = (v.name || '').toLowerCase();
        return (
          idLower.includes('kfb') || // Android ko-kr-x-kfb
          idLower.includes('kob') ||
          idLower.includes('yuna') || // iOS
          idLower.includes('female') ||
          nameLower.includes('여성') ||
          nameLower.includes('female') ||
          nameLower.includes('heami') ||
          nameLower.includes('sunhi') ||
          nameLower.includes('yuna')
        );
      });
      return femaleVoice?.identifier;
    }
  }

  /** 단위 테스트용 보이스 캐시 설정 */
  static setCachedVoicesForTesting(voices: Speech.Voice[] | null): void {
    this.cachedVoices = voices;
  }

  /** 저장된 사운드 설정을 불러와 초기화한다. */
  static async init(): Promise<SoundSettings> {
    if (this.isInitialized) return this.settings;
    try {
      void this.loadAvailableVoices();
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
   *
   * 일반 발화는 큐에 쌓여 앞선 발화가 끝난 뒤 순서대로 재생된다(진행 중인 발화를 끊지 않음).
   * `priority: 'high'`는 대기열 맨 앞에 들어가지만 진행 중인 발화는 끊지 않는다.
   * 미리듣기(isPreview)만 대기열을 비우고 즉시 재생한다.
   *
   * @param message 발화할 안내 문구
   * @param overrideProfileId 임시 적용할 보이스 프로필 ID (선택)
   * @param isPreview 미리듣기 여부 (음소거 상태여도 미리듣기는 허용할 수 있음)
   * @param priority 대기열 우선순위 (기본 normal)
   */
  static speak(
    message: string,
    overrideProfileId?: VoiceProfileId,
    isPreview = false,
    priority: SpeakPriority = 'normal',
  ): void {
    const self = TTSNavigationService;
    if (!isPreview && (self.settings.isMuted || self.settings.volume <= 0 || self.isBarkMuted)) {
      return;
    }

    if (isPreview) {
      self.queue = [];
      self.utteranceId += 1; // 이전 발화의 콜백 무효화
      self.clearWatchdog();
      void self.stopCurrentOutput();
      self.utter({ message, profileId: overrideProfileId, priority });
      return;
    }

    if (self.queue.some((item) => item.message === message)) return;
    const item: QueuedUtterance = { message, profileId: overrideProfileId, priority };
    if (priority === 'high') self.queue.unshift(item);
    else self.queue.push(item);
    self.trimQueue();

    if (!self.isBusy) self.playNext();
  }

  private static trimQueue(): void {
    const self = TTSNavigationService;
    while (self.queue.length > MAX_QUEUE_LENGTH) {
      const oldestNormal = self.queue.findIndex((q) => q.priority === 'normal');
      self.queue.splice(oldestNormal >= 0 ? oldestNormal : self.queue.length - 1, 1);
    }
  }

  private static clearWatchdog(): void {
    const self = TTSNavigationService;
    if (self.watchdog) {
      clearTimeout(self.watchdog);
      self.watchdog = null;
    }
  }

  /** 재생이 시작된 뒤에만 문장 길이에 따른 완료 안전 타이머를 적용한다. */
  private static startPlaybackWatchdog(message: string, finish: () => void): void {
    this.clearWatchdog();
    this.watchdog = setTimeout(finish, Math.min(45000, 8000 + message.length * 500));
  }

  private static playNext(): void {
    const self = TTSNavigationService;
    const next = self.queue.shift();
    if (!next) {
      self.isBusy = false;
      return;
    }
    self.utter(next);
  }

  /** 한 문장을 실제로 발화한다. 끝나면(또는 오류/타임아웃) 다음 대기 항목으로 넘어간다. */
  private static utter({ message, profileId: overrideProfileId }: QueuedUtterance): void {
    const self = TTSNavigationService;
    const profileId = overrideProfileId ?? self.settings.profileId;
    const profile = VOICE_PROFILES.find((p) => p.id === profileId) ?? VOICE_PROFILES[0];
    const matchedVoice = self.cachedVoices
      ? self.findVoiceForGender(profile.gender, self.cachedVoices)
      : undefined;

    self.isBusy = true;
    self.utteranceId += 1;
    const id = self.utteranceId;
    const finish = (): void => {
      if (id !== self.utteranceId) return; // stop()·새 발화로 이미 무효화된 콜백
      self.clearWatchdog();
      self.requestController?.abort();
      self.requestController = null;
      void self.releaseCurrentPlayer();
      self.isSpeaking = false;
      self.playNext();
    };

    const speechOptions: Speech.SpeechOptions = {
      language: 'ko-KR',
      pitch: profile.pitch,
      rate: profile.rate,
      volume: self.settings.volume,
      ...(matchedVoice ? { voice: matchedVoice } : {}),
      onStart: () => {
        self.isSpeaking = true;
      },
      onDone: finish,
      onStopped: finish,
      onError: (err) => {
        if (Platform.OS === 'web') {
          console.info('[TTSNavigationService] 브라우저 오디오 정책에 따른 대기 상태:', err);
        } else {
          console.warn('[TTSNavigationService] 발화 오류:', err);
        }
        finish();
      },
    };

    // 앞선 발화의 안전 타이머를 정리한다. Gemini 요청 시간은 재생 제한에 포함하지 않는다.
    self.clearWatchdog();
    void self.speakWithGemini(message, profileId, id, speechOptions, finish);
  }

  private static async speakWithGemini(
    message: string,
    profileId: VoiceProfileId,
    id: number,
    fallbackOptions: Speech.SpeechOptions,
    finish: () => void,
  ): Promise<void> {
    const self = TTSNavigationService;
    const profile = self.geminiVoices[profileId];
    const controller = new AbortController();
    self.requestController = controller;
    try {
      const response = await fetchWithServerFallback(
        '/api/v1/voice/tts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message, ...profile }),
          signal: controller.signal,
        },
        30000,
        2000,
      );
      if (!response.ok) throw new Error(`Gemini TTS returned ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (id !== self.utteranceId) return;
      if (!bytes.length) throw new Error('Gemini TTS returned empty audio');

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        await self.playGeminiAudioOnWeb(bytes, message, fallbackOptions, id, finish);
        return;
      }

      const { File, Paths } = await import('expo-file-system');
      const file = new File(Paths.cache, `petwalk-tts-${id}.wav`);
      file.create({ overwrite: true });
      await file.write(self.bytesToBase64(bytes), { encoding: 'base64' });
      if (id !== self.utteranceId) {
        file.delete();
        return;
      }
      self.currentAudioFile = file;
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        allowsRecording: false,
        shouldPlayInBackground: true,
      });
      if (id !== self.utteranceId) {
        file.delete();
        return;
      }
      const player = createAudioPlayer({ uri: file.uri });
      self.currentPlayer = player;
      player.volume = self.settings.volume;
      player.setActiveForLockScreen(true, { title: '편안하개 산책 안내', artist: '편안하개' });
      let fallbackStarted = false;
      self.playbackSubscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.playing) self.isSpeaking = true;
        if (status.error && !fallbackStarted) {
          fallbackStarted = true;
          void self.playNativeFallback(message, fallbackOptions, id, finish);
        } else if (status.didJustFinish) {
          finish();
        }
      });
      player.play();
      self.startPlaybackWatchdog(message, finish);
    } catch (error) {
      if (id !== self.utteranceId || controller.signal.aborted) return;
      if (Platform.OS === 'web') {
        console.debug('[TTSNavigationService] 웹 Gemini TTS를 사용할 수 없어 브라우저 음성으로 전환:', error);
      } else {
        console.info('[TTSNavigationService] Gemini TTS 실패, 기기 음성으로 전환:', error);
      }
      await self.playNativeFallback(message, fallbackOptions, id, finish);
    }
  }

  private static async playGeminiAudioOnWeb(
    bytes: Uint8Array,
    message: string,
    fallbackOptions: Speech.SpeechOptions,
    id: number,
    finish: () => void,
  ): Promise<void> {
    const self = TTSNavigationService;
    const audioUrl = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' }));
    const audio = new Audio(audioUrl);
    self.currentWebAudio = audio;
    self.currentWebAudioUrl = audioUrl;
    audio.volume = self.settings.volume;

    let fallbackStarted = false;
    const useBrowserSpeech = () => {
      if (fallbackStarted || id !== self.utteranceId) return;
      fallbackStarted = true;
      void self.playNativeFallback(message, fallbackOptions, id, finish);
    };

    audio.onended = finish;
    audio.onerror = useBrowserSpeech;
    try {
      await audio.play();
      if (id === self.utteranceId) self.isSpeaking = true;
      self.startPlaybackWatchdog(message, finish);
    } catch {
      useBrowserSpeech();
    }
  }

  private static bytesToBase64(bytes: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let encoded = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i];
      const hasB = i + 1 < bytes.length;
      const hasC = i + 2 < bytes.length;
      const b = hasB ? bytes[i + 1] : 0;
      const c = hasC ? bytes[i + 2] : 0;
      encoded += alphabet[a >> 2];
      encoded += alphabet[((a & 3) << 4) | (b >> 4)];
      encoded += hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : '=';
      encoded += hasC ? alphabet[c & 63] : '=';
    }
    return encoded;
  }

  private static async playNativeFallback(
    message: string,
    options: Speech.SpeechOptions,
    id: number,
    finish: () => void,
  ): Promise<void> {
    const self = TTSNavigationService;
    if (id !== self.utteranceId) return;
    await self.releaseCurrentPlayer();
    try {
      self.startPlaybackWatchdog(message, finish);
      Speech.speak(message, options);
    } catch (error) {
      if (Platform.OS !== 'web') console.warn('[TTSNavigationService] TTS 미지원 환경:', error);
      finish();
    }
  }

  private static async releaseCurrentPlayer(): Promise<void> {
    const self = TTSNavigationService;
    const webAudio = self.currentWebAudio;
    self.currentWebAudio = null;
    if (webAudio) {
      webAudio.onended = null;
      webAudio.onerror = null;
      webAudio.pause();
      webAudio.src = '';
    }
    if (self.currentWebAudioUrl && typeof URL !== 'undefined') {
      URL.revokeObjectURL(self.currentWebAudioUrl);
      self.currentWebAudioUrl = null;
    }
    self.playbackSubscription?.remove();
    self.playbackSubscription = null;
    self.currentPlayer?.clearLockScreenControls();
    self.currentPlayer?.remove();
    self.currentPlayer = null;
    const file = self.currentAudioFile;
    self.currentAudioFile = null;
    try {
      file?.delete();
    } catch {
      // 캐시 파일이 이미 정리된 경우 무시
    }
  }

  private static async stopCurrentOutput(): Promise<void> {
    const self = TTSNavigationService;
    self.requestController?.abort();
    self.requestController = null;
    let speechStop: Promise<void>;
    try {
      speechStop = Speech.stop();
    } catch {
      speechStop = Promise.resolve();
    }
    await self.releaseCurrentPlayer();
    await speechStop.catch(() => {});
  }

  /** 진행 중인 발화를 멈추고 대기열을 비운다. */
  static async stop(): Promise<void> {
    const self = TTSNavigationService;
    self.queue = [];
    self.isBusy = false;
    self.utteranceId += 1;
    self.clearWatchdog();
    await self.stopCurrentOutput();
    self.isSpeaking = false;
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
