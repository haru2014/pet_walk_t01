const fs = require('fs');
const path = require('path');

const DEFAULT_THEME_ID = 'modern-business';

function stripHex(colorStr) {
  if (!colorStr) return '000000';
  return String(colorStr).replace(/^#/, '').trim();
}

function loadTheme(themeInput, requestedLayout = null) {
  let themeConfig = null;

  if (typeof themeInput === 'object' && themeInput !== null) {
    themeConfig = themeInput;
  } else {
    const themeId = themeInput || DEFAULT_THEME_ID;
    const templatePath = path.resolve(__dirname, `../templates/${themeId}.json`);

    if (fs.existsSync(templatePath)) {
      themeConfig = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    } else {
      console.warn(`[ThemeLoader] Theme "${themeId}" not found. Falling back to "${DEFAULT_THEME_ID}".`);
      const fallbackPath = path.resolve(__dirname, `../templates/${DEFAULT_THEME_ID}.json`);
      themeConfig = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    }
  }

  // Determine aspect ratio
  const layout = requestedLayout || themeConfig.layout || '16x9';
  const is16x9 = layout === '16x9' || layout === 'LAYOUT_16x9';

  const dimensions = is16x9
    ? { width: 10, height: 5.625, layoutName: 'LAYOUT_16x9' }
    : { width: 10, height: 7.5, layoutName: 'LAYOUT_4x3' };

  // Clean all colors
  const cleanColors = {};
  for (const [key, value] of Object.entries(themeConfig.colors || {})) {
    cleanColors[key] = stripHex(value);
  }

  return {
    ...themeConfig,
    layout: dimensions.layoutName,
    width: dimensions.width,
    height: dimensions.height,
    is16x9,
    colors: cleanColors,
    fontTitle: themeConfig.fonts?.title || 'Pretendard',
    fontBody: themeConfig.fonts?.body || 'Pretendard',
    fontFallbackTitle: themeConfig.fonts?.fallbackTitle || 'Pretendard',
    fontFallbackBody: themeConfig.fonts?.fallbackBody || 'Pretendard',
    cardRadius: themeConfig.metrics?.cardRadius ?? (is16x9 ? 0.15 : 0.2),
    badgeRadius: themeConfig.metrics?.badgeRadius ?? 0.08
  };
}

module.exports = {
  loadTheme,
  stripHex
};

