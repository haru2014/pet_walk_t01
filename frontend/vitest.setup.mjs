import Module from 'node:module';
import { vi } from 'vitest';

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
