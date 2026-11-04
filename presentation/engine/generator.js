const path = require('path');
const fs = require('fs');
const { PptxGenJS } = require('./runtime');
const { loadTheme } = require('./theme');
const { renderSlide } = require('./layouts');

async function generatePresentation(deckSpec, options = {}) {
  if (!deckSpec || !Array.isArray(deckSpec.slides)) {
    throw new Error('Invalid deck specification: "slides" array is required.');
  }

  const requestedTheme = options.theme || deckSpec.theme || 'modern-business';
  const requestedLayout = options.layout || deckSpec.layout || null;
  const theme = loadTheme(requestedTheme, requestedLayout);

  const pptx = new PptxGenJS();
  pptx.layout = theme.layout; // 'LAYOUT_16x9' or 'LAYOUT_4x3'

  if (deckSpec.title) {
    pptx.title = deckSpec.title;
  }
  if (deckSpec.author || deckSpec.presenter) {
    pptx.author = deckSpec.author || deckSpec.presenter;
  }
  if (deckSpec.subject) {
    pptx.subject = deckSpec.subject;
  }

  const slides = deckSpec.slides;
  const totalSlides = slides.length;

  slides.forEach((slideData, index) => {
    const slide = pptx.addSlide();
    renderSlide(slide, pptx, slideData, theme, index + 1, totalSlides);
  });

  const outputPath = options.outputPath || path.resolve(process.cwd(), 'output', `${deckSpec.id || 'presentation'}.pptx`);
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  await pptx.writeFile({ fileName: outputPath });

  return {
    success: true,
    outputPath,
    totalSlides,
    theme: theme.id,
    layout: theme.layout
  };
}

module.exports = {
  generatePresentation
};

