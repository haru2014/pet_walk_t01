/**
 * [편안하개 - PetWalk]
 * 햅틱 피드백 서비스 (expo-haptics 래퍼)
 *
 * 웹/미지원 환경에서는 조용히 무시하여 호출부가 플랫폼을 신경 쓰지 않도록 한다.
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

async function safeRun(action: () => Promise<void>): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await action();
  } catch {
    // 햅틱 미지원 기기는 무시
  }
}

/** 가벼운 탭 피드백 (토글 해제 등) */
export function hapticLight(): Promise<void> {
  return safeRun(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** 성공 알림 피드백 (즐겨찾기 저장 완료 등) */
export function hapticSuccess(): Promise<void> {
  return safeRun(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** 회전 지점 접근 알림 (다크 포켓 모드 방향 카드) */
export function hapticTurnApproach(): Promise<void> {
  return safeRun(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}
