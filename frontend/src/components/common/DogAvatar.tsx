/**
 * [편안하개 - PetWalk]
 * 반려견 대표 사진/아바타 렌더러 컴포넌트 (DogAvatar.tsx)
 *
 * - 실제 갤러리 이미지 URI (`file://`, `http://`, `data:`) 렌더링
 * - 프리셋 캐릭터 아바타 (`preset:golden`, `preset:poodle` 등) 이모지 렌더링
 * - 미등록 시 기본 발바닥 아이콘 렌더링
 */

import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { AppText as Text } from './AppText';
import { TOKENS } from '../../theme/tokens';
import { AppIcon } from './AppIcon';
import { DOG_AVATAR_PRESETS } from '../../services/photoPickerService';

export interface DogAvatarProps {
  photoUri?: string;
  size?: number;
  style?: ViewStyle;
}

export const DogAvatar: React.FC<DogAvatarProps> = ({
  photoUri,
  size = 48,
  style,
}) => {
  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  // 1. 프리셋 아바타인 경우
  if (photoUri && photoUri.startsWith('preset:')) {
    const presetId = photoUri.replace('preset:', '');
    const preset = DOG_AVATAR_PRESETS.find((p) => p.id === presetId) ?? DOG_AVATAR_PRESETS[0];

    return (
      <View
        style={[
          styles.baseContainer,
          containerStyle,
          { backgroundColor: preset.color, borderColor: TOKENS.colors.primary },
          style,
        ]}
      >
        <Text style={{ fontSize: size * 0.52 }}>{preset.emoji}</Text>
      </View>
    );
  }

  // 2. 실제 갤러리 사진인 경우
  if (photoUri && photoUri !== 'mock_photo_url') {
    return (
      <View style={[styles.baseContainer, containerStyle, style]}>
        <Image
          source={{ uri: photoUri }}
          style={[styles.image, containerStyle]}
          resizeMode="cover"
        />
      </View>
    );
  }

  // 3. 미등록 기본 상태
  return (
    <View
      style={[
        styles.baseContainer,
        containerStyle,
        { backgroundColor: TOKENS.colors.primaryLight, borderColor: TOKENS.colors.primary },
        style,
      ]}
    >
      <AppIcon name="pawOutline" size={size * 0.55} color={TOKENS.colors.primaryDark} />
    </View>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
