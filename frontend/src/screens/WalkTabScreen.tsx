/**
 * [편안하개 - PetWalk]
 * 모바일 산책 탭 화면 (Screen-04, UX_COMPACT_RULES Rule 11 스크롤 배제 준수)
 *
 * 추천 코스 지도 프리뷰 및 한 손 조작 Thumb Zone 단일 뷰포트 통합
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { DogProfile } from '../types/dogProfile';
import { WalkPreferences, RecommendedCourse } from '../types/walkSettings';
import { WalkSettingsView } from '../components/walk/WalkSettingsView';
import { CourseRecommendationView } from '../components/walk/CourseRecommendationView';
import { CoursePlan } from '../types/bookmark';
import { FeedbackSummaryPayload } from '../services/feedbackContext';

export interface WalkTabScreenProps {
  dog: DogProfile;
  preferences: WalkPreferences;
  onUpdatePreferences?: (preferences: WalkPreferences) => void;
  feedbackSummary?: FeedbackSummaryPayload | null;
  onBack: () => void;
  onStartWalk: (course?: RecommendedCourse, plan?: CoursePlan) => void;
  onPinSelect: (instruction: string) => void;
}

export const WalkTabScreen: React.FC<WalkTabScreenProps> = ({
  dog,
  preferences,
  onUpdatePreferences,
  feedbackSummary,
  onBack,
  onStartWalk,
  onPinSelect,
}) => {
  const [currentStep, setCurrentStep] = useState<'settings' | 'recommend'>('settings');

  const handleFindRoute = (newPreferences: WalkPreferences) => {
    onUpdatePreferences?.(newPreferences);
    setCurrentStep('recommend');
  };

  const handleBackFromRecommend = () => {
    setCurrentStep('settings');
  };

  return (
    <View style={styles.container}>
      {currentStep === 'settings' ? (
        <WalkSettingsView
          dog={dog}
          initialPreferences={preferences}
          onBack={onBack}
          onFindRoute={handleFindRoute}
        />
      ) : (
        <CourseRecommendationView
          dog={dog}
          preferences={preferences}
          feedback={feedbackSummary}
          onBack={handleBackFromRecommend}
          onStartWalk={onStartWalk}
          onPinSelect={onPinSelect}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

