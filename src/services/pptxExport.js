import pptxgen from 'pptxgenjs';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  headerBg:    '0d1b2a',
  footerBg:    '1b4332',
  blueLine:    '1565c0',
  emerald:     '2d6a4f',
  lightGreen:  'd8f3dc',
  accent:      '52b788',
  accentDark:  '081c15',
  cardBg:      'f8fafc',
  cardBorder:  'e2e8f0',
  white:       'FFFFFF',
  text:        '1e293b',
  textMuted:   '64748b',
  refText:     '334155',
  frameBg:     'f1f5f9',
  frameBorder: 'cbd5e1',
  photoText:   '94a3b8',
  tagBg:       'e0f2fe',
  tagText:     '0369a1',
};

const FONT = 'Calibri';

const SZ = {
  titleSlide:   42,
  sectionTitle: 38,
  slideTitle:   32,
  headline:     15,
  body:         20,
  meta:         16,
  footer:       12,
  ref:          14,
};

// ── Template geometry (LAYOUT_WIDE = 13.33 × 7.5 in) ─────────────────────────
const HEADER_H  = 0.52;
const LINE_H    = 0.057;
const FOOTER_H  = 0.55;
const LINE1_Y   = HEADER_H;
const CONTENT_Y = HEADER_H + LINE_H;
const CONTENT_H = 7.5 - HEADER_H - LINE_H - LINE_H - FOOTER_H;
const LINE2_Y   = CONTENT_Y + CONTENT_H;
const FOOTER_Y  = LINE2_Y + LINE_H;

const STRIPE_W  = 0.22;   // left accent stripe
const PAD_L     = 0.55;   // text starts here

// ── Stamp school template on every slide ─────────────────────────────────────
function addTemplate(s, prs, schoolName, schoolEmail) {
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.white } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: HEADER_H, fill: { color: C.headerBg } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: LINE1_Y, w: '100%', h: LINE_H, fill: { color: C.accent } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: LINE2_Y, w: '100%', h: LINE_H, fill: { color: C.accent } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: FOOTER_Y, w: '100%', h: FOOTER_H, fill: { color: C.footerBg } });

  // School name & contact footer
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

// ── Decorative layer for content slides ───────────────────────────────────────
function addContentDecor(s, prs) {
  // Left vertical accent stripe
  s.addShape(prs.ShapeType.rect, {
    x: 0, y: CONTENT_Y, w: STRIPE_W, h: CONTENT_H,
    fill: { color: C.emerald }, line: { pt: 0, color: C.emerald },
  });
  // Top right subtle orb
  s.addShape(prs.ShapeType.ellipse, {
    x: 10.5, y: CONTENT_Y - 0.5, w: 3.5, h: 3.5,
    fill: { color: C.accent, transparency: 88 }, line: { pt: 0, color: C.accent },
  });
  s.addShape(prs.ShapeType.ellipse, {
    x: 12.4, y: CONTENT_Y + 0.15, w: 0.35, h: 0.35,
    fill: { color: C.emerald, transparency: 65 }, line: { pt: 0, color: C.emerald },
  });
}

// ── Visual / Photo container (Supports Real AI Image Embedding) ───────────────
function addVisualContainer(s, prs, x, y, w, h, sl) {
  const hasImage = Boolean(sl.imageBase64 || sl.imageUrl);

  if (hasImage) {
    // Card background for image
    s.addShape(prs.ShapeType.roundRect, {
      x, y, w, h,
      fill: { color: C.cardBg },
      line: { color: C.accent, pt: 1.5 },
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
      console.warn('Could not render image to slide, falling back to label:', e);
    }

    // Bottom caption / visual badge
    s.addShape(prs.ShapeType.roundRect, {
      x: x + 0.12, y: y + h - 0.45, w: w - 0.24, h: 0.35,
      fill: { color: C.emerald },
      line: { pt: 0, color: C.emerald },
      rectRadius: 0.04,
    });
    s.addText(`✨ AI Generated Visual · ${sl.suggestedVisual ? sl.suggestedVisual.slice(0, 45) : 'Classroom Diagram'}`, {
      x: x + 0.15, y: y + h - 0.45, w: w - 0.3, h: 0.35,
      fontSize: 10, color: C.white, align: 'center', valign: 'middle', fontFace: FONT, bold: true,
    });

  } else {
    // Elegant frame placeholder when image is not yet rendered
    s.addShape(prs.ShapeType.roundRect, {
      x, y, w, h,
      fill: { color: C.frameBg },
      line: { color: C.accent, pt: 2, dashType: 'dash' },
      rectRadius: 0.08,
    });

    // Corner marks
    const CS = 0.14;
    [[x, y], [x + w - CS, y], [x, y + h - CS], [x + w - CS, y + h - CS]].forEach(([cx, cy]) => {
      s.addShape(prs.ShapeType.rect, {
        x: cx, y: cy, w: CS, h: CS,
        fill: { color: C.emerald }, line: { pt: 0, color: C.emerald },
      });
    });

    s.addText('🎨', { x, y: y + h * 0.2, w, h: 0.65, fontSize: 32, align: 'center', valign: 'middle' });
    s.addText('Educational Visual / Diagram', {
      x: x + 0.1, y: y + h * 0.44, w: w - 0.2, h: 0.35,
      fontSize: 13, color: C.textMuted, align: 'center', fontFace: FONT, bold: true,
    });
    if (sl.suggestedVisual) {
      s.addText(`Concept: ${sl.suggestedVisual}`, {
        x: x + 0.15, y: y + h * 0.58, w: w - 0.3, h: h * 0.35,
        fontSize: 11, color: C.textMuted, align: 'center', valign: 'top',
        fontFace: FONT, italic: true, wrap: true,
      });
    }
  }
}

// ── Parse **bold** markdown into pptxgenjs text run objects ──────────────────
function buildBulletRuns(bullets, fontSize) {
  const PARA = { bullet: { type: 'bullet', indent: 15 }, paraSpaceAfter: 10 };
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
 *
 * @param {{
 *   title:        string,
 *   subject:      string,
 *   gradeLevel:   string,
 *   schoolName:   string,
 *   schoolEmail:  string,
 *   slides:       Array<{ layout, type, title, headline, bullets, notes, suggestedVisual, imageBase64, imageUrl }>,
 *   references:   string[],
 *   includeNotes: boolean,
 * }} params
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

  // ── 1. Title slide ──────────────────────────────────────────────────────────
  {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);

    // Decorative geometric rings
    s.addShape(prs.ShapeType.ellipse, {
      x: -1.2, y: CONTENT_Y - 0.4, w: 4.5, h: 4.5,
      fill: { color: C.accent, transparency: 80 }, line: { pt: 0, color: C.accent },
    });
    s.addShape(prs.ShapeType.ellipse, {
      x: 10.8, y: LINE2_Y - 4.0, w: 4.2, h: 4.2,
      fill: { color: C.headerBg, transparency: 88 }, line: { pt: 0, color: C.headerBg },
    });
    s.addShape(prs.ShapeType.diamond, {
      x: 0.6, y: CONTENT_Y + 0.5, w: 0.35, h: 0.35,
      fill: { color: C.emerald }, line: { pt: 0, color: C.emerald },
    });
    s.addShape(prs.ShapeType.diamond, {
      x: 12.3, y: LINE2_Y - 0.9, w: 0.35, h: 0.35,
      fill: { color: C.accent }, line: { pt: 0, color: C.accent },
    });

    // Title Card with deep navy background and emerald border
    const cardY = CONTENT_Y + 0.6;
    const cardH = CONTENT_H - 1.3;
    s.addShape(prs.ShapeType.roundRect, {
      x: 0.8, y: cardY, w: 11.73, h: cardH,
      fill: { color: C.headerBg },
      line: { color: C.accent, pt: 2.5 },
      rectRadius: 0.12,
    });

    // Subject Pill Badge
    s.addShape(prs.ShapeType.roundRect, {
      x: 1.2, y: cardY + 0.4, w: 3.2, h: 0.38,
      fill: { color: C.accent },
      line: { pt: 0, color: C.accent },
      rectRadius: 0.1,
    });
    s.addText(`${subject} · ${gradeLevel}`, {
      x: 1.2, y: cardY + 0.4, w: 3.2, h: 0.38,
      fontSize: 12, bold: true, color: C.accentDark,
      align: 'center', valign: 'middle', fontFace: FONT,
    });

    // Main Lesson Title
    s.addText(title, {
      x: 1.2, y: cardY + 0.9, w: 10.9, h: cardH * 0.48,
      fontSize: SZ.titleSlide, bold: true, color: C.white,
      align: 'left', valign: 'middle', wrap: true, fontFace: FONT,
    });

    // DepEd MATATAG Alignment Subtitle
    s.addText('DepEd K–12 / MATATAG Curriculum Lesson Presentation', {
      x: 1.2, y: cardY + cardH * 0.72, w: 10.9, h: 0.35,
      fontSize: 14, color: C.accent, italic: true, fontFace: FONT,
    });

    if (includeNotes) {
      s.addNotes(`Teacher Script: Welcome students to today's lesson on ${title} for ${subject} ${gradeLevel}. Ensure all students have their learning materials ready.`);
    }
  }

  // ── 2. Content & Visual slides ──────────────────────────────────────────────
  for (const sl of slides) {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);

    if (sl.layout === 'section') {
      // ── Section / Divider Slide ─────────────────────────────────────────
      s.addShape(prs.ShapeType.ellipse, {
        x: -1.0, y: CONTENT_Y - 0.2, w: 4.0, h: 4.0,
        fill: { color: C.headerBg, transparency: 90 }, line: { pt: 0, color: C.headerBg },
      });
      s.addShape(prs.ShapeType.ellipse, {
        x: 10.8, y: LINE2_Y - 3.6, w: 3.8, h: 3.8,
        fill: { color: C.accent, transparency: 85 }, line: { pt: 0, color: C.accent },
      });

      const cY = CONTENT_Y + 0.8;
      const cH = CONTENT_H - 1.6;
      s.addShape(prs.ShapeType.roundRect, {
        x: 1.0, y: cY, w: 11.33, h: cH,
        fill: { color: C.emerald }, line: { pt: 0, color: C.emerald },
        rectRadius: 0.1,
      });

      // Header Tag
      s.addText(sl.type === 'objectives' ? '🎯 LEARNING TARGETS' : sl.type === 'summary' ? '📌 KEY TAKEAWAYS' : '📖 LESSON SEGMENT', {
        x: 1.4, y: cY + 0.4, w: 10.5, h: 0.35,
        fontSize: 13, bold: true, color: C.lightGreen, fontFace: FONT,
      });

      // Title
      s.addText(sl.title, {
        x: 1.4, y: cY + 0.8, w: 10.5, h: 0.75,
        fontSize: SZ.sectionTitle, bold: true, color: C.white, fontFace: FONT,
      });

      // Bullets in section (e.g. objectives or summary)
      if (sl.bullets?.length) {
        s.addText(buildBulletRuns(sl.bullets, 18), {
          x: 1.4, y: cY + 1.65, w: 10.5, h: cH - 1.85,
          valign: 'top', wrap: true, lineSpacingMultiple: 1.25,
        });
      }

    } else {
      // ── Standard or Visual content slide ───────────────────────────────
      addContentDecor(s, prs);

      const TITLE_H = 0.75;
      const UL_Y    = CONTENT_Y + TITLE_H + 0.05;
      const BODY_Y  = UL_Y + 0.08;
      const BODY_H  = CONTENT_H - TITLE_H - 0.22;

      if (sl.layout === 'visual') {
        // Split: left 52% text card, right 45% visual/image container
        const LEFT_W  = 6.8;
        const RIGHT_X = PAD_L + LEFT_W + 0.3;
        const RIGHT_W = 13.33 - RIGHT_X - 0.3;

        // Slide Title
        s.addText(sl.title, {
          x: PAD_L, y: CONTENT_Y + 0.08, w: LEFT_W, h: TITLE_H,
          fontSize: SZ.slideTitle, bold: true, color: C.accentDark,
          fontFace: FONT, wrap: true,
        });
        // Accent underline
        s.addShape(prs.ShapeType.rect, {
          x: PAD_L, y: UL_Y, w: LEFT_W, h: 0.04,
          fill: { color: C.accent }, line: { pt: 0, color: C.accent },
        });

        let bY = BODY_Y;
        if (sl.headline) {
          s.addText(sl.headline, {
            x: PAD_L, y: bY, w: LEFT_W, h: 0.34,
            fontSize: SZ.headline, color: C.emerald, italic: true, fontFace: FONT, bold: true,
          });
          bY += 0.34;
        }

        // Bullets
        if (sl.bullets?.length) {
          s.addText(buildBulletRuns(sl.bullets, SZ.body), {
            x: PAD_L, y: bY, w: LEFT_W, h: BODY_H - (bY - BODY_Y),
            valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
          });
        }

        // Right side visual container (Embeds Real AI Image if available)
        addVisualContainer(s, prs, RIGHT_X, CONTENT_Y + 0.1, RIGHT_W, CONTENT_H - 0.25, sl);

      } else {
        // Full-width content slide with modern card backing
        const FULL_W = 13.33 - PAD_L - 0.35;

        // Slide Title
        s.addText(sl.title, {
          x: PAD_L, y: CONTENT_Y + 0.08, w: FULL_W, h: TITLE_H,
          fontSize: SZ.slideTitle, bold: true, color: C.accentDark,
          fontFace: FONT, wrap: true,
        });
        // Accent underline
        s.addShape(prs.ShapeType.rect, {
          x: PAD_L, y: UL_Y, w: FULL_W, h: 0.04,
          fill: { color: C.accent }, line: { pt: 0, color: C.accent },
        });

        let bY = BODY_Y;
        if (sl.headline) {
          s.addText(sl.headline, {
            x: PAD_L, y: bY, w: FULL_W, h: 0.34,
            fontSize: SZ.headline, color: C.emerald, italic: true, fontFace: FONT, bold: true,
          });
          bY += 0.34;
        }

        if (sl.bullets?.length) {
          s.addText(buildBulletRuns(sl.bullets, SZ.body), {
            x: PAD_L, y: bY, w: FULL_W, h: BODY_H - (bY - BODY_Y),
            valign: 'top', wrap: true, lineSpacingMultiple: 1.35,
          });
        }
      }
    }

    if (includeNotes && sl.notes) {
      s.addNotes(`Teacher Notes / Guide:\n${sl.notes}`);
    }
  }

  // ── 3. References slide ─────────────────────────────────────────────────────
  if (references.length) {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);
    addContentDecor(s, prs);
    const FULL_W = 13.33 - PAD_L - 0.35;
    s.addText('References & Learning Resources', {
      x: PAD_L, y: CONTENT_Y + 0.12, w: FULL_W, h: 0.65,
      fontSize: SZ.slideTitle, bold: true, color: C.accentDark, fontFace: FONT,
    });
    s.addShape(prs.ShapeType.rect, {
      x: PAD_L, y: CONTENT_Y + 0.8, w: FULL_W, h: 0.04,
      fill: { color: C.accent }, line: { pt: 0, color: C.accent },
    });
    const refRuns = references.flatMap((ref, i) => [
      { text: `${i + 1}.  ${ref}`, options: { paraSpaceAfter: 10, color: C.refText, fontFace: FONT, fontSize: SZ.ref } },
      { text: '', options: { breakLine: true } },
    ]);
    s.addText(refRuns, {
      x: PAD_L, y: CONTENT_Y + 0.95, w: FULL_W, h: CONTENT_H - 1.1,
      valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
    });
    if (includeNotes) {
      s.addNotes('References sourced from DepEd Philippines MATATAG curriculum materials, textbooks, and teacher guides.');
    }
  }

  // ── 4. Closing slide ────────────────────────────────────────────────────────
  {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);

    s.addShape(prs.ShapeType.ellipse, {
      x: -1.2, y: CONTENT_Y - 0.4, w: 4.5, h: 4.5,
      fill: { color: C.accent, transparency: 80 }, line: { pt: 0, color: C.accent },
    });
    s.addShape(prs.ShapeType.ellipse, {
      x: 10.8, y: LINE2_Y - 4.0, w: 4.2, h: 4.2,
      fill: { color: C.headerBg, transparency: 88 }, line: { pt: 0, color: C.headerBg },
    });

    const cardY = CONTENT_Y + 0.6;
    const cardH = CONTENT_H - 1.3;
    s.addShape(prs.ShapeType.roundRect, {
      x: 0.8, y: cardY, w: 11.73, h: cardH,
      fill: { color: C.headerBg },
      line: { color: C.accent, pt: 2.5 },
      rectRadius: 0.12,
    });

    s.addText('Maraming Salamat! · Thank You!', {
      x: 0.8, y: cardY + 0.4, w: 11.73, h: cardH * 0.45,
      fontSize: 44, bold: true, color: C.white,
      align: 'center', valign: 'middle', fontFace: FONT,
    });
    s.addText(title, {
      x: 0.8, y: cardY + cardH * 0.56, w: 11.73, h: cardH * 0.22,
      fontSize: SZ.meta, color: C.accent,
      align: 'center', valign: 'middle', bold: true, fontFace: FONT, wrap: true,
    });
    s.addText(`${gradeLevel}  ·  ${subject}  ·  kaTuro AI Powered Lesson`, {
      x: 0.8, y: cardY + cardH * 0.78, w: 11.73, h: cardH * 0.16,
      fontSize: 13, color: C.white,
      align: 'center', valign: 'middle', fontFace: FONT,
    });

    if (includeNotes) {
      s.addNotes('Conclude the lesson, collect student exit tickets/worksheets, and give instructions for the next meeting.');
    }
  }

  const safeName = title.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_') || 'presentation';
  await prs.writeFile({ fileName: `${safeName}.pptx` });
}
