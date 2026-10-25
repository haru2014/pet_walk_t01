import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { THEME_PALETTES } from '../../theme/tokens';
import { WeeklyWalkAchievementCard } from './WeeklyWalkAchievementCard';

function toReactNativeWebRgba(hex: string, alpha: number): string {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${channels.join(',')},${alpha.toFixed(2)})`;
}

describe('WeeklyWalkAchievementCard', () => {
  it.each([
    { label: '숲길', colors: THEME_PALETTES.forest },
    { label: '바다', colors: THEME_PALETTES.ocean },
    { label: '코랄', colors: THEME_PALETTES.coral },
  ])('uses the $label theme colors for a completed badge', ({ colors }) => {
    const html = renderToStaticMarkup(
      <WeeklyWalkAchievementCard walkCount={3} colors={colors} />,
    );

    expect(html).toContain(`background-color:${toReactNativeWebRgba(colors.primary, 0.14)}`);
    expect(html).toContain(`color:${toReactNativeWebRgba(colors.primaryDark, 1)}`);
    expect(html).toContain('달성 완료');
  });

  it('does not show the completed badge before reaching the goal', () => {
    const html = renderToStaticMarkup(
      <WeeklyWalkAchievementCard walkCount={2} colors={THEME_PALETTES.forest} />,
    );

    expect(html).toContain('진행 중');
    expect(html).not.toContain('달성 완료');
    expect(html).not.toContain(`background-color:${toReactNativeWebRgba(THEME_PALETTES.forest.primary, 0.14)}`);
  });
});
