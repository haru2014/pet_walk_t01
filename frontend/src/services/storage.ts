/**
 * [편안하개 - PetWalk]
 * React Native AsyncStorage 기반 Local-First 스토리지 서비스 (US-A2, Phase 1)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, STORAGE_PREFIX, WalkRecord, WalkFeedback } from '../types/storage';

export class LocalStorageService {
  static async getItem<T>(key: string): Promise<T | null> {
    try {
      const data = await AsyncStorage.getItem(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (e) {
      console.warn(`[LocalStorageService] getItem 실패: ${key}`, e);
      return null;
    }
  }

  static async setItem<T>(key: string, value: T): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`[LocalStorageService] setItem 실패: ${key}`, e);
      return false;
    }
  }

  static async removeItem(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error(`[LocalStorageService] removeItem 실패: ${key}`, e);
      return false;
    }
  }

  /**
   * 편안하개 네임스페이스(@편안하개:*)의 모든 로컬 데이터 일괄 영구 삭제 (US-23)
   */
  static async clearAll(): Promise<boolean> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const targetKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
      if (targetKeys.length > 0) {
        await AsyncStorage.multiRemove(targetKeys);
      }
      return true;
    } catch (e) {
      console.error('[LocalStorageService] clearAll 실패:', e);
      return false;
    }
  }

  static async getWalkHistory(): Promise<WalkRecord[]> {
    const list = await this.getItem<WalkRecord[]>(STORAGE_KEYS.WALK_HISTORY);
    return list ?? [];
  }

  static async appendWalkRecord(record: WalkRecord): Promise<boolean> {
    const history = await this.getWalkHistory();
    history.unshift(record);
    const trimmed = history.slice(0, 100);
    return this.setItem(STORAGE_KEYS.WALK_HISTORY, trimmed);
  }

  static async updateWalkFeedback(
    recordId: string,
    feedback: WalkFeedback
  ): Promise<boolean> {
    const history = await this.getWalkHistory();
    const updated = history.map((rec) =>
      rec.id === recordId ? { ...rec, feedback } : rec
    );
    return this.setItem(STORAGE_KEYS.WALK_HISTORY, updated);
  }

  static async updateWalkRecordRemoteId(recordId: string, remoteId: string): Promise<boolean> {
    const history = await this.getWalkHistory();
    const updated = history.map((record) =>
      record.id === recordId ? { ...record, remoteId } : record
    );
    return this.setItem(STORAGE_KEYS.WALK_HISTORY, updated);
  }
}

