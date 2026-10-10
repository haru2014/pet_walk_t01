/**
 * [편안하개 - PetWalk]
 * expo-speech 기반 시선 해방(Eyes-Free) 핸즈프리 음성 안내 엔진 (US-C2, Phase 4)
 */

import * as Speech from 'expo-speech';

export class TTSNavigationService {
  private static isSpeaking = false;

  /**
   * 한국어 음성으로 길안내 및 위험 경고 브리핑을 발화한다.
   * @param message 발화할 안내 문구
   */
  static speak(message: string): void {
    try {
      void Speech.stop().catch(() => {});
      Speech.speak(message, {
        language: 'ko-KR',
        pitch: 1.05,
        rate: 0.95,
        onStart: () => {
          this.isSpeaking = true;
        },
        onDone: () => {
          this.isSpeaking = false;
        },
        onError: (err) => {
          console.warn('[TTSNavigationService] 발화 오류:', err);
          this.isSpeaking = false;
        },
      });
    } catch (e) {
      console.warn('[TTSNavigationService] TTS 미지원 환경:', e);
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
}
