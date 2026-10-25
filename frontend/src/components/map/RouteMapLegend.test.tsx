import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { THEME_PALETTES } from '../../theme/tokens';
import { themeManager } from '../../theme/themeManager';
import { RouteMapLegend } from './RouteMapLegend';

describe('RouteMapLegend', () => {
  it('shows the selected theme route colors for all three segment types', () => {
    const getTheme = vi.spyOn(themeManager, 'getTheme').mockReturnValue('coral');
    const getColors = vi.spyOn(themeManager, 'getColors').mockReturnValue(THEME_PALETTES.coral);

    try {
      const html = renderToStaticMarkup(<RouteMapLegend />);

      expect(html).toContain('편안한 길');
      expect(html).toContain('보통 길');
      expect(html).toContain('주의 구간');
      expect(html).toContain('background-color:rgba(21,128,61,1.00)');
      expect(html).toContain('background-color:rgba(37,99,235,1.00)');
      expect(html).toContain('background-color:rgba(194,65,12,1.00)');
    } finally {
      getTheme.mockRestore();
      getColors.mockRestore();
    }
  });
});
