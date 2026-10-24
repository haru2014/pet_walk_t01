import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CourseRecommendationView,
  formatCourseDisplayName,
  formatCourseReasonText,
  getThemeContrastingAccentColor,
} from './CourseRecommendationView';
import { DogProfile } from '../../types/dogProfile';
import { WalkPreferences } from '../../types/walkSettings';

vi.mock('expo-task-manager', () => ({
  defineTask: vi.fn(),
}));

vi.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6, Balanced: 3, High: 4 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  requestBackgroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  watchPositionAsync: vi.fn(),
  startLocationUpdatesAsync: vi.fn(),
  stopLocationUpdatesAsync: vi.fn(),
  hasStartedLocationUpdatesAsync: vi.fn().mockResolvedValue(false),
  getCurrentPositionAsync: vi.fn().mockResolvedValue({
    coords: { latitude: 36.3628, longitude: 127.3592, accuracy: 5 },
    timestamp: Date.now(),
  }),
}));

vi.mock('expo-speech', () => ({
  speak: vi.fn(),
  stop: vi.fn(),
  isSpeakingAsync: vi.fn().mockResolvedValue(false),
}));

vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn(),
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: {},
  NotificationFeedbackType: {},
}));

vi.mock('../../services/haptics', () => ({
  HapticFeedback: {
    selection: vi.fn(),
    impactLight: vi.fn(),
    impactMedium: vi.fn(),
    impactHeavy: vi.fn(),
    notificationSuccess: vi.fn(),
    notificationWarning: vi.fn(),
    notificationError: vi.fn(),
  },
}));

vi.mock('../../services/ttsNavigation', () => ({
  TTSNavigationService: {
    speak: vi.fn(),
    stop: vi.fn(),
    setMuted: vi.fn(),
    isMuted: vi.fn().mockReturnValue(false),
    setVolume: vi.fn(),
    getVolume: vi.fn().mockReturnValue(1.0),
    setVoiceProfile: vi.fn(),
    getVoiceProfile: vi.fn().mockReturnValue('gentle'),
    subscribeMuteState: vi.fn().mockReturnValue(() => {}),
  },
}));

vi.mock('../voice/VoiceQuickControlBar', () => ({
  VoiceQuickControlBar: () => React.createElement('div', { 'data-testid': 'mock-voice-bar' }),
}));

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Polyline: (props: any) => React.createElement('polyline', props),
  Circle: (props: any) => React.createElement('circle', props),
  Ellipse: (props: any) => React.createElement('ellipse', props),
  Line: (props: any) => React.createElement('line', props),
  Path: (props: any) => React.createElement('path', props),
  Polygon: (props: any) => React.createElement('polygon', props),
  Rect: (props: any) => React.createElement('rect', props),
  G: (props: any) => React.createElement('g', props),
  Text: (props: any) => React.createElement('text', props),
}));

vi.mock('../map/RouteMapView', () => ({
  RouteMapView: () => React.createElement('div', { 'data-testid': 'mock-route-map-view' }),
}));

vi.mock('../../services/api', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    requestWalkPlan: vi.fn(),
  };
});

const mockDog: DogProfile = {
  id: 'dog_1',
  name: '뽀삐',
  breed: '말티즈',
  ageYears: 4,
  weightKg: 4.5,
  speedKmH: 2.8,
  jointCareLevel: 1,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
};

describe('CourseRecommendationView - P0 공원 검증 및 PlanSourceBadge 연계', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('공원 모드에서 검증된 서버 응답이 없거나 로딩 중일 때 미검증 코스를 노출하지 않고 안내/에러 뷰를 표출한다', () => {
    const preferences: WalkPreferences = {
      originMode: 'park',
      pilotParkId: 'yurim',
      durationMinutes: 30,
      environments: ['soft', 'shade'],
      requestText: '',
    };

    const html = renderToStaticMarkup(
      <CourseRecommendationView
        dog={mockDog}
        preferences={preferences}
        feedback={null}
        onBack={vi.fn()}
        onStartWalk={vi.fn()}
      />
    );

    // 공원 검증 확인 전에는 코스 상세 카드가 아닌 대기/알림 뷰와 돌아가기 버튼 표시
    expect(html).toContain('보행 경로를 확인하고 있어요');
    expect(html).toContain('산책 설정으로 돌아가기');
    expect(html).not.toContain('실시간 AI 맞춤 코스');
  });

  it('현위치 모드(current_location)에서는 안전 기본 코스를 준비하여 바로 렌더링할 수 있다', () => {
    const preferences: WalkPreferences = {
      originMode: 'current_location',
      durationMinutes: 30,
      environments: ['soft'],
      requestText: '',
    };

    const html = renderToStaticMarkup(
      <CourseRecommendationView
        dog={mockDog}
        preferences={preferences}
        feedback={null}
        onBack={vi.fn()}
        onStartWalk={vi.fn()}
      />
    );

    // 현위치 모드에서는 안전 로컬 코스가 즉시 준비되어 추천 산책 코스 헤더 표시
    expect(html).toContain('추천 산책 코스');
    expect(html).toContain('안심 기본 코스');
  });

  it('formatCourseDisplayName은 중복 거리와 불필요한 안 번호를 제거한다', () => {
    expect(formatCourseDisplayName('🏞️ 세종호수공원 내부 보행로 · 1안 반시계 방향 1.9km')).toBe(
      '🏞️ 세종호수공원 내부 보행로 · 반시계 방향'
    );
    expect(formatCourseDisplayName('대전 유림공원 내부 보행로 · 2안 시계 방향 2.3km')).toBe(
      '대전 유림공원 내부 보행로 · 시계 방향'
    );
    expect(formatCourseDisplayName('안심 기본 코스')).toBe('안심 기본 코스');
  });

  it('formatCourseReasonText는 추천 사유에서 중복 거리와 안 번호를 제거한다', () => {
    expect(
      formatCourseReasonText(
        'AI 맞춤 점수 86점: 🏞️ 세종호수공원 내부 보행로 · 1안 반시계 방향 1.9km (실측 최대 경사 2.7%)'
      )
    ).toBe('AI 맞춤 점수 86점: 🏞️ 세종호수공원 내부 보행로 · 반시계 방향 (실측 최대 경사 2.7%)');
  });

  it('getThemeContrastingAccentColor는 테마별 주 색상에 대비되는 강조 색상을 반환한다', () => {
    expect(getThemeContrastingAccentColor('dusty_amber')).toBe('#D97706');
    expect(getThemeContrastingAccentColor('forest')).toBe('#D97706');
    expect(getThemeContrastingAccentColor('mint')).toBe('#D97706');
    expect(getThemeContrastingAccentColor('vivid_violet')).toBe('#D97706');
    expect(getThemeContrastingAccentColor('ocean')).toBe('#EA580C');
    expect(getThemeContrastingAccentColor('coral')).toBe('#0284C7');
    expect(getThemeContrastingAccentColor('dark')).toBe('#FBBF24');
    expect(getThemeContrastingAccentColor('unknown', { accent: '#AABBCC' })).toBe('#AABBCC');
  });
});
