/**
 * [편안하개 - PetWalk]
 * useAppResponsive 단위 테스트
 * - 3단 반응형 티어 분기 (compact < 720, standard 720~840, spacious >= 840)
 * - 전 화면(Home, WalkSettings, CourseRecommend, Community, MyProfile, WalkReport) 토큰 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ReactNative from 'react-native';
import { useAppResponsive } from './useAppResponsive';
import { TYPOGRAPHY } from '../theme/tokens';

describe('useAppResponsive Hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('720dp 미만 화면(예: iPhone SE, 667dp)에서는 compact 티어를 반환하고 컴팩트 토큰을 제공한다', () => {
    vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
      width: 375,
      height: 667,
      scale: 2,
      fontScale: 1,
    });

    const tokens = useAppResponsive();

    expect(tokens.tier).toBe('compact');
    expect(tokens.isCompact).toBe(true);
    expect(tokens.isStandard).toBe(false);
    expect(tokens.isSpacious).toBe(false);

    // 홈 위젯
    expect(tokens.home.dogAvatarSize).toBe(42);
    expect(tokens.home.weatherGaugeSize).toBe(66);
    expect(tokens.home.trailPawWidth).toBe(28);

    // 산책 설정
    expect(tokens.walkSettings.envCardHeight).toBe(44);
    expect(tokens.walkSettings.findButtonFontSize).toBe(TYPOGRAPHY.button);

    // 추천 코스
    expect(tokens.courseRecommend.startButtonFontSize).toBe(TYPOGRAPHY.button);

    // 커뮤니티
    expect(tokens.community.inlineMapHeight).toBe(160);

    // 마이프로필
    expect(tokens.myProfile.profileAvatarSize).toBe(48);

    // 산책 리포트
    expect(tokens.walkReport.statBoxHeight).toBe(64);
  });

  it('720dp ~ 840dp 화면(예: 일반 갤럭시/아이폰 기본형, 800dp)에서는 standard 티어를 반환한다', () => {
    vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
      width: 390,
      height: 800,
      scale: 3,
      fontScale: 1,
    });

    const tokens = useAppResponsive();

    expect(tokens.tier).toBe('standard');
    expect(tokens.isCompact).toBe(false);
    expect(tokens.isStandard).toBe(true);
    expect(tokens.isSpacious).toBe(false);

    // 홈 위젯
    expect(tokens.home.dogAvatarSize).toBe(48);
    expect(tokens.home.weatherGaugeSize).toBe(74);

    // 산책 설정
    expect(tokens.walkSettings.envCardHeight).toBe(52);

    // 커뮤니티
    expect(tokens.community.inlineMapHeight).toBe(195);

    // 산책 리포트
    expect(tokens.walkReport.statBoxHeight).toBe(72);
  });

  it('840dp 이상 화면(예: 갤럭시 A/S 시리즈 1080x2340 롱스크린, 915dp)에서는 spacious 티어를 반환하여 여백을 꽉 채운다', () => {
    vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
      width: 412,
      height: 915,
      scale: 3,
      fontScale: 1,
    });

    const tokens = useAppResponsive();

    expect(tokens.tier).toBe('spacious');
    expect(tokens.isCompact).toBe(false);
    expect(tokens.isStandard).toBe(false);
    expect(tokens.isSpacious).toBe(true);

    // 홈 위젯 (롱스크린 여백 방지 확장)
    expect(tokens.home.dogAvatarSize).toBe(54);
    expect(tokens.home.weatherGaugeSize).toBe(82);
    expect(tokens.home.trailPawWidth).toBe(36);

    // 산책 설정
    expect(tokens.walkSettings.envCardHeight).toBe(60);

    // 추천 코스
    expect(tokens.courseRecommend.startButtonFontSize).toBe(16);

    // 커뮤니티
    expect(tokens.community.inlineMapHeight).toBe(235);

    // 산책 리포트
    expect(tokens.walkReport.statBoxHeight).toBe(82);
  });
});
