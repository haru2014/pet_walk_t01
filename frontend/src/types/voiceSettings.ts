/**
 * [편안하개 - PetWalk]
 * AI 음성 가이드 보이스 프로필 및 사운드 설정 데이터 모델 (US-C2, #37)
 */

export type VoiceProfileId =
  | 'calm_female'
  | 'bright_female'
  | 'calm_male'
  | 'friendly_male';

export interface VoiceProfile {
  readonly id: VoiceProfileId;
  readonly label: string;
  readonly tone: string;
  readonly gender: 'female' | 'male';
  readonly pitch: number; // 0.5 ~ 2.0 (기본 1.0)
  readonly rate: number;  // 0.5 ~ 2.0 (기본 0.95)
  readonly description: string;
  readonly sampleMessage: string;
}

export interface SoundSettings {
  profileId: VoiceProfileId;
  volume: number; // 0.0 ~ 1.0 (기본 0.8)
  isMuted: boolean; // 돌발 상황 수동 퀵 음소거 여부
  smartBarkMuteEnabled?: boolean; // 짖음/돌발소음 감지 자동 음소거 활성화 여부 (기본 true)
  barkNoiseThresholdDb?: number;  // 짖음 감지 임계치 (기본 73 dB)
  noiseCooldownSec?: number;      // 소음 잦아든 후 복구 대기 시간 (기본 3초)
}

export interface BarkMuteState {
  isAutoMuted: boolean;           // 현재 소음으로 인해 자동 일시 차단 중인지 여부
  currentNoiseDb: number;         // 현재 측정 데시벨
  cooldownRemainingSec: number;   // 자동 복구까지 남은 시간 (초)
}

export const VOICE_PROFILES: readonly VoiceProfile[] = [
  {
    id: 'calm_female',
    label: '차분한 안심 톤',
    tone: '차분함',
    gender: 'female',
    pitch: 1.0,
    rate: 0.95,
    description: '편안하고 부드러운 목소리로 산책길을 안내해요',
    sampleMessage: '앞쪽에 완만한 잔디 산책로가 있어요. 편안하게 걸어가세요.',
  },
  {
    id: 'bright_female',
    label: '밝고 활기찬 톤',
    tone: '밝음',
    gender: 'female',
    pitch: 1.15,
    rate: 1.0,
    description: '활기차고 명랑한 목소리로 신나는 산책을 도와드려요',
    sampleMessage: '오늘 날씨가 참 좋아요! 신나게 산책을 시작해볼까요?',
  },
  {
    id: 'calm_male',
    label: '안정적인 남성 톤',
    tone: '안정적',
    gender: 'male',
    pitch: 0.50,
    rate: 0.92,
    description: '낮고 신뢰감 있는 목소리로 안전하게 코칭해요',
    sampleMessage: '30미터 앞 우회전입니다. 차가 적은 조용한 길로 안내할게요.',
  },
  {
    id: 'friendly_male',
    label: '친근한 다정 톤',
    tone: '친근함',
    gender: 'male',
    pitch: 0.58,
    rate: 0.95,
    description: '친구처럼 다정하고 자연스러운 목소리로 동행해요',
    sampleMessage: '주변에 쉴 수 있는 벤치가 있어요. 잠시 물 한 모금 마시고 갈까요?',
  },
];

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  profileId: 'calm_female',
  volume: 0.8,
  isMuted: false,
  smartBarkMuteEnabled: true,
  barkNoiseThresholdDb: 73,
  noiseCooldownSec: 3,
};
