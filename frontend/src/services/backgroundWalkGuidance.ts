import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import type { GpsPoint } from './locationService';
import { evaluateGuidance, GuidanceState, INITIAL_GUIDANCE_STATE } from './guidanceEngine';
import { TTSNavigationService } from './ttsNavigation';

const SESSION_KEY = '@편안하개:active_background_guidance';

interface BackgroundGuidanceSession {
  route: RouteFeatureCollection;
  pins: readonly RouteStepPin[];
  state: GuidanceState;
}

export async function saveBackgroundGuidanceSession(
  route: RouteFeatureCollection,
  pins: readonly RouteStepPin[],
  state: GuidanceState = INITIAL_GUIDANCE_STATE,
): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ route, pins, state }));
}

export async function clearBackgroundGuidanceSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

/** TaskManager가 화면 컴포넌트 없이 실행될 때 경로 회전 안내를 처리한다. */
export async function processBackgroundGuidancePoint(point: GpsPoint): Promise<void> {
  try {
    const serialized = await AsyncStorage.getItem(SESSION_KEY);
    if (!serialized) return;

    const session = JSON.parse(serialized) as BackgroundGuidanceSession;
    const result = evaluateGuidance(
      [point.longitude, point.latitude],
      session.route,
      session.pins,
      session.state,
    );

    // 마지막 좌표를 저장해 다음 headless 실행에서도 직전 점 기준 판정을 이어간다.
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, state: result.nextState }));
    if (result.events.length === 0) return;
    await TTSNavigationService.init();
    await TTSNavigationService.prepareForBackgroundSpeech();
    for (const event of result.events) {
      if (event.category === 'turn') TTSNavigationService.speakTurn(event.message);
      else TTSNavigationService.speak(event.message, undefined, false,
        event.kind === 'off_route' || event.kind === 'to_start' ? 'high' : 'normal');
    }
  } catch (error) {
    console.warn('[backgroundWalkGuidance] 백그라운드 안내 처리 실패:', error);
  }
}
