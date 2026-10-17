/**
 * [편안하개 - PetWalk]
 * 홈 화면 3대 위젯 반응형 레이아웃 훅 (useHomeResponsive.ts)
 *
 * 목적:
 * - 해상도 및 화면 높이(컴팩트 ~ 최신 20:9 대화면 롱스크린)에 관계없이
 *   반려견 카드, 산책지수 위젯, 달성도 위젯이 모바일 화면에 꽉 차고 균형 있게 반응하도록 스케일링 제공.
 * - 소형 기기(iPhone SE 등): 컴팩트 핏으로 잘림 없이 표시
 * - 일반 기기(iPhone 12/13/14 등): 균형 잡힌 표준 여백과 가독성 확보
 * - 대화면/롱스크린(Galaxy S/A 시리즈 1080x2340, iPhone Pro Max 등): 하단 공백(Dead Space) 없이 3개 위젯이 풍성하게 화면을 채움
 */

import { useWindowDimensions } from 'react-native';

export type ResponsiveTier = 'compact' | 'standard' | 'spacious';

export interface ResponsiveHomeTokens {
  tier: ResponsiveTier;
  windowHeight: number;
  windowWidth: number;
  isCompact: boolean;
  isStandard: boolean;
  isSpacious: boolean;

  // 전체 화면 여백 및 간격
  screenPaddingHorizontal: number;
  screenPaddingTop: number;
  screenPaddingBottom: number;
  screenGap: number;

  // 상단 환영 인사
  greetingSubSize: number;
  greetingMainSize: number;
  greetingPawIconSize: number;
  greetingMarginBottom: number;

  // 1. HomeDogCard (반려견 카드)
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

  // 2. GoldenTimeWidget (오늘 강아지 산책지수)
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

  // 3. TrailAccomplishmentWidget (이번 주 산책 달성도)
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
}

export function useHomeResponsive(): ResponsiveHomeTokens {
  const { height, width } = useWindowDimensions();

  // 높이 기준 반응형 티어 판별
  // height < 720: 소형 화면 (iPhone SE 667 등)
  // 720 <= height < 840: 표준 화면 (iPhone 12/13/14 844 등)
  // height >= 840: 롱스크린 / 고해상도 대화면 (Galaxy S21~S24 880~915, iPhone Pro Max 932 등)
  const tier: ResponsiveTier =
    height < 720 ? 'compact' : height < 840 ? 'standard' : 'spacious';

  if (tier === 'compact') {
    return {
      tier,
      windowHeight: height,
      windowWidth: width,
      isCompact: true,
      isStandard: false,
      isSpacious: false,

      screenPaddingHorizontal: 12,
      screenPaddingTop: 4,
      screenPaddingBottom: 8,
      screenGap: 8,

      greetingSubSize: 11.5,
      greetingMainSize: 16.5,
      greetingPawIconSize: 15,
      greetingMarginBottom: 2,

      dogCardPaddingV: 10,
      dogCardPaddingH: 12,
      dogAvatarSize: 42,
      dogNameSize: 15,
      dogSubtitleSize: 11.5,
      dogBreedSize: 10.5,
      dogChipPaddingV: 3.5,
      dogChipPaddingH: 7.5,
      dogChipFontSize: 10.5,
      dogChipIconSize: 12,
      dogStartBtnPaddingV: 7.5,
      dogStartBtnPaddingH: 12,
      dogStartBtnFontSize: 12,
      dogCarouselMinHeight: 124,
      dogDotsMarginTop: 5,

      weatherTopMarginBottom: 3,
      weatherPawIconSize: 15,
      weatherHeadingSize: 14.5,
      weatherSubHeadingSize: 11,
      weatherCardPaddingV: 9,
      weatherCardPaddingH: 10,
      weatherGaugeSize: 66,
      weatherScoreFontSize: 21,
      weatherScoreUnitSize: 9.5,
      weatherStatusBadgeFont: 10.5,
      weatherStatusBadgePadV: 1.5,
      weatherStatusBadgePadH: 6,
      weatherChipFont: 9.5,
      weatherChipPadV: 1.5,
      weatherChipPadH: 5,
      weatherStatusTitleSize: 13,
      weatherRecommendTimeSize: 11,
      weatherDetailHintSize: 10.5,
      weatherAttributionMarginTop: 3,
      weatherAttributionSize: 9,

      trailCardPaddingV: 9,
      trailCardPaddingH: 12,
      trailPuppyAvatarSize: 32,
      trailTitleSize: 14.5,
      trailCountBadgeFont: 10,
      trailCountBadgePadV: 2,
      trailCountBadgePadH: 6,
      trailPawWidth: 28,
      trailPawHeight: 25,
      trailDayFontSize: 9.5,
      trailPawsMarginTop: 6,
      trailTodayDotSize: 4,
    };
  }

  if (tier === 'standard') {
    return {
      tier,
      windowHeight: height,
      windowWidth: width,
      isCompact: false,
      isStandard: true,
      isSpacious: false,

      screenPaddingHorizontal: 16,
      screenPaddingTop: 8,
      screenPaddingBottom: 14,
      screenGap: 12,

      greetingSubSize: 12.5,
      greetingMainSize: 19,
      greetingPawIconSize: 17,
      greetingMarginBottom: 4,

      dogCardPaddingV: 13,
      dogCardPaddingH: 14,
      dogAvatarSize: 48,
      dogNameSize: 16.5,
      dogSubtitleSize: 12.5,
      dogBreedSize: 11.5,
      dogChipPaddingV: 5,
      dogChipPaddingH: 9,
      dogChipFontSize: 11.5,
      dogChipIconSize: 13,
      dogStartBtnPaddingV: 9.5,
      dogStartBtnPaddingH: 15,
      dogStartBtnFontSize: 13,
      dogCarouselMinHeight: 144,
      dogDotsMarginTop: 8,

      weatherTopMarginBottom: 5,
      weatherPawIconSize: 17,
      weatherHeadingSize: 16,
      weatherSubHeadingSize: 12,
      weatherCardPaddingV: 12,
      weatherCardPaddingH: 12,
      weatherGaugeSize: 74,
      weatherScoreFontSize: 24,
      weatherScoreUnitSize: 10.5,
      weatherStatusBadgeFont: 11.5,
      weatherStatusBadgePadV: 2.5,
      weatherStatusBadgePadH: 8,
      weatherChipFont: 10.5,
      weatherChipPadV: 2.5,
      weatherChipPadH: 6,
      weatherStatusTitleSize: 14.5,
      weatherRecommendTimeSize: 12,
      weatherDetailHintSize: 11.5,
      weatherAttributionMarginTop: 5,
      weatherAttributionSize: 9.5,

      trailCardPaddingV: 12,
      trailCardPaddingH: 14,
      trailPuppyAvatarSize: 38,
      trailTitleSize: 16,
      trailCountBadgeFont: 11.5,
      trailCountBadgePadV: 3,
      trailCountBadgePadH: 8,
      trailPawWidth: 32,
      trailPawHeight: 29,
      trailDayFontSize: 10.5,
      trailPawsMarginTop: 9,
      trailTodayDotSize: 4.5,
    };
  }

  // tier === 'spacious' (롱스크린 대화면, 1017-home2.png 대응)
  return {
    tier,
    windowHeight: height,
    windowWidth: width,
    isCompact: false,
    isStandard: false,
    isSpacious: true,

    screenPaddingHorizontal: 16,
    screenPaddingTop: 10,
    screenPaddingBottom: 16,
    screenGap: 14,

    greetingSubSize: 13,
    greetingMainSize: 20.5,
    greetingPawIconSize: 19,
    greetingMarginBottom: 6,

    dogCardPaddingV: 16,
    dogCardPaddingH: 16,
    dogAvatarSize: 54,
    dogNameSize: 18,
    dogSubtitleSize: 13,
    dogBreedSize: 12,
    dogChipPaddingV: 6,
    dogChipPaddingH: 10.5,
    dogChipFontSize: 12,
    dogChipIconSize: 14,
    dogStartBtnPaddingV: 11,
    dogStartBtnPaddingH: 17,
    dogStartBtnFontSize: 14,
    dogCarouselMinHeight: 160,
    dogDotsMarginTop: 10,

    weatherTopMarginBottom: 7,
    weatherPawIconSize: 19,
    weatherHeadingSize: 17,
    weatherSubHeadingSize: 12.5,
    weatherCardPaddingV: 15,
    weatherCardPaddingH: 15,
    weatherGaugeSize: 82,
    weatherScoreFontSize: 27,
    weatherScoreUnitSize: 11,
    weatherStatusBadgeFont: 12,
    weatherStatusBadgePadV: 3,
    weatherStatusBadgePadH: 9,
    weatherChipFont: 11,
    weatherChipPadV: 3,
    weatherChipPadH: 7,
    weatherStatusTitleSize: 15.5,
    weatherRecommendTimeSize: 12.5,
    weatherDetailHintSize: 12,
    weatherAttributionMarginTop: 6,
    weatherAttributionSize: 10,

    trailCardPaddingV: 15,
    trailCardPaddingH: 15,
    trailPuppyAvatarSize: 42,
    trailTitleSize: 17,
    trailCountBadgeFont: 12,
    trailCountBadgePadV: 3.5,
    trailCountBadgePadH: 9,
    trailPawWidth: 36,
    trailPawHeight: 32,
    trailDayFontSize: 11.5,
    trailPawsMarginTop: 12,
    trailTodayDotSize: 5,
  };
}
