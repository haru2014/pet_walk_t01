/**
 * [편안하개 - PetWalk]
 * 모바일 산책 탭 화면 (Screen-04, US-C1, US-D2)
 *
 * 추천 코스 지도 프리뷰, 3대 안심 지표 요약, 실시간 음성 네비게이션 산책 시작
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { DogProfile } from '../types/dogProfile';
import { WalkPreferences, RecommendedCourse } from '../types/walkSettings';
import { CourseRecommendationView } from '../components/walk/CourseRecommendationView';

export interface WalkTabScreenProps {
  dog: DogProfile;
  preferences: WalkPreferences;
  onBack: () => void;
  onStartWalk: (course?: RecommendedCourse) => void;
  onPinSelect: (instruction: string) => void;
}

export const WalkTabScreen: React.FC<WalkTabScreenProps> = ({
  dog,
  preferences,
  onBack,
  onStartWalk,
  onPinSelect,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionSubtitle}>AI 추천 안심 코스</Text>
        <Text style={styles.sectionTitle}>{dog.name}와 걷는 순환 코스 🗺️</Text>
      </View>

      <CourseRecommendationView
        dog={dog}
        preferences={preferences}
        onBack={onBack}
        onStartWalk={onStartWalk}
        onPinSelect={onPinSelect}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: TOKENS.colors.textMuted,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
    letterSpacing: -0.5,
  },
});
