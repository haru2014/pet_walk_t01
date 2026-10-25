/**
 * [편안하개 - PetWalk]
 * US-18 산책 중 한 손 원터치 배변/소변 마킹 및 로깅 단위 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalStorageService } from './storage';
import { WalkRecord, PoopEvent } from '../types/storage';

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
    getAllKeys: vi.fn(async () => Array.from(memoryStore.keys())),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const k of keys) {
        memoryStore.delete(k);
      }
    }),
  },
}));

describe('US-18 한 손 원터치 배변 마킹 및 영구 저장', () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it('배변 및 소변 이벤트 생성 시 타입, 타임스탬프, 좌표 정보가 정상 바인딩된다', () => {
    const poopEvent: PoopEvent = {
      id: `poop_${Date.now()}`,
      timestamp: Date.now(),
      type: 'poop',
      lat: 37.544,
      lon: 127.038,
    };

    const peeEvent: PoopEvent = {
      id: `pee_${Date.now()}`,
      timestamp: Date.now(),
      type: 'pee',
      lat: 37.545,
      lon: 127.039,
    };

    expect(poopEvent.type).toBe('poop');
    expect(poopEvent.lat).toBe(37.544);
    expect(peeEvent.type).toBe('pee');
    expect(peeEvent.lon).toBe(127.039);
  });

  it('산책 완주 시 배변 이벤트 목록과 총 횟수가 WalkRecord에 안전하게 영구 저장된다', async () => {
    const mockEvents: PoopEvent[] = [
      { id: 'p1', timestamp: Date.now() - 600000, type: 'poop', lat: 37.544, lon: 127.038 },
      { id: 'p2', timestamp: Date.now() - 300000, type: 'pee', lat: 37.545, lon: 127.039 },
      { id: 'p3', timestamp: Date.now() - 60000, type: 'poop', lat: 37.546, lon: 127.040 },
    ];

    const testRecord: WalkRecord = {
      id: 'walk_test_poop_1',
      dogId: 'dog_choco',
      startedAt: new Date(Date.now() - 1800000).toISOString(),
      completedAt: new Date().toISOString(),
      durationMinutes: 30,
      totalDistanceKm: 1.5,
      averageSpeedKmH: 3.0,
      safeSurfaceRatio: 0.85,
      gpsTrack: [],
      poopCount: mockEvents.length,
      poopEvents: mockEvents,
    };

    await LocalStorageService.appendWalkRecord(testRecord);

    const history = await LocalStorageService.getWalkHistory();
    expect(history).toHaveLength(1);
    expect(history[0].poopCount).toBe(3);
    expect(history[0].poopEvents).toHaveLength(3);
    expect(history[0].poopEvents?.[0].type).toBe('poop');
    expect(history[0].poopEvents?.[1].type).toBe('pee');
  });
});
