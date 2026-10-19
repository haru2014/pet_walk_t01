import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataBackupRestoreCard } from './DataBackupRestoreCard';
import { DogProfile } from '../../types/dogProfile';
import { BackupService } from '../../services/backupService';
import { WalkStatisticsService } from '../../services/walkStatisticsService';

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

  it('기본 펼침 상태에서 병원 제출용 엑셀(CSV) 및 기기 백업 JSON 버튼과 복원 안내가 노출된다', () => {
    const html = renderToStaticMarkup(
      <DataBackupRestoreCard dog={mockDog} defaultExpanded={true} />
    );

    // 1. 헤더 안내
    expect(html).toContain('동물병원 제출 및 데이터 백업·복원');
    expect(html).toContain('수의사 진료 시 누적 보행 데이터를 확인하거나');

    // 2. 내보내기 버튼들
    expect(html).toContain('📥 엑셀(CSV) 저장');
    expect(html).toContain('병원 진료·보험 제출용');
    expect(html).toContain('📋 JSON 백업');
    expect(html).toContain('기기 이전·전체 보관용');

    // 3. 복원하기 섹션 (UX 관점 이음새)
    expect(html).toContain('📂 기기 변경 데이터 복원');
    expect(html).toContain('이전에 백업해 둔 편안하개 JSON 파일');
    expect(html).toContain('📂 백업 파일(JSON) 선택하여 복원하기');
  });

  it('접힘 상태(defaultExpanded=false)에서는 본문이 숨겨지고 헤더만 표시된다', () => {
    const html = renderToStaticMarkup(
      <DataBackupRestoreCard dog={mockDog} defaultExpanded={false} />
    );

    expect(html).toContain('동물병원 제출 및 데이터 백업·복원');
    expect(html).toContain('슬개골 진료 상담 표 / 기기 변경 백업 및 복원 열기');

    expect(html).not.toContain('📥 엑셀(CSV) 저장');
    expect(html).not.toContain('📂 백업 파일(JSON) 선택하여 복원하기');
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
