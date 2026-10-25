import { TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
/**
 * [편안하개 - PetWalk]
 * 모바일 추천 산책 코스 화면 (Screen-04, docs/screenshots/04_course_recommendation.png 원형 복원 및 스크롤 방지 최적화)
 *
 * 1. 상단: 뒤로가기 & '추천 산책 코스' 헤더 + 실시간 AI 맞춤 코스 뱃지
 * 2. 상단 브리핑: "✨ {dog.name}에게 맞는 산책 코스를 찾았어요." & 안내문 & 조건 태그 칩들
 * 3. 중앙: 실시간 보행로 지도 (flex: 1로 뷰포트에 유연 적응하여 스크롤 배제)
 * 4. 하단 카드: 대체 코스 칩(추천 1/2/3) + 즐겨찾기 + 거리/시간/3대 안심 지표 + 추천 사유
 * 5. 하단 Thumb Zone: [이 코스로 산책 시작하기] 버튼
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { requestWalkPlan, RoutePlanResult } from '../../services/api';
import { createBookmark } from '../../services/bookmarkService';
import { generateAdaptiveCourses, buildAdaptiveConditionLabels, extractCourseScore } from '../../services/courseAdaptivePlanner';
import { getCoursePlanById, getCoursePlanByParkId } from '../../services/sampleRoute';
import { useAppTheme } from '../../theme/themeManager';
import { useAppResponsive } from '../../hooks/useAppResponsive';
import { AppIcon } from '../common/AppIcon';
import { AppScreenHeader } from '../common/AppScreenHeader';
import { CoursePlan } from '../../types/bookmark';
import { buildCourseSummary } from '../../services/routeGeometry';
import { DogProfile, toWalkDogSummary } from '../../types/dogProfile';
import { formatShadePercentLabel, formatStairsCountLabel, RecommendedCourse, WalkPreferences } from '../../types/walkSettings';
import { RouteMapView } from '../map/RouteMapView';
import { FeedbackSummaryPayload } from '../../services/feedbackContext';
import { PlanSourceBadge } from './PlanSourceBadge';
import { BookmarkToggleButton } from '../bookmark/BookmarkToggleButton';
import { VoiceQuickControlBar } from '../voice/VoiceQuickControlBar';
import { formatCourseSlope, formatCourseSurface } from '../../services/routeProfileFormatter';
import { mergeCurrentLocationPin } from '../../services/locationPinHelper';
import { getCurrentLocationCoords } from '../../services/locationService';

export interface CourseRecommendationViewProps {
  dog: DogProfile;
  preferences?: WalkPreferences;
  feedback?: FeedbackSummaryPayload | null;
  onBack: () => void;
  onStartWalk: (course: RecommendedCourse, plan?: CoursePlan) => void;
  onPinSelect?: (instruction: string) => void;
}

export const CourseRecommendationView: React.FC<CourseRecommendationViewProps> = ({
  dog,
  preferences,
  feedback,
  onBack,
  onStartWalk,
  onPinSelect,
}) => {
  const { colors } = useAppTheme();
  const { courseRecommend, scale } = useAppResponsive();
  const requiresValidatedPark = (preferences?.originMode ?? 'park') !== 'current_location';
  const [planError, setPlanError] = useState<string | null>(null);
  const [courses, setCourses] = useState<readonly RecommendedCourse[]>(() =>
    requiresValidatedPark ? [] : generateAdaptiveCourses(dog, preferences, feedback)
  );
  const [selectedCourseIndex, setSelectedCourseIndex] = useState(0);
  const [planResult, setPlanResult] = useState<RoutePlanResult | null>(null);
  const [requestInputs, setRequestInputs] = useState({ dog, preferences, feedback });
  if (requestInputs.dog !== dog || requestInputs.preferences !== preferences || requestInputs.feedback !== feedback) {
    setRequestInputs({ dog, preferences, feedback });
    setPlanResult(null);
    setPlanError(null);
    setSelectedCourseIndex(0);
    setCourses(requiresValidatedPark ? [] : generateAdaptiveCourses(dog, preferences, feedback));
  }

  useEffect(() => {
    let isMounted = true;
    void requestWalkPlan(dog, preferences, feedback).then((res) => {
      if (!isMounted) return;
      setPlanResult(res);
      if (res.courses.length > 0) setCourses(res.courses);
    }).catch((error: unknown) => {
      if (!isMounted) return;
      setPlanError(error instanceof Error ? error.message : '공원 내부 경로를 생성하지 못했습니다.');
      setCourses([]);
    });
    return () => { isMounted = false; };
  }, [dog, preferences, feedback, requiresValidatedPark]);

  const currentCourse = courses[selectedCourseIndex] ?? courses[0];
  const candidatePlan = currentCourse?.id ? planResult?.coursePlans?.[currentCourse.id] : undefined;
  const activePlan = useMemo(() => {
    if (candidatePlan) return candidatePlan;
    if (planResult?.isLiveServer && selectedCourseIndex === 0) {
      return { route: planResult.route, stepPins: planResult.stepPins };
    }
    if (requiresValidatedPark) return { route: { type: 'FeatureCollection' as const, features: [] }, stepPins: [] };
    return getCoursePlanById(
      currentCourse?.id,
      getCoursePlanByParkId(preferences?.pilotParkId, selectedCourseIndex)
    );
  }, [candidatePlan, currentCourse?.id, planResult, selectedCourseIndex, preferences?.pilotParkId, requiresValidatedPark]);

  const isCurrentLocOrigin = (preferences?.originMode ?? 'park') === 'current_location';
  const [gpsCoords, setGpsCoords] = useState<{ lon: number; lat: number } | null>(() => {
    if (preferences?.userCoordinates) {
      return { lon: preferences.userCoordinates.lon, lat: preferences.userCoordinates.lat };
    }
    return null;
  });

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
  const activePins = useMemo(() => {
    const pins = activePlan.stepPins;
    if (isCurrentLocOrigin && gpsCoords) {
      return mergeCurrentLocationPin(pins, gpsCoords.lon, gpsCoords.lat);
    }
    return pins;
  }, [activePlan.stepPins, isCurrentLocOrigin, gpsCoords]);
  const plan: CoursePlan = useMemo(() => ({ route: activeRoute, stepPins: activePins }), [activeRoute, activePins]);
  const activeSummary = useMemo(
    () => buildCourseSummary(activeRoute, dog.speedKmH),
    [activeRoute, dog.speedKmH],
  );
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

  if (!currentCourse || (requiresValidatedPark && !planResult)) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 20, justifyContent: 'center', gap: 16 }]}>
        <Text accessibilityRole="alert" style={{ color: colors.textMain }}>
          {planError ?? '선택한 공원 내부의 보행 경로를 확인하고 있어요.'}
        </Text>
        <TouchableOpacity accessibilityRole="button" onPress={onBack} style={[styles.startButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.startButtonText}>산책 설정으로 돌아가기</Text>
        </TouchableOpacity>
      </View>
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

      {/* 지도와 안내가 한 화면에 들어오도록 세로 스크롤 없이 배치 */}
      <View style={styles.mainScroll}>
        {/* 2. 상단 AI 맞춤 브리핑 & 조건 태그 (04_course_recommendation.png 원형 복원) */}
        <View style={[styles.briefingSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.titleRow}>
            <AppIcon name="sparkle" size={16} color={colors.primaryDark} />
            <Text style={[styles.briefingTitle, { color: colors.textMain, fontSize: courseRecommend.briefingTitleSize }]}>
              {dog.name}에게 맞는 산책 코스를 찾았어요.
            </Text>
          </View>
          {safetyBriefingText ? (
            <Text style={[styles.briefingDesc, { color: colors.textMain, opacity: 0.85, fontSize: courseRecommend.briefingSubSize, lineHeight: courseRecommend.briefingSubSize * 1.35 }]}>
              {safetyBriefingText}
            </Text>
          ) : null}
          {/* 가로 태그 칩 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagScrollRow}>
            {conditionLabels.map((lbl) => (
              <View
                key={lbl}
                style={[
                  styles.tagChip,
                  { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.tagText, { color: colors.primaryDark, fontSize: courseRecommend.altCourseChipFont }]}>{lbl}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* 3. 중앙 실시간 지도 (뷰포트에 최적화된 정중앙 배치) */}
        <View style={[styles.mapSection, { minHeight: courseRecommend.mapMinHeight }]}>
          <RouteMapView
            route={activeRoute}
            stepPins={activePins}
            speedKmH={dog.speedKmH}
            stairsCount={currentCourse.stairsCount}
            fillContainer
            onStart={() => onStartWalk(currentCourse, plan)}
            onPinSelect={onPinSelect}
          />
        </View>

        {/* 고도 자료 출처 (Copernicus DEM 라이선스 6조 (b), #76) */}
        {planResult?.elevationAttribution ? (
          <Text style={[styles.elevationAttribution, { color: colors.textMuted }]}>
            고도·경사: {planResult.elevationAttribution}
          </Text>
        ) : null}
      </View>

      {/* 4. 하단 코스 요약 & 대체 코스 & Thumb Zone 시작 버튼 */}
      <View style={[styles.bottomCard, { paddingVertical: courseRecommend.cardPaddingV, paddingHorizontal: courseRecommend.cardPaddingH, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {/* 상단 핸들 바 & 대체 코스 퀵 칩 & 북마크 */}
        <View style={styles.sheetHeaderRow}>
          <View style={styles.courseChipRow}>
            {courses.slice(0, 3).map((c, idx) => {
              const isSelected = idx === selectedCourseIndex;
              const score = extractCourseScore(c);
              const scoreText = score != null ? ` · ${score}점` : '';
              return (
                <TouchableOpacity
                  key={c.id}
                  activeOpacity={0.8}
                  onPress={() => setSelectedCourseIndex(idx)}
                  style={[
                    styles.courseChip,
                    {
                      paddingVertical: courseRecommend.altCourseChipPadV,
                      backgroundColor: isSelected ? colors.primaryWash : colors.background,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.courseChipText,
                      { color: isSelected ? colors.primaryDark : colors.textMain, fontSize: courseRecommend.altCourseChipFont },
                      isSelected && styles.courseChipTextActive,
                    ]}
                  >
                    {idx === 0 ? `👑 추천 1${scoreText}` : `코스 ${idx + 1}${scoreText}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <BookmarkToggleButton bookmark={bookmarkCandidate} />
        </View>

        {/* 코스 명칭 및 핵심 보행 수치 (거리 / 시간 / 속도) */}
        <Text style={[styles.courseName, { color: colors.textMain, fontSize: courseRecommend.courseTitleSize }]}>
          {currentCourse.name}
        </Text>
        <View style={styles.courseMetricsRow}>
          <Text style={[styles.courseMetaText, { color: colors.primaryDark, fontSize: courseRecommend.metricNumberSize }]}>
            {activeSummary.totalDistanceKm.toFixed(1)}km · 약 {activeSummary.estimatedMinutes}분
          </Text>
          {extractCourseScore(currentCourse) != null && (
            <View style={[styles.scoreBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.scoreBadgeText, { color: colors.primaryDark, fontSize: courseRecommend.metricLabelSize }]}>
                AI 맞춤 {extractCourseScore(currentCourse)}점
              </Text>
            </View>
          )}
        </View>

        {/* 코스별 추천 사유 (Issue #155 맞춤 점수 근거 및 실측 지표 안내) */}
        {currentCourse.reason ? (
          <View style={[styles.reasonBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.reasonText, { color: colors.textMain, fontSize: courseRecommend.metricLabelSize, lineHeight: courseRecommend.metricLabelSize * 1.35 }]}>
              💡 {currentCourse.reason}
            </Text>
          </View>
        ) : null}

        {/* 4대 안심 지표 바 (노면 / 계단 / 경사 / 그늘) */}
        {(() => {
          const surfaceInfo = formatCourseSurface(currentCourse);
          const slopeInfo = formatCourseSlope(currentCourse);

          let slopeContent: React.ReactNode;
          if (slopeInfo.isUnknown) {
            slopeContent = <Text style={{ color: colors.textMuted }}>경사도 정보 없음</Text>;
          } else if (slopeInfo.isApproximation) {
            slopeContent = <Text style={{ color: colors.textMain, fontWeight: '700' }}>{slopeInfo.text}</Text>;
          } else {
            slopeContent = <>최대 경사 <Text style={{ color: colors.textMain, fontWeight: '700' }}>{slopeInfo.numericValue}%</Text></>;
          }

          return (
            <View style={[styles.metricsBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.metricText, { color: colors.textMain, fontSize: courseRecommend.metricLabelSize }]}>
                {surfaceInfo.isUnknown ? (
                  <Text style={{ color: colors.textMuted }}>노면 정보 없음</Text>
                ) : (
                  <>폭신 노면 <Text style={{ color: colors.primaryDark, fontWeight: '700' }}>{surfaceInfo.text}</Text></>
                )}
              </Text>
              <Text style={[styles.metricDot, { color: colors.textMuted }]}>·</Text>
              <Text style={[styles.metricText, { color: colors.textMain, fontSize: courseRecommend.metricLabelSize }]}>
                <Text style={{ color: colors.textMain, fontWeight: '700' }}>
                  {formatStairsCountLabel(currentCourse.stairsCount)}
                </Text>
              </Text>
              <Text style={[styles.metricDot, { color: colors.textMuted }]}>·</Text>
              <Text style={[styles.metricText, { color: colors.textMain, fontSize: courseRecommend.metricLabelSize }]}>
                {slopeContent}
              </Text>
              <Text style={[styles.metricDot, { color: colors.textMuted }]}>·</Text>
              <Text style={[styles.metricText, { color: colors.textMain, fontSize: courseRecommend.metricLabelSize }]}>
                {currentCourse.shadePercent == null ? (
                  <Text style={{ color: colors.textMuted }}>{formatShadePercentLabel(currentCourse.shadePercent)}</Text>
                ) : (
                  <>{'그늘 '}<Text style={{ color: colors.textMain, fontWeight: '700' }}>{currentCourse.shadePercent}%</Text></>
                )}
              </Text>
            </View>
          );
        })()}

        {/* Thumb Zone 산책 시작 버튼 (04_course_recommendation.png 원형 복원) */}
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
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  briefingTitle: { fontSize: TYPOGRAPHY.sectionTitle, fontWeight: '800', letterSpacing: -0.3 },
  briefingDesc: { fontSize: TYPOGRAPHY.support, lineHeight: TYPOGRAPHY_LINE_HEIGHT.support, marginBottom: 4 },
  tagScrollRow: { flexDirection: 'row' },
  tagChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginRight: 6 },
  tagText: { fontSize: TYPOGRAPHY.label, fontWeight: '700' },
  mainScroll: { flex: 1 },
  mapSection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  elevationAttribution: { fontSize: TYPOGRAPHY.caption, lineHeight: TYPOGRAPHY_LINE_HEIGHT.caption, marginTop: 3, paddingHorizontal: 4 },
  bottomCard: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 6,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  courseChipRow: { flexDirection: 'row', gap: 6, flex: 1, marginRight: 8 },
  courseChip: { flex: 1, paddingVertical: 5, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  courseChipText: { fontSize: TYPOGRAPHY.label, fontWeight: '600' },
  courseChipTextActive: { fontWeight: '800' },
  courseMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  courseName: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '800', marginBottom: 2 },
  scoreBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  scoreBadgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '800' },
  reasonBox: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  reasonText: { fontSize: TYPOGRAPHY.support, lineHeight: TYPOGRAPHY_LINE_HEIGHT.support },
  courseMetaText: { fontSize: TYPOGRAPHY.caption, fontWeight: '700' },
  metricsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  metricText: { fontSize: TYPOGRAPHY.label },
  metricDot: { fontSize: TYPOGRAPHY.label },
  startButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  startButtonText: { fontSize: TYPOGRAPHY.button, fontWeight: '700', letterSpacing: -0.2 },
});

