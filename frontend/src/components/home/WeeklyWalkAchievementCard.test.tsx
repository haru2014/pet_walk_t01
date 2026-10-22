import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APP_THEMES, AppTheme } from '../../types/appTheme';
import { WeeklyWalkAchievementCard } from './WeeklyWalkAchievementCard';

function toReactNativeWebRgba(hex: string, alpha: number): string {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${channels.join(',')},${alpha.toFixed(2)})`;
}

describe('WeeklyWalkAchievementCard', () => {
  it.each(Object.values(APP_THEMES))('uses the $label theme colors for a completed badge', (theme: AppTheme) => {
    const html = renderToStaticMarkup(
      <WeeklyWalkAchievementCard walkCount={3} theme={theme} />,
    );

    expect(html).toContain(`background-color:${toReactNativeWebRgba(theme.primary, 0.14)}`);
    expect(html).toContain(`color:${toReactNativeWebRgba(theme.primaryDark, 1)}`);
    expect(html).toContain('달성 완료');
  });

  it('does not show the completed badge before reaching the goal', () => {
    const html = renderToStaticMarkup(
      <WeeklyWalkAchievementCard walkCount={2} theme={APP_THEMES.mint} />,
    );

    expect(html).toContain('진행 중');
    expect(html).not.toContain('달성 완료');
    expect(html).not.toContain(`background-color:${toReactNativeWebRgba(APP_THEMES.mint.primary, 0.14)}`);
  });
});
