const fs = require('fs');
const path = require('path');

function parseMarkdownDeck(mdContent) {
  const slides = [];
  let deckMeta = {
    title: 'Presentation',
    theme: 'modern-business',
    slides: []
  };

  const rawSlides = mdContent.split(/\n---\s*\n/);

  rawSlides.forEach((rawSlide, index) => {
    const lines = rawSlide.trim().split('\n');
    if (lines.length === 0 || !lines[0].trim()) return;

    let layout = index === 0 ? 'cover' : 'columns-2';
    let title = '';
    let subtitle = '';
    let category = '';
    let notes = '';
    const items = [];
    const points = [];

    let inNotes = false;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('Notes:') || trimmed.startsWith('발표자노트:')) {
        inNotes = true;
        notes += trimmed.replace(/^(Notes:|발표자노트:)/, '').trim() + '\n';
        return;
      }

      if (inNotes) {
        notes += trimmed + '\n';
        return;
      }

      if (trimmed.startsWith('layout:')) {
        layout = trimmed.replace('layout:', '').trim();
      } else if (trimmed.startsWith('theme:') && index === 0) {
        deckMeta.theme = trimmed.replace('theme:', '').trim();
      } else if (trimmed.startsWith('category:') || trimmed.startsWith('tag:')) {
        category = trimmed.replace(/^(category:|tag:)/, '').trim();
      } else if (trimmed.startsWith('# ')) {
        title = trimmed.replace('# ', '').trim();
      } else if (trimmed.startsWith('## ')) {
        if (!title) title = trimmed.replace('## ', '').trim();
        else subtitle = trimmed.replace('## ', '').trim();
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const pt = trimmed.replace(/^[-*]\s+/, '').trim();
        points.push(pt);
        items.push(pt);
      }
    });

    if (index === 0 && title) {
      deckMeta.title = title;
      deckMeta.subtitle = subtitle;
    }

    slides.push({
      layout,
      title,
      subtitle,
      category,
      points,
      items,
      notes: notes.trim()
    });
  });

  deckMeta.slides = slides;
  return deckMeta;
}

function loadDeckFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Presentation spec file not found: ${resolved}`);
  }

  const content = fs.readFileSync(resolved, 'utf8');
  if (resolved.endsWith('.json')) {
    return JSON.parse(content);
  } else if (resolved.endsWith('.md')) {
    return parseMarkdownDeck(content);
  } else {
    // Try JSON first, then markdown
    try {
      return JSON.parse(content);
    } catch (e) {
      return parseMarkdownDeck(content);
    }
  }
}

module.exports = {
  loadDeckFile,
  parseMarkdownDeck
};

