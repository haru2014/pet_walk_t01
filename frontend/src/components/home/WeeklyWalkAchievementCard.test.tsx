import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { THEME_PALETTES } from '../../theme/tokens';
import { WeeklyWalkAchievementCard } from './WeeklyWalkAchievementCard';

function normalizeWebColor(color: string): string {
  const hex = color.match(/^#([\da-f]{6})$/i);
  if (hex) {
    const channels = [0, 2, 4].map((offset) => Number.parseInt(hex[1].slice(offset, offset + 2), 16));
    return `rgba(${channels.join(',')},1.00)`;
  }
  return color.replace(/\s/g, '').toLowerCase();
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
    const normalizedHtml = html.replace(/\s/g, '').toLowerCase();

    expect(normalizedHtml).toContain(`background-color:${normalizeWebColor(colors.primaryWash)}`);
    expect(normalizedHtml).toContain(`color:${normalizeWebColor(colors.primaryDark)}`);
    expect(html).toContain('달성 완료');
  });

  it('does not show the completed badge before reaching the goal', () => {
    const html = renderToStaticMarkup(
      <WeeklyWalkAchievementCard walkCount={2} colors={THEME_PALETTES.forest} />,
    );
    const normalizedHtml = html.replace(/\s/g, '').toLowerCase();

    expect(html).toContain('진행 중');
    expect(html).not.toContain('달성 완료');
    expect(normalizedHtml).not.toContain(`background-color:${normalizeWebColor(THEME_PALETTES.forest.primaryWash)}`);
  });
});
