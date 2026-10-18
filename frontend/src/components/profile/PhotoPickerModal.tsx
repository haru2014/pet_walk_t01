/**
 * [편안하개 - PetWalk]
 * 대표 사진 선택 및 아바타 선택 바텀 모달 (PhotoPickerModal.tsx)
 *
 * - 📸 갤러리 앨범에서 사진 선택
 * - 📷 카메라로 즉시 촬영
 * - 🐾 인기 견종 프리셋 캐릭터 선택
 * - 🗑️ 기본 사진으로 복원
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { PhotoPickerService, DOG_AVATAR_PRESETS } from '../../services/photoPickerService';

export interface PhotoPickerModalProps {
  visible: boolean;
  currentPhotoUri?: string;
  onClose: () => void;
  onSelectPhoto: (photoUri?: string) => void;
}

export const PhotoPickerModal: React.FC<PhotoPickerModalProps> = ({
  visible,
  currentPhotoUri,
  onClose,
  onSelectPhoto,
}) => {
  const [isProcessing, setIsProcessing] = React.useState(false);

  const handleClose = () => {
    if (isProcessing) return;
    onClose();
  };

  const handlePickGallery = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const result = await PhotoPickerService.pickFromGallery();
      if (!result.canceled && result.uri) {
        onSelectPhoto(result.uri);
      }
      onClose();
    } catch {
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCaptureCamera = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const result = await PhotoPickerService.captureFromCamera();
      if (!result.canceled && result.uri) {
        onSelectPhoto(result.uri);
      }
      onClose();
    } catch {
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectPreset = (presetId: string) => {
    if (isProcessing) return;
    onClose();
    onSelectPhoto(`preset:${presetId}`);
  };

  const handleRemovePhoto = () => {
    if (isProcessing) return;
    onClose();
    onSelectPhoto(undefined);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheetContainer}>
              <View style={styles.handleBar} />
              <Text style={styles.title}>🐾 우리 아이 대표 사진 등록</Text>
              <Text style={styles.subtitle}>
                앨범 사진 또는 귀여운 견종 캐릭터를 선택하세요.
              </Text>

              {/* 1. 갤러리 및 카메라 액션 */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handlePickGallery}
                  disabled={isProcessing}
                  style={[styles.actionBtn, isProcessing && { opacity: 0.6 }]}
                >
                  <Text style={styles.actionIcon}>📸</Text>
                  <Text style={styles.actionText}>사진 보관함</Text>
                  <Text style={styles.actionSub}>
                    {isProcessing ? '불러오는 중...' : '앨범에서 선택'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleCaptureCamera}
                  disabled={isProcessing}
                  style={[styles.actionBtn, isProcessing && { opacity: 0.6 }]}
                >
                  <Text style={styles.actionIcon}>📷</Text>
                  <Text style={styles.actionText}>카메라</Text>
                  <Text style={styles.actionSub}>
                    {isProcessing ? '카메라 연결 중...' : '직접 촬영하기'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 2. 인기 견종 캐릭터 프리셋 선택 */}
              <Text style={styles.presetSectionTitle}>또는 귀여운 캐릭터 아바타 선택</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRow}
              >
                {DOG_AVATAR_PRESETS.map((p) => {
                  const isCurrent = currentPhotoUri === `preset:${p.id}`;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.8}
                      onPress={() => handleSelectPreset(p.id)}
                      disabled={isProcessing}
                      style={[
                        styles.presetItem,
                        { backgroundColor: p.color },
                        isCurrent && styles.presetItemActive,
                      ]}
                    >
                      <Text style={styles.presetEmoji}>{p.emoji}</Text>
                      <Text style={styles.presetName}>{p.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* 3. 초기화 및 취소 */}
              {Boolean(currentPhotoUri) && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleRemovePhoto}
                  disabled={isProcessing}
                  style={styles.removeBtn}
                >
                  <Text style={styles.removeText}>🗑️ 기본 아이콘으로 초기화</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleClose}
                disabled={isProcessing}
                style={styles.closeBtn}
              >
                <Text style={styles.closeText}>닫기</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: TOKENS.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: TOKENS.colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    fontSize: 26,
    marginBottom: 4,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  actionSub: {
    fontSize: 10,
    color: TOKENS.colors.textMuted,
    marginTop: 2,
  },
  presetSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: TOKENS.colors.textMuted,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 14,
  },
  presetItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minWidth: 70,
  },
  presetItemActive: {
    borderColor: TOKENS.colors.primary,
  },
  presetEmoji: {
    fontSize: 24,
    marginBottom: 2,
  },
  presetName: {
    fontSize: 10,
    fontWeight: '600',
    color: TOKENS.colors.textMain,
  },
  removeBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    marginTop: 4,
  },
  removeText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  closeBtn: {
    backgroundColor: TOKENS.colors.background,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  closeText: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
});
