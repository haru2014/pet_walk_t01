/**
 * [편안하개 - PetWalk]
 * AI 음성 가이드 보이스 프로필 및 볼륨 세부 설정 모달 (US-C2, #37)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';
import {
  SoundSettings,
  VOICE_PROFILES,
  VoiceProfileId,
} from '../../types/voiceSettings';
import { TTSNavigationService } from '../../services/ttsNavigation';

export interface VoiceSettingModalProps {
  visible: boolean;
  onClose: () => void;
}

const VOLUME_STEPS = [0.2, 0.4, 0.6, 0.8, 1.0];

export const VoiceSettingModal: React.FC<VoiceSettingModalProps> = ({ visible, onClose }) => {
  const [settings, setSettings] = useState<SoundSettings>(() => TTSNavigationService.getSettings());

  useEffect(() => TTSNavigationService.subscribe((next) => {
      setSettings(next);
  }), []);

  const handleSelectProfile = (id: VoiceProfileId) => {
    void TTSNavigationService.setProfile(id);
    TTSNavigationService.previewVoice(id);
  };

  const handleSelectVolume = (vol: number) => {
    void TTSNavigationService.setVolume(vol);
  };

  const handleToggleMute = () => {
    void TTSNavigationService.toggleMute();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          {/* 헤더 */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <AppIcon name="volume" size={20} color={TOKENS.colors.primaryDark} />
              <Text style={styles.title}>AI 음성 가이드 & 사운드 설정</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea}>
            {/* 돌발 상황 원터치 음소거 배너 */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleToggleMute}
              style={[styles.muteBanner, settings.isMuted && styles.muteBannerActive]}
            >
              <View style={styles.muteBannerLeft}>
                <AppIcon
                  name={settings.isMuted ? 'volumeMute' : 'volume'}
                  size={20}
                  color={settings.isMuted ? TOKENS.colors.warning : TOKENS.colors.primaryDark}
                />
                <View>
                  <Text style={[styles.muteBannerTitle, settings.isMuted && styles.muteBannerTitleActive]}>
                    {settings.isMuted ? '음소거 활성화됨' : '음성 안내 켜짐'}
                  </Text>
                  <Text style={styles.muteBannerDesc}>
                    {settings.isMuted ? '개 짖음/소음 등 돌발 상황으로 발화가 중단되었습니다' : '터치 시 즉시 모든 음성을 끄고 정지합니다'}
                  </Text>
                </View>
              </View>
              <View style={[styles.toggleBadge, settings.isMuted && styles.toggleBadgeActive]}>
                <Text style={[styles.toggleBadgeText, settings.isMuted && styles.toggleBadgeTextActive]}>
                  {settings.isMuted ? '음소거 해제' : '음소거'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* 음량 세부 조절 */}
            <Text style={styles.sectionLabel}>안내 음량 (볼륨)</Text>
            <View style={styles.volumeRow}>
              {VOLUME_STEPS.map((vol) => {
                const isSelected = Math.abs(settings.volume - vol) < 0.05 && !settings.isMuted;
                const percent = Math.round(vol * 100);
                return (
                  <TouchableOpacity
                    key={vol}
                    activeOpacity={0.8}
                    onPress={() => handleSelectVolume(vol)}
                    style={[styles.volumeChip, isSelected && styles.volumeChipSelected]}
                  >
                    <Text style={[styles.volumeText, isSelected && styles.volumeTextSelected]}>
                      {percent}%
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* AI 목소리 프로필 선택 */}
            <Text style={styles.sectionLabel}>AI 목소리 프로필</Text>
            <View style={styles.profileList}>
              {VOICE_PROFILES.map((profile) => {
                const isSelected = settings.profileId === profile.id;
                return (
                  <TouchableOpacity
                    key={profile.id}
                    activeOpacity={0.8}
                    onPress={() => handleSelectProfile(profile.id)}
                    style={[styles.profileCard, isSelected && styles.profileCardSelected]}
                  >
                    <View style={styles.profileHeader}>
                      <View style={styles.profileTitleWrap}>
                        <Text style={[styles.profileLabel, isSelected && styles.profileLabelSelected]}>
                          {profile.label}
                        </Text>
                        <View style={styles.toneBadge}>
                          <Text style={styles.toneBadgeText}>{profile.tone}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => TTSNavigationService.previewVoice(profile.id)}
                        style={styles.previewButton}
                      >
                        <Text style={styles.previewButtonText}>▶ 미리듣기</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.profileDesc}>{profile.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 🐾 스마트 짖음 감지 자동 음소거 (US-C2, #37) */}
            <Text style={styles.sectionLabel}>스마트 소음 감지</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                const next = !(settings.smartBarkMuteEnabled ?? true);
                void TTSNavigationService.updateSettings({ smartBarkMuteEnabled: next });
              }}
              style={styles.smartBarkCard}
            >
              <View style={styles.smartBarkLeft}>
                <Text style={styles.smartBarkTitle}>
                  🐾 돌발 짖음 감지 시 자동 음소거
                </Text>
                <Text style={styles.smartBarkDesc}>
                  주변에서 73dB 이상 개 짖는 소리가 나면 안내를 즉시 멈추고, 조용해지면 3초 후 자동으로 다시 켭니다.
                </Text>
              </View>
              <View style={[
                styles.smartBarkBadge,
                (settings.smartBarkMuteEnabled ?? true) ? styles.smartBarkBadgeActive : null,
              ]}>
                <Text style={[
                  styles.smartBarkBadgeText,
                  (settings.smartBarkMuteEnabled ?? true) ? styles.smartBarkBadgeTextActive : null,
                ]}>
                  {(settings.smartBarkMuteEnabled ?? true) ? '켜짐' : '꺼짐'}
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity activeOpacity={0.85} onPress={onClose} style={styles.confirmButton}>
            <Text style={styles.confirmButtonText}>설정 완료</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: TOKENS.colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: TOKENS.colors.textMain },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, color: TOKENS.colors.textMuted },
  scrollArea: { marginVertical: 14 },
  muteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.colors.primaryLight,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.primaryDark,
    marginBottom: 16,
  },
  muteBannerActive: {
    backgroundColor: '#FEF3C7',
    borderColor: TOKENS.colors.warning,
  },
  muteBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  muteBannerTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.primaryDark },
  muteBannerTitleActive: { color: '#B45309' },
  muteBannerDesc: { fontSize: 11, color: TOKENS.colors.textMuted, marginTop: 2 },
  toggleBadge: { backgroundColor: TOKENS.colors.primaryDark, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  toggleBadgeActive: { backgroundColor: TOKENS.colors.warning },
  toggleBadgeText: { color: TOKENS.colors.textWhite, fontSize: 12, fontWeight: '700' },
  toggleBadgeTextActive: { color: '#78350F' },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 8, marginTop: 4 },
  volumeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  volumeChip: { flex: 1, marginHorizontal: 3, paddingVertical: 10, alignItems: 'center', borderRadius: 8, backgroundColor: TOKENS.colors.background, borderWidth: 1, borderColor: TOKENS.colors.border },
  volumeChipSelected: { borderColor: TOKENS.colors.primaryDark, backgroundColor: TOKENS.colors.primaryLight },
  volumeText: { fontSize: 13, fontWeight: '600', color: TOKENS.colors.textMuted },
  volumeTextSelected: { color: TOKENS.colors.primaryDark, fontWeight: '800' },
  profileList: { gap: 10, marginBottom: 10 },
  profileCard: { padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: TOKENS.colors.border, backgroundColor: TOKENS.colors.background },
  profileCardSelected: { borderColor: TOKENS.colors.primaryDark, backgroundColor: TOKENS.colors.primaryLight },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  profileTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileLabel: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain },
  profileLabelSelected: { color: TOKENS.colors.primaryDark },
  toneBadge: { backgroundColor: TOKENS.colors.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: TOKENS.colors.border },
  toneBadgeText: { fontSize: 10, color: TOKENS.colors.textMuted, fontWeight: '600' },
  previewButton: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: TOKENS.colors.surface, borderWidth: 1, borderColor: TOKENS.colors.border },
  previewButtonText: { fontSize: 11, fontWeight: '700', color: TOKENS.colors.primaryDark },
  profileDesc: { fontSize: 12, color: TOKENS.colors.textMuted, lineHeight: 16 },
  confirmButton: { backgroundColor: TOKENS.colors.primaryDark, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  confirmButtonText: { color: TOKENS.colors.textWhite, fontSize: 15, fontWeight: '700' },
  smartBarkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.colors.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    marginBottom: 16,
  },
  smartBarkLeft: { flex: 1, marginRight: 10 },
  smartBarkTitle: { fontSize: 13, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 2 },
  smartBarkDesc: { fontSize: 11, color: TOKENS.colors.textMuted, lineHeight: 15 },
  smartBarkBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  smartBarkBadgeActive: {
    backgroundColor: TOKENS.colors.primaryDark,
  },
  smartBarkBadgeText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  smartBarkBadgeTextActive: { color: TOKENS.colors.textWhite },
});
