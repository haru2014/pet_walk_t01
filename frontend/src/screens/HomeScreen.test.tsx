/**
 * [편안하개 - PetWalk]
 * 디자인 시안 02번 개편 홈 화면 (HomeScreen.tsx) 단위 테스트
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeScreen, resolveHomeScreenWeatherCoords } from './HomeScreen';
import { DEFAULT_DOGS } from '../types/dogProfile';
import { PILOT_PARKS, DEFAULT_PILOT_PARK } from '../types/pilotParks';

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

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Polyline: (props: any) => React.createElement('polyline', props),
  Circle: (props: any) => React.createElement('circle', props),
  Path: (props: any) => React.createElement('path', props),
  G: (props: any) => React.createElement('g', props),
  Text: (props: any) => React.createElement('text', props),
}));
vi.mock('react-native-webview', () => ({
  WebView: (props: any) => React.createElement('div', { 'data-testid': 'mock-webview', ...props }),
  default: (props: any) => React.createElement('div', { 'data-testid': 'mock-webview', ...props }),
}));
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      fitBounds: vi.fn(),
      remove: vi.fn(),
      setStyle: vi.fn(),
    })),
  },
}));

describe('HomeScreen - 디자인 시안 02번 (Dusty Amber & Sage Green)', () => {
  const mockDog = DEFAULT_DOGS[0];

  it('바로 산책하기 메인 카드와 Trail info 섹션을 정상 렌더링한다', () => {
    const html = renderToStaticMarkup(
      <HomeScreen
        dog={mockDog}
        dogs={DEFAULT_DOGS}
        selectedDogId={mockDog.id}
        onSelectDog={vi.fn()}
        onAddDog={vi.fn()}
        feedbackSummary={null}
        onPressProfile={vi.fn()}
        onStartWalk={vi.fn()}
        onOpenPlanner={vi.fn()}
      />
    );

    // 1. 메인 카드 타이틀 & 자유 산책 ("바로 산책하기")
    expect(html).toContain('바로 산책하기');
    expect(html).toContain('자유 산책');
    expect(html).toContain('산책 거리');
    expect(html).toContain('산책 시간');
    expect(html).toContain('시작 →');

    // 2. Trail info & 이번 주 산책 달성도 정보 카드
    expect(html).toContain('산책 정보');
    expect(html).toContain('이번 주 산책 달성도');
    expect(html).toContain('산책하기 좋은 시간');
  });

  it('다견 등록 시 현재 선택된 반려견 이름 뱃지가 메인 카드 헤더에 노출된다', () => {
    const html = renderToStaticMarkup(
      <HomeScreen
        dog={mockDog}
        dogs={DEFAULT_DOGS}
        selectedDogId={mockDog.id}
        onSelectDog={vi.fn()}
        onAddDog={vi.fn()}
        feedbackSummary={null}
        onPressProfile={vi.fn()}
        onStartWalk={vi.fn()}
        onOpenPlanner={vi.fn()}
      />
    );

    expect(html).toContain(mockDog.name);
    expect(html).toContain('▾');
  });

  it('단일 반려견 등록 시에도 반려견 이름 프로필 버튼이 메인 카드 헤더에 정상 노출된다', () => {
    const html = renderToStaticMarkup(
      <HomeScreen
        dog={mockDog}
        dogs={[mockDog]}
        selectedDogId={mockDog.id}
        onSelectDog={vi.fn()}
        onAddDog={vi.fn()}
        feedbackSummary={null}
        onPressProfile={vi.fn()}
        onStartWalk={vi.fn()}
        onOpenPlanner={vi.fn()}
      />
    );

    expect(html).toContain(mockDog.name);
    expect(html).not.toContain('▾');
    expect(html).toContain('프로필 확인 및 변경');
  });

  it('갈색 카드 헤더에 알림 버튼이 정상 포함된다', () => {
    const html = renderToStaticMarkup(
      <HomeScreen
        dog={mockDog}
        dogs={DEFAULT_DOGS}
        selectedDogId={mockDog.id}
        onSelectDog={vi.fn()}
        onAddDog={vi.fn()}
        feedbackSummary={null}
        onPressProfile={vi.fn()}
        onStartWalk={vi.fn()}
        onOpenPlanner={vi.fn()}
        onOpenNotification={vi.fn()}
      />
    );

    expect(html).toContain('알림');
  });

  it('HomeNotificationModal 컴포넌트가 HomeScreen 내에 정상 배치되어 있다', () => {
    const html = renderToStaticMarkup(
      <HomeScreen
        dog={mockDog}
        dogs={DEFAULT_DOGS}
        selectedDogId={mockDog.id}
        onSelectDog={vi.fn()}
        onAddDog={vi.fn()}
        feedbackSummary={null}
        onPressProfile={vi.fn()}
        onStartWalk={vi.fn()}
        onOpenPlanner={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="알림"');
  });

  describe('resolveHomeScreenWeatherCoords - 사용자 위치 및 선택 공원 폴백 연동 (#281)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('사용자 GPS 위치를 정상 획득하면 사용자 위치 좌표와 isGps: true를 반환한다', async () => {
      const mockGetLocation = vi.fn().mockResolvedValue({
        ok: true,
        coords: { latitude: 37.5665, longitude: 126.9780, accuracy: 10 },
      });

      const coords = await resolveHomeScreenWeatherCoords('sejong', mockGetLocation as any);

      expect(coords).toEqual({
        lat: 37.5665,
        lon: 126.9780,
        isGps: true,
      });
      expect(mockGetLocation).toHaveBeenCalledWith(4000);
    });

    it('사용자 GPS 위치 획득 실패 시 선택한 공원 좌표와 isGps: false를 반환한다', async () => {
      const mockGetLocation = vi.fn().mockResolvedValue({
        ok: false,
        reason: 'permission_denied',
      });

      const sejongPark = PILOT_PARKS.find((p) => p.id === 'sejong')!;
      const coords = await resolveHomeScreenWeatherCoords('sejong', mockGetLocation as any);

      expect(coords).toEqual({
        lat: sejongPark.center.lat,
        lon: sejongPark.center.lon,
        isGps: false,
      });
    });

    it('사용자 GPS 실패 및 공원 미지정 시 기본 유림공원 좌표를 반환한다', async () => {
      const mockGetLocation = vi.fn().mockResolvedValue({
        ok: false,
        reason: 'timeout',
      });

      const coords = await resolveHomeScreenWeatherCoords(undefined, mockGetLocation as any);

      expect(coords).toEqual({
        lat: DEFAULT_PILOT_PARK.center.lat,
        lon: DEFAULT_PILOT_PARK.center.lon,
        isGps: false,
      });
    });

    it('위치 조회 중 예외 발생 시에도 크래시 없이 선택 공원 좌표로 안전하게 폴백한다', async () => {
      const mockGetLocation = vi.fn().mockRejectedValue(new Error('Location provider crashed'));

      const doanPark = PILOT_PARKS.find((p) => p.id === 'doan')!;
      const coords = await resolveHomeScreenWeatherCoords('doan', mockGetLocation as any);

      expect(coords).toEqual({
        lat: doanPark.center.lat,
        lon: doanPark.center.lon,
        isGps: false,
      });
    });
  });
});
