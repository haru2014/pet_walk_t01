const { generatePresentation } = require('./generator');
const { loadTheme } = require('./theme');
const { loadDeckFile, parseMarkdownDeck } = require('./parser');
const { LAYOUT_MAP } = require('./layouts');

module.exports = {
  generatePresentation,
  loadTheme,
  loadDeckFile,
  parseMarkdownDeck,
  LAYOUT_MAP
};

