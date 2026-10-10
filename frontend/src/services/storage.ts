/**
 * [편안하개 - PetWalk]
 * React Native AsyncStorage 기반 Local-First 스토리지 서비스 (US-A2, Phase 1)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, WalkRecord } from '../types/storage';

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

  static async getWalkHistory(): Promise<WalkRecord[]> {
    const list = await this.getItem<WalkRecord[]>(STORAGE_KEYS.WALK_HISTORY);
    return list ?? [];
  }

  static async appendWalkRecord(record: WalkRecord): Promise<boolean> {
    const history = await this.getWalkHistory();
    history.unshift(record);
    const trimmed = history.slice(0, 100);
    return await this.setItem(STORAGE_KEYS.WALK_HISTORY, trimmed);
  }
}
