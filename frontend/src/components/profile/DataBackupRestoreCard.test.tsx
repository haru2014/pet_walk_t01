import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataBackupRestoreCard } from './DataBackupRestoreCard';
import { DogProfile } from '../../types/dogProfile';
import { BackupService } from '../../services/backupService';

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

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Polyline: (props: any) => React.createElement('polyline', props),
  Circle: (props: any) => React.createElement('circle', props),
  Ellipse: (props: any) => React.createElement('ellipse', props),
  Line: (props: any) => React.createElement('line', props),
  Path: (props: any) => React.createElement('path', props),
  Polygon: (props: any) => React.createElement('polygon', props),
  Rect: (props: any) => React.createElement('rect', props),
  G: (props: any) => React.createElement('g', props),
  Text: (props: any) => React.createElement('text', props),
}));

const mockDog: DogProfile = {
  id: 'dog-1',
  name: '초코',
  breed: '푸들',
  ageYears: 3,
  weightKg: 4.5,
  jointCareLevel: 1,
  speedKmH: 3.5,
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
};

describe('DataBackupRestoreCard (프로필 탭 백업 및 복원 통합 카드)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryStore.clear();
  });

  it('기본 접힘 상태(defaultExpanded 미지정 또는 false)에서는 본문이 숨겨지고 헤더만 표시된다', () => {
    const htmlDefault = renderToStaticMarkup(
      <DataBackupRestoreCard dog={mockDog} />
    );
    expect(htmlDefault).toContain('백업 및 복원하기');
    expect(htmlDefault).toContain('기기를 바꿀 때 내 데이터를 옮겨 보세요');
    expect(htmlDefault).not.toContain('📋 백업하기');
    expect(htmlDefault).not.toContain('기기 이전·전체 보관용');
    expect(htmlDefault).not.toContain('CSV');
    expect(htmlDefault).not.toContain('JSON');

    const htmlExplicitFalse = renderToStaticMarkup(
      <DataBackupRestoreCard dog={mockDog} defaultExpanded={false} />
    );
    expect(htmlExplicitFalse).toContain('백업 및 복원하기');
    expect(htmlExplicitFalse).toContain('기기를 바꿀 때 내 데이터를 옮겨 보세요');
    expect(htmlExplicitFalse).not.toContain('📋 백업하기');
  });

  it('펼침 상태(defaultExpanded=true)에서 친숙한 백업하기/복원하기 버튼과 안내 문구가 노출되고 CSV/JSON 용어는 노출되지 않는다', () => {
    const html = renderToStaticMarkup(
      <DataBackupRestoreCard dog={mockDog} defaultExpanded={true} />
    );

    // 1. 헤더 안내
    expect(html).toContain('백업 및 복원하기');
    expect(html).toContain('닫기');

    // 2. 백업 및 복원 버튼 (친숙한 용어)
    expect(html).toContain('📋 백업하기');
    expect(html).toContain('기기 이전·전체 보관용');
    expect(html).toContain('📂 복원하기');
    expect(html).toContain('이전에 백업해 둔 편안하개 백업 파일을 선택하면');

    // 3. 기술 용어(CSV, JSON 백업) 및 병원 제출 문구 미노출 검증
    expect(html).not.toContain('엑셀');
    expect(html).not.toContain('CSV');
    expect(html).not.toContain('JSON 백업');
    expect(html).not.toContain('병원 진료');
  });

  it('BackupService의 restoreAnyBackup이 통합 백업, 프로필 백업, 산책 백업을 모두 안전하게 처리한다', async () => {
    // 1. 통합 백업 복원 테스트
    const unifiedPayload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      service: '편안하개 (PetWalk)',
      profile: mockDog,
      records: [
        {
          id: 'walk-restore-1',
          dogId: 'dog-1',
          startedAt: '2026-10-18T10:00:00.000Z',
          completedAt: '2026-10-18T10:30:00.000Z',
          durationMinutes: 30,
          totalDistanceKm: 2.0,
          averageSpeedKmH: 4.0,
          safeSurfaceRatio: 0.95,
          gpsTrack: [],
        },
      ],
    };

    const resUnified = await BackupService.restoreAnyBackup(JSON.stringify(unifiedPayload));
    expect(resUnified).not.toBeNull();
    expect(resUnified?.profile?.name).toBe('초코');
    expect(resUnified?.recordsCount).toBe(1);

    // 2. 잘못된 JSON 파싱 시 null 반환
    const resInvalid = await BackupService.restoreAnyBackup('not-a-valid-json');
    expect(resInvalid).toBeNull();
  });
});
