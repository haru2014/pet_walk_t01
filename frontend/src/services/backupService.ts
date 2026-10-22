/**
 * [편안하개 - PetWalk]
 * 프로필 JSON 로컬 백업 & 복원 엔진 (US-A2)
 *
 * Local-First 원칙:
 * - 클라우드 DB가 아닌 기기 로컬 파일로 프로필 내보내기/가져오기 지원
 * - 브라우저(Web 데모) 및 모바일(React Native) 환경 모두 호환
 */

import { DogProfile, JointCareLevel } from '../types/dogProfile';
import { LocalStorageService } from './storage';
import { STORAGE_KEYS, WalkRecord } from '../types/storage';

export interface BackupPayload {
  version: '1.0';
  exportedAt: string;
  service: '편안하개 (PetWalk)';
  profile: DogProfile;
  records?: WalkRecord[];
}

export interface RestoreResult {
  readonly profile: DogProfile | null;
  readonly recordsCount: number;
}

export class BackupService {
  /**
   * 프로필 JSON 데이터 생성 (US-A2)
   */
  static exportProfileToJson(profile: DogProfile): string {
    const payload: BackupPayload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      service: '편안하개 (PetWalk)',
      profile,
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * 프로필과 산책 기록을 모두 포함한 통합 백업 JSON 생성
   */
  static exportUnifiedBackupToJson(profile: DogProfile, records: WalkRecord[]): string {
    const payload: BackupPayload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      service: '편안하개 (PetWalk)',
      profile,
      records,
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * 통합 백업 파일을 기기에 저장한다. 웹은 브라우저 다운로드, 모바일은 시스템 공유 시트를 연다.
   */
  static async downloadUnifiedBackupJsonFile(profile: DogProfile, records: WalkRecord[]): Promise<boolean> {
    try {
      const jsonStr = this.exportUnifiedBackupToJson(profile, records);
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        this.downloadJsonInBrowser(jsonStr, this.getUnifiedBackupFilename(profile));
        return true;
      }

      const [{ File, Paths }, Sharing] = await Promise.all([
        import('expo-file-system'),
        import('expo-sharing'),
      ]);
      if (!(await Sharing.isAvailableAsync())) return false;

      const file = new File(Paths.cache, this.getUnifiedBackupFilename(profile));
      if (file.exists) file.delete();
      file.create();
      file.write(jsonStr);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: '편안하개 백업 파일 저장',
        UTI: 'public.json',
      });
      return true;
    } catch (error) {
      console.warn('[BackupService] 통합 백업 파일 다운로드 실패:', error);
      return false;
    }
  }

  /** 시스템 파일 선택기에서 JSON 백업 파일을 선택해 문자열로 읽는다. */
  static async pickBackupJsonFile(): Promise<string | null> {
    try {
      const [DocumentPicker, { File }] = await Promise.all([
        import('expo-document-picker'),
        import('expo-file-system'),
      ]);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'public.json'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return null;
      return await new File(result.assets[0].uri).text();
    } catch (error) {
      console.warn('[BackupService] 백업 파일 열기 실패:', error);
      throw error;
    }
  }

  private static getUnifiedBackupFilename(profile: DogProfile): string {
    const safeName = profile.name.replace(/[\\/:*?"<>|]/g, '_').trim() || '반려견';
    return `편안하개_통합백업_${safeName}_${new Date().toISOString().slice(0, 10)}.json`;
  }

  private static downloadJsonInBrowser(jsonString: string, filename: string): void {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * 브라우저 환경에서 JSON 파일 다운로드 트리거
   */
  static downloadProfileJsonFile(profile: DogProfile): boolean {
    try {
      const jsonStr = this.exportProfileToJson(profile);
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `편안하개_프로필_${profile.name}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return true;
      }
      return false;
    } catch (error) {
      console.warn('[BackupService] 파일 다운로드 실패:', error);
      return false;
    }
  }

  /**
   * JSON 문자열 파싱 및 프로필 검증 복원
   */
  static parseAndValidateBackup(jsonString: string): DogProfile | null {
    try {
      const parsed = JSON.parse(jsonString) as Record<string, unknown>;
      const candidate = extractCandidate(parsed);

      if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
        return null;
      }

      const weight = parseWeight(candidate.weightKg);
      if (weight === null) {
        return null;
      }

      return sanitizeProfile(candidate, weight);
    } catch (error) {
      console.warn('[BackupService] JSON 백업 파싱 실패:', error);
      return null;
    }
  }

  /**
   * JSON 파일 문자열을 로컬 스토리지에 즉시 복원 저장 (US-A2)
   */
  static async restoreFromJsonString(jsonString: string): Promise<DogProfile | null> {
    const profile = this.parseAndValidateBackup(jsonString);
    if (!profile) return null;

    const savedProfiles = await LocalStorageService.getItem<DogProfile[]>(STORAGE_KEYS.DOG_PROFILES);
    if (savedProfiles !== null && Array.isArray(savedProfiles)) {
      const updatedProfiles = savedProfiles.some((dog) => dog.id === profile.id)
        ? savedProfiles.map((dog) => dog.id === profile.id ? profile : dog)
        : [profile, ...savedProfiles];
      const profilesSaved = await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILES, updatedProfiles);
      if (!profilesSaved) return null;
    }

    const saved = await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, profile);
    return saved ? profile : null;
  }

  /**
   * 모든 유형의 백업 JSON(프로필 단독, 산책기록 단독, 통합 백업)을 판별하여 로컬 스토리지에 복원
   */
  static async restoreAnyBackup(jsonString: string): Promise<RestoreResult | null> {
    try {
      const parsed = JSON.parse(jsonString) as Record<string, unknown>;
      let restoredProfile: DogProfile | null = null;
      let restoredRecordsCount = 0;

      // 1. 프로필 복원 시도
      restoredProfile = await this.restoreFromJsonString(jsonString);

      // 2. 산책 기록 복원 시도
      let candidateRecords: unknown = null;
      if (Array.isArray(parsed.records)) {
        candidateRecords = parsed.records;
      } else if (Array.isArray(parsed)) {
        candidateRecords = parsed;
      }

      if (Array.isArray(candidateRecords) && candidateRecords.length > 0) {
        const validRecords: WalkRecord[] = candidateRecords.filter((r: any) =>
          r && typeof r === 'object' && typeof r.id === 'string' && typeof r.totalDistanceKm === 'number'
        );

        if (validRecords.length > 0) {
          const existingHistory = await LocalStorageService.getWalkHistory();
          const existingIds = new Set(existingHistory.map((h) => h.id));
          const merged = [...validRecords.filter((r) => !existingIds.has(r.id)), ...existingHistory];
          await LocalStorageService.setItem(STORAGE_KEYS.WALK_HISTORY, merged);
          restoredRecordsCount = validRecords.length;
        }
      }

      if (!restoredProfile && restoredRecordsCount === 0) {
        return null;
      }

      return { profile: restoredProfile, recordsCount: restoredRecordsCount };
    } catch (error) {
      console.warn('[BackupService] 백업 데이터 복원 실패:', error);
      return null;
    }
  }
}

function extractCandidate(parsed: Record<string, unknown>): Record<string, unknown> {
  if (parsed.profile && typeof parsed.profile === 'object') {
    return parsed.profile as Record<string, unknown>;
  }
  return parsed;
}

function parseWeight(val: unknown): number | null {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function parseJointCare(val: unknown): JointCareLevel {
  const num = Number(val);
  return num === 1 || num === 2 || num === 3 ? (num as JointCareLevel) : 0;
}

function sanitizeProfile(candidate: Record<string, unknown>, weight: number): DogProfile {
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const breed = typeof candidate.breed === 'string' && candidate.breed.trim() ? candidate.breed.trim() : '믹스견';
  const age = Number(candidate.ageYears) || 1;
  const speed = typeof candidate.speedKmH === 'number' && candidate.speedKmH > 0 ? candidate.speedKmH : 2.8;

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `dog_${Date.now()}`,
    name,
    breed,
    ageYears: age,
    weightKg: weight,
    jointCareLevel: parseJointCare(candidate.jointCareLevel),
    speedKmH: speed,
    preference: typeof candidate.preference === 'string' ? candidate.preference : undefined,
    photoUri: typeof candidate.photoUri === 'string' ? candidate.photoUri : undefined,
    avatarUrl: typeof candidate.avatarUrl === 'string' ? candidate.avatarUrl : undefined,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

