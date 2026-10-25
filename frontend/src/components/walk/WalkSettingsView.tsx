import { TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
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
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from '../common/AppIcon';
import { AppScreenHeader } from '../common/AppScreenHeader';
import { DogProfile } from '../../types/dogProfile';
import { PILOT_PARKS, getPilotParkById } from '../../types/pilotParks';
import { useAppResponsive } from '../../hooks/useAppResponsive';
import {
  EnvironmentId,
  WALK_ENVIRONMENTS,
  WalkPreferences,
  WalkOriginMode,
  formatDurationLabel,
} from '../../types/walkSettings';
import { WalkVoiceInputSection } from './WalkVoiceInputSection';
import { WalkDurationSlider } from './WalkDurationSlider';
import { getCurrentLocationCoords } from '../../services/locationService';
import { VoiceIntentResult, normalizeToFrontendParkId } from '../../services/voiceIntentApi';
import { resolveAiEnvironments } from '../../services/voiceIntentSettings';
import { unsupportedParkMessage } from '../../services/voiceIntentLandmarks';

export interface WalkSettingsViewProps {
  dog: DogProfile;
  initialPreferences?: WalkPreferences;
  onBack: () => void;
  onFindRoute: (preferences: WalkPreferences) => void;
}

const PRESET_DURATIONS = [20, 30, 40, 60] as const;

function getAiBannerTitle(
  originMode: WalkOriginMode,
  isLocating: boolean,
  userCoords: { lat: number; lon: number } | undefined,
  currentParkShortName: string
): string {
  if (originMode !== 'current_location') {
    return `${currentParkShortName} 산책길 위주로 찾아요`;
  }
  if (isLocating) {
    return '현재 GPS 위치 수신 중...';
  }
  if (userCoords) {
    return '현재 위치를 확인했어요';
  }
  return '현재 위치 기준 실시간 안심 경로';
}

function getAiBannerBody(
  originMode: WalkOriginMode,
  locationError: string | null,
  isLocating: boolean,
  userCoords: { lat: number; lon: number } | undefined,
  currentParkName: string
): string {
  if (originMode !== 'current_location') {
    return `${currentParkName} 안의 산책길을 따라 편안한 순환 코스를 찾아요.`;
  }
  if (locationError) {
    return `⚠️ ${locationError}`;
  }
  if (isLocating) {
    return 'GPS로 현재 위치를 확인하고 있어요. 잠시만 기다려 주세요...';
  }
  if (userCoords) {
    return '현재 위치에서 출발하는 편안한 산책길을 찾아요.';
  }
  return '현재 위치에서 출발해 계단이 적고 편안한 산책길을 찾아요. 코스를 공유할 때는 집 근처 위치를 보호해요.';
}

function buildAiNoticeSummary(
  targetDuration: number | null,
  parkName?: string,
  intent?: VoiceIntentResult['intent']
): string {
  const parts: string[] = [];
  if (targetDuration) parts.push(`${targetDuration}분`);
  if (parkName) parts.push(parkName);
  if (intent?.prefer_shade) parts.push('그늘길');
  if (intent?.prefer_cushion) parts.push('폭신한 흙길');
  if (intent?.avoid_stairs) parts.push('계단피하기');
  return parts.join(' · ');
}

export const WalkSettingsView: React.FC<WalkSettingsViewProps> = ({
  dog,
  initialPreferences,
  onBack,
  onFindRoute,
}) => {
  const { colors } = useAppTheme();
  const { walkSettings, scale } = useAppResponsive();
  const [originMode, setOriginMode] = useState<WalkOriginMode>(
    initialPreferences?.originMode ?? 'park'
  );
  const [pilotParkId, setPilotParkId] = useState<string>(
    initialPreferences?.pilotParkId ?? 'yurim'
  );
  const [duration, setDuration] = useState<number | null>(
    initialPreferences?.durationMinutes ?? 30
  );
  const [isFreeWalk, setIsFreeWalk] = useState<boolean>(
    initialPreferences?.isFreeWalk ?? false
  );
  const [showDetailedDuration, setShowDetailedDuration] = useState<boolean>(false);
  const [environments, setEnvironments] = useState<EnvironmentId[]>(
    initialPreferences?.environments ?? ['soft', 'shade', 'stairs']
  );
  const [requestText, setRequestText] = useState<string>(initialPreferences?.requestText ?? '');
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | undefined>(
    initialPreferences?.userCoordinates
  );
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<{ summary: string; briefing?: string } | null>(null);
  const [unsupportedLandmark, setUnsupportedLandmark] = useState<string | null>(null);

  const clearVoiceWarning = () => {
    setUnsupportedLandmark(null);
    setAiNotice(null);
  };

  const fetchUserLocation = async () => {
    setIsLocating(true);
    setLocationError(null);
    const res = await getCurrentLocationCoords(5000);
    setIsLocating(false);
    if (res.ok && res.coords) {
      const coords = { lat: res.coords.latitude, lon: res.coords.longitude };
      setUserCoords(coords);
      return coords;
    } else {
      const err = res.errorMessage || '현재 위치를 확인할 수 없습니다.';
      setLocationError(err);
      return null;
    }
  };

  const handleToggleEnvironment = (id: EnvironmentId) => {
    setEnvironments((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleIntentParsed = (result: VoiceIntentResult) => {
    const { intent, landmark_park_id } = result;

    // 1. 산책 시간 자동 반영
    let resolvedDuration = duration;
    if (intent.target_duration_minutes) {
      resolvedDuration = intent.target_duration_minutes;
      setDuration(resolvedDuration);
      setIsFreeWalk(false);
      if (![20, 30, 40, 60].includes(intent.target_duration_minutes)) {
        setShowDetailedDuration(true);
      }
    }

    // 2. 환경 칩 자동 반영 (버그 수정: avoid_stairs 감지 시 stairs 칩 켜기)
    setEnvironments((prev) => resolveAiEnvironments(prev, intent));

    // 3. 랜드마크 공원 자동 설정 (정규화 적용)
    let resolvedParkId = pilotParkId;
    const rawTarget = intent.destination_landmark || landmark_park_id;
    const parkId = normalizeToFrontendParkId(rawTarget);
    setUnsupportedLandmark(rawTarget && !parkId ? rawTarget : null);
    if (rawTarget && !parkId) {
      setAiNotice({ summary: unsupportedParkMessage(rawTarget) });
      return;
    }
    if (parkId) {
      resolvedParkId = parkId;
      // 장소 언급은 출발 위치 선택이 아니다. 공원 모드는 사용자가 직접 선택한다.
      setOriginMode('current_location');
      setPilotParkId(resolvedParkId);
    }

    // 4. AI 맞춤 설정 알림 요약
    const parkObj = getPilotParkById(resolvedParkId);
    setAiNotice(parkId
      ? {
        summary: buildAiNoticeSummary(resolvedDuration, undefined, intent),
        briefing: `${parkObj?.name ?? '말씀하신 공원'}을 인식했어요. 산책은 현재 위치에서 시작하도록 설정했어요. 공원 보행로에서 시작하려면 공원 모드를 직접 선택해 주세요.`,
      }
      : {
        summary: buildAiNoticeSummary(resolvedDuration, undefined, intent),
        briefing: intent.briefing_message || undefined,
      });
  };

  const currentPark = getPilotParkById(pilotParkId);

  const handleSubmit = async () => {
    if (unsupportedLandmark) return;
    const payloadDuration = isFreeWalk ? null : duration;
    if (originMode === 'current_location') {
      const coords = userCoords ?? (await fetchUserLocation()) ?? undefined;
      onFindRoute({
        originMode,
        durationMinutes: payloadDuration,
        environments,
        requestText,
        isFreeWalk,
        pilotParkId: undefined,
        userCoordinates: coords,
      });
    } else {
      onFindRoute({
        originMode,
        durationMinutes: payloadDuration,
        environments,
        requestText,
        isFreeWalk,
        pilotParkId,
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 1. 상단 공통 규격 헤더 (48px 터치타깃 보장) */}
      <AppScreenHeader title="산책 설정" onBack={onBack} />

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={[styles.contentWrap, { paddingHorizontal: walkSettings.containerPaddingH }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. 타이틀 & 안내 섹션 (03_walk_settings.png 원형 복원) */}
        <View style={styles.titleSection}>
          <Text style={[styles.mainTitle, { color: colors.textMain }]}>
            {dog.name}와 어떤 산책을 할까요?
          </Text>
          <Text style={[styles.subTitle, { color: colors.textMuted }]}>
            원하는 산책 조건을 알려주면 {dog.name}에게 맞는 편안한 길을 찾아볼게요.
          </Text>
        </View>

        {/* 3. 직접 말해도 좋아요 (자연어 음성/텍스트 입력 섹션 - US-A1) */}
        <WalkVoiceInputSection
          dogName={dog.name}
          requestText={requestText}
          onChangeText={setRequestText}
          onIntentParsed={handleIntentParsed}
          coords={userCoords}
          onFindRouteDirectly={handleSubmit}
          hideResultBadge={true}
        />

        {/* AI 맞춤 조건 적용 알림 카드 */}
        {aiNotice && (
          <View style={styles.aiFeedbackCard}>
            <View style={styles.aiFeedbackTop}>
              <AppIcon name="sparkle" size={14} color="#4338CA" />
              <Text style={styles.aiFeedbackTitle}>{unsupportedLandmark ? '지원 공원을 선택해 주세요' : '말씀하신 산책 조건을 반영했어요'}</Text>
            </View>
            <Text style={styles.aiFeedbackSummary}>{aiNotice.summary}</Text>
            {aiNotice.briefing ? (
              <Text style={styles.aiFeedbackBriefing}>{aiNotice.briefing}</Text>
            ) : null}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSubmit}
              disabled={Boolean(unsupportedLandmark)}
              style={styles.aiFeedbackQuickBtn}
            >
              <AppIcon name="sparkle" size={13} color="#FFFFFF" />
              <Text style={styles.aiFeedbackQuickBtnText}>이 조건으로 산책로 바로 찾기 🚀</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 4. 산책 경로 생성 진입 방식 (1. 현재 위치 기반 / 2. 지정한 공원 주변) */}
        <View style={styles.originModeRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setOriginMode('current_location');
              clearVoiceWarning();
              if (!userCoords && !isLocating) {
                void fetchUserLocation();
              }
            }}
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
            onPress={() => { setOriginMode('park'); clearVoiceWarning(); }}
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
              {getAiBannerTitle(originMode, isLocating, userCoords, currentPark.shortName)}
            </Text>
          </View>
          <Text style={[styles.aiBannerBody, { color: locationError ? '#DC2626' : colors.textMuted }]}>
            {getAiBannerBody(originMode, locationError, isLocating, userCoords, currentPark.name)}
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
                    onPress={() => { setPilotParkId(park.id); clearVoiceWarning(); }}
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

        {/* 5. 섹션 1: 얼마나 걸을까요? (빠른 프리셋 + 상세 설정 & 2시간 확장 복원 - US-A3, #38) */}
        <View
          style={[
            styles.sectionBlock,
            { marginTop: walkSettings.sectionGap, marginBottom: walkSettings.sectionGap },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View style={styles.durationTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.textMain }]}>얼마나 걸을까요?</Text>
              <View style={[styles.durationBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.durationBadgeText, { color: colors.primaryDark }]}>
                  {formatDurationLabel(duration, isFreeWalk)}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setShowDetailedDuration((prev) => !prev)}
              style={[styles.detailToggleBtn, { borderColor: colors.primary }]}
            >
              <Text style={[styles.detailToggleText, { color: colors.primaryDark }]}>
                {showDetailedDuration ? '간편 설정으로 돌아가기 ▲' : '맞춤 설정 (최대 2시간) ▼'}
              </Text>
            </TouchableOpacity>
          </View>

          {!showDetailedDuration ? (
            <View style={styles.durationChipRow}>
              {PRESET_DURATIONS.map((min) => {
                const isSelected = !isFreeWalk && duration === min;
                const label = min === 60 ? '1시간' : `${min}분`;
                return (
                  <TouchableOpacity
                    key={min}
                    activeOpacity={0.8}
                    onPress={() => {
                      setIsFreeWalk(false);
                      setDuration(min);
                    }}
                    style={[
                      styles.durationChip,
                      {
                        height: scale(36, 38, 44),
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
          ) : (
            <WalkDurationSlider
              duration={duration}
              isFreeWalk={isFreeWalk}
              onChangeDuration={(mins) => {
                setIsFreeWalk(false);
                setDuration(mins);
              }}
              onChangeFreeWalk={(free) => {
                setIsFreeWalk(free);
                if (free) {
                  setDuration(null);
                } else if (!duration) {
                  setDuration(30);
                }
              }}
              hideHeader={true}
            />
          )}
        </View>

        {/* 5. 섹션 2: 어떤 길이 좋을까요? (6대 안심 환경 2열 카드 그리드 복원) */}
        <View style={[styles.sectionBlock, { marginBottom: walkSettings.sectionGap }]}>
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
                      minHeight: walkSettings.envCardHeight,
                      padding: scale(7, 9, 12),
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
      <View style={[styles.bottomBar, { paddingVertical: scale(8, 10, 14), backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity
          activeOpacity={0.88}
          disabled={isLocating || Boolean(unsupportedLandmark)}
          onPress={handleSubmit}
          style={[styles.submitButton, { height: scale(46, 50, 56), backgroundColor: colors.primary, opacity: isLocating ? 0.75 : 1 }]}
        >
          <View style={styles.submitButtonContent}>
            {isLocating ? (
              <>
                <ActivityIndicator size="small" color={colors.textWhite} style={{ marginRight: 6 }} />
                <Text style={[styles.submitButtonText, { fontSize: walkSettings.findButtonFontSize, color: colors.textWhite }]}>
                  현재 위치 확인 중...
                </Text>
              </>
            ) : (
              <>
                <AppIcon name="sparkle" size={18} color={colors.textWhite} />
                <Text style={[styles.submitButtonText, { fontSize: walkSettings.findButtonFontSize, color: colors.textWhite }]}>
                  맞춤 산책길 찾기
                </Text>
              </>
            )}
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
  headerTitle: { fontSize: TYPOGRAPHY.screenTitle, fontWeight: '700', letterSpacing: -0.3 },
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
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
  },
  originModeTextActive: {
    fontWeight: '800',
  },
  mainTitle: {
    fontSize: TYPOGRAPHY.screenTitle,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  subTitle: {
    fontSize: TYPOGRAPHY.support,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.support,
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
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '700',
  },
  aiBannerBody: {
    fontSize: TYPOGRAPHY.support,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.support,
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
    fontSize: TYPOGRAPHY.label,
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
  durationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  durationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  durationBadgeText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
  },
  detailToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  detailToggleText: {
    fontSize: TYPOGRAPHY.support,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.sectionTitle,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  sectionSubGuide: {
    fontSize: TYPOGRAPHY.support,
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
    fontSize: TYPOGRAPHY.label,
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
    fontSize: TYPOGRAPHY.caption,
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
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    marginBottom: 1,
  },
  envDetail: {
    fontSize: TYPOGRAPHY.support,
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
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  aiFeedbackCard: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#6366F1',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  aiFeedbackTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  aiFeedbackTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '800',
    color: '#4338CA',
  },
  aiFeedbackSummary: {
    fontSize: TYPOGRAPHY.support,
    fontWeight: '600',
    color: '#312E81',
    marginBottom: 4,
  },
  aiFeedbackBriefing: {
    fontSize: TYPOGRAPHY.label,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 8,
  },
  aiFeedbackQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingVertical: 9,
    borderRadius: 10,
  },
  aiFeedbackQuickBtnText: {
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
