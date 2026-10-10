/**
 * [편안하개 - PetWalk]
 * 초절전 다크 포켓 모드 화면 (US-C2, Phase 4)
 *
 * True Black(#000000) OLED 배경 + 고대비 네온 그린 HUD(시간·거리·속도)
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { WalkStats } from '../hooks/useWalkGuidance';
import { SlideToUnlock } from '../components/common/SlideToUnlock';
import { formatElapsed } from '../services/walkFormat';

export interface DarkPocketScreenProps {
  readonly dogName: string;
  readonly stats: WalkStats;
  readonly onUnlock: () => void;
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

export const DarkPocketScreen: React.FC<DarkPocketScreenProps> = ({ dogName, stats, onUnlock }) => (
  <View style={styles.container}>
    <Text style={styles.title}>🐾 {dogName}와 안심 산책 중</Text>
    <Text style={styles.subtitle}>화면이 꺼져도 음성으로 안내해요</Text>

    <View style={styles.hud}>
      <HudItem label="경과 시간" value={formatElapsed(stats.elapsedSec)} unit="" />
      <HudItem label="이동 거리" value={stats.distanceKm.toFixed(2)} unit="km" />
      <HudItem label="현재 속도" value={stats.speedKmH.toFixed(1)} unit="km/h" />
    </View>

    <View style={styles.unlockArea}>
      <SlideToUnlock onUnlock={onUnlock} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.pocketBg,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },
  title: {
    color: TOKENS.colors.pocketHud,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: TOKENS.colors.pocketHudSubtle,
    opacity: 0.7,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  hud: {
    flex: 1,
    justifyContent: 'center',
    gap: 28,
  },
  hudItem: {
    alignItems: 'center',
  },
  hudLabel: {
    color: TOKENS.colors.pocketHudSubtle,
    opacity: 0.7,
    fontSize: 13,
    marginBottom: 4,
  },
  hudValue: {
    color: TOKENS.colors.pocketHud,
    fontSize: 56,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  hudUnit: {
    fontSize: 20,
    fontWeight: '600',
  },
  unlockArea: {
    paddingBottom: 8,
  },
});
