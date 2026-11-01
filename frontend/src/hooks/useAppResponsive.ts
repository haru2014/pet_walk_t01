/**
 * [편안하개 - PetWalk]
 * 모바일 앱 전역 반응형 레이아웃 훅 (useAppResponsive.ts)
 *
 * 목적:
 * - 해상도 및 화면 높이(컴팩트 ~ 최신 20:9 대화면 롱스크린)에 관계없이
 *   홈, 산책(설정/추천), 커뮤니티, 마이페이지, 산책리포트 등 전체 앱 화면이
 *   모바일 단말기 화면에 유연하고 꽉 차게 반응하도록 통합 스케일링 제공.
 *
 * 기기 세로 해상도 티어(Tier):
 * 1. compact (< 720dp, iPhone SE 등 소형): 컴팩트 핏으로 스크롤이나 요소 잘림 방지
 * 2. standard (720 ~ 840dp, iPhone 12/13/14/15 등 일반): 균형 잡힌 기본 여백과 가독성
 * 3. spacious (>= 840dp, Galaxy S/A 20:9 시리즈, iPhone Pro Max 등): 대화면 여백 채움 및 풍성한 비주얼
 */

import { useWindowDimensions } from 'react-native';
import { TYPOGRAPHY } from '../theme/tokens';

export type ResponsiveTier = 'compact' | 'standard' | 'spacious';

export interface AppResponsiveTokens {
  tier: ResponsiveTier;
  windowHeight: number;
  windowWidth: number;
  isCompact: boolean;
  isStandard: boolean;
  isSpacious: boolean;

  /** 값 선택 유틸리티: tier에 따라 알맞은 값을 반환 */
  scale: <T>(compactVal: T, standardVal: T, spaciousVal: T) => T;

  // 1. 공통 화면 규격
  pagePaddingH: number;
  pagePaddingV: number;
  cardGap: number;
  cardBorderRadius: number;

  // 2. 홈 화면 토큰
  home: {
    screenPaddingHorizontal: number;
    screenPaddingTop: number;
    screenPaddingBottom: number;
    screenGap: number;
    greetingSubSize: number;
    greetingMainSize: number;
    greetingPawIconSize: number;
    greetingMarginBottom: number;
    dogCardPaddingV: number;
    dogCardPaddingH: number;
    dogAvatarSize: number;
    dogNameSize: number;
    dogSubtitleSize: number;
    dogBreedSize: number;
    dogChipPaddingV: number;
    dogChipPaddingH: number;
    dogChipFontSize: number;
    dogChipIconSize: number;
    dogStartBtnPaddingV: number;
    dogStartBtnPaddingH: number;
    dogStartBtnFontSize: number;
    dogCarouselMinHeight: number;
    dogDotsMarginTop: number;
    weatherTopMarginBottom: number;
    weatherPawIconSize: number;
    weatherHeadingSize: number;
    weatherSubHeadingSize: number;
    weatherCardPaddingV: number;
    weatherCardPaddingH: number;
    weatherGaugeSize: number;
    weatherScoreFontSize: number;
    weatherScoreUnitSize: number;
    weatherStatusBadgeFont: number;
    weatherStatusBadgePadV: number;
    weatherStatusBadgePadH: number;
    weatherChipFont: number;
    weatherChipPadV: number;
    weatherChipPadH: number;
    weatherStatusTitleSize: number;
    weatherRecommendTimeSize: number;
    weatherDetailHintSize: number;
    weatherAttributionMarginTop: number;
    weatherAttributionSize: number;
    trailCardPaddingV: number;
    trailCardPaddingH: number;
    trailPuppyAvatarSize: number;
    trailTitleSize: number;
    trailCountBadgeFont: number;
    trailCountBadgePadV: number;
    trailCountBadgePadH: number;
    trailPawWidth: number;
    trailPawHeight: number;
    trailDayFontSize: number;
    trailPawsMarginTop: number;
    trailTodayDotSize: number;
  };

  // 3. 산책 설정 화면 (WalkSettingsView)
  walkSettings: {
    containerPaddingH: number;
    containerPaddingV: number;
    sectionGap: number;
    sectionTitleSize: number;
    sectionTitleMarginB: number;
    aiBannerPaddingV: number;
    aiBannerPaddingH: number;
    aiBannerTitleSize: number;
    aiBannerBodySize: number;
    chipPaddingV: number;
    chipPaddingH: number;
    chipFontSize: number;
    envCardHeight: number;
    envCardPaddingV: number;
    envCardPaddingH: number;
    envCardTitleSize: number;
    envCardIconSize: number;
    findButtonPaddingV: number;
    findButtonFontSize: number;
    findButtonMarginTop: number;
  };

  // 4. 추천 산책 코스 화면 (CourseRecommendationView)
  courseRecommend: {
    mapMinHeight: number;
    headerPaddingV: number;
    headerPaddingH: number;
    briefingTitleSize: number;
    briefingSubSize: number;
    altCourseChipPadV: number;
    altCourseChipPadH: number;
    altCourseChipFont: number;
    cardPaddingV: number;
    cardPaddingH: number;
    courseTitleSize: number;
    metricNumberSize: number;
    metricLabelSize: number;
    startButtonPaddingV: number;
    startButtonFontSize: number;
  };

  // 5. 커뮤니티 화면 (CommunityTabScreen)
  community: {
    containerPaddingH: number;
    feedCardPaddingV: number;
    feedCardPaddingH: number;
    feedCardGap: number;
    inlineMapHeight: number;
    authorAvatarSize: number;
    authorNameSize: number;
    courseTitleSize: number;
    metricBadgeFont: number;
    metricBadgePadV: number;
    metricBadgePadH: number;
    maskingNoticeFont: number;
    actionBtnPaddingV: number;
    actionBtnFontSize: number;
  };

  // 6. 마이페이지 (MyProfileTabScreen)
  myProfile: {
    containerPaddingH: number;
    profileCardPaddingV: number;
    profileCardPaddingH: number;
    profileAvatarSize: number;
    dogNameSize: number;
    dogMetaSize: number;
    tabBtnPaddingV: number;
    tabBtnFontSize: number;
    segmentPaddingV: number;
    segmentFontSize: number;
    cardPaddingV: number;
    statNumberSize: number;
    statLabelSize: number;
    menuItemPaddingV: number;
    menuItemFontSize: number;
  };

  // 7. 산책 리포트 (WalkReportScreen)
  walkReport: {
    mapHeight: number;
    congratsCardPadding: number;
    cardPaddingV: number;
    cardPaddingH: number;
    statBoxHeight: number;
    statValueFontSize: number;
    feedbackCardPadding: number;
    buttonHeight: number;
    titleSize: number;
    gaugeCircleSize: number;
    gaugeValueSize: number;
    gaugeLabelSize: number;
    buttonPaddingV: number;
    buttonFontSize: number;
  };
}

export function useAppResponsive(): AppResponsiveTokens {
  const { height, width } = useWindowDimensions();

  const tier: ResponsiveTier =
    height < 720 ? 'compact' : height < 840 ? 'standard' : 'spacious';

  const isCompact = tier === 'compact';
  const isStandard = tier === 'standard';
  const isSpacious = tier === 'spacious';

  const scale = <T>(compactVal: T, standardVal: T, spaciousVal: T): T => {
    if (isCompact) return compactVal;
    if (isStandard) return standardVal;
    return spaciousVal;
  };

  // 1. 공통 화면 규격
  const pagePaddingH = scale(12, 16, 18);
  const pagePaddingV = scale(8, 12, 16);
  const cardGap = scale(8, 12, 16);
  const cardBorderRadius = scale(14, 16, 18);

  // 2. 홈 화면 토큰
  const home = {
    screenPaddingHorizontal: scale(12, 16, 16),
    screenPaddingTop: scale(4, 8, 10),
    screenPaddingBottom: scale(8, 14, 16),
    screenGap: scale(8, 12, 14),

    greetingSubSize: TYPOGRAPHY.support,
    greetingMainSize: TYPOGRAPHY.sectionTitle,
    greetingPawIconSize: scale(15, 17, 19),
    greetingMarginBottom: scale(2, 4, 6),

    dogCardPaddingV: scale(10, 13, 16),
    dogCardPaddingH: scale(12, 14, 16),
    dogAvatarSize: scale(42, 48, 54),
    dogNameSize: TYPOGRAPHY.cardTitle,
    dogSubtitleSize: TYPOGRAPHY.support,
    dogBreedSize: TYPOGRAPHY.caption,
    dogChipPaddingV: scale(3.5, 5, 6),
    dogChipPaddingH: scale(7.5, 9, 10.5),
    dogChipFontSize: TYPOGRAPHY.label,
    dogChipIconSize: scale(12, 13, 14),
    dogStartBtnPaddingV: scale(7.5, 9.5, 11),
    dogStartBtnPaddingH: scale(12, 15, 17),
    dogStartBtnFontSize: TYPOGRAPHY.button,
    dogCarouselMinHeight: scale(124, 144, 160),
    dogDotsMarginTop: scale(5, 8, 10),

    weatherTopMarginBottom: scale(3, 5, 7),
    weatherPawIconSize: scale(15, 17, 19),
    weatherHeadingSize: TYPOGRAPHY.cardTitle,
    weatherSubHeadingSize: TYPOGRAPHY.support,
    weatherCardPaddingV: scale(9, 12, 15),
    weatherCardPaddingH: scale(10, 12, 15),
    weatherGaugeSize: scale(66, 74, 82),
    weatherScoreFontSize: TYPOGRAPHY.metricValue,
    weatherScoreUnitSize: TYPOGRAPHY.caption,
    weatherStatusBadgeFont: TYPOGRAPHY.label,
    weatherStatusBadgePadV: scale(1.5, 2.5, 3),
    weatherStatusBadgePadH: scale(6, 8, 9),
    weatherChipFont: TYPOGRAPHY.label,
    weatherChipPadV: scale(1.5, 2.5, 3),
    weatherChipPadH: scale(5, 6, 7),
    weatherStatusTitleSize: TYPOGRAPHY.cardTitle,
    weatherRecommendTimeSize: TYPOGRAPHY.support,
    weatherDetailHintSize: TYPOGRAPHY.caption,
    weatherAttributionMarginTop: scale(3, 5, 6),
    weatherAttributionSize: TYPOGRAPHY.caption,

    trailCardPaddingV: scale(9, 12, 15),
    trailCardPaddingH: scale(12, 14, 15),
    trailPuppyAvatarSize: scale(32, 38, 42),
    trailTitleSize: TYPOGRAPHY.cardTitle,
    trailCountBadgeFont: TYPOGRAPHY.label,
    trailCountBadgePadV: scale(2, 3, 3.5),
    trailCountBadgePadH: scale(6, 8, 9),
    trailPawWidth: scale(28, 32, 36),
    trailPawHeight: scale(25, 29, 32),
    trailDayFontSize: TYPOGRAPHY.label,
    trailPawsMarginTop: scale(6, 9, 12),
    trailTodayDotSize: scale(4, 4.5, 5),
  };

  // 3. 산책 설정 화면 (WalkSettingsView)
  const walkSettings = {
    containerPaddingH: scale(12, 16, 18),
    containerPaddingV: scale(6, 10, 14),
    sectionGap: scale(8, 12, 16),
    sectionTitleSize: TYPOGRAPHY.sectionTitle,
    sectionTitleMarginB: scale(4, 6, 8),
    aiBannerPaddingV: scale(6, 8, 11),
    aiBannerPaddingH: scale(10, 12, 14),
    aiBannerTitleSize: TYPOGRAPHY.cardTitle,
    aiBannerBodySize: TYPOGRAPHY.support,
    chipPaddingV: scale(4, 6, 8),
    chipPaddingH: scale(8, 11, 14),
    chipFontSize: TYPOGRAPHY.label,
    envCardHeight: scale(44, 52, 60),
    envCardPaddingV: scale(5, 8, 10),
    envCardPaddingH: scale(8, 10, 12),
    envCardTitleSize: TYPOGRAPHY.cardTitle,
    envCardIconSize: scale(16, 18, 20),
    findButtonPaddingV: scale(10, 12.5, 15),
    findButtonFontSize: TYPOGRAPHY.button,
    findButtonMarginTop: scale(6, 10, 14),
  };

  // 4. 추천 산책 코스 화면 (CourseRecommendationView)
  const courseRecommend = {
    mapMinHeight: scale(145, 160, 175),
    headerPaddingV: scale(6, 8, 10),
    headerPaddingH: scale(12, 16, 18),
    briefingTitleSize: TYPOGRAPHY.sectionTitle,
    briefingSubSize: TYPOGRAPHY.support,
    altCourseChipPadV: scale(4, 5.5, 7),
    altCourseChipPadH: scale(8, 11, 13),
    altCourseChipFont: TYPOGRAPHY.label,
    cardPaddingV: scale(10, 13, 16),
    cardPaddingH: scale(12, 15, 18),
    courseTitleSize: TYPOGRAPHY.cardTitle,
    metricNumberSize: TYPOGRAPHY.metricValue,
    metricLabelSize: TYPOGRAPHY.label,
    startButtonPaddingV: scale(10, 12.5, 15),
    startButtonFontSize: TYPOGRAPHY.button,
  };

  // 5. 커뮤니티 화면 (CommunityTabScreen)
  const community = {
    containerPaddingH: scale(12, 16, 18),
    feedCardPaddingV: scale(10, 13, 16),
    feedCardPaddingH: scale(12, 15, 18),
    feedCardGap: scale(10, 13, 16),
    inlineMapHeight: scale(160, 195, 235),
    authorAvatarSize: scale(32, 38, 44),
    authorNameSize: TYPOGRAPHY.cardTitle,
    courseTitleSize: TYPOGRAPHY.cardTitle,
    metricBadgeFont: TYPOGRAPHY.label,
    metricBadgePadV: scale(2.5, 3.5, 4.5),
    metricBadgePadH: scale(6, 8, 10),
    maskingNoticeFont: TYPOGRAPHY.caption,
    actionBtnPaddingV: scale(8, 10, 12),
    actionBtnFontSize: TYPOGRAPHY.button,
  };

  // 6. 마이페이지 (MyProfileTabScreen)
  const myProfile = {
    containerPaddingH: scale(12, 16, 18),
    profileCardPaddingV: scale(12, 15, 18),
    profileCardPaddingH: scale(12, 16, 18),
    profileAvatarSize: scale(48, 58, 68),
    dogNameSize: TYPOGRAPHY.cardTitle,
    dogMetaSize: TYPOGRAPHY.support,
    tabBtnPaddingV: scale(6, 8, 10),
    tabBtnFontSize: TYPOGRAPHY.label,
    segmentPaddingV: scale(6, 7, 9),
    segmentFontSize: TYPOGRAPHY.label,
    cardPaddingV: scale(8, 10, 14),
    statNumberSize: TYPOGRAPHY.metricValue,
    statLabelSize: TYPOGRAPHY.label,
    menuItemPaddingV: scale(10, 13, 16),
    menuItemFontSize: TYPOGRAPHY.body,
  };

  // 7. 산책 리포트 (WalkReportScreen)
  const walkReport = {
    mapHeight: scale(
      Math.max(170, Math.round(height * 0.32)),
      Math.max(210, Math.round(height * 0.36)),
      Math.max(260, Math.round(height * 0.40))
    ),
    congratsCardPadding: scale(10, 12, 16),
    cardPaddingV: scale(10, 14, 18),
    cardPaddingH: scale(12, 16, 18),
    statBoxHeight: scale(64, 72, 82),
    statValueFontSize: TYPOGRAPHY.metricValue,
    feedbackCardPadding: scale(8, 10, 14),
    buttonHeight: scale(44, 50, 54),
    titleSize: TYPOGRAPHY.sectionTitle,
    gaugeCircleSize: scale(60, 72, 84),
    gaugeValueSize: TYPOGRAPHY.metricValue,
    gaugeLabelSize: TYPOGRAPHY.label,
    buttonPaddingV: scale(10, 13, 15),
    buttonFontSize: TYPOGRAPHY.button,
  };

  return {
    tier,
    windowHeight: height,
    windowWidth: width,
    isCompact,
    isStandard,
    isSpacious,
    scale,

    pagePaddingH,
    pagePaddingV,
    cardGap,
    cardBorderRadius,

    home,
    walkSettings,
    courseRecommend,
    community,
    myProfile,
    walkReport,
  };
}
