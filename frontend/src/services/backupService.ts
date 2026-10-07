/**
 * [편안하개 - PetWalk]
 * 프로필 JSON 로컬 백업 & 복원 엔진 (US-A2)
 * 
 * Local-First 원칙:
 * - 클라우드 DB가 아닌 기기 로컬 파일로 프로필 내보내기/가져오기 지원
 * - 브라우저(Web 데모) 및 모바일(React Native) 환경 모두 호환
 */

import { DogProfile } from '../types/dogProfile';
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
   * 프로필 JSON 데이터 생성
   */
  static async exportProfileToJson(profile: DogProfile): Promise<string> {
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
  static async downloadProfileJsonFile(profile: DogProfile): Promise<boolean> {
    try {
      const jsonStr = await this.exportProfileToJson(profile);
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `편안하개_프로필_${profile.name}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[BackupService] 파일 다운로드 실패:', error);
      return false;
    }
  }

  /**
   * JSON 문자열 파싱 및 프로필 검증 복원
   */
  static parseAndValidateBackup(jsonString: string): DogProfile | null {
    try {
      const parsed = JSON.parse(jsonString) as Partial<BackupPayload> & Partial<DogProfile>;

      // 백업 포맷(BackupPayload) 또는 순수 DogProfile 모두 호환
      const profileCandidate: any = parsed.profile ? parsed.profile : parsed;

      if (!profileCandidate.name || typeof profileCandidate.weightKg !== 'number') {
        throw new Error('필수 프로필 필드(name, weightKg) 누락');
      }

      const validProfile: DogProfile = {
        id: profileCandidate.id || `dog_${Date.now()}`,
        name: String(profileCandidate.name),
        breed: String(profileCandidate.breed || '믹스견'),
        ageYears: Number(profileCandidate.ageYears || 1),
        weightKg: Number(profileCandidate.weightKg || 5.0),
        jointCareLevel: (profileCandidate.jointCareLevel ?? 0) as 0 | 1 | 2,
        speedKmH: Number(profileCandidate.speedKmH || 2.8),
        photoUri: profileCandidate.photoUri,
        createdAt: profileCandidate.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return validProfile;
    } catch (error) {
      console.warn('[BackupService] JSON 백업 파싱 실패:', error);
      return null;
    }
  }

  /**
   * JSON 파일 문자열을 로컬 스토리지에 즉시 복원 저장
   */
  static async restoreFromJsonString(jsonString: string): Promise<DogProfile | null> {
    const profile = this.parseAndValidateBackup(jsonString);
    if (!profile) return null;

    const saved = await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, profile);
    return saved ? profile : null;
  }
}
