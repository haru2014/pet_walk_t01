/**
 * [편안하개 - PetWalk]
 * 자연어 및 음성 발화 산책 조건 입력 섹션 컴포넌트 (US-A1)
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';
import { TTSNavigationService } from '../../services/ttsNavigation';

export interface WalkVoiceInputSectionProps {
  dogName: string;
  requestText: string;
  onChangeText: (text: string) => void;
}

export const WalkVoiceInputSection: React.FC<WalkVoiceInputSectionProps> = ({
  dogName,
  requestText,
  onChangeText,
}) => {
  const [isListening, setIsListening] = useState(false);

  const handleToggleVoiceInput = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    setIsListening(true);
    TTSNavigationService.speak('원하시는 산책 조건을 편안하게 말씀해주세요.');

    // 모바일 음성 발화 예시 자동 반영
    setTimeout(() => {
      onChangeText(
        requestText
          ? `${requestText} 계단 피하고 시원한 길로 찾아줘`
          : `${dogName}랑 30분 정도 폭신한 길로 걸을래`
      );
      setIsListening(false);
    }, 1600);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>직접 말해도 좋아요</Text>
      <View style={styles.textInputBox}>
        <TextInput
          value={requestText}
          onChangeText={onChangeText}
          multiline
          placeholder={`예) ${dogName}랑 30분 정도 천천히 걷고 싶어.\n계단은 피하고 그늘이 많은 길로 찾아줘.`}
          placeholderTextColor="#9CA3AF"
          style={styles.textArea}
        />
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleToggleVoiceInput}
          style={[styles.micButton, isListening && styles.micButtonActive]}
        >
          <AppIcon
            name="mic"
            size={20}
            color={isListening ? TOKENS.colors.textWhite : TOKENS.colors.textMuted}
          />
        </TouchableOpacity>
      </View>
      {isListening && (
        <Text style={styles.listeningNotice}>말씀해주세요. 듣고 있어요...</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 6 },
  textInputBox: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 74,
    justifyContent: 'space-between',
  },
  textArea: {
    fontSize: 13,
    color: TOKENS.colors.textMain,
    lineHeight: 18,
    minHeight: 38,
    textAlignVertical: 'top',
  },
  micButton: {
    alignSelf: 'flex-end',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TOKENS.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  micButtonActive: {
    backgroundColor: TOKENS.colors.primaryDark,
  },
  listeningNotice: {
    fontSize: 11,
    color: TOKENS.colors.primaryDark,
    marginTop: 4,
    fontWeight: '600',
  },
});
