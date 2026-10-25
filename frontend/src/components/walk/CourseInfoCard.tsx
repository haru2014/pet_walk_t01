/**
 * [편안하개 - PetWalk]
 * AI 추천 코스 요약 카드 (Screen-04, US-B1, US-29)
 *
 * 코스명 / 추천 순번 / 즐겨찾기 토글 / 3대 간략 지표(폭신·그늘·계단)
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { TOKENS, TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import { AppIcon, AppIconName } from '../common/AppIcon';
import { RecommendedCourse } from '../../types/walkSettings';
import { CourseSummary } from '../../types/route';
import { BookmarkedRoute } from '../../types/bookmark';
import { BookmarkToggleButton } from '../bookmark/BookmarkToggleButton';
import { formatCourseSurface } from '../../services/routeProfileFormatter';

import { extractCourseScore } from '../../services/courseAdaptivePlanner';

export interface CourseInfoCardProps {
  readonly course: RecommendedCourse;
  readonly summary: CourseSummary;
  readonly rank: number;
  readonly bookmark: BookmarkedRoute | null;
}

const StatBox: React.FC<{ icon: AppIconName; label: string; value: string; isMuted?: boolean }> = ({ icon, label, value, isMuted }) => (
  <View style={styles.statBox}>
    <View style={styles.statIcon}><AppIcon name={icon} size={18} color={TOKENS.colors.primaryDark} /></View>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, isMuted && { color: TOKENS.colors.textMuted }]}>{value}</Text>
  </View>
);

export const CourseInfoCard: React.FC<CourseInfoCardProps> = ({ course, summary, rank, bookmark }) => {
  const surfaceInfo = formatCourseSurface(course);
  const score = extractCourseScore(course);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.name}>{course.name}</Text>
          {score != null && (
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreBadgeText}>AI 맞춤 {score}점</Text>
            </View>
          )}
        </View>
        <View style={styles.actions}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>추천 {rank}</Text>
          </View>
          <BookmarkToggleButton bookmark={bookmark} />
        </View>
      </View>
      <Text style={styles.stats}>
        {summary.totalDistanceKm.toFixed(2)} km · 약 {summary.estimatedMinutes}분
      </Text>
      <View style={styles.statsRow}>
        <StatBox
          icon="soft"
          label="폭신한 길"
          value={surfaceInfo.isUnknown ? '정보 없음' : surfaceInfo.text}
          isMuted={surfaceInfo.isUnknown}
        />
        <StatBox
          icon="shade"
          label="그늘 구간"
          value={course.shadeLevel ?? '정보 없음'}
          isMuted={course.shadeLevel == null}
        />
        <StatBox icon="stairs" label="계단" value={course.stairsCount} />
      </View>
      {course.reason ? (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonText} numberOfLines={2}>
            💡 {course.reason}
          </Text>
        </View>
      ) : null}
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
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  name: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '700', color: TOKENS.colors.textMain },
  scoreBadge: { backgroundColor: TOKENS.colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  scoreBadgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '800', color: TOKENS.colors.primaryDark },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { backgroundColor: TOKENS.colors.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '700', color: TOKENS.colors.primaryDark },
  stats: { fontSize: TYPOGRAPHY.label, color: TOKENS.colors.textMuted, marginBottom: 14 },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: TOKENS.colors.border, paddingTop: 12, gap: 8 },
  statBox: { flex: 1, alignItems: 'center' },
  statIcon: { marginBottom: 2 },
  statLabel: { fontSize: TYPOGRAPHY.label, color: TOKENS.colors.textMuted, marginBottom: 2 },
  statValue: { fontSize: TYPOGRAPHY.label, fontWeight: '700', color: TOKENS.colors.textMain },
  reasonBox: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: TOKENS.colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  reasonText: { fontSize: TYPOGRAPHY.support, lineHeight: TYPOGRAPHY_LINE_HEIGHT.support, color: TOKENS.colors.textMuted },
});
