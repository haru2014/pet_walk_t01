/**
 * [편안하개 - PetWalk]
 * 돌발 소음/개 짖음 실시간 데시벨 모니터링 및 자동 음소거/복구 엔진 (US-C2, #37)
 *
 * Local-First 프라이버시 원칙 준수:
 * - 어떠한 음성 데이터도 녹음, 저장, 서버 전송하지 않음
 * - 실시간 음압(dB) RMS만 계산 후 버퍼 즉시 폐기
 * - 순간 데시벨 >= 임계치(기본 73dB) 감지 시 안내 즉시 중단(Ducking)
 * - 소음 종료 후 쿨다운(기본 3초) 경과 시 원래 상태로 자동 복구(Auto-Resume)
 */

import { Platform } from 'react-native';
import { BarkMuteState, DEFAULT_SOUND_SETTINGS } from '../types/voiceSettings';
import { TTSNavigationService } from './ttsNavigation';

type NoiseListener = (state: BarkMuteState) => void;

export class AmbientNoiseMonitorService {
  private static isMonitoring = false;
  private static isAutoMuted = false;
  private static currentNoiseDb = 45; // 평상시 배경 소음 기준
  private static cooldownRemainingSec = 0;
  private static cooldownTimer: ReturnType<typeof setInterval> | null = null;
  private static listeners: NoiseListener[] = [];
  private static audioContext: AudioContext | null = null;
  private static mediaStream: MediaStream | null = null;
  private static analyserNode: AnalyserNode | null = null;
  private static animationFrameId: number | null = null;

  /** 현재 모니터링 상태 조회 */
  static getState(): BarkMuteState {
    return {
      isAutoMuted: this.isAutoMuted,
      currentNoiseDb: Math.round(this.currentNoiseDb),
      cooldownRemainingSec: Math.max(0, Math.round(this.cooldownRemainingSec * 10) / 10),
    };
  }

  /** 모니터링 활성화 여부 */
  static getIsActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * 실시간 주변 소음 모니터링 시작
   */
  static async startMonitoring(): Promise<boolean> {
    if (this.isMonitoring) return true;
    this.isMonitoring = true;

    // Web 환경: Web Audio API AnalyserNode 연결
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.navigator?.mediaDevices) {
      try {
        const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.mediaStream = stream;

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          this.audioContext = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          this.analyserNode = analyser;

          this.startAudioLoop();
        }
        return true;
      } catch {
        // 마이크 권한 거부 또는 미지원 브라우저: 시뮬레이션 및 수동 트리거 지원 모드로 안전 동작
        return false;
      }
    }

    return true;
  }

  /** 실시간 Web Audio RMS 계산 루프 */
  private static startAudioLoop(): void {
    if (!this.analyserNode || !this.isMonitoring) return;

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

    const checkAudio = () => {
      if (!this.isMonitoring || !this.analyserNode) return;

      this.analyserNode.getByteTimeDomainData(dataArray);

      // RMS 계산
      let sumSquares = 0;
      for (const val of dataArray) {
        const normalized = (val - 128) / 128; // -1.0 ~ 1.0
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);

      // 모바일 주머니 속 기준 보정 dB (배경 40dB ~ 강한 짖음 95dB로 선형 매핑)
      const approxDb = Math.min(100, Math.max(35, Math.round(40 + rms * 150)));

      this.processDecibel(approxDb);

      this.animationFrameId = window.requestAnimationFrame(checkAudio);
    };

    this.animationFrameId = window.requestAnimationFrame(checkAudio);
  }

  /**
   * 데시벨 수치를 입력받아 임계치 초과 여부 판정 및 자동 음소거/복구 트리거
   */
  static processDecibel(db: number): void {
    const soundSettings = TTSNavigationService.getSettings();
    const isSmartMuteOn = soundSettings.smartBarkMuteEnabled ?? DEFAULT_SOUND_SETTINGS.smartBarkMuteEnabled ?? true;
    const thresholdDb = soundSettings.barkNoiseThresholdDb ?? DEFAULT_SOUND_SETTINGS.barkNoiseThresholdDb ?? 73;
    const cooldownDuration = soundSettings.noiseCooldownSec ?? DEFAULT_SOUND_SETTINGS.noiseCooldownSec ?? 3;

    this.currentNoiseDb = db;

    if (!isSmartMuteOn) {
      if (this.isAutoMuted) {
        this.clearAutoMute();
      }
      this.notifyListeners();
      return;
    }

    // 1. 임계치 이상의 돌발 소음(개 짖음) 발생
    if (db >= thresholdDb) {
      this.cooldownRemainingSec = cooldownDuration;

      if (!this.isAutoMuted) {
        this.isAutoMuted = true;
        TTSNavigationService.setBarkMuted(true);
      }

      // 기존 쿨다운 타이머가 있다면 리셋
      if (this.cooldownTimer) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
      }

      this.notifyListeners();
    } else if (this.isAutoMuted && !this.cooldownTimer) {
      // 2. 소음이 임계치 미만으로 잦아듦 (쿨다운 카운트다운 시작)
      this.cooldownTimer = setInterval(() => {
        this.cooldownRemainingSec -= 0.5;

        if (this.cooldownRemainingSec <= 0) {
          this.clearAutoMute();
        } else {
          this.notifyListeners();
        }
      }, 500);
    }

    this.notifyListeners();
  }

  /** 자동 음소거 해제 및 안내 복구 */
  private static clearAutoMute(): void {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    this.isAutoMuted = false;
    this.cooldownRemainingSec = 0;
    TTSNavigationService.setBarkMuted(false);
    this.notifyListeners();
  }

  /** 테스트 및 시연용 돌발 소음 데시벨 강제 주입 */
  static simulateNoise(db: number): void {
    this.processDecibel(db);
    // 짖음 순간 후 주변 소음이 잦아드는 시나리오를 자동 연계하여 3초 쿨다운 타이머 작동
    setTimeout(() => {
      this.processDecibel(45);
    }, 150);
  }

  /** 모니터링 중단 및 리소스 해제 */
  static stopMonitoring(): void {
    this.isMonitoring = false;

    if (this.animationFrameId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.analyserNode = null;
    this.clearAutoMute();
  }

  /** 상태 구독 리스너 등록 */
  static subscribe(listener: NoiseListener): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // 격리
      }
    }
  }

  /** 테스트 전용 초기화 */
  static resetForTesting(): void {
    this.stopMonitoring();
    this.currentNoiseDb = 45;
    this.cooldownRemainingSec = 0;
    this.isAutoMuted = false;
    this.listeners = [];
  }
}
