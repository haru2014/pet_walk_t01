/**
 * [편안하개 - PetWalk]
 * 코스 카드 안내 칸 (US-B3, US-20)
 *
 * 서버가 코스마다 보내는 `notice` 를 그대로 보여 준다. 줄바꿈(\n)으로 여러 안내가 올 수 있다.
 * - 공원 산책로가 짧아 목표 시간을 못 채울 때 (#229, #257)
 * - 고른 환경 조건을 실측으로 얼마나 맞췄는지 (예: 보행 전용로가 부족해 차도 옆 보도가 약 22% 포함돼요)
 * 안내가 없으면 아무것도 그리지 않는다.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { useAppTheme } from '../../theme/themeManager';
import { TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';

export interface CourseNoticeLineProps {
  readonly notice?: string | null;
  readonly colors: ReturnType<typeof useAppTheme>['colors'];
}

/** 화면을 스크롤하지 않도록 카드에는 앞쪽(중요한) 안내 3줄까지만 보여 준다 (UX_COMPACT_RULES 11) */
export const MAX_NOTICE_LINES = 3;

/** 서버 안내 문자열을 줄 목록으로 (빈 줄·중복 제거, 최대 MAX_NOTICE_LINES 줄) */
export function splitCourseNotice(notice?: string | null): string[] {
  if (!notice) return [];
  const lines = notice.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  return [...new Set(lines)].slice(0, MAX_NOTICE_LINES);
}

export const CourseNoticeLine: React.FC<CourseNoticeLineProps> = ({ notice, colors }) => {
  const lines = splitCourseNotice(notice);
  if (lines.length === 0) return null;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`코스 안내. ${lines.join('. ')}`}
      style={[styles.box, { backgroundColor: colors.background, borderColor: colors.border }]}
    >
      {lines.map((line) => (
        <Text key={line} style={[styles.text, { color: colors.textMain }]} numberOfLines={2}>
          ⓘ {line}
        </Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
  },
  text: {
    fontSize: TYPOGRAPHY.caption,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.caption,
    letterSpacing: -0.1,
  },
});
