import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ImagePicker from 'expo-image-picker';
import { PhotoPickerService, DOG_AVATAR_PRESETS } from './photoPickerService';

vi.mock('expo-image-picker', () => ({
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
}));

describe('PhotoPickerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DOG_AVATAR_PRESETS', () => {
    it('반려견 대표 캐릭터 아바타 프리셋 목록을 제공해야 한다', () => {
      expect(DOG_AVATAR_PRESETS.length).toBeGreaterThanOrEqual(5);
      const golden = DOG_AVATAR_PRESETS.find((p) => p.id === 'golden');
      expect(golden).toBeDefined();
      expect(golden?.name).toBe('골든리트리버');
    });
  });

  describe('pickFromGallery', () => {
    it('갤러리 권한이 거부된 경우 canceled: true를 반환해야 한다', () => {
      vi.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({
        granted: false,
        status: ImagePicker.PermissionStatus.DENIED,
        canAskAgain: true,
        expires: 'never',
      });

      return PhotoPickerService.pickFromGallery().then((res) => {
        expect(res.canceled).toBe(true);
        expect(res.uri).toBeUndefined();
      });
    });

    it('갤러리에서 사진을 선택하면 해당 이미지 URI를 반환해야 한다', () => {
      vi.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({
        granted: true,
        status: ImagePicker.PermissionStatus.GRANTED,
        canAskAgain: true,
        expires: 'never',
      });
      vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///path/to/my_dog.jpg', width: 400, height: 400 }],
      });

      return PhotoPickerService.pickFromGallery().then((res) => {
        expect(res.canceled).toBe(false);
        expect(res.uri).toBe('file:///path/to/my_dog.jpg');
      });
    });

    it('사용자가 선택을 취소한 경우 canceled: true를 반환해야 한다', () => {
      vi.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({
        granted: true,
        status: ImagePicker.PermissionStatus.GRANTED,
        canAskAgain: true,
        expires: 'never',
      });
      vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: true,
        assets: null,
      });

      return PhotoPickerService.pickFromGallery().then((res) => {
        expect(res.canceled).toBe(true);
        expect(res.uri).toBeUndefined();
      });
    });
  });

  describe('captureFromCamera', () => {
    it('카메라 권한이 허용되고 촬영된 경우 이미지 URI를 반환해야 한다', () => {
      vi.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValueOnce({
        granted: true,
        status: ImagePicker.PermissionStatus.GRANTED,
        canAskAgain: true,
        expires: 'never',
      });
      vi.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///path/to/camera_shot.jpg', width: 400, height: 400 }],
      });

      return PhotoPickerService.captureFromCamera().then((res) => {
        expect(res.canceled).toBe(false);
        expect(res.uri).toBe('file:///path/to/camera_shot.jpg');
      });
    });
  });
});
