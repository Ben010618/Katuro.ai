import pptxgen from 'pptxgenjs';

// ── Vibrant & Professional Color Palette ──────────────────────────────────────
const C = {
  headerBg:    '0f172a', // Deep slate navy
  footerBg:    '064e3b', // Deep emerald
  accent:      '10b981', // Vibrant emerald green
  accentLight: 'd1fae5', // Soft green tint
  accentDark:  '064e3b',
  blueLine:    '2563eb', // Vivid royal blue
  cardBg:      'f8fafc', // Clean off-white card container
  cardBorder:  'cbd5e1',
  white:       'FFFFFF',
  text:        '0f172a', // High-contrast dark text
  textMuted:   '475569',
  refText:     '334155',
  tagBg:       'e0f2fe',
  tagText:     '0369a1',
  warnBg:      'fef3c7',
  warnText:    '92400e',
};

const FONT = 'Calibri';

const SZ = {
  titleSlide:   40,
  sectionTitle: 34,
  slideTitle:   30,
  headline:     14,
  body:         18,
  cardBody:     16,
  meta:         15,
  footer:       12,
  ref:          13,
};

// ── Template geometry (LAYOUT_WIDE = 13.33 × 7.5 in) ─────────────────────────
const HEADER_H  = 0.52;
const LINE_H    = 0.055;
const FOOTER_H  = 0.55;
const LINE1_Y   = HEADER_H;
const CONTENT_Y = HEADER_H + LINE_H;
const CONTENT_H = 7.5 - HEADER_H - LINE_H - LINE_H - FOOTER_H;
const LINE2_Y   = CONTENT_Y + CONTENT_H;
const FOOTER_Y  = LINE2_Y + LINE_H;

const STRIPE_W  = 0.22;
const PAD_L     = 0.55;

// ── Stamp modern school template on every slide ──────────────────────────────
function addTemplate(s, prs, schoolName, schoolEmail) {
  // Pure white base
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.white } });

  // Top header banner
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: HEADER_H, fill: { color: C.headerBg } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: LINE1_Y, w: '100%', h: LINE_H, fill: { color: C.accent } });

  // Bottom footer banner
  s.addShape(prs.ShapeType.rect, { x: 0, y: LINE2_Y, w: '100%', h: LINE_H, fill: { color: C.accent } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: FOOTER_Y, w: '100%', h: FOOTER_H, fill: { color: C.footerBg } });

  // School name & contact branding in footer
  s.addShape(prs.ShapeType.ellipse, { x: 0.28, y: FOOTER_Y + (FOOTER_H - 0.3) / 2, w: 0.3, h: 0.3, fill: { color: C.accent } });
  s.addText('🏫', { x: 0.28, y: FOOTER_Y + (FOOTER_H - 0.3) / 2, w: 0.3, h: 0.3, fontSize: 11, align: 'center', valign: 'middle' });
  s.addText(schoolName || 'DepEd Philippines · kaTuro AI', {
    x: 0.65, y: FOOTER_Y, w: 5.8, h: FOOTER_H, fontSize: SZ.footer, color: C.white, valign: 'middle', fontFace: FONT, bold: true,
  });

  s.addText('✉', { x: 7.1, y: FOOTER_Y, w: 0.4, h: FOOTER_H, fontSize: 14, color: C.accent, valign: 'middle', align: 'center' });
  s.addText(schoolEmail || 'support@katuro.ai', {
    x: 7.55, y: FOOTER_Y, w: 5.5, h: FOOTER_H, fontSize: SZ.footer, color: C.white, valign: 'middle', fontFace: FONT,
  });
}

// ── Decorative background accents for slides ─────────────────────────────────
function addSlideDecor(s, prs) {
  // Left vertical accent stripe
  s.addShape(prs.ShapeType.rect, {
    x: 0, y: CONTENT_Y, w: STRIPE_W, h: CONTENT_H,
    fill: { color: C.accentDark }, line: { pt: 0, color: C.accentDark },
  });

  // Top right subtle luminous glow circles
  s.addShape(prs.ShapeType.ellipse, {
    x: 10.8, y: CONTENT_Y - 0.4, w: 3.2, h: 3.2,
    fill: { color: C.accent, transparency: 88 }, line: { pt: 0, color: C.accent },
  });
  s.addShape(prs.ShapeType.ellipse, {
    x: 12.4, y: CONTENT_Y + 0.15, w: 0.35, h: 0.35,
    fill: { color: C.accentDark, transparency: 65 }, line: { pt: 0, color: C.accentDark },
  });
}

// ── Real AI Image / Visual Container ──────────────────────────────────────────
function addVisualContainer(s, prs, x, y, w, h, sl) {
  const hasImage = Boolean(sl.imageBase64 || sl.imageUrl);

  if (hasImage) {
    // Card background for image
    s.addShape(prs.ShapeType.roundRect, {
      x, y, w, h,
      fill: { color: C.cardBg },
      line: { color: C.cardBorder, pt: 1.5 },
      rectRadius: 0.08,
    });

    // Embed real AI-generated image
    const imgY = y + 0.12;
    const imgH = h - 0.65;
    const imgX = x + 0.12;
    const imgW = w - 0.24;

    try {
      if (sl.imageBase64) {
        s.addImage({
          data: sl.imageBase64,
          x: imgX, y: imgY, w: imgW, h: imgH,
          rounding: true,
        });
      } else if (sl.imageUrl) {
        s.addImage({
          path: sl.imageUrl,
          x: imgX, y: imgY, w: imgW, h: imgH,
          rounding: true,
        });
      }
    } catch (e) {
      console.warn('Could not render image to slide:', e);
    }

    // Bottom caption badge
    s.addShape(prs.ShapeType.roundRect, {
      x: x + 0.12, y: y + h - 0.45, w: w - 0.24, h: 0.36,
      fill: { color: C.accentDark },
      line: { pt: 0, color: C.accentDark },
      rectRadius: 0.04,
    });
    s.addText(`✨ Visual Aid: ${sl.suggestedVisual ? sl.suggestedVisual.slice(0, 50) : 'Classroom Illustration'}`, {
      x: x + 0.15, y: y + h - 0.45, w: w - 0.3, h: 0.36,
      fontSize: 10, color: C.white, align: 'center', valign: 'middle', fontFace: FONT, bold: true,
    });

  } else {
    // Elegant fallback card
    s.addShape(prs.ShapeType.roundRect, {
      x, y, w, h,
      fill: { color: C.cardBg },
      line: { color: C.accent, pt: 1.5 },
      rectRadius: 0.08,
    });
    s.addText('🎨', { x, y: y + h * 0.25, w, h: 0.65, fontSize: 36, align: 'center', valign: 'middle' });
    s.addText(sl.suggestedVisual ? `Visual: ${sl.suggestedVisual}` : 'Classroom Visual Aid', {
      x: x + 0.15, y: y + h * 0.52, w: w - 0.3, h: 0.4,
      fontSize: 12, color: C.textMuted, align: 'center', fontFace: FONT, bold: true, wrap: true,
    });
  }
}

// ── Parse **bold** markdown into pptxgenjs text run objects ──────────────────
function buildBulletRuns(bullets, fontSize = SZ.body) {
  const PARA = { bullet: { type: 'bullet', indent: 15 }, paraSpaceAfter: 12 };
  const runs = [];
  bullets.forEach(bullet => {
    const parts = bullet.split(/(\*\*[^*]+\*\*)/g);
    let first = true;
    parts.forEach(part => {
      if (!part) return;
      const isBold = part.startsWith('**') && part.endsWith('**');
      runs.push({
        text: isBold ? part.slice(2, -2) : part,
        options: {
          bold:     isBold,
          color:    isBold ? C.accentDark : C.text,
          fontFace: FONT,
          fontSize,
          ...(first ? PARA : {}),
        },
      });
      first = false;
    });
    runs.push({ text: '', options: { breakLine: true } });
  });
  return runs;
}

/**
 * Build and download a .pptx using the enhanced modern school slide template.
 */
export async function exportToPptx({
  title,
  subject,
  gradeLevel,
  schoolName,
  schoolEmail,
  slides,
  references = [],
  includeNotes = true,
}) {
  const prs = new pptxgen();
  prs.layout = 'LAYOUT_WIDE';

  // ── 1. Title Slide (Modern Hero Header) ─────────────────────────────────────
  {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);

    // Decorative geometric rings
    s.addShape(prs.ShapeType.ellipse, {
      x: -1.0, y: CONTENT_Y - 0.3, w: 4.5, h: 4.5,
      fill: { color: C.accent, transparency: 80 }, line: { pt: 0, color: C.accent },
    });
    s.addShape(prs.ShapeType.ellipse, {
      x: 10.5, y: LINE2_Y - 3.8, w: 4.2, h: 4.2,
      fill: { color: C.headerBg, transparency: 88 }, line: { pt: 0, color: C.headerBg },
    });

    // Hero Title Card with dark slate background
    const cardY = CONTENT_Y + 0.5;
    const cardH = CONTENT_H - 1.1;
    s.addShape(prs.ShapeType.roundRect, {
      x: 0.8, y: cardY, w: 11.73, h: cardH,
      fill: { color: C.headerBg },
      line: { color: C.accent, pt: 2.5 },
      rectRadius: 0.12,
    });

    // Subject & Grade Pill Badge
    s.addShape(prs.ShapeType.roundRect, {
      x: 1.3, y: cardY + 0.45, w: 3.5, h: 0.42,
      fill: { color: C.accent },
      line: { pt: 0, color: C.accent },
      rectRadius: 0.1,
    });
    s.addText(`${subject || 'Science'}  ·  ${gradeLevel || 'Lesson'}`, {
      x: 1.3, y: cardY + 0.45, w: 3.5, h: 0.42,
      fontSize: 13, bold: true, color: C.headerBg,
      align: 'center', valign: 'middle', fontFace: FONT,
    });

    // Main Lesson Title
    s.addText(title, {
      x: 1.3, y: cardY + 1.0, w: 10.7, h: cardH * 0.45,
      fontSize: SZ.titleSlide, bold: true, color: C.white,
      align: 'left', valign: 'middle', wrap: true, fontFace: FONT,
    });

    // DepEd MATATAG Alignment Subtitle
    s.addText('DepEd K–12 / MATATAG Curriculum Lesson Presentation', {
      x: 1.3, y: cardY + cardH * 0.72, w: 10.7, h: 0.35,
      fontSize: 14, color: C.accent, italic: true, fontFace: FONT,
    });

    if (includeNotes) {
      s.addNotes(`Teacher Script: Welcome students! Today we will explore ${title} for ${subject} ${gradeLevel}. Please get your notebooks and pens ready.`);
    }
  }

  // ── 2. Content & Visual Slides ──────────────────────────────────────────────
  for (const sl of slides) {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);

    // ── Layout A: Objectives Slide ──────────────────────────────────────────
    if (sl.layout === 'objectives') {
      addSlideDecor(s, prs);

      // Header Tag
      s.addShape(prs.ShapeType.roundRect, {
        x: PAD_L, y: CONTENT_Y + 0.1, w: 3.2, h: 0.34,
        fill: { color: C.accentLight }, line: { pt: 0, color: C.accentLight }, rectRadius: 0.08,
      });
      s.addText('🎯 LEARNING TARGETS', {
        x: PAD_L, y: CONTENT_Y + 0.1, w: 3.2, h: 0.34,
        fontSize: 11, bold: true, color: C.accentDark, align: 'center', valign: 'middle', fontFace: FONT,
      });

      // Title
      s.addText(sl.title || 'Learning Objectives', {
        x: PAD_L, y: CONTENT_Y + 0.48, w: 12.0, h: 0.65,
        fontSize: SZ.slideTitle, bold: true, color: C.text, fontFace: FONT,
      });

      // Render 3 distinct objective cards
      const objectives = sl.bullets?.length ? sl.bullets : [
        'Understand key foundational concepts of the lesson.',
        'Analyze practical real-world examples in local contexts.',
        'Demonstrate mastery through guided assessment activities.',
      ];

      const cardCount = Math.min(objectives.length, 3);
      const cardW = (12.2 - (cardCount - 1) * 0.25) / cardCount;
      const cardH = CONTENT_H - 1.5;
      const cardY = CONTENT_Y + 1.25;

      objectives.slice(0, cardCount).forEach((obj, idx) => {
        const cardX = PAD_L + idx * (cardW + 0.25);

        // Container card
        s.addShape(prs.ShapeType.roundRect, {
          x: cardX, y: cardY, w: cardW, h: cardH,
          fill: { color: C.cardBg },
          line: { color: C.cardBorder, pt: 1.5 },
          rectRadius: 0.1,
        });

        // Step number badge
        s.addShape(prs.ShapeType.ellipse, {
          x: cardX + 0.2, y: cardY + 0.25, w: 0.45, h: 0.45,
          fill: { color: C.accentDark },
        });
        s.addText(`0${idx + 1}`, {
          x: cardX + 0.2, y: cardY + 0.25, w: 0.45, h: 0.45,
          fontSize: 12, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: FONT,
        });

        s.addText(`Target Goal ${idx + 1}`, {
          x: cardX + 0.75, y: cardY + 0.28, w: cardW - 0.9, h: 0.38,
          fontSize: 13, bold: true, color: C.accentDark, fontFace: FONT,
        });

        // Objective text
        s.addText(obj.replace(/^\*\*/, '').replace(/\*\*$/, ''), {
          x: cardX + 0.2, y: cardY + 0.85, w: cardW - 0.4, h: cardH - 1.0,
          fontSize: SZ.cardBody, color: C.text, fontFace: FONT, wrap: true, valign: 'top', lineSpacingMultiple: 1.25,
        });
      });

    // ── Layout B: Visual Split Slide (with Real AI Image) ────────────────────
    } else if (sl.layout === 'visual') {
      addSlideDecor(s, prs);

      const LEFT_W  = 6.8;
      const RIGHT_X = PAD_L + LEFT_W + 0.3;
      const RIGHT_W = 13.33 - RIGHT_X - 0.35;

      // Category Pill
      s.addShape(prs.ShapeType.roundRect, {
        x: PAD_L, y: CONTENT_Y + 0.1, w: 2.8, h: 0.32,
        fill: { color: C.accentLight }, line: { pt: 0, color: C.accentLight }, rectRadius: 0.08,
      });
      s.addText(sl.type === 'activity' ? '💡 INTERACTION' : sl.type === 'example' ? '🔍 REAL EXAMPLE' : '📖 CONCEPT STUDY', {
        x: PAD_L, y: CONTENT_Y + 0.1, w: 2.8, h: 0.32,
        fontSize: 10, bold: true, color: C.accentDark, align: 'center', valign: 'middle', fontFace: FONT,
      });

      // Slide Title
      s.addText(sl.title, {
        x: PAD_L, y: CONTENT_Y + 0.46, w: LEFT_W, h: 0.75,
        fontSize: SZ.slideTitle, bold: true, color: C.text,
        fontFace: FONT, wrap: true,
      });
      // Underline
      s.addShape(prs.ShapeType.rect, {
        x: PAD_L, y: CONTENT_Y + 1.22, w: LEFT_W, h: 0.04,
        fill: { color: C.accent }, line: { pt: 0, color: C.accent },
      });

      let bY = CONTENT_Y + 1.35;
      if (sl.headline) {
        s.addText(sl.headline, {
          x: PAD_L, y: bY, w: LEFT_W, h: 0.34,
          fontSize: SZ.headline, color: C.accentDark, italic: true, fontFace: FONT, bold: true,
        });
        bY += 0.38;
      }

      // Bullets
      if (sl.bullets?.length) {
        s.addText(buildBulletRuns(sl.bullets, SZ.body), {
          x: PAD_L, y: bY, w: LEFT_W, h: CONTENT_H - (bY - CONTENT_Y) - 0.2,
          valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
        });
      }

      // Embedded AI Visual on the right
      addVisualContainer(s, prs, RIGHT_X, CONTENT_Y + 0.2, RIGHT_W, CONTENT_H - 0.4, sl);

    // ── Layout C: Multi-Card Concept Slide ───────────────────────────────────
    } else if (sl.layout === 'content') {
      addSlideDecor(s, prs);

      // Slide Title
      s.addText(sl.title, {
        x: PAD_L, y: CONTENT_Y + 0.15, w: 12.0, h: 0.7,
        fontSize: SZ.slideTitle, bold: true, color: C.text, fontFace: FONT, wrap: true,
      });
      s.addShape(prs.ShapeType.rect, {
        x: PAD_L, y: CONTENT_Y + 0.88, w: 12.0, h: 0.04,
        fill: { color: C.accent }, line: { pt: 0, color: C.accent },
      });

      let bY = CONTENT_Y + 1.0;
      if (sl.headline) {
        s.addText(sl.headline, {
          x: PAD_L, y: bY, w: 12.0, h: 0.34,
          fontSize: SZ.headline, color: C.accentDark, italic: true, fontFace: FONT, bold: true,
        });
        bY += 0.38;
      }

      // If we have 2 to 3 bullet points, render as modern visual cards!
      const bullets = sl.bullets || [];
      if (bullets.length >= 2 && bullets.length <= 4) {
        const count = bullets.length;
        const cardW = (12.2 - (count - 1) * 0.25) / count;
        const cardH = CONTENT_H - (bY - CONTENT_Y) - 0.3;

        bullets.forEach((bText, idx) => {
          const cardX = PAD_L + idx * (cardW + 0.25);

          s.addShape(prs.ShapeType.roundRect, {
            x: cardX, y: bY, w: cardW, h: cardH,
            fill: { color: C.cardBg },
            line: { color: C.cardBorder, pt: 1.5 },
            rectRadius: 0.08,
          });

          // Header tag for card
          s.addShape(prs.ShapeType.roundRect, {
            x: cardX + 0.15, y: bY + 0.15, w: cardW - 0.3, h: 0.35,
            fill: { color: C.accentDark },
            line: { pt: 0, color: C.accentDark },
            rectRadius: 0.05,
          });
          s.addText(`Key Point 0${idx + 1}`, {
            x: cardX + 0.15, y: bY + 0.15, w: cardW - 0.3, h: 0.35,
            fontSize: 11, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: FONT,
          });

          s.addText(buildBulletRuns([bText], SZ.cardBody), {
            x: cardX + 0.2, y: bY + 0.65, w: cardW - 0.4, h: cardH - 0.8,
            valign: 'top', wrap: true, lineSpacingMultiple: 1.25,
          });
        });
      } else {
        // Standard bullet text
        s.addText(buildBulletRuns(bullets, SZ.body), {
          x: PAD_L, y: bY, w: 12.0, h: CONTENT_H - (bY - CONTENT_Y) - 0.2,
          valign: 'top', wrap: true, lineSpacingMultiple: 1.35,
        });
      }

    // ── Layout D: Interactive Activity / Assessment Challenge Slide ──────────
    } else if (sl.layout === 'activity') {
      addSlideDecor(s, prs);

      s.addShape(prs.ShapeType.roundRect, {
        x: PAD_L, y: CONTENT_Y + 0.1, w: 3.5, h: 0.34,
        fill: { color: C.warnBg }, line: { pt: 0, color: C.warnBg }, rectRadius: 0.08,
      });
      s.addText('💡 CLASSROOM CHALLENGE', {
        x: PAD_L, y: CONTENT_Y + 0.1, w: 3.5, h: 0.34,
        fontSize: 11, bold: true, color: C.warnText, align: 'center', valign: 'middle', fontFace: FONT,
      });

      s.addText(sl.title || 'Guided Practice & Discussion', {
        x: PAD_L, y: CONTENT_Y + 0.48, w: 12.0, h: 0.65,
        fontSize: SZ.slideTitle, bold: true, color: C.text, fontFace: FONT,
      });

      // Large interactive challenge card
      const boxY = CONTENT_Y + 1.25;
      const boxH = CONTENT_H - 1.5;
      s.addShape(prs.ShapeType.roundRect, {
        x: PAD_L, y: boxY, w: 12.2, h: boxH,
        fill: { color: C.cardBg },
        line: { color: C.blueLine, pt: 2 },
        rectRadius: 0.1,
      });

      // Challenge prompt
      s.addText('Task Instructions / Discussion Prompt:', {
        x: PAD_L + 0.3, y: boxY + 0.25, w: 11.5, h: 0.35,
        fontSize: 14, bold: true, color: C.blueLine, fontFace: FONT,
      });

      if (sl.bullets?.length) {
        s.addText(buildBulletRuns(sl.bullets, SZ.body), {
          x: PAD_L + 0.3, y: boxY + 0.7, w: 11.5, h: boxH - 0.9,
          valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
        });
      }

    // ── Layout E: Summary Slide ──────────────────────────────────────────────
    } else if (sl.layout === 'summary') {
      addSlideDecor(s, prs);

      s.addShape(prs.ShapeType.roundRect, {
        x: PAD_L, y: CONTENT_Y + 0.1, w: 3.2, h: 0.34,
        fill: { color: C.accentLight }, line: { pt: 0, color: C.accentLight }, rectRadius: 0.08,
      });
      s.addText('📌 LESSON SYNTHESIS', {
        x: PAD_L, y: CONTENT_Y + 0.1, w: 3.2, h: 0.34,
        fontSize: 11, bold: true, color: C.accentDark, align: 'center', valign: 'middle', fontFace: FONT,
      });

      s.addText('Key Takeaways & Summary', {
        x: PAD_L, y: CONTENT_Y + 0.48, w: 12.0, h: 0.65,
        fontSize: SZ.slideTitle, bold: true, color: C.text, fontFace: FONT,
      });

      const bullets = sl.bullets || [];
      const boxY = CONTENT_Y + 1.25;
      const boxH = CONTENT_H - 1.5;

      s.addShape(prs.ShapeType.roundRect, {
        x: PAD_L, y: boxY, w: 12.2, h: boxH,
        fill: { color: C.accentDark },
        line: { pt: 0, color: C.accentDark },
        rectRadius: 0.1,
      });

      if (bullets.length) {
        const whiteRuns = bullets.flatMap(b => [
          { text: `✓  ${b.replace(/^\*\*/, '').replace(/\*\*$/, '')}`, options: { bold: true, color: C.white, fontFace: FONT, fontSize: 18, paraSpaceAfter: 14 } },
          { text: '', options: { breakLine: true } },
        ]);
        s.addText(whiteRuns, {
          x: PAD_L + 0.4, y: boxY + 0.4, w: 11.4, h: boxH - 0.8,
          valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
        });
      }
    }

    // Attach presenter notes
    if (includeNotes && sl.notes) {
      s.addNotes(`Teacher Guide Script:\n${sl.notes}`);
    }
  }

  // ── 3. References Slide ─────────────────────────────────────────────────────
  if (references.length) {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);
    addSlideDecor(s, prs);

    const FULL_W = 13.33 - PAD_L - 0.35;
    s.addText('References & Learning Resources', {
      x: PAD_L, y: CONTENT_Y + 0.15, w: FULL_W, h: 0.65,
      fontSize: SZ.slideTitle, bold: true, color: C.text, fontFace: FONT,
    });
    s.addShape(prs.ShapeType.rect, {
      x: PAD_L, y: CONTENT_Y + 0.82, w: FULL_W, h: 0.04,
      fill: { color: C.accent }, line: { pt: 0, color: C.accent },
    });

    const refRuns = references.flatMap((ref, i) => [
      { text: `${i + 1}.  ${ref}`, options: { paraSpaceAfter: 10, color: C.refText, fontFace: FONT, fontSize: SZ.ref } },
      { text: '', options: { breakLine: true } },
    ]);
    s.addText(refRuns, {
      x: PAD_L, y: CONTENT_Y + 0.98, w: FULL_W, h: CONTENT_H - 1.1,
      valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
    });
    if (includeNotes) {
      s.addNotes('References sourced from DepEd Philippines MATATAG curriculum materials and official teacher guides.');
    }
  }

  // ── 4. Closing Slide ────────────────────────────────────────────────────────
  {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);

    s.addShape(prs.ShapeType.ellipse, {
      x: -1.0, y: CONTENT_Y - 0.3, w: 4.5, h: 4.5,
      fill: { color: C.accent, transparency: 80 }, line: { pt: 0, color: C.accent },
    });
    s.addShape(prs.ShapeType.ellipse, {
      x: 10.5, y: LINE2_Y - 3.8, w: 4.2, h: 4.2,
      fill: { color: C.headerBg, transparency: 88 }, line: { pt: 0, color: C.headerBg },
    });

    const cardY = CONTENT_Y + 0.5;
    const cardH = CONTENT_H - 1.1;
    s.addShape(prs.ShapeType.roundRect, {
      x: 0.8, y: cardY, w: 11.73, h: cardH,
      fill: { color: C.headerBg },
      line: { color: C.accent, pt: 2.5 },
      rectRadius: 0.12,
    });

    s.addText('Maraming Salamat! · Thank You!', {
      x: 0.8, y: cardY + 0.35, w: 11.73, h: cardH * 0.42,
      fontSize: 44, bold: true, color: C.white,
      align: 'center', valign: 'middle', fontFace: FONT,
    });
    s.addText(title, {
      x: 0.8, y: cardY + cardH * 0.55, w: 11.73, h: cardH * 0.22,
      fontSize: SZ.meta, color: C.accent,
      align: 'center', valign: 'middle', bold: true, fontFace: FONT, wrap: true,
    });
    s.addText(`${gradeLevel || 'Grade Level'}  ·  ${subject || 'DepEd'}  ·  kaTuro AI Powered Lesson`, {
      x: 0.8, y: cardY + cardH * 0.78, w: 11.73, h: cardH * 0.16,
      fontSize: 13, color: C.white,
      align: 'center', valign: 'middle', fontFace: FONT,
    });

    if (includeNotes) {
      s.addNotes('Collect student outputs/exit tickets and announce the homework or topic for the next meeting.');
    }
  }

  const safeName = title.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_') || 'presentation';
  await prs.writeFile({ fileName: `${safeName}.pptx` });
}
