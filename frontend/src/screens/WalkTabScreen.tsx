/**
 * [편안하개 - PetWalk]
 * 모바일 산책 탭 화면 (Screen-04, UX_COMPACT_RULES Rule 11 스크롤 배제 준수)
 *
 * 추천 코스 지도 프리뷰 및 한 손 조작 Thumb Zone 단일 뷰포트 통합
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { DogProfile } from '../types/dogProfile';
import { WalkPreferences, RecommendedCourse } from '../types/walkSettings';
import { CourseRecommendationView } from '../components/walk/CourseRecommendationView';
import { CoursePlan } from '../types/bookmark';
import { FeedbackSummaryPayload } from '../services/feedbackContext';

export interface WalkTabScreenProps {
  dog: DogProfile;
  preferences: WalkPreferences;
  feedbackSummary?: FeedbackSummaryPayload | null;
  onBack: () => void;
  onStartWalk: (course?: RecommendedCourse, plan?: CoursePlan) => void;
  onPinSelect: (instruction: string) => void;
}

export const WalkTabScreen: React.FC<WalkTabScreenProps> = ({
  dog,
  preferences,
  feedbackSummary,
  onBack,
  onStartWalk,
  onPinSelect,
}) => {
  return (
    <View style={styles.container}>
      <CourseRecommendationView
        dog={dog}
        preferences={preferences}
        feedback={feedbackSummary}
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
});
