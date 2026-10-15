/**
 * [편안하개 - PetWalk]
 * 마이페이지 안내 음성 설정 및 미리듣기 카드 컴포넌트 (VoiceSettingCard.tsx)
 *
 * 1. 실시간 적용 중인 AI 보이스 프로필 확인 및 [▶ 미리듣기] 기능
 * 2. 원터치 음소거/음량 상태 표시
 * 3. [보이스 변경 및 상세 설정] 모달 연동
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { CardWrapper } from '../common/CardWrapper';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/themeManager';
import { SoundSettings, VOICE_PROFILES, VoiceProfile } from '../../types/voiceSettings';
import { TTSNavigationService } from '../../services/ttsNavigation';
import { VoiceSettingModal } from './VoiceSettingModal';

export interface VoiceSettingCardProps {
  style?: ViewStyle;
}

export const VoiceSettingCard: React.FC<VoiceSettingCardProps> = ({ style }) => {
  const { colors } = useAppTheme();
  const [settings, setSettings] = useState<SoundSettings>(() => TTSNavigationService.getSettings());
  const [modalVisible, setModalVisible] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  useEffect(() => {
    return TTSNavigationService.subscribe((next) => {
      setSettings(next);
    });
  }, []);

  const currentProfile: VoiceProfile =
    VOICE_PROFILES.find((p) => p.id === settings.profileId) ?? VOICE_PROFILES[0];

  const isMuted = settings.isMuted || settings.volume <= 0;
  const volumePercent = Math.round(settings.volume * 100);

  const handlePreviewVoice = () => {
    setIsPlayingPreview(true);
    TTSNavigationService.previewVoice(settings.profileId);
    setTimeout(() => {
      setIsPlayingPreview(false);
    }, 2500);
  };

  const handleToggleMute = () => {
    void TTSNavigationService.toggleMute();
  };

  return (
    <>
      <CardWrapper variant="flat" style={{ ...styles.card, ...(style as any) }}>
        <View style={styles.headerRow}>
          <View style={styles.titleGroup}>
            <Text style={[styles.cardTitle, { color: colors.textMain }]}>
              🎙️ 안내 음성 설정 및 미리듣기
            </Text>
            <Text style={[styles.cardDesc, { color: colors.textMuted }]}>
              산책 중 실시간 길안내 목소리(4종) 선택, 미리듣기 및 음량을 조절합니다.
            </Text>
          </View>
        </View>

        {/* 현재 보이스 정보 및 미리듣기 박스 */}
        <View
          style={[
            styles.voicePreviewBox,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.voiceInfoRow}>
            <View style={styles.voiceIconWrap}>
              <AppIcon name="sparkle" size={18} color={colors.primary} />
            </View>
            <View style={styles.voiceTextGroup}>
              <View style={styles.voiceNameRow}>
                <Text style={[styles.voiceName, { color: colors.textMain }]}>
                  {currentProfile.label}
                </Text>
                <View style={[styles.toneBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.toneBadgeText, { color: colors.primaryDark }]}>
                    {currentProfile.tone}
                  </Text>
                </View>
              </View>
              <Text style={[styles.voiceDesc, { color: colors.textMuted }]} numberOfLines={1}>
                {currentProfile.description}
              </Text>
            </View>

            {/* ▶ 미리듣기 버튼 */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handlePreviewVoice}
              style={[
                styles.previewBtn,
                { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                isPlayingPreview && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.previewBtnText,
                  { color: colors.primaryDark },
                  isPlayingPreview && { color: '#FFFFFF' },
                ]}
              >
                {isPlayingPreview ? '🔊 재생 중' : '▶ 미리듣기'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 하단 컨트롤: 음량/음소거 & 설정 버튼 */}
          <View style={[styles.controlRow, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleToggleMute}
              style={styles.muteToggleRow}
            >
              <AppIcon
                name={isMuted ? 'volumeMute' : 'volume'}
                size={16}
                color={isMuted ? '#D97706' : colors.primary}
              />
              <Text
                style={[
                  styles.muteStatusText,
                  { color: isMuted ? '#D97706' : colors.textMain },
                ]}
              >
                {isMuted ? '음소거됨' : `음량 ${volumePercent}%`}
              </Text>
              <Text style={[styles.muteActionHint, { color: colors.textMuted }]}>
                ({isMuted ? '터치 시 켜기' : '터치 시 끄기'})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setModalVisible(true)}
              style={[
                styles.settingBtn,
                { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint },
              ]}
            >
              <Text style={[styles.settingBtnText, { color: colors.primaryDark }]}>
                ⚙️ 보이스 변경
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </CardWrapper>

      {/* 보이스 변경 및 음량 세부 설정 모달 */}
      <VoiceSettingModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
  },
  headerRow: {
    marginBottom: 8,
  },
  titleGroup: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  voicePreviewBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 4,
  },
  voiceInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceTextGroup: {
    flex: 1,
  },
  voiceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  voiceName: {
    fontSize: 13,
    fontWeight: '700',
  },
  toneBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  toneBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  voiceDesc: {
    fontSize: 10,
    marginTop: 2,
  },
  previewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  muteToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  muteStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  muteActionHint: {
    fontSize: 10,
  },
  settingBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  settingBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
