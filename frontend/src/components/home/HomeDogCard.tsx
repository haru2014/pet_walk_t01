/**
 * [편안하개 - PetWalk]
 * 모바일 홈 활성 반려견 카드 (Screen-01, US-A2)
 *
 * 아바타, 준비 완료 뱃지, 산책 프리셋 칩, 산책 시작 버튼
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { DogProfile } from '../../types/dogProfile';

export interface HomeDogCardProps {
  profile: DogProfile;
  onPressProfile?: () => void;
  onStartWalk?: () => void;
}

export const HomeDogCard: React.FC<HomeDogCardProps> = ({
  profile,
  onPressProfile,
  onStartWalk,
}) => {
  return (
    <View style={styles.card}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPressProfile}
        style={styles.profileRow}
      >
        {/* 원형 아바타 */}
        <View style={styles.avatarWrapper}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarIcon}>🐶</Text>
          </View>
          <View style={styles.onlineBadge} />
        </View>

        {/* 반려견 정보 */}
        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.dogName}>{profile.name}</Text>
            <View style={styles.readyBadge}>
              <Text style={styles.readyBadgeText}>준비 완료</Text>
            </View>
            <Text style={styles.changeNotice}>변경 ▾</Text>
          </View>
          <Text style={styles.subtitle}>오늘 산책 준비됐어요 ☀️</Text>
          <Text style={styles.breedText}>
            {profile.breed} · {profile.ageYears}살 · {profile.speedKmH} km/h
          </Text>
        </View>
      </TouchableOpacity>

      {/* 칩 + 산책 시작 버튼 행 */}
      <View style={styles.actionRow}>
        <View style={styles.chipsContainer}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>⏱ 30분 산책</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>🌿 폭신한 길 우선</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onStartWalk}
          style={styles.startButton}
        >
          <Text style={styles.startButtonText}>산책 시작 →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    padding: 18,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    marginBottom: 16,
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 14,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: TOKENS.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: TOKENS.colors.primary,
  },
  avatarIcon: {
    fontSize: 30,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: TOKENS.colors.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  dogName: {
    fontSize: 17,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  readyBadge: {
    backgroundColor: TOKENS.colors.primarySubtle,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 20,
  },
  readyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primary,
  },
  changeNotice: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    marginLeft: 'auto',
  },
  subtitle: {
    fontSize: 13,
    color: TOKENS.colors.textMuted,
    lineHeight: 18,
  },
  breedText: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    gap: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  chip: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderWidth: 1,
    borderColor: TOKENS.colors.primaryMint,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.primaryDark,
  },
  startButton: {
    backgroundColor: TOKENS.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 14,
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
