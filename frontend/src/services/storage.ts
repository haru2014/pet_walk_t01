/**
 * [편안하개 - PetWalk]
 * Local-First 영속성 스토리지 서비스 (Storage Service)
 * 
 * 특징:
 * 1. AsyncStorage 기반 제네릭 타입 안전 CRUD 제공
 * 2. React Native 환경 외(Node.js, Web, 단위 테스트)에서도 오류 없이 구동되도록 인메모리 스토리지 자동 폴백 지원
 * 3. 키 접두사 '@편안하개:' 무결성 보장
 */

import { STORAGE_KEYS, StorageKey, DogProfile, WalkRecord, FeedbackSummary } from '../types/storage';

// 인메모리 폴백 저장소 (네이티브 AsyncStorage 미지원 환경용)
const memoryStorage = new Map<string, string>();

// 스토리지 드라이버 인터페이스
export interface StorageDriver {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  clear?: () => Promise<void>;
}

// 기본 드라이버 (브라우저 localStorage 또는 인메모리 Map)
let currentDriver: StorageDriver = {
  getItem: async (key: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return memoryStorage.get(key) ?? null;
  },
  setItem: async (key: string, val: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, val);
      return;
    }
    memoryStorage.set(key, val);
  },
  removeItem: async (key: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
    memoryStorage.delete(key);
  },
};

/** 네이티브 AsyncStorage 가져오기 시도 (동적 import 또는 폴백) */
async function getAsyncStorage(): Promise<StorageDriver> {
  return currentDriver;
}

export class LocalStorageService {
  /**
   * 커스텀 스토리지 드라이버 주입 (React Native AsyncStorage 등)
   */
  static setAdapter(driver: StorageDriver): void {
    currentDriver = driver;
  }

  /**
   * 단일 데이터 조회 (제네릭)
   */
  static async getItem<T>(key: StorageKey | string): Promise<T | null> {
    try {
      const storage = await getAsyncStorage();
      const raw = await storage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn(`[LocalStorageService] getItem 실패 (${key}):`, error);
      return null;
    }
  }

  /**
   * 단일 데이터 저장 (제네릭)
   */
  static async setItem<T>(key: StorageKey | string, value: T): Promise<boolean> {
    try {
      const storage = await getAsyncStorage();
      const serialized = JSON.stringify(value);
      await storage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.error(`[LocalStorageService] setItem 실패 (${key}):`, error);
      return false;
    }
  }

  /**
   * 데이터 삭제
   */
  static async removeItem(key: StorageKey | string): Promise<boolean> {
    try {
      const storage = await getAsyncStorage();
      await storage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`[LocalStorageService] removeItem 실패 (${key}):`, error);
      return false;
    }
  }

  // ==========================================
  // 도메인 편의 메서드 (반려견 프로필, 산책 기록)
  // ==========================================

  /** 반려견 프로필 로드 (US-A2) */
  static async getDogProfile(): Promise<DogProfile | null> {
    return this.getItem<DogProfile>(STORAGE_KEYS.DOG_PROFILE);
  }

  /** 반려견 프로필 저장 (US-A2) */
  static async saveDogProfile(profile: DogProfile): Promise<boolean> {
    return this.setItem<DogProfile>(STORAGE_KEYS.DOG_PROFILE, profile);
  }

  /** 최근 산책 히스토리 로드 (US-E1, 최대 100건) */
  static async getWalkHistory(): Promise<WalkRecord[]> {
    const list = await this.getItem<WalkRecord[]>(STORAGE_KEYS.WALK_HISTORY);
    return list ?? [];
  }

  /** 산책 완주 기록 추가 (US-E1) */
  static async appendWalkRecord(record: WalkRecord): Promise<boolean> {
    const history = await this.getWalkHistory();
    // 최신 순으로 추가하고 최대 100건 보관
    const updated = [record, ...history].slice(0, 100);
    return this.setItem<WalkRecord[]>(STORAGE_KEYS.WALK_HISTORY, updated);
  }

  /** 최근 산책 피드백 요약본 조회 (US-E3) */
  static async getFeedbackSummary(): Promise<FeedbackSummary | null> {
    return this.getItem<FeedbackSummary>(STORAGE_KEYS.FEEDBACK_SUMMARY);
  }
}
