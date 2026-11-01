/**
 * [편안하개 - PetWalk]
 * 반려견 대표 사진 선택 및 갤러리/카메라 연동 서비스 (photoPickerService.ts)
 *
 * - Expo ImagePicker (갤러리 앨범 및 카메라) 연동
 * - 반려견 캐릭터 프리셋 아바타 지원 (테스트 및 빠른 선택용)
 * - 권한 체크 및 에러 복구 폴백
 */

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export interface PickPhotoResult {
  canceled: boolean;
  uri?: string;
  isPreset?: boolean;
}

export interface DogAvatarPreset {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export const DOG_AVATAR_PRESETS: DogAvatarPreset[] = [
  { id: 'golden', name: '골든리트리버', emoji: '🦮', color: '#FEF3C7' },
  { id: 'maltese', name: '말티즈/비숑', emoji: '🐕', color: '#F3F4F6' },
  { id: 'poodle', name: '푸들', emoji: '🐩', color: '#FEE2E2' },
  { id: 'shiba', name: '시바/진돗개', emoji: '🐕‍🦺', color: '#FFEDD5' },
  { id: 'corgi', name: '웰시코기', emoji: '🐶', color: '#ECFDF5' },
  { id: 'mixed', name: '귀여운 믹스견', emoji: '🐾', color: '#E0E7FF' },
];

export const PhotoPickerService = {
  /**
   * 기기 갤러리(사진 앨범)에서 사진 선택
   */
  async pickFromGallery(): Promise<PickPhotoResult> {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          '사진 보관함 권한 필요',
          '반려견 대표 사진을 등록하려면 사진 앨범 접근 권한이 필요합니다.'
        );
        return { canceled: true };
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return { canceled: true };
      }

      return {
        canceled: false,
        uri: result.assets[0].uri,
      };
    } catch (err) {
      console.warn('[PhotoPickerService] 갤러리 사진 선택 실패:', err);
      Alert.alert('사진 불러오기 실패', '기기 갤러리를 여는 중 오류가 발생했습니다.');
      return { canceled: true };
    }
  },

  /**
   * 카메라로 즉시 촬영하여 등록
   */
  async captureFromCamera(): Promise<PickPhotoResult> {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          '카메라 권한 필요',
          '반려견 사진을 직접 촬영하려면 카메라 접근 권한이 필요합니다.'
        );
        return { canceled: true };
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return { canceled: true };
      }

      return {
        canceled: false,
        uri: result.assets[0].uri,
      };
    } catch (err) {
      console.warn('[PhotoPickerService] 카메라 촬영 실패:', err);
      Alert.alert('카메라 실행 실패', '카메라를 실행하는 중 오류가 발생했습니다.');
      return { canceled: true };
    }
  },
};
