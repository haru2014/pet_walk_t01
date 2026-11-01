import Module from 'node:module';
import { vi } from 'vitest';

// 테스트는 기본적으로 Supabase 클라우드 없이(로컬 모드) 돈다. 앱은 환경변수가 없으면 기본 Supabase 주소를 쓰므로(supabaseService.ts),
// 테스트에서는 빈 값으로 명시해 예전과 같은 동작을 유지한다. 클라우드가 필요한 테스트는 vi.stubEnv 로 값을 넣는다.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= '';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= '';
process.env.EXPO_PUBLIC_SUPABASE_KEY ??= '';

vi.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: async () => ({ granted: true }),
  useAudioRecorder: () => ({
    isRecording: false,
    uri: 'file:///mock/walk-command.m4a',
    prepareToRecordAsync: async () => {},
    record() {},
    stop: async () => {},
  }),
  createAudioPlayer: vi.fn(() => ({
    volume: 1,
    play() {},
    addListener: () => ({ remove() {} }),
    setActiveForLockScreen() {},
    clearLockScreenControls() {},
    remove() {},
  })),
  setAudioModeAsync: async () => {},
}));

vi.mock('expo-file-system', () => ({
  File: class {
    uri = 'file:///mock/petwalk-tts.wav';
    constructor() {}
    create() {}
    async write() {}
    delete() {}
  },
  Paths: { cache: 'file:///mock/cache' },
}));

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(id)) {
    return 'mock-image.png';
  }
  return originalRequire.apply(this, arguments);
};
