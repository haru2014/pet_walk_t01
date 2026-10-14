/**
 * [편안하개 - PetWalk]
 * 모바일 산책 조건 설정 화면 (Screen-03, docs/screenshots/03_walk_settings.png 원형 복원 및 스크롤 방지 최적화)
 *
 * 1. 헤더: 뒤로가기 & '산책 설정'
 * 2. 상단 타이틀: "{dog.name}와 어떤 산책을 할까요?" & AI 배너
 * 3. 대전·세종 4대 거점 공원 퀵 선택 칩
 * 4. "얼마나 걸을까요?": 20분 / 30분 / 40분 / 1시간 원터치 칩
 * 5. "어떤 길이 좋을까요?": 6대 환경 2열 카드 그리드
 * 6. 하단 Thumb Zone 버튼: [✨ AI 산책 코스 찾아보기]
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from '../common/AppIcon';
import { DogProfile } from '../../types/dogProfile';
import { PILOT_PARKS, getPilotParkById } from '../../types/pilotParks';
import {
  EnvironmentId,
  WALK_ENVIRONMENTS,
  WalkPreferences,
  WalkOriginMode,
} from '../../types/walkSettings';
import { WalkVoiceInputSection } from './WalkVoiceInputSection';

export interface WalkSettingsViewProps {
  dog: DogProfile;
  initialPreferences?: WalkPreferences;
  onBack: () => void;
  onFindRoute: (preferences: WalkPreferences) => void;
}

const PRESET_DURATIONS = [20, 30, 40, 60] as const;

export const WalkSettingsView: React.FC<WalkSettingsViewProps> = ({
  dog,
  initialPreferences,
  onBack,
  onFindRoute,
}) => {
  const { colors } = useAppTheme();
  const [originMode, setOriginMode] = useState<WalkOriginMode>(
    initialPreferences?.originMode ?? 'park'
  );
  const [pilotParkId, setPilotParkId] = useState<string>(
    initialPreferences?.pilotParkId ?? 'yurim'
  );
  const [duration, setDuration] = useState<number>(
    initialPreferences?.durationMinutes ?? 30
  );
  const [environments, setEnvironments] = useState<EnvironmentId[]>(
    initialPreferences?.environments ?? ['soft', 'shade', 'stairs']
  );
  const [requestText, setRequestText] = useState<string>(initialPreferences?.requestText ?? '');

  const handleToggleEnvironment = (id: EnvironmentId) => {
    setEnvironments((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const currentPark = getPilotParkById(pilotParkId);

  const handleSubmit = () => {
    onFindRoute({
      originMode,
      durationMinutes: duration,
      environments,
      requestText,
      isFreeWalk: false,
      pilotParkId: originMode === 'park' ? pilotParkId : undefined,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 1. 상단 컴팩트 헤더 */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={onBack} style={styles.backButton}>
          <AppIcon name="back" size={22} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textMain }]}>산책 설정</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentWrap}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. 타이틀 & 안내 섹션 (03_walk_settings.png 원형 복원) */}
        <View style={styles.titleSection}>
          <Text style={[styles.mainTitle, { color: colors.textMain }]}>
            {dog.name}와 어떤 산책을 할까요?
          </Text>
          <Text style={[styles.subTitle, { color: colors.textMuted }]}>
            원하는 산책 조건을 알려주면 AI가 {dog.name}에게 맞는 안심 길을 찾아볼게요.
          </Text>
        </View>

        {/* 3. 직접 말해도 좋아요 (자연어 음성/텍스트 입력 섹션 - US-A1) */}
        <WalkVoiceInputSection
          dogName={dog.name}
          requestText={requestText}
          onChangeText={setRequestText}
        />

        {/* 4. 산책 경로 생성 진입 방식 (1. 현재 위치 기반 / 2. 지정한 공원 주변) */}
        <View style={styles.originModeRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setOriginMode('current_location')}
            style={[
              styles.originModeBtn,
              {
                backgroundColor: originMode === 'current_location' ? colors.primary : colors.surface,
                borderColor: originMode === 'current_location' ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.originModeText,
                { color: originMode === 'current_location' ? colors.textWhite : colors.textMain },
                originMode === 'current_location' && styles.originModeTextActive,
              ]}
            >
              📍 현재 위치 기반
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setOriginMode('park')}
            style={[
              styles.originModeBtn,
              {
                backgroundColor: originMode === 'park' ? colors.primary : colors.surface,
                borderColor: originMode === 'park' ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.originModeText,
                { color: originMode === 'park' ? colors.textWhite : colors.textMain },
                originMode === 'park' && styles.originModeTextActive,
              ]}
            >
              🏞️ 지정 공원 둘레길
            </Text>
          </TouchableOpacity>
        </View>

        {/* 4. AI 안내 배너 (모드별 분기) */}
        <View style={[styles.aiBanner, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <View style={styles.aiBannerHeader}>
            <AppIcon name="sparkle" size={15} color={colors.primaryDark} />
            <Text style={[styles.aiBannerTitle, { color: colors.primaryDark }]}>
              {originMode === 'current_location'
                ? '현재 위치 기준 실시간 안심 경로'
                : `${currentPark.shortName} (공원 보행률 90% 이상)`}
            </Text>
          </View>
          <Text style={[styles.aiBannerBody, { color: colors.textMuted }]}>
            {originMode === 'current_location'
              ? '단말기 현위치를 출발점으로 하여 계단 없는 완만 보행로를 AI가 탐색해요. (200m 안심 가림 보호)'
              : `${currentPark.name}의 실제 OSM 보행로를 100% 추종하여 쾌적한 공원 순환 코스를 생성해요.`}
          </Text>

          {/* 거점 공원 모드일 때만 공원 칩 행 표출 */}
          {originMode === 'park' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.parkScrollRow}>
              {PILOT_PARKS.map((park) => {
                const isSelected = park.id === pilotParkId;
                return (
                  <TouchableOpacity
                    key={park.id}
                    activeOpacity={0.8}
                    onPress={() => setPilotParkId(park.id)}
                    style={[
                      styles.parkChip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.surface,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.parkChipText,
                        { color: isSelected ? colors.textWhite : colors.textMain, fontWeight: isSelected ? '700' : '500' },
                      ]}
                    >
                      {park.badgeLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* 5. 섹션 1: 얼마나 걸을까요? (4개 원터치 칩 20분 / 30분 / 40분 / 1시간) */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: colors.textMain }]}>얼마나 걸을까요?</Text>
          <View style={styles.durationChipRow}>
            {PRESET_DURATIONS.map((min) => {
              const isSelected = duration === min;
              const label = min === 60 ? '1시간' : `${min}분`;
              return (
                <TouchableOpacity
                  key={min}
                  activeOpacity={0.8}
                  onPress={() => setDuration(min)}
                  style={[
                    styles.durationChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.surface,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      {
                        color: isSelected ? colors.textWhite : colors.textMain,
                        fontWeight: isSelected ? '800' : '600',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 5. 섹션 2: 어떤 길이 좋을까요? (6대 안심 환경 2열 카드 그리드 복원) */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMain }]}>어떤 길이 좋을까요?</Text>
            <Text style={[styles.sectionSubGuide, { color: colors.textMuted }]}>여러 개 선택할 수 있어요</Text>
          </View>
          <View style={styles.envGrid}>
            {WALK_ENVIRONMENTS.map((opt) => {
              const isChecked = environments.includes(opt.id);
              return (
                <TouchableOpacity
                  key={opt.id}
                  activeOpacity={0.8}
                  onPress={() => handleToggleEnvironment(opt.id)}
                  style={[
                    styles.envCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isChecked ? colors.primary : colors.border,
                      borderWidth: isChecked ? 1.5 : 1,
                    },
                  ]}
                >
                  <View style={styles.envCardHeader}>
                    <AppIcon name={opt.icon} size={18} color={isChecked ? colors.primaryDark : colors.textMuted} />
                    {isChecked ? (
                      <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                        <Text style={styles.checkText}>✓</Text>
                      </View>
                    ) : (
                      <View style={[styles.uncheckCircle, { borderColor: colors.border }]} />
                    )}
                  </View>
                  <Text style={[styles.envLabel, { color: colors.textMain }]}>{opt.label}</Text>
                  <Text style={[styles.envDetail, { color: colors.textMuted }]} numberOfLines={1}>
                    {opt.detail}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* 6. 하단 Thumb Zone 탐색 버튼 (03_walk_settings.png 원형 복원) */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={handleSubmit}
          style={[styles.submitButton, { backgroundColor: colors.primary }]}
        >
          <View style={styles.submitButtonContent}>
            <AppIcon name="sparkle" size={18} color={colors.textWhite} />
            <Text style={[styles.submitButtonText, { color: colors.textWhite }]}>
              AI 산책 코스 찾아보기
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  headerPlaceholder: { width: 32 },
  contentScroll: {
    flex: 1,
  },
  contentWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  titleSection: {
    marginBottom: 4,
  },
  originModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  originModeBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  originModeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  originModeTextActive: {
    fontWeight: '800',
  },
  mainTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  subTitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  aiBanner: {
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  aiBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  aiBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  aiBannerBody: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 6,
  },
  parkScrollRow: {
    flexDirection: 'row',
  },
  parkChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 6,
  },
  parkChipText: {
    fontSize: 11,
  },
  sectionBlock: {
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  sectionSubGuide: {
    fontSize: 11,
  },
  durationChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationChip: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationChipText: {
    fontSize: 13,
  },
  envGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  envCard: {
    width: '48.5%',
    padding: 9,
    borderRadius: 12,
  },
  envCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  checkCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
  },
  uncheckCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  envLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 1,
  },
  envDetail: {
    fontSize: 10,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  submitButton: {
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
