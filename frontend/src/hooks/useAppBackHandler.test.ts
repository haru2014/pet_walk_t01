import { describe, it, expect } from 'vitest';
import { determineBackAction } from './useAppBackHandler';

describe('Android 뒤로가기 4단계 우선순위 전략 (determineBackAction)', () => {
  const baseParams = {
    authModalVisible: false,
    consentVisible: false,
    subScreen: 'main' as const,
    activeTab: '홈' as const,
    lastBackPressedAt: 0,
    now: 10000,
    exitTimeoutMs: 2000,
  };

  describe('1단계: 모달 및 오버레이 팝업 닫기', () => {
    it('인증(회원가입/로그인) 모달이 열려 있으면 최우선으로 DISMISS_AUTH_MODAL 액션을 반환해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        authModalVisible: true,
        subScreen: 'pocket', // 산책 중이라도 모달이 우선
      });
      expect(action).toBe('DISMISS_AUTH_MODAL');
    });

    it('위치 권한 동의 모달이 열려 있으면 DISMISS_CONSENT_MODAL 액션을 반환해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        consentVisible: true,
      });
      expect(action).toBe('DISMISS_CONSENT_MODAL');
    });
  });

  describe('2단계: 중요 태스크 보호 (산책 진행 중 오조작 방지)', () => {
    it('산책 진행(pocket) 화면일 때 앱이 종료되지 않고 PROTECT_ACTIVE_WALK 액션을 반환해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        subScreen: 'pocket',
      });
      expect(action).toBe('PROTECT_ACTIVE_WALK');
    });
  });

  describe('3단계: 서브 화면 계층적 역순 복귀', () => {
    it('코스 추천 화면(course_recommend)에서는 직전 단계인 walk_settings로 이동해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        subScreen: 'course_recommend',
      });
      expect(action).toBe('NAVIGATE_TO_WALK_SETTINGS');
    });

    it('산책 설정 화면(walk_settings)에서는 메인(main)으로 복귀해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        subScreen: 'walk_settings',
      });
      expect(action).toBe('NAVIGATE_TO_MAIN');
    });

    it('반려견 선택 화면(dog_selection)에서는 메인(main)으로 복귀해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        subScreen: 'dog_selection',
      });
      expect(action).toBe('NAVIGATE_TO_MAIN');
    });

    it('완주 리포트 화면(report)에서는 홈 탭으로 복귀해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        subScreen: 'report',
      });
      expect(action).toBe('REPORT_TO_HOME');
    });
  });

  describe('4단계: 메인 탭 복귀 및 더블 탭 종료 (Double-Tap to Exit)', () => {
    it('메인에서 다른 탭(커뮤니티)에 위치한 경우 기본 홈 탭으로 이동해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        activeTab: '커뮤니티',
      });
      expect(action).toBe('SWITCH_TO_HOME_TAB');
    });

    it('메인에서 마이 탭에 위치한 경우 기본 홈 탭으로 이동해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        activeTab: '마이',
      });
      expect(action).toBe('SWITCH_TO_HOME_TAB');
    });

    it('홈 화면에서 1회 터치 시 종료 토스트(SHOW_EXIT_TOAST)를 반환해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        lastBackPressedAt: 0,
        now: 10000,
        exitTimeoutMs: 2000,
      });
      expect(action).toBe('SHOW_EXIT_TOAST');
    });

    it('홈 화면에서 2초 이내 재터치 시 앱 종료(EXIT_APP)를 반환해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        lastBackPressedAt: 10000,
        now: 11500, // 1.5초 후
        exitTimeoutMs: 2000,
      });
      expect(action).toBe('EXIT_APP');
    });

    it('홈 화면에서 2초가 지난 후 재터치하면 앱이 종료되지 않고 다시 토스트를 표시해야 한다', () => {
      const action = determineBackAction({
        ...baseParams,
        lastBackPressedAt: 10000,
        now: 12500, // 2.5초 후
        exitTimeoutMs: 2000,
      });
      expect(action).toBe('SHOW_EXIT_TOAST');
    });
  });
});
