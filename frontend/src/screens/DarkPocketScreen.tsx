/**
 * [편안하개 - PetWalk]
 * 초절전 다크 포켓 모드 화면 (US-C2, US-18, Phase 4)
 *
 * 1. True Black(#000000) OLED 배경 + 고대비 네온 그린 HUD(시간·거리·속도)
 * 2. 한 손 원터치 배변/소변 마킹 FAB 및 햅틱 로깅 (US-18)
 * 3. 슬라이드 언락 산책 종료 제스처
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { WalkStats } from '../hooks/useWalkGuidance';
import { SlideToUnlock } from '../components/common/SlideToUnlock';
import { formatElapsed } from '../services/walkFormat';
import { AppIcon } from '../components/common/AppIcon';
import { VoiceQuickControlBar } from '../components/voice/VoiceQuickControlBar';
import { AmbientNoiseMonitorService } from '../services/ambientNoiseMonitor';
import { BarkMuteState, SoundSettings } from '../types/voiceSettings';
import { TTSNavigationService } from '../services/ttsNavigation';

export interface DarkPocketScreenProps {
  readonly dogName: string;
  readonly stats: WalkStats;
  readonly onUnlock: () => void;
  readonly targetMinutes?: number | null;
  readonly isFreeWalk?: boolean;
  readonly onMarkPoop?: (type: 'poop' | 'pee') => void;
  readonly poopCount?: number;
}

const HudItem: React.FC<{ value: string; unit: string; label: string }> = ({ value, unit, label }) => (
  <View style={styles.hudItem}>
    <Text style={styles.hudLabel}>{label}</Text>
    <Text style={styles.hudValue}>
      {value}
      <Text style={styles.hudUnit}> {unit}</Text>
    </Text>
  </View>
);

export const DarkPocketScreen: React.FC<DarkPocketScreenProps> = ({
  dogName,
  stats,
  onUnlock,
  targetMinutes,
  isFreeWalk,
  onMarkPoop,
  poopCount = 0,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [barkState, setBarkState] = useState<BarkMuteState>(() => AmbientNoiseMonitorService.getState());
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() => TTSNavigationService.getSettings());

  useEffect(() => {
    void AmbientNoiseMonitorService.startMonitoring();
    const unsubNoise = AmbientNoiseMonitorService.subscribe((next) => {
      setBarkState(next);
    });
    const unsubTTS = TTSNavigationService.subscribe((next) => {
      setSoundSettings(next);
    });
    return () => {
      unsubNoise();
      unsubTTS();
      AmbientNoiseMonitorService.stopMonitoring();
    };
  }, []);
  const isOvertime = !isFreeWalk && !!targetMinutes && stats.elapsedSec >= targetMinutes * 60;
  const overtimeMinutes = isOvertime ? Math.floor((stats.elapsedSec - targetMinutes! * 60) / 60) : 0;

  const handlePressMark = (type: 'poop' | 'pee') => {
    if (onMarkPoop) onMarkPoop(type);
    const label = type === 'poop' ? '💩 대변' : '💧 소변';
    setToastMsg(`${label} 마킹 완료 (총 ${poopCount + 1}회)`);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const getSubtitle = () => {
    if (isFreeWalk) return '자유 산책 모드 · 시간 제한 없이 안심 기록 중';
    if (isOvertime) return `목표 ${targetMinutes}분 달성 (+${overtimeMinutes}분) · 자유 산책 기록 지속 중`;
    if (targetMinutes) return `목표: ${targetMinutes}분 · 화면이 꺼져도 음성으로 안내해요`;
    return '화면이 꺼져도 음성으로 안내해요';
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <AppIcon name="paw" size={20} color={TOKENS.colors.pocketHud} />
        <Text style={styles.title}>{dogName}와 안심 산책 중</Text>
      </View>
      <Text style={[styles.subtitle, isOvertime && styles.subtitleOvertime]}>
        {getSubtitle()}
      </Text>

      {/* US-C2, #37: 비상 상황 원터치 대형 퀵 음소거 제어 바 */}
      <VoiceQuickControlBar variant="emergency" />

      {/* 스마트 돌발 짖음 감지 상태 배너 & 토글 컨트롤 */}
      {barkState.isAutoMuted ? (
        <View style={styles.barkAlertBanner}>
          <AppIcon name="volumeMute" size={16} color="#EF4444" />
          <Text style={styles.barkAlertText}>
            🚨 돌발 짖음 감지({barkState.currentNoiseDb}dB) · 안내 일시 차단 중 ({barkState.cooldownRemainingSec.toFixed(1)}s 후 자동 복구)
          </Text>
        </View>
      ) : (
        <View style={styles.smartMuteRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              const next = !(soundSettings.smartBarkMuteEnabled ?? true);
              void TTSNavigationService.updateSettings({ smartBarkMuteEnabled: next });
            }}
            style={[
              styles.smartMuteToggleBtn,
              (soundSettings.smartBarkMuteEnabled ?? true) ? styles.smartMuteToggleActive : null,
            ]}
          >
            <Text style={styles.smartMuteToggleIcon}>
              {(soundSettings.smartBarkMuteEnabled ?? true) ? '🟢' : '⚪'}
            </Text>
            <Text
              style={[
                styles.smartMuteToggleText,
                (soundSettings.smartBarkMuteEnabled ?? true) ? styles.smartMuteToggleTextActive : null,
              ]}
            >
              스마트 짖음 감지 자동 음소거 {(soundSettings.smartBarkMuteEnabled ?? true) ? '켜짐 (73dB↑)' : '꺼짐'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => AmbientNoiseMonitorService.simulateNoise(82)}
            style={styles.testBarkChip}
          >
            <Text style={styles.testBarkChipText}>📢 짖음 테스트</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 중앙 HUD 수치 */}
      <View style={styles.hud}>
        <HudItem label="경과 시간" value={formatElapsed(stats.elapsedSec)} unit="" />
        <HudItem label="이동 거리" value={stats.distanceKm.toFixed(2)} unit="km" />
        <HudItem label="현재 속도" value={stats.speedKmH.toFixed(1)} unit="km/h" />
      </View>

      {/* US-18: 한 손 원터치 배변 마킹 FAB 영역 (Thumb Zone) */}
      <View style={styles.poopMarkingZone}>
        {toastMsg ? (
          <View style={styles.toastBadge}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        ) : (
          <View style={styles.poopStatusRow}>
            <Text style={styles.poopStatusText}>
              {poopCount > 0 ? `🐾 배변 ${poopCount}회 마킹됨` : '🐾 배변 시 아래 버튼을 탭하세요'}
            </Text>
          </View>
        )}

        <View style={styles.fabRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handlePressMark('poop')}
            style={styles.poopFab}
          >
            <Text style={styles.poopFabIcon}>💩</Text>
            <Text style={styles.poopFabText}>대변 마킹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handlePressMark('pee')}
            style={styles.peeFab}
          >
            <Text style={styles.poopFabIcon}>💧</Text>
            <Text style={styles.poopFabText}>소변 마킹</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.unlockArea}>
        <SlideToUnlock onUnlock={onUnlock} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TOKENS.colors.pocketBg, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 28, justifyContent: 'space-between' },
  title: { color: TOKENS.colors.pocketHud, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  subtitle: { color: TOKENS.colors.pocketHudSubtle, opacity: 0.7, fontSize: 12, textAlign: 'center', marginTop: 4 },
  subtitleOvertime: { color: '#FBBF24', opacity: 0.95, fontWeight: '700' },
  hud: { flex: 1, justifyContent: 'center', gap: 20 },
  hudItem: { alignItems: 'center' },
  hudLabel: { color: TOKENS.colors.pocketHudSubtle, opacity: 0.7, fontSize: 12, marginBottom: 2 },
  hudValue: { color: TOKENS.colors.pocketHud, fontSize: 50, fontWeight: '800', fontVariant: ['tabular-nums'] },
  hudUnit: { fontSize: 18, fontWeight: '600' },

  poopMarkingZone: { alignItems: 'center', marginBottom: 12 },
  toastBadge: { backgroundColor: 'rgba(16, 185, 129, 0.25)', borderWidth: 1, borderColor: TOKENS.colors.pocketHud, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 14, marginBottom: 8 },
  toastText: { color: TOKENS.colors.pocketHud, fontSize: 11, fontWeight: '700' },
  poopStatusRow: { marginBottom: 6 },
  poopStatusText: { color: TOKENS.colors.pocketHudSubtle, fontSize: 11, opacity: 0.8 },
  fabRow: { flexDirection: 'row', gap: 12, width: '100%', justifyContent: 'center' },
  poopFab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.6)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  peeFab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.6)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  poopFabIcon: { fontSize: 16 },
  poopFabText: { color: '#F8FAFC', fontSize: 12, fontWeight: '700' },
  unlockArea: { paddingBottom: 4 },
  barkAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginVertical: 4,
  },
  barkAlertText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  smartMuteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 4,
  },
  smartMuteToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  smartMuteToggleActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  smartMuteToggleIcon: { fontSize: 10 },
  smartMuteToggleText: {
    color: TOKENS.colors.pocketHudSubtle,
    fontSize: 10,
    fontWeight: '600',
  },
  smartMuteToggleTextActive: {
    color: TOKENS.colors.pocketHud,
    fontWeight: '700',
  },
  testBarkChip: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 14,
  },
  testBarkChipText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '700',
  },
});
