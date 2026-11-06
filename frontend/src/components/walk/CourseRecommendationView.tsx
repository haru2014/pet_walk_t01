import { TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
/**
 * [편안하개 - PetWalk]
 * 모바일 추천 산책 코스 화면 (Screen-04, docs/screenshots/04_course_recommendation.png 원형 복원 및 스크롤 방지 최적화)
 *
 * 1. 상단: 뒤로가기 & '추천 산책 코스' 헤더 + 실시간 AI 맞춤 코스 뱃지
 * 2. 상단 브리핑: "✨ {dog.name}에게 맞는 산책 코스를 찾았어요." & 안내문 & 조건 태그 칩들
 * 3. 중앙: 실시간 보행로 지도 (flex: 1로 뷰포트에 유연 적응하여 스크롤 배제)
 * 4. 하단 카드: 대체 코스 미리보기 + 즐겨찾기 + 코스 요약 및 안심 지표
 * 5. 하단 Thumb Zone: [이 코스로 산책 시작하기] 버튼
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { requestWalkPlan, RoutePlanResult } from '../../services/api';
import { createBookmark } from '../../services/bookmarkService';
import { buildAdaptiveConditionLabels, extractCourseScore } from '../../services/courseAdaptivePlanner';
import { getCoursePlanById, getCoursePlanByParkId } from '../../services/sampleRoute';
import { useAppTheme } from '../../theme/themeManager';
import { useAppResponsive } from '../../hooks/useAppResponsive';
import { AppIcon } from '../common/AppIcon';
import { AppScreenHeader } from '../common/AppScreenHeader';
import { CoursePlan } from '../../types/bookmark';
import { DogProfile, toWalkDogSummary } from '../../types/dogProfile';
import { formatStairsCountLabel, RecommendedCourse, WalkPreferences } from '../../types/walkSettings';
import { RouteMapView } from '../map/RouteMapView';
import { FeedbackSummaryPayload } from '../../services/feedbackContext';
import { PlanSourceBadge } from './PlanSourceBadge';
import { CourseNoticeLine } from './CourseNoticeLine';
import { BookmarkToggleButton } from '../bookmark/BookmarkToggleButton';
import { VoiceQuickControlBar } from '../voice/VoiceQuickControlBar';
import { formatCourseSlope, formatCourseSurface } from '../../services/routeProfileFormatter';
import { mergeCurrentLocationPin } from '../../services/locationPinHelper';
import { getCurrentLocationCoords } from '../../services/locationService';
import { analyzeCourseLaps, mergeLoopStartPin } from '../../services/courseLapInfo';
import { WORLDCOVER_ATTRIBUTION } from '../../constants/legalTerms';
import { getPilotParkById } from '../../types/pilotParks';
import { WalkPlanLoadingView } from './WalkPlanLoadingView';

/**
 * 코스 표시 명칭 정제 (지역명/괄호 별칭 압축, 기계적 수식어 개선, 불필요한 "1안" 및 중복 거리 제거)
 */
export function formatCourseDisplayName(name: string): string {
  if (!name) return '';
  return name
    .replace(/(?:^|\s)\d+안/g, '')
    .replace(/(?:^|\s)\d+(?:\.\d+)?\s*km\b/gi, '')
    .replace(/갑천생태호수공원\s*\(도안호수공원\)/g, '도안호수공원')
    .replace(/^([\p{Extended_Pictographic}\u2300-\u27BF\uFE0F\u200D]+\s*)?(?:대전|세종)\s+/u, (_, emoji) => emoji ?? '')
    .replace(/내부\s*보행로/g, '순환로')
    .split('·')
    .map((part) => part.trim().replace(/\s{2,}/g, ' '))
    .filter(Boolean)
    .join(' · ');
}

/**
 * 코스별 고유 특징 뱃지 (동일 코스명 또는 후보 간 차별화 요소)
 */
export function getCourseFeatureBadge(
  course: Partial<RecommendedCourse>,
  index: number
): { label: string; icon: string; color: string; bgColor: string } {
  if (course.lapCount && course.lapCount > 1) {
    return { label: `${course.lapCount}바퀴 순환`, icon: '🔄', color: '#D97706', bgColor: '#FEF3C7' };
  }

  if (course.differenceTag) {
    return { label: course.differenceTag, icon: '✨', color: '#0D9488', bgColor: '#CCFBF1' };
  }

  if (index === 0) {
    return { label: '최적 맞춤', icon: '🏆', color: '#D97706', bgColor: '#FEF3C7' };
  }

  const soft = course.softSurfacePercent ?? 0;
  const shade = course.shadePercent ?? 0;
  const slope = course.maxSlopePercent ?? 10;
  const stairs = course.stairsCount;
  const noStairs = stairs === '0' || stairs === '0회' || stairs === '확인된 계단 0회';

  if (soft >= 60) {
    return { label: '폭신 흙길', icon: '🌿', color: '#16A34A', bgColor: '#DCFCE7' };
  }
  if (shade >= 60) {
    return { label: '그늘 우선', icon: '🌳', color: '#0D9488', bgColor: '#CCFBF1' };
  }
  if (slope <= 3.0 && noStairs) {
    return { label: '완만 평지', icon: '🐾', color: '#2563EB', bgColor: '#DBEAFE' };
  }

  if (index === 1) {
    return { label: '추천 2안', icon: '🚶', color: '#4B5563', bgColor: '#F3F4F6' };
  }
  return { label: '추천 3안', icon: '🍃', color: '#4B5563', bgColor: '#F3F4F6' };
}

/**
 * 코스 추천 사유 문구 정제 (중복 점수 접두어, 거리, 불필요한 "1안" 및 타이틀 중복 제거)
 * 동일 경로 반복 산책 시 2줄 이내로 안내 문구 지원
 */
export function formatCourseReasonText(
  reason: string,
  courseName?: string,
  lapCount?: number,
  lapCycleMeters?: number | null
): string {
  if (lapCount && lapCount > 1 && lapCycleMeters && lapCycleMeters > 0) {
    return `순환로(약 ${Math.round(lapCycleMeters)}m)를 ${lapCount}바퀴 반복하는 코스입니다.\n실측 지표 기반의 안전하고 쾌적한 산책로예요.`;
  }

  if (!reason) return '';

  if (reason.includes('반복하는 코스')) {
    return reason.trim();
  }

  let cleaned = reason
    .replace(/^AI\s*맞춤(?:\s*점수)?\s*\d+점:?\s*/i, '')
    .trim();

  cleaned = formatCourseDisplayName(cleaned);

  if (courseName) {
    const targetName = formatCourseDisplayName(courseName).trim();
    const targetNoIcon = targetName.replace(/^[\p{Emoji}\u2000-\u3300]\s*/u, '').trim();

    for (const cand of [targetName, targetNoIcon]) {
      if (cand && cleaned.startsWith(cand)) {
        cleaned = cleaned.slice(cand.length).trim();
        break;
      }
    }
  }

  cleaned = cleaned
    .replace(/^[·\-\s]+/, '')
    .replace(/·\s*·+/g, '·')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // (실측 최대 경사 X%) 형태만 남았을 경우 친절한 안내 문장으로 보완
  const slopeMatch = /^\(?(실측\s*최대\s*경사\s*\d+(?:\.\d+)?%)\)?$/.exec(cleaned);
  if (slopeMatch) {
    return `${slopeMatch[1]}의 완만하고 쾌적한 산책 코스입니다.`;
  }

  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned || reason;
}

/**
 * 실시간 날씨 및 안전 브리핑 내용에 알맞은 대표 날씨 아이콘 반환
 */
export function getWeatherEmoji(text?: string): string {
  if (!text) return '🌤️';
  if (/비|우비|우천|소나기|젖은/i.test(text)) return '🌧️';
  if (/눈|빙판|결빙|한파/i.test(text)) return '❄️';
  if (/폭염|더위|지면열|뜨거/i.test(text)) return '☀️';
  if (/바람|강풍|돌풍/i.test(text)) return '💨';
  if (/흐림|구름|흐려/i.test(text)) return '☁️';
  return '🐾';
}

/**
 * 테마의 주 색상(Primary)과 뚜렷하게 대비되는 추천 코스 강조 색상
 */
export function getThemeContrastingAccentColor(
  theme: string,
  colors?: { accent?: string; primary?: string }
): string {
  switch (theme) {
    case 'dusty_amber':
      // 주 색상: 세이지 그린(#5A7361) / 대비 색상: 딥 웜 앰버 골드
      return '#D97706';
    case 'forest':
    case 'mint':
      // 주 색상: 포레스트/민트 그린(#10B981) / 대비 색상: 딥 앰버 오렌지
      return '#D97706';
    case 'vivid_violet':
      // 주 색상: 비비드 바이올렛(#7C3AED) / 대비 색상: 골드 앰버
      return '#D97706';
    case 'ocean':
      // 주 색상: 오션 블루(#2563EB) / 대비 색상: 비비드 텐저린 오렌지
      return '#EA580C';
    case 'coral':
      // 주 색상: 코랄 오렌지(#F97316) / 대비 색상: 딥 오션 스카이 블루
      return '#0284C7';
    case 'dark':
      // 주 색상: 네온 에메랄드(#10B981) / 대비 색상: 네온 앰버 골드
      return '#FBBF24';
    default:
      return colors?.accent || '#D97706';
  }
}

export interface CourseRecommendationViewProps {
  dog: DogProfile;
  preferences?: WalkPreferences;
  feedback?: FeedbackSummaryPayload | null;
  onBack: () => void;
  onStartWalk: (course: RecommendedCourse, plan?: CoursePlan) => void;
  onPinSelect?: (instruction: string) => void;
  initialCourses?: readonly RecommendedCourse[];
  initialPlanResult?: RoutePlanResult | null;
  initialLoading?: boolean;
}

interface RegenerateSuccessResult {
  readonly fresh: ReadonlySet<string>;
  readonly nextIndex: number;
  readonly notice: string | null;
}

function computeRegenerateChanges(
  previousCourses: readonly RecommendedCourse[],
  newCourses: readonly RecommendedCourse[]
): RegenerateSuccessResult {
  const previousIds = new Set(previousCourses.map((c) => c.id));
  const fresh = new Set(newCourses.slice(1).map((c) => c.id).filter((id) => !previousIds.has(id)));
  const firstFreshIndex = newCourses.findIndex((c, i) => i > 0 && fresh.has(c.id));
  const nextIndex = Math.max(0, firstFreshIndex);
  const notice = fresh.size > 0 ? '1번 추천 코스는 그대로 두고, 새로운 2·3번 대안 코스를 불러왔어요!' : null;
  return { fresh, nextIndex, notice };
}

interface CourseSafetyMetricsBarProps {
  readonly course: RecommendedCourse;
  readonly colors: ReturnType<typeof useAppTheme>['colors'];
}

const CourseSafetyMetricsBar: React.FC<CourseSafetyMetricsBarProps> = ({ course, colors }) => {
  const surfaceInfo = formatCourseSurface(course);
  const slopeInfo = formatCourseSlope(course);

  const surfaceValue = surfaceInfo.isUnknown ? '미확인' : surfaceInfo.valueText;
  const stairsValue =
    course.stairsCount === '0' ||
    course.stairsCount === '0회' ||
    course.stairsCount === '확인된 계단 0회'
      ? '0회'
      : formatStairsCountLabel(course.stairsCount);
  let slopeValue = slopeInfo.valueText;
  if (slopeInfo.isUnknown) {
    slopeValue = '미확인';
  } else if (slopeInfo.numericValue != null) {
    slopeValue = `${slopeInfo.numericValue}%`;
  }
  const shadeValue = course.shadePercent == null ? '미확인' : `${course.shadePercent}%`;

  return (
    <View style={[styles.metricsBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={[styles.metricItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.metricLabelRow}>
          <Text style={styles.metricIcon}>🌿</Text>
          <Text numberOfLines={1} style={[styles.metricLabel, { color: colors.textMuted }]}>폭신</Text>
        </View>
        <Text numberOfLines={1} style={[styles.metricValue, { color: colors.primaryDark }]}>{surfaceValue}</Text>
      </View>
      <View style={[styles.metricItem, styles.metricItemWide, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.metricLabelRow}>
          <Text style={styles.metricIcon}>🪜</Text>
          <Text numberOfLines={1} style={[styles.metricLabel, { color: colors.textMuted }]}>확인된 계단</Text>
        </View>
        <Text numberOfLines={1} style={[styles.metricValue, { color: colors.textMain }]}>{stairsValue}</Text>
      </View>
      <View style={[styles.metricItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.metricLabelRow}>
          <Text style={styles.metricIcon}>📐</Text>
          <Text numberOfLines={1} style={[styles.metricLabel, { color: colors.textMuted }]}>경사</Text>
        </View>
        <Text numberOfLines={1} style={[styles.metricValue, { color: colors.textMain }]}>{slopeValue}</Text>
      </View>
      <View style={[styles.metricItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.metricLabelRow}>
          <Text style={styles.metricIcon}>🌳</Text>
          <Text numberOfLines={1} style={[styles.metricLabel, { color: colors.textMuted }]}>그늘</Text>
        </View>
        <Text numberOfLines={1} style={[styles.metricValue, { color: colors.textMain }]}>{shadeValue}</Text>
      </View>
    </View>
  );
};

interface CourseBriefingSectionProps {
  dogName: string;
  safetyBriefingText: string;
  conditionLabels: readonly string[];
  colors: ReturnType<typeof useAppTheme>['colors'];
  courseRecommend: ReturnType<typeof useAppResponsive>['courseRecommend'];
}

const CourseBriefingSection: React.FC<CourseBriefingSectionProps> = ({
  dogName,
  safetyBriefingText,
  conditionLabels,
  colors,
  courseRecommend: _courseRecommend,
}) => (
  <View style={[styles.briefingSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
    <View style={styles.titleRow}>
      <AppIcon name="sparkle" size={16} color={colors.primaryDark} />
      <Text style={[styles.briefingTitle, { color: colors.textMain, fontSize: 16 }]}>
        {dogName}에게 맞는 산책 코스를 찾았어요.
      </Text>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScrollRow} contentContainerStyle={styles.tagScrollContent}>
      {safetyBriefingText ? (
        <View style={[styles.safetyChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={styles.safetyChipIcon}>{getWeatherEmoji(safetyBriefingText)}</Text>
          <Text numberOfLines={1} style={[styles.safetyChipText, { color: colors.textMain }]}>
            {safetyBriefingText}
          </Text>
        </View>
      ) : null}
      {conditionLabels.map((lbl) => (
        <View
          key={lbl}
          style={[
            styles.tagChip,
            { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint, borderWidth: 1 },
          ]}
        >
          <Text style={[styles.tagText, { color: colors.primaryDark }]}>{lbl}</Text>
        </View>
      ))}
    </ScrollView>
  </View>
);

interface CourseChipRowProps {
  courses: readonly RecommendedCourse[];
  selectedCourseIndex: number;
  onSelectCourse: (index: number) => void;
  freshCourseIds: ReadonlySet<string>;
  colors: ReturnType<typeof useAppTheme>['colors'];
}

function getCourseBadgeTag(isFresh: boolean, characteristic?: string): string | undefined {
  if (isFresh && characteristic) return `NEW · ${characteristic}`;
  if (isFresh) return 'NEW';
  return characteristic;
}

const CoursePreviewCardRow: React.FC<CourseChipRowProps> = ({
  courses,
  selectedCourseIndex,
  onSelectCourse,
  freshCourseIds,
  colors,
}) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.coursePreviewScroll}
      contentContainerStyle={styles.coursePreviewRow}
    >
      {courses.map((c, idx) => {
        const isSelected = idx === selectedCourseIndex;
        const characteristic = c.lapCount != null && c.lapCount > 1
          ? `${c.lapCount}바퀴 순환`
          : c.differenceTag;
        const score = extractCourseScore(c);
        const badgeTag = getCourseBadgeTag(freshCourseIds.has(c.id), characteristic);

        return (
          <TouchableOpacity
            key={c.id}
            activeOpacity={0.8}
            onPress={() => onSelectCourse(idx)}
            style={[
              styles.coursePreviewCard,
              {
                backgroundColor: isSelected ? colors.primaryWash : colors.surface,
                borderColor: isSelected ? colors.primary : colors.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${formatCourseDisplayName(c.name)}, ${c.distanceKm}, 약 ${c.estimatedMinutes}분`}
          >
            <Text numberOfLines={1} style={[styles.coursePreviewName, { color: isSelected ? colors.primaryDark : colors.textMain, fontWeight: isSelected ? '800' : '700' }]}>
              {formatCourseDisplayName(c.name)}
            </Text>
            <Text numberOfLines={1} style={[styles.coursePreviewMeta, { color: isSelected ? colors.primaryDark : colors.textMuted }]}>
              {c.distanceKm} · 약 {c.estimatedMinutes}분{score == null ? '' : ` · ${score}점`}
            </Text>
            {badgeTag && (
              <Text numberOfLines={1} style={[styles.coursePreviewTag, { color: colors.primaryDark }]}>
                {badgeTag}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

interface CourseHeaderTitleRowProps {
  currentCourse: RecommendedCourse;
  lapInfo: ReturnType<typeof analyzeCourseLaps>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  courseRecommend: ReturnType<typeof useAppResponsive>['courseRecommend'];
  bookmarkCandidate: ReturnType<typeof createBookmark> | null;
}

function getPlanErrorMessage(error: unknown, requiresValidatedPark: boolean): string {
  if (error instanceof Error) return error.message;
  return requiresValidatedPark
    ? '공원 내부 경로를 생성하지 못했습니다.'
    : '현재 위치 주변 산책 경로를 생성하지 못했습니다.';
}

const CourseHeaderTitleRow: React.FC<CourseHeaderTitleRowProps> = ({
  currentCourse,
  lapInfo,
  colors,
  courseRecommend,
  bookmarkCandidate,
}) => {
  const lapCount = currentCourse.lapCount ?? lapInfo?.lapCount;
  const distanceLabel = `${currentCourse.distanceKm.replace(/km$/i, '').trim()}km`;
  return (
    <View style={styles.courseHeaderRow}>
      <View style={styles.courseTitleCol}>
        <Text
          style={[styles.courseName, { color: colors.textMain, fontSize: Math.min(16, courseRecommend.courseTitleSize) }]}
          numberOfLines={1}
        >
          {formatCourseDisplayName(currentCourse.name)}
        </Text>
        <Text
          style={[
            styles.courseMetaText,
            { color: colors.primaryDark, fontSize: Math.min(12, Math.max(10, courseRecommend.metricLabelSize)) },
          ]}
          numberOfLines={1}
        >
          {lapCount && lapCount > 1 ? `🔄 ${lapCount}바퀴 · ` : ''}
          {distanceLabel} · 약 {currentCourse.estimatedMinutes}분
        </Text>
      </View>
      <BookmarkToggleButton bookmark={bookmarkCandidate} style={styles.bookmarkButton} />
    </View>
  );
};

export const CourseRecommendationView: React.FC<CourseRecommendationViewProps> = ({
  dog,
  preferences,
  feedback,
  onBack,
  onStartWalk,
  onPinSelect,
  initialCourses,
  initialPlanResult,
  initialLoading,
}) => {
  const { colors } = useAppTheme();
  const { courseRecommend, scale } = useAppResponsive();
  const requiresValidatedPark = (preferences?.originMode ?? 'park') !== 'current_location';
  const [planError, setPlanError] = useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState(initialLoading ?? !initialPlanResult);
  const retryInFlightRef = React.useRef(false);
  const [courses, setCourses] = useState<readonly RecommendedCourse[]>(initialCourses ?? []);
  const [selectedCourseIndex, setSelectedCourseIndex] = useState(0);
  const [planResult, setPlanResult] = useState<RoutePlanResult | null>(initialPlanResult ?? null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateNonce, setRegenerateNonce] = useState(0);
  const [freshCourseIds, setFreshCourseIds] = useState<ReadonlySet<string>>(() => new Set());
  const [regenerateNotice, setRegenerateNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!regenerateNotice) return undefined;
    const timer = setTimeout(() => setRegenerateNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [regenerateNotice]);
  const [requestInputs, setRequestInputs] = useState({ dog, preferences, feedback });
  if (requestInputs.dog !== dog || requestInputs.preferences !== preferences || requestInputs.feedback !== feedback) {
    setRequestInputs({ dog, preferences, feedback });
    setPlanResult(initialPlanResult ?? null);
    setPlanError(null);
    setIsPlanLoading(initialLoading ?? !initialPlanResult);
    setSelectedCourseIndex(0);
    setRegenerateNonce(0);
    setFreshCourseIds(new Set());
    setRegenerateNotice(null);
    setCourses(initialCourses ?? []);
  }

  useEffect(() => {
    if (initialPlanResult) return undefined;
    let isMounted = true;
    void requestWalkPlan(dog, preferences, feedback).then((res) => {
      if (!isMounted) return;
      setPlanResult(res);
      if (res.courses.length > 0) {
        setCourses(res.courses);
      } else {
        setPlanError('선택한 조건에 맞는 경로를 찾지 못했습니다. 다시 시도해 주세요.');
        setCourses([]);
      }
    }).catch((error: unknown) => {
      if (!isMounted) return;
      setPlanError(getPlanErrorMessage(error, requiresValidatedPark));
      setCourses([]);
    }).finally(() => {
      if (isMounted) setIsPlanLoading(false);
    });
    return () => { isMounted = false; };
  }, [dog, preferences, feedback, requiresValidatedPark, initialPlanResult]);

  const handleRetryPlan = () => {
    if (retryInFlightRef.current || isPlanLoading) return;
    retryInFlightRef.current = true;
    setIsPlanLoading(true);
    setPlanError(null);
    void requestWalkPlan(dog, preferences, feedback)
      .then((res) => {
        setPlanResult(res);
        setCourses(res.courses);
        setSelectedCourseIndex(0);
        if (res.courses.length === 0) {
          setPlanError('선택한 조건으로 경로를 찾지 못했습니다. 다시 시도해 주세요.');
        }
      })
      .catch((error: unknown) => {
        setPlanError(getPlanErrorMessage(error, requiresValidatedPark));
        setCourses([]);
      })
      .finally(() => {
        retryInFlightRef.current = false;
        setIsPlanLoading(false);
      });
  };

  const handleRegenerateRoute = () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    const nextNonce = regenerateNonce + 1;
    setRegenerateNonce(nextNonce);

    void requestWalkPlan(dog, preferences, feedback, { regenerateNonce: nextNonce })
      .then((res) => {
        setPlanResult(res);
        if (res.courses.length > 0) {
          const { fresh, nextIndex, notice } = computeRegenerateChanges(courses, res.courses);
          setFreshCourseIds(fresh);
          setCourses(res.courses);
          setSelectedCourseIndex(nextIndex);
          if (notice) setRegenerateNotice(notice);
          return;
        }
        setSelectedCourseIndex(0);
      })
      .catch((error: unknown) => {
        setPlanError(error instanceof Error ? error.message : '경로를 다시 생성하지 못했습니다.');
      })
      .finally(() => {
        setIsRegenerating(false);
      });
  };

  const isCurrentLocOrigin = (preferences?.originMode ?? 'park') === 'current_location';
  const [gpsCoords, setGpsCoords] = useState<{ lon: number; lat: number } | null>(() => {
    if (preferences?.userCoordinates) {
      return { lon: preferences.userCoordinates.lon, lat: preferences.userCoordinates.lat };
    }
    return null;
  });

  const currentCourse = courses[selectedCourseIndex] ?? courses[0];
  const currentCourseId = currentCourse?.id;
  const coursePlans = planResult?.coursePlans;
  const userCoordinates = preferences?.userCoordinates;
  const userCoordsLon = userCoordinates?.lon;
  const userCoordsLat = userCoordinates?.lat;
  const pilotParkId = preferences?.pilotParkId;

  const candidatePlan = useMemo(() => {
    if (!currentCourseId || !coursePlans) return undefined;
    // 1순위: 코스 ID 직접 매칭
    if (coursePlans[currentCourseId]) {
      return coursePlans[currentCourseId];
    }
    // 2순위: 서버 코스 플랜 목록의 인덱스 순서 매칭 (후보 경로 ID 표기 차이 방어)
    const planValues = Object.values(coursePlans);
    if (planValues[selectedCourseIndex]) {
      return planValues[selectedCourseIndex];
    }
    return undefined;
  }, [currentCourseId, coursePlans, selectedCourseIndex]);

  const activePlan = useMemo(() => {
    if (candidatePlan) return candidatePlan;
    if (planResult?.route && selectedCourseIndex === 0) {
      return { route: planResult.route, stepPins: planResult.stepPins };
    }

    // 현재 위치 모드는 서버가 준 코스별 경로만 그린다. 공원 샘플이나 앱이 만든 도형으로 대신하지 않는다.
    if (isCurrentLocOrigin || !currentCourse || !planResult || requiresValidatedPark) {
      return { route: { type: 'FeatureCollection' as const, features: [] }, stepPins: [] };
    }
    const fallbackIndex = selectedCourseIndex === 0
      ? 0
      : (((selectedCourseIndex - 1 + regenerateNonce * 2) % 2) + 1);

    return getCoursePlanById(
      currentCourse?.id,
      getCoursePlanByParkId(pilotParkId, fallbackIndex)
    );
  }, [candidatePlan, currentCourse, planResult, selectedCourseIndex, requiresValidatedPark, regenerateNonce, isCurrentLocOrigin, pilotParkId]);

  const loadingMapCenter = useMemo(() => {
    if (isCurrentLocOrigin && gpsCoords) return [gpsCoords.lon, gpsCoords.lat] as const;
    if (isCurrentLocOrigin && userCoordsLon != null && userCoordsLat != null) {
      return [userCoordsLon, userCoordsLat] as const;
    }
    const park = getPilotParkById(pilotParkId);
    return [park.center.lon, park.center.lat] as const;
  }, [isCurrentLocOrigin, gpsCoords, userCoordsLon, userCoordsLat, pilotParkId]);

  useEffect(() => {
    if (isCurrentLocOrigin && !gpsCoords) {
      let isMounted = true;
      void getCurrentLocationCoords(4000).then((res) => {
        if (isMounted && res.ok && res.coords) {
          setGpsCoords({ lon: res.coords.longitude, lat: res.coords.latitude });
        }
      });
      return () => { isMounted = false; };
    }
  }, [isCurrentLocOrigin, gpsCoords]);

  const activeRoute = activePlan.route;
  // 같은 순환로를 여러 바퀴 도는 코스는 바퀴 수·순환 구간을 카드와 지도에 함께 표시한다.
  const lapInfo = useMemo(
    () => analyzeCourseLaps(activeRoute, currentCourse?.lapCount, currentCourse?.lapCycleMeters, {
      loopEntryPoint: currentCourse?.loopEntryPoint,
      approachDistanceM: currentCourse?.approachDistanceM,
    }),
    [activeRoute, currentCourse?.lapCount, currentCourse?.lapCycleMeters, currentCourse?.loopEntryPoint, currentCourse?.approachDistanceM],
  );
  const activePins = useMemo(() => {
    const pins = mergeLoopStartPin(activePlan.stepPins, lapInfo);
    if (isCurrentLocOrigin && gpsCoords) {
      return mergeCurrentLocationPin(pins, gpsCoords.lon, gpsCoords.lat);
    }
    return pins;
  }, [activePlan.stepPins, lapInfo, isCurrentLocOrigin, gpsCoords]);
  const plan: CoursePlan = useMemo(() => ({ route: activeRoute, stepPins: activePins }), [activeRoute, activePins]);
  const bookmarkCandidate = useMemo(
    () => (currentCourse ? createBookmark(currentCourse, plan, toWalkDogSummary(dog)) : null),
    [currentCourse, plan, dog],
  );

  const conditionLabels = useMemo(() => {
    const base = buildAdaptiveConditionLabels(dog, preferences);
    if (feedback && feedback.recommended_max_slope_offset < 0) {
      base.push(`경사 완화 ${Math.abs(feedback.recommended_max_slope_offset)}%`);
    }
    return base;
  }, [dog, preferences, feedback]);

  const safetyBriefingText = planResult?.safetyBriefingMessage ?? '';

  if (!currentCourse || !planResult || isPlanLoading) {
    const park = getPilotParkById(preferences?.pilotParkId);
    const displayName = isCurrentLocOrigin ? '현재 위치' : park.shortName;
    return (
      <WalkPlanLoadingView
        parkName={displayName}
        mapCenter={loadingMapCenter}
        isLoading={isPlanLoading}
        error={planError}
        onBack={onBack}
        onRetry={handleRetryPlan}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 1. 상단 공통 규격 헤더 (48px 터치타깃 보장) */}
      <AppScreenHeader
        title="추천 산책 코스"
        titleFontSize={courseRecommend.briefingTitleSize >= 20 ? 22 : 21}
        onBack={onBack}
        rightAction={
          <View style={styles.headerRightGroup}>
            <VoiceQuickControlBar compact style={styles.headerVoiceBar} />
            <PlanSourceBadge isLive={Boolean(planResult?.isLiveServer)} />
          </View>
        }
      />

      {/* Keep the map in the flexible area; only the course strip below it scrolls. */}
      <CourseBriefingSection
        dogName={dog.name}
        safetyBriefingText={safetyBriefingText}
        conditionLabels={conditionLabels}
        colors={colors}
        courseRecommend={courseRecommend}
      />
      <View style={styles.mapSection}>
        <RouteMapView
          route={activeRoute}
          stepPins={activePins}
          speedKmH={dog.speedKmH}
          fillContainer
          showDirectionToggle
          onStart={() => onStartWalk(currentCourse, plan)}
          onPinSelect={onPinSelect}
        />
      </View>

      {planResult?.elevationAttribution || currentCourse.shadePercent != null ? (
        <View style={styles.attributionContainer}>
          {planResult?.elevationAttribution ? (
            <Text numberOfLines={1} style={[styles.elevationAttribution, { color: colors.textMuted }]}>
              {planResult.elevationAttribution}
            </Text>
          ) : null}
          {currentCourse.shadePercent != null ? (
            <Text numberOfLines={1} style={[styles.elevationAttribution, { color: colors.textMuted }]}>
              {WORLDCOVER_ATTRIBUTION}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* 4. 하단 코스 요약 & 대체 코스 & Thumb Zone 시작 버튼 */}
      <View style={[styles.bottomCard, { paddingVertical: scale(3, 4, 5), paddingHorizontal: courseRecommend.cardPaddingH, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {/* Course previews stay below the map and scroll independently across full width. */}
        <CoursePreviewCardRow
          courses={courses}
          selectedCourseIndex={selectedCourseIndex}
          onSelectCourse={setSelectedCourseIndex}
          freshCourseIds={freshCourseIds}
          colors={colors}
        />

        {/* 코스명과 반복 횟수·거리·시간 및 찜하기 버튼 */}
        <CourseHeaderTitleRow
          currentCourse={currentCourse}
          lapInfo={lapInfo}
          colors={colors}
          courseRecommend={courseRecommend}
          bookmarkCandidate={bookmarkCandidate}
        />
        {/* 4대 안심 지표 바 (노면 / 계단 / 경사 / 그늘) */}
        <CourseSafetyMetricsBar course={currentCourse} colors={colors} />
        {/* 서버 코스 안내 (짧은 공원 코스, 고른 조건의 실측 반영 정도) */}
        <CourseNoticeLine notice={currentCourse.notice} colors={colors} />

        {regenerateNotice ? (
          <View
            accessibilityLiveRegion="polite"
            style={[styles.reasonBox, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint }]}
          >
            <Text style={[styles.reasonText, { color: colors.primaryDark, fontSize: courseRecommend.metricLabelSize }]}>
              ✨ {regenerateNotice}
            </Text>
          </View>
        ) : null}

        {/* Thumb Zone 산책 시작 & 다시 추천 버튼 그룹 (Option 2) */}
        <View style={styles.bottomActionRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleRegenerateRoute}
            disabled={isRegenerating}
            style={[
              styles.regenerateButton,
              {
                height: scale(46, 48, 54),
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: isRegenerating ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="다른 코스 다시 추천받기"
          >
            <View style={styles.btnContent}>
              <AppIcon name="refresh" size={16} color={colors.primaryDark} />
              <Text
                style={[
                  styles.regenerateButtonText,
                  {
                    color: colors.primaryDark,
                    fontSize: courseRecommend.startButtonFontSize ? Math.max(12, courseRecommend.startButtonFontSize - 2) : 13,
                  },
                ]}
              >
                {isRegenerating ? '생성 중…' : '다시 추천'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => onStartWalk(currentCourse, plan)}
            style={[styles.startButton, { height: scale(46, 48, 54), backgroundColor: colors.primary }]}
          >
            <View style={styles.btnContent}>
              <AppIcon name="paw" size={18} color={colors.textWhite} />
              <Text style={[styles.startButtonText, { fontSize: courseRecommend.startButtonFontSize, color: colors.textWhite }]}>
                이 코스로 산책 시작하기
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: TYPOGRAPHY.screenTitle, fontWeight: '700', letterSpacing: -0.3 },
  headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerVoiceBar: { marginTop: 0, alignSelf: 'auto' },
  briefingSection: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  briefingTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  tagScrollRow: { flexDirection: 'row' },
  tagScrollContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  safetyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  safetyChipIcon: { fontSize: 12 },
  safetyChipText: { fontSize: 12, fontWeight: '700', letterSpacing: -0.1 },
  tagChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  tagText: { fontSize: 12, fontWeight: '700' },
  mapSection: { flex: 1, minHeight: 0, width: '100%', alignItems: 'stretch' },
  attributionContainer: {
    paddingHorizontal: 14,
    paddingVertical: 2,
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  elevationAttribution: { fontSize: 8, lineHeight: 11, opacity: 0.65 },
  bottomCard: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 5,
    gap: 3,
    flexShrink: 0,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coursePreviewScroll: { width: '100%', height: 50 },
  coursePreviewRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  coursePreviewCard: {
    width: 145,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  routePreview: {
    width: '100%',
    height: 23,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  routePreviewUnavailable: { fontSize: 8, fontWeight: '600' },
  coursePreviewName: { fontSize: 13, fontWeight: '700' },
  coursePreviewMeta: { fontSize: 11.5, fontWeight: '600' },
  coursePreviewTag: { fontSize: 10, fontWeight: '700' },
  coursePreviewSelected: { fontSize: 10, fontWeight: '700' },
  bookmarkButton: { height: 32 },
  courseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 1,
    minWidth: 0,
  },
  courseTitleCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    gap: 1,
  },
  courseName: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '800',
    flexShrink: 1,
  },
  scoreBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  scoreBadgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '800' },
  reasonBox: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
  },
  reasonText: {
    fontSize: TYPOGRAPHY.support,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.support,
    letterSpacing: -0.1,
  },
  courseMetaText: { fontSize: TYPOGRAPHY.caption, fontWeight: '800', letterSpacing: -0.2 },
  metricsBar: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  metricItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 3,
    paddingHorizontal: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  metricItemWide: {
    flex: 1.25,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  metricIcon: { fontSize: 11 },
  metricLabel: { fontSize: 11.5, fontWeight: '600', letterSpacing: -0.2 },
  metricValue: { fontSize: 13.5, fontWeight: '800', letterSpacing: -0.2 },
  bottomActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  regenerateButton: {
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  regenerateButtonText: {
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  startButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  startButtonText: { fontSize: TYPOGRAPHY.button, fontWeight: '700', letterSpacing: -0.2 },
});
