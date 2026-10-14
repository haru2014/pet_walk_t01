/**
 * [편안하개 - PetWalk]
 * 돌발 상황 원터치 퀵 음소거 및 사운드 제어 플로팅 바 (US-C2, #37)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';
import { SoundSettings } from '../../types/voiceSettings';
import { TTSNavigationService } from '../../services/ttsNavigation';
import { VoiceSettingModal } from './VoiceSettingModal';

export interface VoiceQuickControlBarProps {
  compact?: boolean;
  variant?: 'standard' | 'compact' | 'emergency';
  style?: StyleProp<ViewStyle>;
}

interface VoiceBarControlProps {
  readonly isMuted: boolean;
  readonly volume: number;
  readonly onToggleMute: () => void;
  readonly onOpenSettings: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

const CompactVoiceBar: React.FC<VoiceBarControlProps> = ({
  isMuted,
  volume,
  onToggleMute,
  onOpenSettings,
  style,
}) => {
  const muteText = isMuted ? '음소거' : `${Math.round(volume * 100)}%`;
  const iconColor = isMuted ? '#F59E0B' : TOKENS.colors.pocketHud;

  return (
    <View style={[styles.compactContainer, style]}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onToggleMute}
        style={[styles.compactMuteBtn, isMuted ? styles.compactMuteBtnActive : null]}
      >
        <AppIcon
          name={isMuted ? 'volumeMute' : 'volume'}
          size={18}
          color={iconColor}
        />
        <Text style={[styles.compactMuteText, isMuted ? styles.compactMuteTextActive : null]}>
          {muteText}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onOpenSettings}
        style={styles.compactSettingsBtn}
      >
        <AppIcon name="sparkle" size={16} color={TOKENS.colors.pocketHud} />
      </TouchableOpacity>
    </View>
  );
};

const EmergencyVoiceBar: React.FC<VoiceBarControlProps> = ({
  isMuted,
  volume,
  onToggleMute,
  onOpenSettings,
  style,
}) => {
  const percentText = `${Math.round(volume * 100)}%`;
  const mainTitle = isMuted ? '음소거 켜짐 (발화 즉시 중단됨)' : `긴급 원터치 음소거 (${percentText})`;
  const subHint = isMuted ? '터치 시 음성 안내 다시 켜기' : '돌발 상황/개 짖음 시 터치하여 즉시 음소거';
  const iconColor = isMuted ? '#F59E0B' : TOKENS.colors.pocketHud;

  return (
    <View style={[styles.emergencyContainer, style]}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onToggleMute}
        style={[styles.emergencyMuteBtn, isMuted ? styles.emergencyMuteBtnActive : null]}
      >
        <View style={[styles.emergencyIconCircle, isMuted ? styles.emergencyIconCircleActive : null]}>
          <AppIcon
            name={isMuted ? 'volumeMute' : 'volume'}
            size={24}
            color={iconColor}
          />
        </View>
        <View style={styles.emergencyTextCol}>
          <Text style={[styles.emergencyMainText, isMuted ? styles.emergencyMainTextActive : null]}>
            {mainTitle}
          </Text>
          <Text style={[styles.emergencySubHint, isMuted ? styles.emergencySubHintActive : null]}>
            {subHint}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onOpenSettings}
        style={styles.emergencySettingBtn}
      >
        <AppIcon name="sparkle" size={20} color={TOKENS.colors.pocketHud} />
        <Text style={styles.emergencySettingLabel}>보이스</Text>
      </TouchableOpacity>
    </View>
  );
};

const StandardVoiceBar: React.FC<VoiceBarControlProps> = ({
  isMuted,
  volume,
  onToggleMute,
  onOpenSettings,
  style,
}) => {
  const percentText = `${Math.round(volume * 100)}%`;
  const title = isMuted ? '음소거 중 (발화 중단)' : `음성 안내 켜짐 (${percentText})`;
  const desc = isMuted ? '돌발 상황 대비 음소거됨 · 터치 시 즉시 해제' : '개 짖음/소음 시 터치하여 즉시 음소거';
  const tagText = isMuted ? '해제' : '음소거';
  const iconColor = isMuted ? '#B45309' : TOKENS.colors.primaryDark;

  return (
    <View style={[styles.barContainer, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onToggleMute}
        style={[styles.mainMuteCard, isMuted ? styles.mainMuteCardActive : null]}
      >
        <View style={styles.leftRow}>
          <View style={[styles.iconBox, isMuted ? styles.iconBoxActive : null]}>
            <AppIcon
              name={isMuted ? 'volumeMute' : 'volume'}
              size={18}
              color={iconColor}
            />
          </View>
          <View>
            <Text style={[styles.statusTitle, isMuted ? styles.statusTitleActive : null]}>
              {title}
            </Text>
            <Text style={styles.statusDesc}>{desc}</Text>
          </View>
        </View>

        <View style={[styles.actionTag, isMuted ? styles.actionTagActive : null]}>
          <Text style={[styles.actionTagText, isMuted ? styles.actionTagTextActive : null]}>
            {tagText}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onOpenSettings}
        style={styles.settingTriggerBtn}
      >
        <AppIcon name="sparkle" size={18} color={TOKENS.colors.primaryDark} />
        <Text style={styles.settingTriggerText}>보이스 설정</Text>
      </TouchableOpacity>
    </View>
  );
};

export const VoiceQuickControlBar: React.FC<VoiceQuickControlBarProps> = ({
  compact = false,
  variant,
  style,
}) => {
  const [settings, setSettings] = useState<SoundSettings>(() => TTSNavigationService.getSettings());
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    return TTSNavigationService.subscribe((next) => {
      setSettings(next);
    });
  }, []);

  const handleToggleMute = () => {
    void TTSNavigationService.toggleMute();
  };

  const isMuted = settings.isMuted || settings.volume <= 0;
  const activeVariant = variant ?? (compact ? 'compact' : 'standard');

  return (
    <>
      {activeVariant === 'emergency' && (
        <EmergencyVoiceBar
          isMuted={isMuted}
          volume={settings.volume}
          onToggleMute={handleToggleMute}
          onOpenSettings={() => setModalVisible(true)}
          style={style}
        />
      )}
      {activeVariant === 'compact' && (
        <CompactVoiceBar
          isMuted={isMuted}
          volume={settings.volume}
          onToggleMute={handleToggleMute}
          onOpenSettings={() => setModalVisible(true)}
          style={style}
        />
      )}
      {activeVariant === 'standard' && (
        <StandardVoiceBar
          isMuted={isMuted}
          volume={settings.volume}
          onToggleMute={handleToggleMute}
          onOpenSettings={() => setModalVisible(true)}
          style={style}
        />
      )}
      <VoiceSettingModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  barContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  mainMuteCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
  },
  mainMuteCardActive: { backgroundColor: '#FEF3C7', borderColor: TOKENS.colors.warning },
  leftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 6 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TOKENS.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxActive: { backgroundColor: '#FDE68A' },
  statusTitle: { fontSize: 13, fontWeight: '700', color: TOKENS.colors.textMain },
  statusTitleActive: { color: '#B45309' },
  statusDesc: { fontSize: 10, color: TOKENS.colors.textMuted, marginTop: 1 },
  actionTag: {
    backgroundColor: TOKENS.colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  actionTagActive: { backgroundColor: '#F59E0B', borderColor: '#D97706' },
  actionTagText: { fontSize: 11, fontWeight: '700', color: TOKENS.colors.textMain },
  actionTagTextActive: { color: TOKENS.colors.textWhite },
  settingTriggerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: TOKENS.colors.surface,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  settingTriggerText: { fontSize: 10, fontWeight: '700', color: TOKENS.colors.primaryDark },
  compactContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginTop: 10 },
  compactMuteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: TOKENS.colors.pocketHud,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  compactMuteBtnActive: { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderColor: '#F59E0B' },
  compactMuteText: { fontSize: 12, fontWeight: '700', color: TOKENS.colors.pocketHud },
  compactMuteTextActive: { color: '#F59E0B' },
  compactSettingsBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
  },
  emergencyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginVertical: 12,
  },
  emergencyMuteBtn: {
    flex: 1,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderWidth: 2,
    borderColor: TOKENS.colors.pocketHud,
    borderRadius: 28,
    paddingHorizontal: 14,
    gap: 12,
  },
  emergencyMuteBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: '#F59E0B',
  },
  emergencyIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyIconCircleActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.3)',
  },
  emergencyTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  emergencyMainText: {
    fontSize: 14,
    fontWeight: '800',
    color: TOKENS.colors.pocketHud,
    letterSpacing: -0.3,
  },
  emergencyMainTextActive: {
    color: '#F59E0B',
  },
  emergencySubHint: {
    fontSize: 10,
    color: TOKENS.colors.pocketHudSubtle,
    marginTop: 1,
    opacity: 0.85,
  },
  emergencySubHintActive: {
    color: '#FCD34D',
  },
  emergencySettingBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  emergencySettingLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TOKENS.colors.pocketHud,
  },
});
