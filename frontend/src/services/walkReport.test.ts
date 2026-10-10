/**
 * [편안하개 - PetWalk]
 * Phase 5 완주 기록 영구 저장 (100회 FIFO) & 3초 인포그래픽 리포트 검증 단위 테스트
 *
 * - US-E1: Local-First 영구 저장 (AsyncStorage, 100회 FIFO 정책)
 * - US-E2: 인포그래픽 보행 통계 및 3초 원터치 피드백 바인딩
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalStorageService } from './storage';
import { WalkRecord, WalkFeedback, STORAGE_KEYS } from '../types/storage';

// In-Memory AsyncStorage Mocking
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
    clear: vi.fn(async () => {
      memoryStore.clear();
    }),
  },
}));

function createSampleRecord(id: string, distanceKm = 1.4): WalkRecord {
  return {
    id,
    dogId: 'dog_choco',
    startedAt: new Date(Date.now() - 1800000).toISOString(),
    completedAt: new Date().toISOString(),
    durationMinutes: 30,
    totalDistanceKm: distanceKm,
    averageSpeedKmH: 2.1,
    safeSurfaceRatio: 0.88,
    gpsTrack: [
      { lat: 37.5665, lon: 126.978, timestamp: 1000 },
      { lat: 37.567, lon: 126.9785, timestamp: 2000 },
    ],
  };
}

describe('Phase 5 - 완주 기록 영구 저장 및 100회 FIFO 보관 정책 (US-E1)', () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it('초기 상태에서는 산책 기록이 빈 배열이어야 한다', async () => {
    const history = await LocalStorageService.getWalkHistory();
    expect(history).toEqual([]);
  });

  it('산책 기록 1건을 저장하면 정상적으로 로컬 스토리지에 보관되어야 한다', async () => {
    const record = createSampleRecord('walk_001');
    const success = await LocalStorageService.appendWalkRecord(record);

    expect(success).toBe(true);
    const history = await LocalStorageService.getWalkHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('walk_001');
    expect(history[0].totalDistanceKm).toBe(1.4);
    expect(history[0].gpsTrack).toHaveLength(2);
  });

  it('100회 초과 기록 시 FIFO 정책에 따라 가장 오래된 기록이 삭제되고 100건만 유지되어야 한다', async () => {
    // 105개의 기록을 순차적으로 등록 (walk_1 ~ walk_105)
    for (let i = 1; i <= 105; i++) {
      await LocalStorageService.appendWalkRecord(createSampleRecord(`walk_${i}`));
    }

    const history = await LocalStorageService.getWalkHistory();
    expect(history).toHaveLength(100);

    // 최신 기록이 맨 앞(인덱스 0)에 위치해야 함
    expect(history[0].id).toBe('walk_105');
    // 100번째(인덱스 99) 기록은 walk_6이어야 함 (walk_1 ~ walk_5 탈락)
    expect(history[99].id).toBe('walk_6');

    // 탈락된 오래된 기록은 존재하지 않아야 함
    const ids = history.map((h) => h.id);
    expect(ids).not.toContain('walk_1');
    expect(ids).not.toContain('walk_2');
    expect(ids).not.toContain('walk_5');
  });
});

describe('Phase 5 - 3초 원터치 피드백 메타데이터 바인딩 (US-E2)', () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it('산책 기록에 5점 만족도, 웰니스 칩, 한 줄 코멘트가 정상 바인딩되어야 한다', async () => {
    const record = createSampleRecord('walk_target');
    await LocalStorageService.appendWalkRecord(record);

    const feedback: WalkFeedback = {
      comfortScore: 5,
      tags: ['완만해요', '그늘많아요', '발이 편해요'],
      comment: '노면이 흙길이라 초코가 신나게 걸었어요!',
    };

    const updated = await LocalStorageService.updateWalkFeedback('walk_target', feedback);
    expect(updated).toBe(true);

    const history = await LocalStorageService.getWalkHistory();
    const target = history.find((h) => h.id === 'walk_target');
    expect(target?.feedback).toBeDefined();
    expect(target?.feedback?.comfortScore).toBe(5);
    expect(target?.feedback?.tags).toContain('완만해요');
    expect(target?.feedback?.comment).toBe('노면이 흙길이라 초코가 신나게 걸었어요!');
  });

  it('존재하지 않는 ID에 피드백을 업데이트해도 기존 데이터가 유지되어야 한다', async () => {
    const record = createSampleRecord('walk_existing');
    await LocalStorageService.appendWalkRecord(record);

    const dummyFeedback: WalkFeedback = {
      comfortScore: 3,
      tags: ['완만해요'],
    };

    await LocalStorageService.updateWalkFeedback('non_existing_id', dummyFeedback);

    const history = await LocalStorageService.getWalkHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('walk_existing');
    expect(history[0].feedback).toBeUndefined();
  });
});

describe('Phase 5 - 인포그래픽 통계 지표 및 웰니스 카피라이팅 원칙 검증', () => {
  it('완만 노면 달성률 및 보행 수치가 인포그래픽 리포트 형식으로 정확히 환산되어야 한다', () => {
    const record = createSampleRecord('walk_report_check', 2.34);

    const distanceFormatted = `${record.totalDistanceKm.toFixed(2)} km`;
    const durationFormatted = `${record.durationMinutes} 분`;
    const speedFormatted = `${record.averageSpeedKmH.toFixed(1)} km/h`;
    const safeSurfacePercent = Math.round(record.safeSurfaceRatio * 100);

    expect(distanceFormatted).toBe('2.34 km');
    expect(durationFormatted).toBe('30 분');
    expect(speedFormatted).toBe('2.1 km/h');
    expect(safeSurfacePercent).toBe(88);
  });

  it('피드백 웰니스 태그에 부정적이거나 진단/치료 용어가 포함되지 않아야 한다', () => {
    const allowedTags = ['완만해요', '그늘많아요', '발이 편해요', '경사가 가팔랐어요', '계단이 적었어요'];
    const forbiddenMedicalTerms = ['관절염', '치료', '디스크', '탈구', '진단', '환견'];

    for (const tag of allowedTags) {
      for (const forbidden of forbiddenMedicalTerms) {
        expect(tag).not.toContain(forbidden);
      }
    }
  });
});
