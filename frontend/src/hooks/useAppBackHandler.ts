/**
 * [편안하개 - PetWalk]
 * 안드로이드 뒤로가기 4단계 우선순위 제어 훅 (useAppBackHandler.ts)
 *
 * 1단계: 모달 및 오버레이 닫기 (LandingAuthModal, LocationConsentModal)
 * 2단계: 중요 태스크 보호 (산책 진행 중 포켓 모드 오조작 방지 및 종료 다이얼로그)
 * 3단계: 서브 화면 계층적 역순 복귀 (course_recommend -> walk_settings -> main, report -> main)
 * 4단계: 메인 탭 '홈' 복귀 및 홈 화면 더블 탭 종료 (2초 이내 재터치 시 앱 종료)
 */

import { useEffect, useRef } from 'react';
import { BackHandler, ToastAndroid, Platform } from 'react-native';
import { TabKey } from '../components/common/BottomTabBar';

export type AppSubScreen =
  | 'main'
  | 'dog_selection'
  | 'walk_settings'
  | 'course_recommend'
  | 'pocket'
  | 'report'
  | 'onboarding';

export type BackActionType =
  | 'DISMISS_AUTH_MODAL'
  | 'DISMISS_CONSENT_MODAL'
  | 'PROTECT_ACTIVE_WALK'
  | 'NAVIGATE_TO_WALK_SETTINGS'
  | 'NAVIGATE_TO_MAIN'
  | 'REPORT_TO_HOME'
  | 'SWITCH_TO_HOME_TAB'
  | 'SHOW_EXIT_TOAST'
  | 'EXIT_APP';

export interface BackDecisionParams {
  authModalVisible: boolean;
  consentVisible: boolean;
  subScreen: AppSubScreen;
  activeTab: TabKey;
  lastBackPressedAt: number;
  now: number;
  exitTimeoutMs?: number;
}

/**
 * 상태에 따른 뒤로가기 동작을 결정하는 순수 함수 (단위 테스트 및 예측 가능성 확보)
 */
export function determineBackAction(params: BackDecisionParams): BackActionType {
  const {
    authModalVisible,
    consentVisible,
    subScreen,
    activeTab,
    lastBackPressedAt,
    now,
    exitTimeoutMs = 2000,
  } = params;

  // 1단계: 모달/오버레이 우선 닫기
  if (authModalVisible) return 'DISMISS_AUTH_MODAL';
  if (consentVisible) return 'DISMISS_CONSENT_MODAL';

  // 2단계: 중요 태스크 보호 (산책 진행 중)
  if (subScreen === 'pocket') return 'PROTECT_ACTIVE_WALK';

  // 3단계: 서브 화면 계층적 역순 복귀
  if (subScreen === 'course_recommend') return 'NAVIGATE_TO_WALK_SETTINGS';
  if (subScreen === 'walk_settings' || subScreen === 'dog_selection') return 'NAVIGATE_TO_MAIN';
  if (subScreen === 'report') return 'REPORT_TO_HOME';

  // 4단계: 메인 탭 복귀 ('홈'이 아닌 다른 탭에 있을 때)
  if (subScreen === 'main' && activeTab !== '홈') return 'SWITCH_TO_HOME_TAB';

  // 4단계: 홈 화면 (또는 온보딩 첫 진입)에서 더블 탭 종료
  if (now - lastBackPressedAt < exitTimeoutMs) {
    return 'EXIT_APP';
  }

  return 'SHOW_EXIT_TOAST';
}

export interface UseAppBackHandlerOptions {
  authModalVisible: boolean;
  onCloseAuthModal: () => void;
  consentVisible: boolean;
  onDeclineConsent: () => void;
  subScreen: AppSubScreen;
  setSubScreen: (subScreen: AppSubScreen) => void;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  onPocketUnlock: () => void;
  exitTimeoutMs?: number;
  onShowExitToast?: (message: string) => void;
  onExitApp?: () => void;
}

export function useAppBackHandler({
  authModalVisible,
  onCloseAuthModal,
  consentVisible,
  onDeclineConsent,
  subScreen,
  setSubScreen,
  activeTab,
  setActiveTab,
  onPocketUnlock,
  exitTimeoutMs = 2000,
  onShowExitToast,
  onExitApp,
}: UseAppBackHandlerOptions) {
  const lastBackPressedRef = useRef<number>(0);

  useEffect(() => {
    // 안드로이드 플랫폼이 아니면 하드웨어 백 리스너 미등록 (웹/iOS 오작동 방지)
    if (Platform.OS !== 'android') return;

    const handleHardwareBackPress = (): boolean => {
      const now = Date.now();
      const action = determineBackAction({
        authModalVisible,
        consentVisible,
        subScreen,
        activeTab,
        lastBackPressedAt: lastBackPressedRef.current,
        now,
        exitTimeoutMs,
      });

      switch (action) {
        case 'DISMISS_AUTH_MODAL':
          onCloseAuthModal();
          return true;

        case 'DISMISS_CONSENT_MODAL':
          onDeclineConsent();
          return true;

        case 'PROTECT_ACTIVE_WALK':
          onPocketUnlock();
          return true;

        case 'NAVIGATE_TO_WALK_SETTINGS':
          setSubScreen('walk_settings');
          return true;

        case 'NAVIGATE_TO_MAIN':
          setSubScreen('main');
          return true;

        case 'REPORT_TO_HOME':
          setSubScreen('main');
          setActiveTab('홈');
          return true;

        case 'SWITCH_TO_HOME_TAB':
          setActiveTab('홈');
          return true;

        case 'SHOW_EXIT_TOAST': {
          lastBackPressedRef.current = now;
          const msg = '뒤로가기 버튼을 한 번 더 누르면 종료됩니다.';
          if (onShowExitToast) {
            onShowExitToast(msg);
          } else if (ToastAndroid?.show) {
            ToastAndroid.show(msg, ToastAndroid.SHORT);
          }
          return true;
        }

        case 'EXIT_APP': {
          if (onExitApp) {
            onExitApp();
          } else if (BackHandler.exitApp) {
            BackHandler.exitApp();
          }
          return true;
        }

        default:
          return false;
      }
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleHardwareBackPress
    );

    return () => {
      subscription.remove();
    };
  }, [
    authModalVisible,
    onCloseAuthModal,
    consentVisible,
    onDeclineConsent,
    subScreen,
    setSubScreen,
    activeTab,
    setActiveTab,
    onPocketUnlock,
    exitTimeoutMs,
    onShowExitToast,
    onExitApp,
  ]);
}
