/**
 * [편안하개 - PetWalk]
 * 대체 코스 접기/펼치기 목록 (Screen-04, US-B1)
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { RecommendedCourse } from '../../types/walkSettings';

export interface AlternativeCourseListProps {
  readonly courses: readonly RecommendedCourse[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
}

export const AlternativeCourseList: React.FC<AlternativeCourseListProps> = ({ courses, selectedIndex, onSelect }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TouchableOpacity activeOpacity={0.8} onPress={() => setExpanded((prev) => !prev)} style={styles.toggleButton}>
        <Text style={styles.toggleText}>{expanded ? '다른 코스 접기 ▴' : '다른 코스 보기 ▾'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.list}>
          {courses.map((course, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <TouchableOpacity
                key={course.id}
                activeOpacity={0.85}
                onPress={() => onSelect(idx)}
                style={[styles.card, isSelected && styles.cardSelected]}
              >
                <View>
                  <Text style={styles.name}>{course.name}</Text>
                  <Text style={styles.meta}>
                    {course.distanceKm} · 약 {course.estimatedMinutes}분
                  </Text>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <Text style={styles.check}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  toggleButton: {
    backgroundColor: TOKENS.colors.surface,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleText: { fontSize: 13, fontWeight: '600', color: TOKENS.colors.primaryDark },
  list: { gap: 8, marginBottom: 16 },
  card: {
    backgroundColor: TOKENS.colors.surface,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardSelected: { borderColor: TOKENS.colors.primary, backgroundColor: TOKENS.colors.primaryLight },
  name: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: 2 },
  meta: { fontSize: 12, color: TOKENS.colors.textMuted },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: TOKENS.colors.primary, backgroundColor: TOKENS.colors.primary },
  check: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
