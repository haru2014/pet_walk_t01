/**
 * [편안하개 - PetWalk]
 * 홈 화면 3대 위젯 반응형 레이아웃 훅 (useHomeResponsive.ts)
 *
 * 공통 반응형 훅(useAppResponsive.ts)의 홈 화면 특화 프록시 인터페이스.
 * 기존 HomeScreen 및 3개 위젯과의 100% 하위 호환성을 보장합니다.
 */

import { useAppResponsive, ResponsiveTier } from './useAppResponsive';

export type { ResponsiveTier };

export interface ResponsiveHomeTokens {
  tier: ResponsiveTier;
  windowHeight: number;
  windowWidth: number;
  isCompact: boolean;
  isStandard: boolean;
  isSpacious: boolean;

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
}

export function useHomeResponsive(): ResponsiveHomeTokens {
  const app = useAppResponsive();
  return {
    tier: app.tier,
    windowHeight: app.windowHeight,
    windowWidth: app.windowWidth,
    isCompact: app.isCompact,
    isStandard: app.isStandard,
    isSpacious: app.isSpacious,
    ...app.home,
  };
}
