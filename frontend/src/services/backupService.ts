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
import { STORAGE_KEYS } from '../types/storage';

export interface BackupPayload {
  version: '1.0';
  exportedAt: string;
  service: '편안하개 (PetWalk)';
  profile: DogProfile;
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
  return num === 1 || num === 2 ? (num as JointCareLevel) : 0;
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

