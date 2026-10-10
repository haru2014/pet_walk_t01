/**
 * [편안하개 - PetWalk]
 * 모바일 추천 산책 코스 화면 (Screen-04, US-B1, US-C1)
 *
 * 지도 프리뷰, 3대 안심 지표(경사/노면/그늘), 추천 사유 카드, 대체 코스 선택
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { DogProfile } from '../../types/dogProfile';
import {
  DEFAULT_RECOMMENDED_COURSES,
  RecommendedCourse,
  WalkPreferences,
} from '../../types/walkSettings';
import { RouteMapView } from '../map/RouteMapView';
import { RouteReasonCard } from '../map/RouteReasonCard';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from '../../services/sampleRoute';

export interface CourseRecommendationViewProps {
  dog: DogProfile;
  preferences?: WalkPreferences;
  onBack: () => void;
  onStartWalk: (course: RecommendedCourse) => void;
  onPinSelect?: (instruction: string) => void;
}

export const CourseRecommendationView: React.FC<CourseRecommendationViewProps> = ({
  dog,
  preferences,
  onBack,
  onStartWalk,
  onPinSelect,
}) => {
  const [courses] = useState<readonly RecommendedCourse[]>(
    DEFAULT_RECOMMENDED_COURSES
  );
  const [selectedCourseIndex, setSelectedCourseIndex] = useState(0);
  const [showAlternatives, setShowAlternatives] = useState(false);

  const currentCourse = courses[selectedCourseIndex] ?? courses[0];

  // 조건 태그 목록
  const conditionLabels: string[] = [
    dog.name,
    ...(preferences?.durationMinutes
      ? [
          preferences.durationMinutes === 60
            ? '1시간'
            : `${preferences.durationMinutes}분`,
        ]
      : ['30분']),
    '폭신한 길',
    '그늘이 많은 길',
    '계단 피하기',
  ];

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>추천 산책 코스</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 상단 안내 */}
        <View style={styles.titleSection}>
          <View style={styles.sparkleBadge}>
            <Text style={styles.sparkleIcon}>✨</Text>
          </View>
          <Text style={styles.mainTitle}>
            {dog.name}에게 맞는 산책 코스를{'\n'}찾았어요.
          </Text>
          <Text style={styles.subTitle}>
            선택한 조건을 반영해 관절과 발바닥이 편안한 순환 코스예요.
          </Text>
        </View>

        {/* 조건 태그 칩 */}
        <View style={styles.tagWrap}>
          {conditionLabels.map((lbl) => (
            <View key={lbl} style={styles.tagChip}>
              <Text style={styles.tagText}>{lbl}</Text>
            </View>
          ))}
        </View>

        {/* 인터랙티브 지도 프리뷰 (Phase 3) */}
        <View style={styles.mapWrapper}>
          <RouteMapView
            route={SAMPLE_ROUTE}
            stepPins={SAMPLE_STEP_PINS}
            speedKmH={dog.speedKmH}
            onStart={() => onStartWalk(currentCourse)}
            onPinSelect={onPinSelect}
          />
        </View>

        {/* 코스 요약 카드 */}
        <View style={styles.summaryCard}>
          <View style={styles.courseHeader}>
            <Text style={styles.courseName}>{currentCourse.name}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>추천 {selectedCourseIndex + 1}</Text>
            </View>
          </View>
          <Text style={styles.courseStats}>
            {currentCourse.distanceKm} · 약 {currentCourse.estimatedMinutes}분
          </Text>

          {/* 3개 간략 지표 행 */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statIcon}>🌿</Text>
              <Text style={styles.statLabel}>폭신한 길</Text>
              <Text style={styles.statValue}>{currentCourse.softRatio}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statIcon}>🌳</Text>
              <Text style={styles.statLabel}>그늘 구간</Text>
              <Text style={styles.statValue}>{currentCourse.shadeLevel}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statIcon}>🚶</Text>
              <Text style={styles.statLabel}>계단</Text>
              <Text style={styles.statValue}>{currentCourse.stairsCount}</Text>
            </View>
          </View>
        </View>

        {/* AI 추천 사유 인포그래픽 카드 */}
        <RouteReasonCard
          reasonText={currentCourse.reason}
          maxSlopePercent={currentCourse.maxSlopePercent}
          softSurfacePercent={currentCourse.softSurfacePercent}
          shadePercent={currentCourse.shadePercent}
        />

        {/* 대체 코스 토글 버튼 */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setShowAlternatives((prev) => !prev)}
          style={styles.toggleAltButton}
        >
          <Text style={styles.toggleAltText}>
            {showAlternatives ? '다른 코스 접기 ▴' : '다른 코스 보기 ▾'}
          </Text>
        </TouchableOpacity>

        {/* 대체 코스 목록 */}
        {showAlternatives && (
          <View style={styles.altList}>
            {courses.map((course, idx) => {
              const isSelected = idx === selectedCourseIndex;
              return (
                <TouchableOpacity
                  key={course.id}
                  activeOpacity={0.85}
                  onPress={() => setSelectedCourseIndex(idx)}
                  style={[
                    styles.altCard,
                    isSelected && styles.altCardSelected,
                  ]}
                >
                  <View>
                    <Text style={styles.altName}>{course.name}</Text>
                    <Text style={styles.altMeta}>
                      {course.distanceKm} · 약 {course.estimatedMinutes}분
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.altRadio,
                      isSelected && styles.altRadioSelected,
                    ]}
                  >
                    {isSelected && <Text style={styles.altCheck}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* 하단 고정 버튼 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => onStartWalk(currentCourse)}
          style={styles.startButton}
        >
          <Text style={styles.startButtonText}>이 코스로 산책 시작하기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.background,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.surface,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 26,
    color: TOKENS.colors.textMain,
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.3,
  },
  headerPlaceholder: {
    width: 36,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 110,
  },
  titleSection: {
    marginBottom: 12,
    marginTop: 6,
  },
  sparkleBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: TOKENS.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sparkleIcon: {
    fontSize: 16,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.5,
    marginBottom: 6,
    lineHeight: 28,
  },
  subTitle: {
    fontSize: 13,
    color: TOKENS.colors.textMuted,
    lineHeight: 18,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  tagChip: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.primaryDark,
  },
  mapWrapper: {
    marginBottom: 16,
    borderRadius: TOKENS.borderRadius.card,
    overflow: 'hidden',
  },
  summaryCard: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    padding: 18,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  courseName: {
    fontSize: 17,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  badge: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  courseStats: {
    fontSize: 13,
    color: TOKENS.colors.textMuted,
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    paddingTop: 12,
    gap: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  toggleAltButton: {
    backgroundColor: TOKENS.colors.surface,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleAltText: {
    fontSize: 13,
    fontWeight: '600',
    color: TOKENS.colors.primaryDark,
  },
  altList: {
    gap: 8,
    marginBottom: 16,
  },
  altCard: {
    backgroundColor: TOKENS.colors.surface,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  altCardSelected: {
    borderColor: TOKENS.colors.primary,
    backgroundColor: '#F0FDF4',
  },
  altName: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    marginBottom: 2,
  },
  altMeta: {
    fontSize: 12,
    color: TOKENS.colors.textMuted,
  },
  altRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  altRadioSelected: {
    borderColor: TOKENS.colors.primary,
    backgroundColor: TOKENS.colors.primary,
  },
  altCheck: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: TOKENS.colors.surface,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 6,
  },
  startButton: {
    backgroundColor: TOKENS.colors.primary,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
