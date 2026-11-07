/**
 * Slide layout rendering library for PptxGenJS.
 * Implements reusable, high-quality, editable slide layouts.
 */

const PHASES = ['warm-up', 'learn', 'practice', 'exit-ticket'];
const PHASE_LABELS = {
  'warm-up': 'Warm-up',
  'learn': 'Learn',
  'practice': 'Practice',
  'exit-ticket': 'Exit ticket'
};

function renderProgressBar(slide, pptx, currentPhase, theme) {
  if (!currentPhase) return 0;
  const normalizedPhase = String(currentPhase).toLowerCase().replace(/\s+/g, '-');
  const currentIndex = PHASES.indexOf(normalizedPhase);
  if (currentIndex === -1) return 0;

  const marginX = 0.8;
  const barY = 0.32;
  const barH = 0.26;
  const totalW = theme.width - marginX * 2;
  const gap = 0.12;
  const barW = (totalW - gap * 3) / 4;

  const phaseColors = {
    'warm-up': { solid: theme.colors.phaseWarmup || 'FFB020', soft: theme.colors.phaseWarmupSoft || 'FFF1D2', textDark: true },
    'learn': { solid: theme.colors.phaseLearn || '2E6BD9', soft: theme.colors.phaseLearnSoft || 'E4EDFC', textDark: false },
    'practice': { solid: theme.colors.phasePractice || '16A06F', soft: theme.colors.phasePracticeSoft || 'DDF4EA', textDark: false },
    'exit-ticket': { solid: theme.colors.phaseExit || 'E4483F', soft: theme.colors.phaseExitSoft || 'FCE3E1', textDark: false }
  };

  PHASES.forEach((p, idx) => {
    const x = marginX + idx * (barW + gap);
    const conf = phaseColors[p];
    const label = PHASE_LABELS[p];

    let fill = theme.colors.phaseUpcoming || 'E6EBF2';
    let textColor = '6E7891';
    let text = label;
    let bold = false;

    if (idx < currentIndex) {
      fill = conf.soft;
      textColor = conf.textDark ? '1E2B4A' : conf.solid;
      text = '✔  ' + label;
    } else if (idx === currentIndex) {
      fill = conf.solid;
      textColor = conf.textDark ? '1E2B4A' : 'FFFFFF';
      text = label + '  [ NOW ]';
      bold = true;
    }

    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: barY, w: barW, h: barH,
      fill: { color: fill },
      line: { color: idx === currentIndex ? fill : (theme.colors.border || 'D6DEEA'), width: 0.8 },
      rectRadius: 0.08
    });

    slide.addText(text, {
      x, y: barY, w: barW, h: barH,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: textColor,
      bold,
      align: 'center',
      valign: 'middle'
    });
  });

  return barY + barH + 0.15;
}

// Helper to render standard header on content slides
function renderHeader(slide, pptx, data, theme) {
  const marginX = 0.8;
  let currentY = 0.5;

  if (data.phase) {
    const pb = renderProgressBar(slide, pptx, data.phase, theme);
    if (pb > 0) currentY = pb;
  }


  // Category / Tracker Tag
  if (data.category || data.tag) {
    const tagText = (data.category || data.tag).toUpperCase();
    slide.addShape(pptx.ShapeType.roundRect, {
      x: marginX,
      y: currentY,
      w: Math.max(1.2, tagText.length * 0.12 + 0.3),
      h: 0.28,
      fill: { color: theme.colors.badgeBg || theme.colors.surfaceSubtle },
      line: { color: theme.colors.border, width: 0.8 },
      rectRadius: theme.badgeRadius
    });

    slide.addText(tagText, {
      x: marginX,
      y: currentY,
      w: Math.max(1.2, tagText.length * 0.12 + 0.3),
      h: 0.28,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.badgeText || theme.colors.primary,
      bold: true,
      align: 'center',
      valign: 'middle'
    });

    currentY += 0.35;
  }

  // Slide Title
  const titleText = data.title || '슬라이드 제목';
  slide.addText(titleText, {
    x: marginX,
    y: currentY,
    w: theme.width - marginX * 2,
    h: 0.55,
    fontSize: 22,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true,
    valign: 'top'
  });

  currentY += 0.5;

  // Subtitle / Key statement
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: marginX,
      y: currentY,
      w: theme.width - marginX * 2,
      h: 0.32,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.textMuted,
      valign: 'top'
    });
    currentY += 0.35;
  }

  return currentY;
}

// Helper to render standard footer (slide number & source/disclaimer)
// Helper to render standard footer (slide number & source/disclaimer)
function renderFooter(slide, data, theme, slideIndex, totalSlides) {
  const marginX = 0.8;
  const footerY = theme.height - 0.50;
  const fontSafe = theme.fontFallbackBody || 'Pretendard';

  // 1. Left side: Source citation or Instructor name
  let leftText = '';
  if (data.source || data.sourceCitation) {
    leftText = data.source ? `[출처] ${data.source}` : data.sourceCitation;
  } else if (data.footer) {
    leftText = data.footer;
  } else if (theme.id === 'lesson-plan') {
    leftText = data.instructor || data.teacher || '애자일 코칭 & 스크럼 마스터 심화 과정';
  }

  if (leftText) {
    slide.addText(leftText, {
      x: marginX,
      y: footerY,
      w: 5.5,
      h: 0.38,
      fontSize: 12,
      fontFace: fontSafe,
      color: theme.colors.textMuted || '6E7891'
    });
  }

  // 2. Right side: Lesson name / Slide count
  const lessonTitle = data.lessonName || (theme.id === 'lesson-plan' ? '애자일 스크럼 개발 심화 교육' : '');
  const pageStr = (slideIndex && totalSlides) ? `${slideIndex} / ${totalSlides}` : '';
  const rightParts = [lessonTitle, pageStr].filter(Boolean);
  const rightText = rightParts.join('  |  ');

  if (rightText) {
    slide.addText(rightText, {
      x: theme.width - marginX - 4.5,
      y: footerY,
      w: 4.5,
      h: 0.38,
      fontSize: 12,
      fontFace: fontSafe,
      color: theme.colors.textMuted || '6E7891',
      align: 'right'
    });
  }
}

function renderCover(slide, pptx, data, theme) {
  const marginX = 1.0;

  // Decorative Accent Bar or Pill
  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX,
    y: 1.2,
    w: 0.6,
    h: 0.08,
    fill: { color: theme.colors.primary },
    line: { color: theme.colors.primary, width: 0 },
    rectRadius: 0.04
  });

  // Category / Subject Tag
  if (data.category || data.tag) {
    slide.addText((data.category || data.tag).toUpperCase(), {
      x: marginX + 0.8,
      y: 1.1,
      w: 5.0,
      h: 0.28,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.accent,
      bold: true
    });
  }

  // Main Title
  slide.addText(data.title || '발표 제목을 입력하세요', {
    x: marginX,
    y: 1.55,
    w: theme.width - marginX * 2,
    h: 1.4,
    fontSize: 32,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true,
    valign: 'middle'
  });

  // Subtitle
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: marginX,
      y: 3.05,
      w: theme.width - marginX * 2,
      h: 0.8,
      fontSize: 16,
      fontFace: theme.fontBody,
      color: theme.colors.textSecondary,
      valign: 'top'
    });
  }

  // Bottom Metadata Card / Line
  const metaY = theme.height - 1.3;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX,
    y: metaY,
    w: theme.width - marginX * 2,
    h: 0.65,
    fill: { color: theme.colors.surface },
    line: { color: theme.colors.border, width: 1 },
    rectRadius: theme.cardRadius
  });

  const presenter = data.presenter || data.author || '';
  const dateOrOrg = data.date || data.organization || '';
  const metaText = [presenter, dateOrOrg].filter(Boolean).join('  |  ');

  if (metaText) {
    slide.addText(metaText, {
      x: marginX + 0.3,
      y: metaY,
      w: theme.width - marginX * 2 - 0.6,
      h: 0.65,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.textMuted,
      valign: 'middle'
    });
  }
}

// 2. Agenda Slide
function renderAgenda(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const items = data.items || [];
  const count = items.length || 4;

  const cardW = (theme.width - marginX * 2 - (count > 4 ? 0.3 : 0.2) * (count - 1)) / count;
  const cardH = theme.height - contentStartY - 1.0;
  const gap = (theme.width - marginX * 2 - cardW * count) / (count - 1 || 1);

  items.forEach((item, idx) => {
    const itemX = marginX + idx * (cardW + gap);
    const title = typeof item === 'string' ? item : item.title;
    const desc = typeof item === 'object' ? item.description : '';

    // Card container
    slide.addShape(pptx.ShapeType.roundRect, {
      x: itemX,
      y: contentStartY + 0.2,
      w: cardW,
      h: cardH,
      fill: { color: theme.colors.surface },
      line: { color: theme.colors.border, width: 1 },
      rectRadius: theme.cardRadius
    });

    // Step Number Badge
    slide.addShape(pptx.ShapeType.roundRect, {
      x: itemX + 0.25,
      y: contentStartY + 0.45,
      w: 0.5,
      h: 0.5,
      fill: { color: theme.colors.accentLight || theme.colors.surfaceSubtle },
      line: { color: theme.colors.border, width: 0.8 },
      rectRadius: 0.1
    });

    slide.addText(String(idx + 1).padStart(2, '0'), {
      x: itemX + 0.25,
      y: contentStartY + 0.45,
      w: 0.5,
      h: 0.5,
      fontSize: 14,
      fontFace: theme.fontTitle,
      color: theme.colors.primary,
      bold: true,
      align: 'center',
      valign: 'middle'
    });

    // Title
    slide.addText(title, {
      x: itemX + 0.25,
      y: contentStartY + 1.15,
      w: cardW - 0.5,
      h: 0.7,
      fontSize: 15,
      fontFace: theme.fontTitle,
      color: theme.colors.textPrimary,
      bold: true,
      valign: 'top'
    });

    // Description
    if (desc) {
      slide.addText(desc, {
        x: itemX + 0.25,
        y: contentStartY + 1.9,
        w: cardW - 0.5,
        h: cardH - 2.1,
        fontSize: 12,
        fontFace: theme.fontBody,
        color: theme.colors.textSecondary,
        valign: 'top'
      });
    }
  });
}

// 3. Section Divider Slide
function renderSection(slide, pptx, data, theme) {
  const marginX = 0.8;
  const totalW = theme.width - marginX * 2;
  const totalH = theme.height - 2.0;
  const startY = 1.0;

  // Background card
  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX,
    y: startY,
    w: totalW,
    h: totalH,
    fill: { color: theme.colors.surface || 'F1F5FB' },
    line: { color: theme.colors.border || 'D6DEEA', width: 1.5 },
    rectRadius: theme.cardRadius || 0.2
  });

  const hasImg = !!data.image;
  const leftW = hasImg ? totalW * 0.55 : totalW - 1.6;

  // Section Number Pill
  const secNum = data.sectionNumber || data.number || '01';
  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX + 0.6,
    y: startY + 0.6,
    w: 1.6,
    h: 0.38,
    fill: { color: theme.colors.primary || '1E2B4A' },
    line: { color: theme.colors.primary || '1E2B4A', width: 0 },
    rectRadius: 0.1
  });
  slide.addText(`SECTION ${secNum}`, {
    x: marginX + 0.6,
    y: startY + 0.6,
    w: 1.6,
    h: 0.38,
    fontSize: 12,
    fontFace: theme.fontTitle,
    color: 'FFFFFF',
    bold: true,
    align: 'center',
    valign: 'middle'
  });

  // Section Title
  slide.addText(data.title || '섹션 제목', {
    x: marginX + 0.6,
    y: startY + 1.2,
    w: leftW,
    h: 1.6,
    fontSize: 28,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true,
    valign: 'middle'
  });

  // Section Subtitle / Description
  if (data.subtitle || data.description) {
    slide.addText(data.subtitle || data.description, {
      x: marginX + 0.6,
      y: startY + 3.0,
      w: leftW,
      h: 1.2,
      fontSize: 13.5,
      fontFace: theme.fontBody,
      color: theme.colors.textSecondary,
      lineSpacing: 20
    });
  }

  // Right side illustration if present
  if (hasImg) {
    const imgX = marginX + leftW + 0.4;
    const imgW = totalW - leftW - 1.0;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: imgX,
      y: startY + 0.6,
      w: imgW,
      h: totalH - 1.2,
      fill: { color: 'FFFFFF' },
      line: { color: theme.colors.border || 'D6DEEA', width: 1 },
      rectRadius: 0.15
    });
    slide.addImage({
      path: data.image,
      x: imgX + 0.2,
      y: startY + 0.8,
      w: imgW - 0.4,
      h: totalH - 1.6,
      sizing: { type: 'contain', w: imgW - 0.4, h: totalH - 1.6 }
    });
  }
}

function renderKeyMessage(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;

  // Large Highlight Card
  const boxY = contentStartY + 0.15;
  const boxH = theme.height - boxY - 0.9;

  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX,
    y: boxY,
    w: theme.width - marginX * 2,
    h: boxH,
    fill: { color: theme.colors.surface },
    line: { color: theme.colors.borderActive || theme.colors.primary, width: 1.5 },
    rectRadius: theme.cardRadius
  });

  // Quotation or Core Statement
  slide.addText(`“${data.statement || data.message || data.title}”`, {
    x: marginX + 0.8,
    y: boxY + 0.5,
    w: theme.width - marginX * 2 - 1.6,
    h: 1.5,
    fontSize: 22,
    fontFace: theme.fontTitle,
    color: theme.colors.primary,
    bold: true,
    align: 'center',
    valign: 'middle'
  });

  // Bullet takeaways or explanation
  const points = data.points || data.items || [];
  if (points.length > 0) {
    const textRuns = points.map(p => ({
      text: `•  ${typeof p === 'string' ? p : p.text}\n`,
      options: {
        fontSize: 12,
        fontFace: theme.fontBody,
        color: theme.colors.textSecondary,
        breakLine: true
      }
    }));

    slide.addText(textRuns, {
      x: marginX + 1.2,
      y: boxY + 2.0,
      w: theme.width - marginX * 2 - 2.4,
      h: boxH - 2.2,
      valign: 'top',
      lineSpacing: 22
    });
  }
}

// 5. 2-Columns Layout (Comparison, Problem-Solution, Before-After)
function renderColumns2(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const gap = 0.3;
  const colW = (theme.width - marginX * 2 - gap) / 2;
  const colH = theme.height - contentStartY - 0.75;

  let cols = data.columns || data.cards;

  // If slide has data.image and only 1 column or raw points, make column 2 an image card
  if (data.image && (!cols || cols.length === 1)) {
    const firstCol = (cols && cols[0]) ? cols[0] : { title: data.cardTitle || data.title, points: data.points || data.items || [] };
    cols = [
      firstCol,
      { isImageCard: true, image: data.image, caption: data.caption || '' }
    ];
  } else if (!cols) {
    cols = [
      { title: '항목 1', points: [] },
      { title: '항목 2', points: [] }
    ];
  }

  cols.slice(0, 2).forEach((col, idx) => {
    const colX = marginX + idx * (colW + gap);

    // If this column is an image card
    if (col.image || col.isImageCard) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: colX,
        y: contentStartY + 0.1,
        w: colW,
        h: colH,
        fill: { color: 'FFFFFF' },
        line: { color: theme.colors.border || 'D6DEEA', width: 1 },
        rectRadius: theme.cardRadius || 0.15
      });

      if (col.tag) {
        slide.addText(col.tag.toUpperCase(), {
          x: colX + 0.25,
          y: contentStartY + 0.25,
          w: colW - 0.5,
          h: 0.25,
          fontSize: 12,
          fontFace: theme.fontBody,
          color: theme.colors.accent,
          bold: true
        });
      }

      if (col.title) {
        slide.addText(col.title, {
          x: colX + 0.25,
          y: contentStartY + (col.tag ? 0.55 : 0.3),
          w: colW - 0.5,
          h: 0.4,
          fontSize: 14,
          fontFace: theme.fontTitle,
          color: theme.colors.textPrimary,
          bold: true
        });
      }

      const imgY = col.title ? contentStartY + 0.75 : contentStartY + 0.25;
      const imgH = colH - (imgY - contentStartY) - (col.caption ? 0.5 : 0.2);

      slide.addImage({
        path: col.image,
        x: colX + 0.2,
        y: imgY,
        w: colW - 0.4,
        h: imgH,
        sizing: { type: 'contain', w: colW - 0.4, h: imgH }
      });

      if (col.caption) {
        slide.addText(col.caption, {
          x: colX + 0.2,
          y: contentStartY + colH - 0.45,
          w: colW - 0.4,
          h: 0.35,
          fontSize: 12,
          fontFace: theme.fontFallbackBody || 'Pretendard',
          color: theme.colors.textMuted,
          align: 'center'
        });
      }
      return;
    }

    // Standard text card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: colX,
      y: contentStartY + 0.1,
      w: colW,
      h: colH,
      fill: { color: theme.colors.surface || 'F1F5FB' },
      line: {
        color: (idx === 1 && data.highlightSecond) ? (theme.colors.primary || '2E6BD9') : (theme.colors.border || 'D6DEEA'),
        width: (idx === 1 && data.highlightSecond) ? 1.5 : 1
      },
      rectRadius: theme.cardRadius || 0.15
    });

    if (col.tag) {
      slide.addText(col.tag.toUpperCase(), {
        x: colX + 0.3,
        y: contentStartY + 0.25,
        w: colW - 0.6,
        h: 0.25,
        fontSize: 12,
        fontFace: theme.fontBody,
        color: theme.colors.accent,
        bold: true
      });
    }

    slide.addText(col.title || `구분 ${idx + 1}`, {
      x: colX + 0.3,
      y: contentStartY + (col.tag ? 0.55 : 0.3),
      w: colW - 0.6,
      h: 0.45,
      fontSize: 15,
      fontFace: theme.fontTitle,
      color: theme.colors.textPrimary,
      bold: true
    });

    const points = col.points || col.items || [];
    if (points.length > 0) {
      const runs = points.map(p => ({
        text: `✔  ${typeof p === 'string' ? p : p.text}\n`,
        options: {
          fontSize: 12,
          fontFace: theme.fontBody,
          color: theme.colors.textSecondary,
          breakLine: true
        }
      }));

      slide.addText(runs, {
        x: colX + 0.3,
        y: contentStartY + (col.tag ? 1.05 : 0.8),
        w: colW - 0.6,
        h: colH - 1.0,
        valign: 'top',
        lineSpacing: 19
      });
    }
  });
}

function renderColumns3(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const gap = 0.25;
  const colW = (theme.width - marginX * 2 - gap * 2) / 3;
  const colH = theme.height - contentStartY - 0.85;

  const cols = data.columns || data.cards || [];

  cols.slice(0, 3).forEach((col, idx) => {
    const colX = marginX + idx * (colW + gap);

    // Card background
    slide.addShape(pptx.ShapeType.roundRect, {
      x: colX,
      y: contentStartY + 0.1,
      w: colW,
      h: colH,
      fill: { color: theme.colors.surface },
      line: { color: theme.colors.border, width: 1 },
      rectRadius: theme.cardRadius
    });

    // Top pill / tag
    if (col.tag) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: colX + 0.25,
        y: contentStartY + 0.25,
        w: colW - 0.5,
        h: 0.28,
        fill: { color: theme.colors.badgeBg || theme.colors.surfaceSubtle },
        line: { color: theme.colors.border, width: 0.8 },
        rectRadius: theme.badgeRadius
      });
      slide.addText(col.tag, {
        x: colX + 0.25,
        y: contentStartY + 0.25,
        w: colW - 0.5,
        h: 0.28,
        fontSize: 12,
        fontFace: theme.fontBody,
        color: theme.colors.badgeText || theme.colors.primary,
        bold: true,
        align: 'center',
        valign: 'middle'
      });
    }

    // Column Title
    const titleY = col.tag ? contentStartY + 0.65 : contentStartY + 0.3;
    slide.addText(col.title || `Pillar ${idx + 1}`, {
      x: colX + 0.25,
      y: titleY,
      w: colW - 0.5,
      h: 0.45,
      fontSize: 15,
      fontFace: theme.fontTitle,
      color: theme.colors.textPrimary,
      bold: true
    });

    // Column Points
    const points = col.points || col.items || [];
    if (points.length > 0) {
      const runs = points.map(p => ({
        text: `•  ${typeof p === 'string' ? p : p.text}\n`,
        options: {
          fontSize: 12,
          fontFace: theme.fontBody,
          color: theme.colors.textSecondary,
          breakLine: true
        }
      }));

      slide.addText(runs, {
        x: colX + 0.25,
        y: titleY + 0.5,
        w: colW - 0.5,
        h: colH - (titleY - contentStartY) - 0.6,
        valign: 'top',
        lineSpacing: 18
      });
    }
  });
}

// 7. 4-Cards Grid Layout (2x2)
function renderCards4(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const gapX = 0.3;
  const gapY = 0.25;
  const cardW = (theme.width - marginX * 2 - gapX) / 2;
  const cardH = (theme.height - contentStartY - 0.8 - gapY) / 2;

  const cards = data.cards || data.items || [];

  cards.slice(0, 4).forEach((card, idx) => {
    const row = Math.floor(idx / 2);
    const col = idx % 2;
    const cardX = marginX + col * (cardW + gapX);
    const cardY = contentStartY + 0.1 + row * (cardH + gapY);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: theme.colors.surface },
      line: { color: theme.colors.border, width: 1 },
      rectRadius: theme.cardRadius
    });

    // Card Title
    slide.addText(card.title || `항목 ${idx + 1}`, {
      x: cardX + 0.3,
      y: cardY + 0.2,
      w: cardW - 0.6,
      h: 0.35,
      fontSize: 14,
      fontFace: theme.fontTitle,
      color: theme.colors.textPrimary,
      bold: true
    });

    // Card Description
    slide.addText(card.description || card.text || '', {
      x: cardX + 0.3,
      y: cardY + 0.6,
      w: cardW - 0.6,
      h: cardH - 0.8,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.textSecondary,
      valign: 'top'
    });
  });
}

// 8. Timeline / Process / Steps Layout
function renderTimeline(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const steps = data.steps || data.milestones || data.items || [];
  const count = steps.length || 4;

  const stepW = (theme.width - marginX * 2 - 0.2 * (count - 1)) / count;
  const stepH = theme.height - contentStartY - 1.0;
  const gap = (theme.width - marginX * 2 - stepW * count) / (count - 1 || 1);

  // Connecting line behind steps
  const lineY = contentStartY + 0.65;
  slide.addShape(pptx.ShapeType.line, {
    x: marginX + 0.3,
    y: lineY,
    w: theme.width - marginX * 2 - 0.6,
    h: 0,
    line: { color: theme.colors.borderActive || theme.colors.primary, width: 2 }
  });

  steps.forEach((step, idx) => {
    const stepX = marginX + idx * (stepW + gap);

    // Step Node Indicator (Circle or Pill)
    slide.addShape(pptx.ShapeType.ellipse, {
      x: stepX + stepW / 2 - 0.2,
      y: lineY - 0.2,
      w: 0.4,
      h: 0.4,
      fill: { color: theme.colors.surface },
      line: { color: theme.colors.primary, width: 2 }
    });

    slide.addText(String(idx + 1), {
      x: stepX + stepW / 2 - 0.2,
      y: lineY - 0.2,
      w: 0.4,
      h: 0.4,
      fontSize: 12,
      fontFace: theme.fontTitle,
      color: theme.colors.primary,
      bold: true,
      align: 'center',
      valign: 'middle'
    });

    // Step Card
    slide.addShape(pptx.ShapeType.roundRect, {
      x: stepX,
      y: lineY + 0.4,
      w: stepW,
      h: stepH - 0.6,
      fill: { color: theme.colors.surface },
      line: { color: theme.colors.border, width: 1 },
      rectRadius: theme.cardRadius
    });

    // Step Tag / Date
    if (step.date || step.tag) {
      slide.addText(step.date || step.tag, {
        x: stepX + 0.2,
        y: lineY + 0.55,
        w: stepW - 0.4,
        h: 0.25,
        fontSize: 12,
        fontFace: theme.fontBody,
        color: theme.colors.accent,
        bold: true
      });
    }

    // Step Title
    slide.addText(step.title || `단계 ${idx + 1}`, {
      x: stepX + 0.2,
      y: lineY + (step.date || step.tag ? 0.8 : 0.6),
      w: stepW - 0.4,
      h: 0.45,
      fontSize: 13,
      fontFace: theme.fontTitle,
      color: theme.colors.textPrimary,
      bold: true
    });

    // Step Description / Tasks
    const desc = step.description || (step.tasks ? step.tasks.join('\n') : '');
    slide.addText(desc, {
      x: stepX + 0.2,
      y: lineY + 1.3,
      w: stepW - 0.4,
      h: stepH - 1.6,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.textSecondary,
      valign: 'top',
      lineSpacing: 16
    });
  });
}

// 9. Metrics / KPI Stats Layout
function renderMetrics(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const metrics = data.metrics || data.kpis || data.items || [];
  const count = metrics.length || 3;

  const cardW = (theme.width - marginX * 2 - 0.3 * (count - 1)) / count;
  const cardH = theme.height - contentStartY - 0.9;
  const gap = (theme.width - marginX * 2 - cardW * count) / (count - 1 || 1);

  metrics.forEach((m, idx) => {
    const cardX = marginX + idx * (cardW + gap);

    // Card container
    slide.addShape(pptx.ShapeType.roundRect, {
      x: cardX,
      y: contentStartY + 0.15,
      w: cardW,
      h: cardH,
      fill: { color: theme.colors.surface },
      line: { color: theme.colors.border, width: 1 },
      rectRadius: theme.cardRadius
    });

    // Metric Label
    slide.addText(m.label || `지표 ${idx + 1}`, {
      x: cardX + 0.3,
      y: contentStartY + 0.4,
      w: cardW - 0.6,
      h: 0.38,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.textMuted,
      bold: true
    });

    // Big Value
    slide.addText(String(m.value || '0'), {
      x: cardX + 0.3,
      y: contentStartY + 0.75,
      w: cardW - 0.6,
      h: 1.1,
      fontSize: 38,
      fontFace: theme.fontTitle,
      color: theme.colors.primary,
      bold: true,
      valign: 'middle'
    });

    // Unit / Change Badge
    if (m.change || m.unit) {
      const badgeText = m.change ? `${m.change}` : m.unit;
      slide.addShape(pptx.ShapeType.roundRect, {
        x: cardX + 0.3,
        y: contentStartY + 1.9,
        w: Math.max(1.0, badgeText.length * 0.12 + 0.3),
        h: 0.38,
        fill: { color: theme.colors.badgeBg || theme.colors.surfaceSubtle },
        line: { color: theme.colors.border, width: 0.8 },
        rectRadius: theme.badgeRadius
      });
      slide.addText(badgeText, {
        x: cardX + 0.3,
        y: contentStartY + 1.9,
        w: Math.max(1.0, badgeText.length * 0.12 + 0.3),
        h: 0.38,
        fontSize: 12,
        fontFace: theme.fontBody,
        color: theme.colors.badgeText || theme.colors.accent,
        bold: true,
        align: 'center',
        valign: 'middle'
      });
    }

    // Description / Notes
    if (m.description) {
      slide.addText(m.description, {
        x: cardX + 0.3,
        y: contentStartY + 2.35,
        w: cardW - 0.6,
        h: cardH - 2.5,
        fontSize: 12,
        fontFace: theme.fontBody,
        color: theme.colors.textSecondary,
        valign: 'top'
      });
    }
  });
}

// 10. Native Table Layout
function renderTable(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const tableW = theme.width - marginX * 2;
  const tableY = contentStartY + 0.2;

  const headers = data.headers || [];
  const rows = data.rows || [];

  const tableData = [];

  // Add Header Row
  if (headers.length > 0) {
    tableData.push(
      headers.map(h => ({
        text: String(h),
        options: {
          fill: { color: theme.colors.surfaceSubtle || 'F1F5F9' },
          color: theme.colors.textPrimary,
          fontFace: theme.fontTitle,
          fontSize: 12,
          bold: true,
          align: 'center',
          valign: 'middle'
        }
      }))
    );
  }

  // Add Body Rows
  rows.forEach((row, rowIdx) => {
    tableData.push(
      row.map((cell, colIdx) => ({
        text: String(cell),
        options: {
          fill: { color: rowIdx % 2 === 0 ? theme.colors.surface : (theme.colors.surfaceSubtle || 'FAFAFA') },
          color: theme.colors.textSecondary,
          fontFace: theme.fontBody,
          fontSize: 12,
          align: colIdx === 0 ? 'left' : 'center',
          valign: 'middle'
        }
      }))
    );
  });

  if (tableData.length > 0) {
    slide.addTable(tableData, {
      x: marginX,
      y: tableY,
      w: tableW,
      border: { pt: 0.8, color: theme.colors.border },
      rowH: 0.4
    });
  }
}

// 11. Closing Slide
function renderClosing(slide, pptx, data, theme) {
  const marginX = 1.0;

  // Center card
  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX,
    y: 1.2,
    w: theme.width - marginX * 2,
    h: theme.height - 2.4,
    fill: { color: theme.colors.surface },
    line: { color: theme.colors.border, width: 1 },
    rectRadius: theme.cardRadius
  });

  // Thank you title
  slide.addText(data.title || '감사합니다', {
    x: marginX + 0.8,
    y: 1.8,
    w: theme.width - marginX * 2 - 1.6,
    h: 1.2,
    fontSize: 32,
    fontFace: theme.fontTitle,
    color: theme.colors.primary,
    bold: true,
    align: 'center',
    valign: 'middle'
  });

  // Subtitle / Q&A text
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: marginX + 0.8,
      y: 3.1,
      w: theme.width - marginX * 2 - 1.6,
      h: 0.5,
      fontSize: 15,
      fontFace: theme.fontBody,
      color: theme.colors.textSecondary,
      align: 'center'
    });
  }

  // Contact info / links
  if (data.contact || data.email) {
    let contactText = data.contact || data.email;
    if (typeof contactText === 'object') {
      contactText = Object.values(contactText).filter(Boolean).join(' | ');
    }
    slide.addText(String(contactText), {
      x: marginX + 0.8,
      y: 3.7,
      w: theme.width - marginX * 2 - 1.6,
      h: 0.5,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.textMuted,
      align: 'center'
    });
  }
}


// ==========================================
// Lesson Plan Specific Layouts (4:3 Support)
// ==========================================

// 12. Lesson Plan Title Slide (with Today's Plan schedule cards)
function renderLessonTitle(slide, pptx, data, theme) {
  const marginX = 0.8;
  const leftW = 4.8;
  const rightX = 5.8;
  const rightW = theme.width - rightX - marginX;

  // Grade, Subject & Date line
  const metaLine = [data.grade || data.category || '심화 교육', data.subject || data.topic, data.date || '2026. 10'].filter(Boolean).join('  |  ');
  slide.addText(metaLine.toUpperCase(), {
    x: marginX,
    y: 0.8,
    w: leftW,
    h: 0.35,
    fontSize: 12,
    fontFace: theme.fontBody,
    color: theme.colors.accent,
    bold: true
  });

  // Large Lesson Title in Fredoka
  slide.addText(data.title || '수업 제목', {
    x: marginX,
    y: 1.25,
    w: leftW,
    h: 1.8,
    fontSize: 32,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true,
    valign: 'middle'
  });

  // Subtitle / Narrative
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: marginX,
      y: 3.15,
      w: leftW,
      h: 0.9,
      fontSize: 13.5,
      fontFace: theme.fontBody,
      color: theme.colors.textSecondary,
      valign: 'top',
      lineSpacing: 18
    });
  }

  // Left Bottom Subject Takeaway Card
  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX,
    y: 4.25,
    w: leftW,
    h: 2.2,
    fill: { color: theme.colors.surface || 'F1F5FB' },
    line: { color: theme.colors.border || 'D6DEEA', width: 1 },
    rectRadius: 0.15
  });

  slide.addText('🎯  교육 핵심 목표 (Core Goal)', {
    x: marginX + 0.25,
    y: 4.45,
    w: leftW - 0.5,
    h: 0.35,
    fontSize: 12,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true
  });

  const goalText = data.goal || data.description || '이론을 넘어 실전 스프린트 데이터를 분석하고, 조직 내 애자일 실패 요인을 사전에 방지하는 실천 역량을 확보합니다.';
  slide.addText(goalText, {
    x: marginX + 0.25,
    y: 4.9,
    w: leftW - 0.5,
    h: 1.4,
    fontSize: 12,
    fontFace: theme.fontBody,
    color: theme.colors.textSecondary,
    lineSpacing: 18
  });

  // Right Panel: Today's Plan (Visual Schedule with 4 Cards)
  slide.addShape(pptx.ShapeType.roundRect, {
    x: rightX,
    y: 0.8,
    w: rightW,
    h: 5.65,
    fill: { color: theme.colors.surface || 'F1F5FB' },
    line: { color: theme.colors.textPrimary || '1E2B4A', width: 2 },
    rectRadius: 0.2
  });

  slide.addText("Today's Plan (오늘의 교육 일정 - 120분)", {
    x: rightX + 0.3,
    y: 1.05,
    w: rightW - 0.6,
    h: 0.45,
    fontSize: 14,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true,
    align: 'center'
  });

  const planItems = data.schedule || [
    { phase: 'Warm-up', time: '15 min', color: 'FFB020', title: '인식 점검 & 워밍업', desc: '애자일 vs 전통적 관리 방식 비교' },
    { phase: 'Learn', time: '50 min', color: '2E6BD9', title: '심화 스크럼 프랙티스', desc: '백로그 가치 산정, 용량 계획, 5대 안티패턴' },
    { phase: 'Practice', time: '40 min', color: '16A06F', title: '실전 데이터 분석 & 회고', desc: '스프린트 지표 진단 및 KPT 회고 실습' },
    { phase: 'Exit ticket', time: '15 min', color: 'E4483F', title: '조직 적용 점검 & Q&A', desc: '자가 진단 및 질의응답' }
  ];

  const cardH = 0.95;
  const cardGap = 0.16;
  const startY = 1.65;

  planItems.forEach((item, idx) => {
    const cardY = startY + idx * (cardH + cardGap);

    // Card background
    slide.addShape(pptx.ShapeType.roundRect, {
      x: rightX + 0.25,
      y: cardY,
      w: rightW - 0.5,
      h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: theme.colors.border || 'D6DEEA', width: 1 },
      rectRadius: 0.1
    });

    // Phase colored tab
    slide.addShape(pptx.ShapeType.roundRect, {
      x: rightX + 0.35,
      y: cardY + 0.15,
      w: 0.85,
      h: 0.32,
      fill: { color: item.color },
      line: { color: item.color, width: 0 },
      rectRadius: 0.08
    });

    slide.addText(item.time, {
      x: rightX + 0.35,
      y: cardY + 0.15,
      w: 0.85,
      h: 0.32,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: item.phase === 'Warm-up' ? '1E2B4A' : 'FFFFFF',
      bold: true,
      align: 'center',
      valign: 'middle'
    });

    // Card Title & Desc
    slide.addText(item.title, {
      x: rightX + 1.3,
      y: cardY + 0.12,
      w: rightW - 1.6,
      h: 0.35,
      fontSize: 12,
      fontFace: theme.fontTitle,
      color: theme.colors.textPrimary,
      bold: true
    });

    slide.addText(item.desc, {
      x: rightX + 1.3,
      y: cardY + 0.48,
      w: rightW - 1.6,
      h: 0.4,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.textSecondary
    });
  });
}

// 13. Lesson Warm-up ("Which one doesn't belong?" + Turn-and-Talk)
function renderLessonWarmup(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const totalW = theme.width - marginX * 2;

  // 4 Lettered cards (A, B, C, D) in 2x2 grid
  const gridW = (totalW - 0.3) / 2;
  const gridH = 1.35;
  const gridStartY = contentStartY + 0.1;

  const cards = data.cards || [
    { letter: 'A', title: '고정된 납기와 전체 범위 확정', desc: '초기 계획대로 철저히 통제하는 산출물 중심 관리' },
    { letter: 'B', title: '짧은 반복 주기와 빠른 피드백', desc: '1~2주 스프린트마다 작동하는 소프트웨어 시연' },
    { letter: 'C', title: '자율적 팀과 상호 협력', desc: '관리자의 일방적 지시가 아닌 개발팀의 자발적 작업 할당' },
    { letter: 'D', title: '변화에 대한 유연한 대응', desc: '계획 준수보다 고객 가치와 시장 변화 수용' }
  ];

  cards.forEach((c, idx) => {
    const row = Math.floor(idx / 2);
    const col = idx % 2;
    const cardX = marginX + col * (gridW + 0.3);
    const cardY = gridStartY + row * (gridH + 0.2);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: cardX,
      y: cardY,
      w: gridW,
      h: gridH,
      fill: { color: c.highlight ? (theme.colors.phaseWarmupSoft || 'FFF1D2') : (theme.colors.surface || 'F1F5FB') },
      line: { color: c.highlight ? (theme.colors.phaseWarmup || 'FFB020') : (theme.colors.border || 'D6DEEA'), width: c.highlight ? 1.5 : 1 },
      rectRadius: 0.12
    });

    // Letter badge
    slide.addShape(pptx.ShapeType.ellipse, {
      x: cardX + 0.2,
      y: cardY + 0.2,
      w: 0.45,
      h: 0.45,
      fill: { color: theme.colors.textPrimary || '1E2B4A' },
      line: { color: theme.colors.textPrimary || '1E2B4A', width: 0 }
    });

    slide.addText(c.letter, {
      x: cardX + 0.2,
      y: cardY + 0.2,
      w: 0.45,
      h: 0.45,
      fontSize: 12,
      fontFace: theme.fontTitle,
      color: 'FFFFFF',
      bold: true,
      align: 'center',
      valign: 'middle'
    });

    // Title
    slide.addText(c.title, {
      x: cardX + 0.75,
      y: cardY + 0.2,
      w: gridW - 0.95,
      h: 0.4,
      fontSize: 12.5,
      fontFace: theme.fontTitle,
      color: theme.colors.textPrimary,
      bold: true
    });

    // Description
    slide.addText(c.desc, {
      x: cardX + 0.75,
      y: cardY + 0.65,
      w: gridW - 0.95,
      h: 0.6,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.textSecondary
    });
  });

  // Bottom Turn-and-Talk Marigold Soft Panel
  const turnY = gridStartY + gridH * 2 + 0.35;
  const turnH = theme.height - turnY - 0.7;

  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX,
    y: turnY,
    w: totalW,
    h: turnH,
    fill: { color: theme.colors.phaseWarmupSoft || 'FFF1D2' },
    line: { color: theme.colors.phaseWarmup || 'FFB020', width: 1.5 },
    rectRadius: 0.15
  });

  slide.addText('💬  Turn-and-Talk (짝 토론 / 3분 프롬프트)', {
    x: marginX + 0.3,
    y: turnY + 0.15,
    w: totalW - 0.6,
    h: 0.38,
    fontSize: 12,
    fontFace: theme.fontTitle,
    color: '1E2B4A',
    bold: true
  });

  const promptText = data.prompt || '“A~D 중 우리 조직에서 애자일 스크럼과 가장 어울리지 않는(제외되어야 할) 항목은 무엇이며, 왜 그렇게 생각하는지 옆 동료와 이야기해 보세요.”';
  slide.addText(promptText, {
    x: marginX + 0.3,
    y: turnY + 0.45,
    w: totalW - 0.6,
    h: turnH - 0.55,
    fontSize: 12,
    fontFace: theme.fontBody,
    color: '1E2B4A',
    valign: 'middle',
    lineSpacing: 18
  });
}

// 14. Lesson Learning Target ("I can..." + 3 Success Criteria)
function renderLessonTarget(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const totalW = theme.width - marginX * 2;

  // "I can..." Statement Box with Handwriting Lines
  const targetY = contentStartY + 0.1;
  const targetH = 1.35;

  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX,
    y: targetY,
    w: totalW,
    h: targetH,
    fill: { color: 'FFFFFF' },
    line: { color: theme.colors.border || 'D6DEEA', width: 1 },
    rectRadius: 0.15
  });

  // Solid top line and dashed midline
  slide.addShape(pptx.ShapeType.line, {
    x: marginX + 0.4,
    y: targetY + 0.45,
    w: totalW - 0.8,
    h: 0,
    line: { color: '9DB4DE', width: 0.8 }
  });

  slide.addShape(pptx.ShapeType.line, {
    x: marginX + 0.4,
    y: targetY + 0.9,
    w: totalW - 0.8,
    h: 0,
    line: { color: 'E4483F', width: 1.2 }
  });

  slide.addText('🌟  학습 목표 (Learning Target):', {
    x: marginX + 0.4,
    y: targetY + 0.12,
    w: totalW - 0.8,
    h: 0.28,
    fontSize: 12,
    fontFace: theme.fontTitle,
    color: theme.colors.accent || '2E6BD9',
    bold: true
  });

  const statement = data.statement || '“나는 실전 스프린트 데이터를 분석하여 팀의 가용 역량을 산정하고, 실패 요인을 예방하는 스크럼 프랙티스를 적용할 수 있다.”';
  slide.addText(statement, {
    x: marginX + 0.4,
    y: targetY + 0.48,
    w: totalW - 0.8,
    h: 0.75,
    fontSize: 14,
    fontFace: theme.fontBody,
    color: theme.colors.textPrimary,
    bold: true,
    valign: 'middle'
  });

  // 3 Success Criteria on Soft Blue Panels
  const critY = targetY + targetH + 0.35;
  const critH = theme.height - critY - 0.7;
  const colW = (totalW - 0.4) / 3;

  const criteria = data.criteria || [
    { title: '기준 1. 용량 및 백로그 정제', desc: '가용 시간 대비 스프린트 투입률 100% 초과 방지 원칙과 완료 정의(DoD)를 수립할 수 있다.' },
    { title: '기준 2. 데이터 기반 진단', desc: '번다운 차트와 스프린트 분석표(완료율, 추정 정확도)를 해석하여 장애를 조기 감지할 수 있다.' },
    { title: '기준 3. 회고 액션 플랜', desc: '단순 친목이 아닌 제품 리뷰와 분리된 프로세스 개선 KPT(Keep-Problem-Try)를 도출할 수 있다.' }
  ];

  criteria.forEach((c, idx) => {
    const colX = marginX + idx * (colW + 0.2);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: colX,
      y: critY,
      w: colW,
      h: critH,
      fill: { color: theme.colors.phaseLearnSoft || 'E4EDFC' },
      line: { color: theme.colors.phaseLearn || '2E6BD9', width: 1.2 },
      rectRadius: 0.15
    });

    // Checkbox Icon
    slide.addShape(pptx.ShapeType.roundRect, {
      x: colX + 0.2,
      y: critY + 0.25,
      w: 0.35,
      h: 0.35,
      fill: { color: 'FFFFFF' },
      line: { color: theme.colors.phaseLearn || '2E6BD9', width: 1.5 },
      rectRadius: 0.06
    });

    slide.addText(c.title, {
      x: colX + 0.65,
      y: critY + 0.22,
      w: colW - 0.85,
      h: 0.4,
      fontSize: 12,
      fontFace: theme.fontTitle,
      color: theme.colors.textPrimary,
      bold: true
    });

    slide.addText(c.desc, {
      x: colX + 0.2,
      y: critY + 0.75,
      w: colW - 0.4,
      h: critH - 0.95,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.textSecondary,
      lineSpacing: 18
    });
  });
}

// 15. Lesson Exit Ticket Slide
function renderLessonExitTicket(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const totalW = theme.width - marginX * 2;

  // Ticket Container (with dashed tear-off border on right)
  const ticketY = contentStartY + 0.1;
  const ticketH = theme.height - ticketY - 0.75;
  const mainTicketW = totalW - 2.2;
  const stubX = marginX + mainTicketW;

  // Main Ticket Body
  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX,
    y: ticketY,
    w: mainTicketW,
    h: ticketH,
    fill: { color: 'FFFFFF' },
    line: { color: theme.colors.textPrimary || '1E2B4A', width: 2 },
    rectRadius: 0.15
  });

  // Ticket Header
  slide.addText('🎟️  EXIT TICKET : 오늘 배운 핵심 확인하기', {
    x: marginX + 0.3,
    y: ticketY + 0.2,
    w: mainTicketW - 0.6,
    h: 0.35,
    fontSize: 13,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true
  });

  // Question 1
  slide.addText('Q1. 스프린트 계획 시 가용 시간 대비 작업 투입률이 100%를 초과할 때 취해야 할 조치는?', {
    x: marginX + 0.3,
    y: ticketY + 0.65,
    w: mainTicketW - 0.6,
    h: 0.4,
    fontSize: 12,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true
  });

  slide.addShape(pptx.ShapeType.line, {
    x: marginX + 0.3,
    y: ticketY + 1.25,
    w: mainTicketW - 0.6,
    h: 0,
    line: { color: 'D6DEEA', width: 1, dashType: 'dash' }
  });

  slide.addText('답안: 우선순위가 낮은 백로그 아이템을 Product Backlog로 환원하고, 팀 용량 내에서만 확정한다.', {
    x: marginX + 0.3,
    y: ticketY + 1.05,
    w: mainTicketW - 0.6,
    h: 0.38,
    fontSize: 12,
    fontFace: theme.fontBody,
    color: theme.colors.accent || '2E6BD9'
  });

  // Question 2
  slide.addText('Q2. 스프린트 리뷰(Review)와 스프린트 회고(Retrospective)의 가장 결정적인 차이점은?', {
    x: marginX + 0.3,
    y: ticketY + 1.5,
    w: mainTicketW - 0.6,
    h: 0.4,
    fontSize: 12,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true
  });

  slide.addShape(pptx.ShapeType.line, {
    x: marginX + 0.3,
    y: ticketY + 2.1,
    w: mainTicketW - 0.6,
    h: 0,
    line: { color: 'D6DEEA', width: 1, dashType: 'dash' }
  });

  slide.addText('답안: 리뷰는 이해관계자 피드백을 받는 [제품 자체] 검증이며, 회고는 팀의 [협업 프로세스] 개선이다.', {
    x: marginX + 0.3,
    y: ticketY + 1.9,
    w: mainTicketW - 0.6,
    h: 0.38,
    fontSize: 12,
    fontFace: theme.fontBody,
    color: theme.colors.accent || '2E6BD9'
  });

  // 4-to-1 Self-Check Scale in Phase Colors
  slide.addText('📊  오늘 교육 내용의 이해도 자가진단 (4-to-1 Scale):', {
    x: marginX + 0.3,
    y: ticketY + 2.35,
    w: mainTicketW - 0.6,
    h: 0.38,
    fontSize: 12,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true
  });

  const scales = [
    { score: '4', label: '완벽 이해', desc: '팀에 직접 전파 가능', color: '16A06F' },
    { score: '3', label: '충분 이해', desc: '실전 적용 가능', color: '2E6BD9' },
    { score: '2', label: '기본 이해', desc: '추가 가이드 필요', color: 'FFB020' },
    { score: '1', label: '도움 필요', desc: '멘토링 요청', color: 'E4483F' }
  ];

  const scaleW = (mainTicketW - 0.6 - 0.3) / 4;
  scales.forEach((s, idx) => {
    const sX = marginX + 0.3 + idx * (scaleW + 0.1);
    slide.addShape(pptx.ShapeType.roundRect, {
      x: sX,
      y: ticketY + 2.7,
      w: scaleW,
      h: 0.75,
      fill: { color: 'F1F5FB' },
      line: { color: s.color, width: 1.5 },
      rectRadius: 0.08
    });

    slide.addText(`Level ${s.score}: ${s.label}`, {
      x: sX,
      y: ticketY + 2.75,
      w: scaleW,
      h: 0.38,
      fontSize: 12,
      fontFace: theme.fontTitle,
      color: theme.colors.textPrimary,
      bold: true,
      align: 'center'
    });

    slide.addText(s.desc, {
      x: sX,
      y: ticketY + 3.05,
      w: scaleW,
      h: 0.35,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.textMuted,
      align: 'center'
    });
  });

  // Tear-off Stub on Right Side
  slide.addShape(pptx.ShapeType.roundRect, {
    x: stubX + 0.15,
    y: ticketY,
    w: 2.05,
    h: ticketH,
    fill: { color: theme.colors.surface || 'F1F5FB' },
    line: { color: theme.colors.textPrimary || '1E2B4A', width: 2, dashType: 'dash' },
    rectRadius: 0.15
  });

  slide.addText('TEAR OFF STUB\n(제출용 이름표)', {
    x: stubX + 0.25,
    y: ticketY + 0.3,
    w: 1.85,
    h: 0.6,
    fontSize: 12,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true,
    align: 'center'
  });

  slide.addText('성명: ______________\n소속: ______________\n역할: PO / SM / Dev\n일자: 2026. 10', {
    x: stubX + 0.25,
    y: ticketY + 1.2,
    w: 1.85,
    h: 1.5,
    fontSize: 12,
    fontFace: theme.fontBody,
    color: theme.colors.textSecondary,
    lineSpacing: 22
  });

  slide.addText('“실천하는 애자일이\n진정한 가치를 만듭니다”', {
    x: stubX + 0.25,
    y: ticketY + 2.8,
    w: 1.85,
    h: 0.6,
    fontSize: 12,
    fontFace: theme.fontTitle,
    color: theme.colors.accent || '2E6BD9',
    align: 'center'
  });
}


// 16. Content with Image Layout
function renderContentImage(slide, pptx, data, theme) {
  const contentStartY = renderHeader(slide, pptx, data, theme);
  const marginX = 0.8;
  const gap = 0.3;
  const colW = (theme.width - marginX * 2 - gap) / 2;
  const colH = theme.height - contentStartY - 0.75;

  // Left column: Text card
  slide.addShape(pptx.ShapeType.roundRect, {
    x: marginX,
    y: contentStartY + 0.1,
    w: colW,
    h: colH,
    fill: { color: theme.colors.surface || 'F1F5FB' },
    line: { color: theme.colors.border || 'D6DEEA', width: 1 },
    rectRadius: theme.cardRadius || 0.15
  });

  if (data.tag) {
    slide.addText(data.tag.toUpperCase(), {
      x: marginX + 0.3,
      y: contentStartY + 0.25,
      w: colW - 0.6,
      h: 0.25,
      fontSize: 12,
      fontFace: theme.fontBody,
      color: theme.colors.accent || '2E6BD9',
      bold: true
    });
  }

  slide.addText(data.cardTitle || data.title, {
    x: marginX + 0.3,
    y: contentStartY + (data.tag ? 0.55 : 0.3),
    w: colW - 0.6,
    h: 0.45,
    fontSize: 15,
    fontFace: theme.fontTitle,
    color: theme.colors.textPrimary,
    bold: true
  });

  const points = data.points || data.items || [];
  if (points.length > 0) {
    const runs = points.map(p => ({
      text: `•  ${typeof p === 'string' ? p : p.text}\n`,
      options: {
        fontSize: 12,
        fontFace: theme.fontBody,
        color: theme.colors.textSecondary,
        breakLine: true
      }
    }));

    slide.addText(runs, {
      x: marginX + 0.3,
      y: contentStartY + (data.tag ? 1.05 : 0.8),
      w: colW - 0.6,
      h: colH - 1.1,
      valign: 'top',
      lineSpacing: 18
    });
  }

  // Right column: Image container
  const imgX = marginX + colW + gap;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: imgX,
    y: contentStartY + 0.1,
    w: colW,
    h: colH,
    fill: { color: 'FFFFFF' },
    line: { color: theme.colors.border || 'D6DEEA', width: 1 },
    rectRadius: theme.cardRadius || 0.15
  });

  if (data.image) {
    slide.addImage({
      path: data.image,
      x: imgX + 0.2,
      y: contentStartY + 0.3,
      w: colW - 0.4,
      h: colH - 0.9,
      sizing: { type: 'contain', w: colW - 0.4, h: colH - 0.9 }
    });
  }

  if (data.caption) {
    slide.addText(data.caption, {
      x: imgX + 0.2,
      y: contentStartY + colH - 0.48,
      w: colW - 0.4,
      h: 0.35,
      fontSize: 12,
      fontFace: theme.fontFallbackBody || 'Pretendard',
      color: theme.colors.textMuted,
      align: 'center'
    });
  }
}

const LAYOUT_MAP = {
  'cover': renderCover,
  'agenda': renderAgenda,
  'section': renderSection,
  'key-message': renderKeyMessage,
  'statement': renderKeyMessage,
  'columns-2': renderColumns2,
  'columns-3': renderColumns3,
  'cards-4': renderCards4,
  'timeline': renderTimeline,
  'process': renderTimeline,
  'metrics': renderMetrics,
  'kpi': renderMetrics,
  'table': renderTable,
  'closing': renderClosing,
  'lesson-title': renderLessonTitle,
  'lesson-warmup': renderLessonWarmup,
  'lesson-target': renderLessonTarget,
  'lesson-exit-ticket': renderLessonExitTicket,
  'content-image': renderContentImage,
  'figure': renderContentImage
};

function renderSlide(slide, pptx, slideData, theme, slideIndex, totalSlides) {
  // Enforce Absolute Minimum Font Size Rule (Never below 12pt)
  const MIN_FONT_SIZE = 12;
  const originalAddText = slide.addText.bind(slide);
  slide.addText = function(text, options = {}) {
    if (Array.isArray(text)) {
      text.forEach(item => {
        if (item && item.options && typeof item.options.fontSize === 'number') {
          item.options.fontSize = Math.max(MIN_FONT_SIZE, item.options.fontSize);
        }
      });
    }
    if (options && typeof options.fontSize === 'number') {
      options.fontSize = Math.max(MIN_FONT_SIZE, options.fontSize);
    }
    return originalAddText(text, options);
  };

  const originalAddTable = slide.addTable.bind(slide);
  slide.addTable = function(rows, options = {}) {
    if (Array.isArray(rows)) {
      rows.forEach(row => {
        if (Array.isArray(row)) {
          row.forEach(cell => {
            if (cell && cell.options && typeof cell.options.fontSize === 'number') {
              cell.options.fontSize = Math.max(MIN_FONT_SIZE, cell.options.fontSize);
            }
          });
        }
      });
    }
    return originalAddTable(rows, options);
  };

  // Set slide background
  slide.background = { color: theme.colors.background };

  const layoutType = (slideData.layout || 'columns-2').toLowerCase();
  const renderer = LAYOUT_MAP[layoutType] || renderColumns2;

  // Execute specific slide renderer
  renderer(slide, pptx, slideData, theme);

  // Render footer on non-cover and non-closing slides
  if (layoutType !== 'cover' && layoutType !== 'closing' && layoutType !== 'section') {
    renderFooter(slide, slideData, theme, slideIndex, totalSlides);
  }

  // Presenter notes
  if (slideData.notes) {
    slide.addNotes(slideData.notes);
  }
}

module.exports = {
  LAYOUT_MAP,
  renderSlide,
  renderHeader,
  renderFooter
};

