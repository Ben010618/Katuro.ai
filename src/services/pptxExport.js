import pptxgen from 'pptxgenjs';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  headerBg:    '0d1b2a',
  footerBg:    '2d6a4f',
  blueLine:    '1565c0',
  fbBlue:      '1877f2',
  dark:        '163828',
  accent:      '52b788',
  accentMid:   '2d6a4f',
  white:       'FFFFFF',
  text:        '1a1a2a',
  refText:     '374151',
  frameBg:     'f0fdf4',
  frameBorder: '86efac',
  photoText:   '9ca3af',
};

const FONT = 'Calibri';

const SZ = {
  titleSlide:   44,
  sectionTitle: 40,
  slideTitle:   36,
  headline:     15,
  body:         24,
  meta:         18,
  footer:       13,
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

const STRIPE_W  = 0.22;   // left teal accent stripe
const PAD_L     = 0.52;   // text starts here (after stripe + gap)

// ── Stamp school template on every slide ─────────────────────────────────────
function addTemplate(s, prs, schoolName, schoolEmail) {
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.white } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: HEADER_H, fill: { color: C.headerBg } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: LINE1_Y, w: '100%', h: LINE_H, fill: { color: C.blueLine } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: LINE2_Y, w: '100%', h: LINE_H, fill: { color: C.blueLine } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: FOOTER_Y, w: '100%', h: FOOTER_H, fill: { color: C.footerBg } });
  const iconY = FOOTER_Y + (FOOTER_H - 0.33) / 2;
  s.addShape(prs.ShapeType.ellipse, { x: 0.28, y: iconY, w: 0.33, h: 0.33, fill: { color: C.fbBlue }, line: { color: C.fbBlue, pt: 0 } });
  s.addText('f', { x: 0.28, y: iconY, w: 0.33, h: 0.33, fontSize: 13, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: FONT });
  s.addText(schoolName || 'School Name', { x: 0.68, y: FOOTER_Y, w: 5.8, h: FOOTER_H, fontSize: SZ.footer, color: C.white, valign: 'middle', fontFace: FONT });
  s.addText('✉', { x: 7.1, y: FOOTER_Y, w: 0.4, h: FOOTER_H, fontSize: 15, color: C.white, valign: 'middle', align: 'center' });
  s.addText(schoolEmail || 'school@deped.gov.ph', { x: 7.55, y: FOOTER_Y, w: 5.5, h: FOOTER_H, fontSize: SZ.footer, color: C.white, valign: 'middle', fontFace: FONT });
}

// ── Decorative layer for content slides ───────────────────────────────────────
// Left teal stripe + large translucent circle top-right + small dot cluster
function addContentDecor(s, prs) {
  s.addShape(prs.ShapeType.rect, {
    x: 0, y: CONTENT_Y, w: STRIPE_W, h: CONTENT_H,
    fill: { color: C.accent }, line: { pt: 0, color: C.accent },
  });
  s.addShape(prs.ShapeType.ellipse, {
    x: 10.3, y: CONTENT_Y - 0.6, w: 3.7, h: 3.7,
    fill: { color: C.accent, transparency: 82 }, line: { pt: 0, color: C.accent },
  });
  s.addShape(prs.ShapeType.ellipse, {
    x: 12.55, y: CONTENT_Y + 0.12, w: 0.42, h: 0.42,
    fill: { color: C.accentMid, transparency: 58 }, line: { pt: 0, color: C.accentMid },
  });
  s.addShape(prs.ShapeType.ellipse, {
    x: 12.15, y: CONTENT_Y + 0.42, w: 0.22, h: 0.22,
    fill: { color: C.accent, transparency: 64 }, line: { pt: 0, color: C.accent },
  });
}

// ── Photo frame placeholder ───────────────────────────────────────────────────
function addPhotoFrame(s, prs, x, y, w, h, suggestedVisual) {
  s.addShape(prs.ShapeType.rect, {
    x, y, w, h,
    fill: { color: C.frameBg },
    line: { color: C.frameBorder, pt: 2.5, dashType: 'dash' },
  });
  // Corner mount marks
  const CS = 0.14;
  [[x, y], [x + w - CS, y], [x, y + h - CS], [x + w - CS, y + h - CS]].forEach(([cx, cy]) => {
    s.addShape(prs.ShapeType.rect, {
      x: cx, y: cy, w: CS, h: CS,
      fill: { color: C.accentMid }, line: { pt: 0, color: C.accentMid },
    });
  });
  s.addText('📸', { x, y: y + h * 0.22, w, h: 0.65, fontSize: 34, align: 'center', valign: 'middle' });
  s.addText('Insert Photo Here', {
    x: x + 0.1, y: y + h * 0.44, w: w - 0.2, h: 0.38,
    fontSize: 13, color: C.photoText, align: 'center', fontFace: FONT, italic: true,
  });
  if (suggestedVisual) {
    s.addText(`Suggested: ${suggestedVisual}`, {
      x: x + 0.15, y: y + h * 0.60, w: w - 0.3, h: h * 0.35,
      fontSize: 10, color: C.photoText, align: 'center', valign: 'top',
      fontFace: FONT, italic: true, wrap: true,
    });
  }
}

// ── Parse **bold** markdown into pptxgenjs text run objects ──────────────────
function buildBulletRuns(bullets, fontSize) {
  const PARA = { bullet: { type: 'bullet', indent: 15 }, paraSpaceAfter: 8 };
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
          color:    isBold ? C.dark : C.text,
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
 * Build and download a .pptx using the school slide template.
 *
 * @param {{
 *   title:        string,
 *   subject:      string,
 *   gradeLevel:   string,
 *   schoolName:   string,
 *   schoolEmail:  string,
 *   slides:       Array<{ layout, title, headline, bullets, notes, suggestedVisual }>,
 *   references:   string[],
 *   includeNotes: boolean,
 * }} params
 */
export async function exportToPptx({
  title, subject, gradeLevel,
  schoolName, schoolEmail,
  slides, references = [], includeNotes = true,
}) {
  const prs = new pptxgen();
  prs.layout = 'LAYOUT_WIDE';

  // ── 1. Title slide ──────────────────────────────────────────────────────────
  {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);
    // Watermark circles
    s.addShape(prs.ShapeType.ellipse, {
      x: -1.2, y: CONTENT_Y - 0.4, w: 4.5, h: 4.5,
      fill: { color: C.accent, transparency: 78 }, line: { pt: 0, color: C.accent },
    });
    s.addShape(prs.ShapeType.ellipse, {
      x: 11.0, y: LINE2_Y - 4.0, w: 4.2, h: 4.2,
      fill: { color: C.headerBg, transparency: 86 }, line: { pt: 0, color: C.headerBg },
    });
    // Diamond accents
    s.addShape(prs.ShapeType.diamond, {
      x: 0.6, y: CONTENT_Y + 0.5, w: 0.35, h: 0.35,
      fill: { color: C.accentMid }, line: { pt: 0, color: C.accentMid },
    });
    s.addShape(prs.ShapeType.diamond, {
      x: 12.3, y: LINE2_Y - 0.9, w: 0.35, h: 0.35,
      fill: { color: C.accent }, line: { pt: 0, color: C.accent },
    });
    // Title card
    const cardY = CONTENT_Y + 0.7;
    const cardH = CONTENT_H - 1.5;
    s.addShape(prs.ShapeType.rect, {
      x: 0.7, y: cardY, w: 11.93, h: cardH,
      fill: { color: C.headerBg },
      line: { color: C.blueLine, pt: 2 },
    });
    s.addText(title, {
      x: 0.7, y: cardY + 0.3, w: 11.93, h: cardH * 0.62,
      fontSize: SZ.titleSlide, bold: true, color: C.white,
      align: 'center', valign: 'middle', wrap: true, fontFace: FONT,
    });
    s.addText(`${gradeLevel}  ·  ${subject}`, {
      x: 0.7, y: cardY + cardH * 0.68, w: 11.93, h: cardH * 0.28,
      fontSize: SZ.meta, color: C.accent,
      align: 'center', valign: 'middle', bold: true, fontFace: FONT,
    });
  }

  // ── 2. Content slides ─────────────────────────────────────────────────────
  for (const sl of slides) {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);

    if (sl.layout === 'section') {
      // ── Section / divider slide ─────────────────────────────────────────
      s.addShape(prs.ShapeType.ellipse, {
        x: -1.0, y: CONTENT_Y - 0.2, w: 4.0, h: 4.0,
        fill: { color: C.headerBg, transparency: 88 }, line: { pt: 0, color: C.headerBg },
      });
      s.addShape(prs.ShapeType.ellipse, {
        x: 10.8, y: LINE2_Y - 3.6, w: 3.8, h: 3.8,
        fill: { color: C.headerBg, transparency: 88 }, line: { pt: 0, color: C.headerBg },
      });
      s.addShape(prs.ShapeType.diamond, {
        x: 0.45, y: CONTENT_Y + 0.2, w: 0.4, h: 0.4,
        fill: { color: C.accentMid }, line: { pt: 0, color: C.accentMid },
      });
      s.addShape(prs.ShapeType.diamond, {
        x: 12.35, y: LINE2_Y - 0.68, w: 0.4, h: 0.4,
        fill: { color: C.accentMid }, line: { pt: 0, color: C.accentMid },
      });
      // Title card
      const cY = CONTENT_Y + 1.0;
      const cH = CONTENT_H - 2.0;
      s.addShape(prs.ShapeType.rect, {
        x: 1.0, y: cY, w: 11.33, h: cH,
        fill: { color: C.accent }, line: { pt: 0, color: C.accent },
      });
      s.addText(sl.title, {
        x: 1.0, y: cY, w: 11.33, h: cH,
        fontSize: SZ.sectionTitle, bold: true, color: C.headerBg,
        align: 'center', valign: 'middle', wrap: true, fontFace: FONT,
      });

    } else {
      // ── Standard or Visual content slide ───────────────────────────────
      addContentDecor(s, prs);

      const TITLE_H = 0.78;
      const UL_Y    = CONTENT_Y + TITLE_H + 0.08;
      const BODY_Y  = UL_Y + 0.07;
      const BODY_H  = CONTENT_H - TITLE_H - 0.22;

      if (sl.layout === 'visual') {
        // Split: left 53% text, right 43% photo frame
        const LEFT_W  = 6.9;
        const RIGHT_X = PAD_L + LEFT_W + 0.25;
        const RIGHT_W = 13.33 - RIGHT_X - 0.15;

        s.addText(sl.title, {
          x: PAD_L, y: CONTENT_Y + 0.1, w: LEFT_W, h: TITLE_H,
          fontSize: SZ.slideTitle, bold: true, color: C.dark,
          fontFace: FONT, wrap: true,
        });
        s.addShape(prs.ShapeType.rect, {
          x: PAD_L, y: UL_Y, w: LEFT_W, h: 0.045,
          fill: { color: C.accent }, line: { pt: 0, color: C.accent },
        });

        let bY = BODY_Y;
        if (sl.headline) {
          s.addText(sl.headline, {
            x: PAD_L, y: bY, w: LEFT_W, h: 0.36,
            fontSize: SZ.headline, color: C.accentMid, italic: true, fontFace: FONT,
          });
          bY += 0.36;
        }
        if (sl.bullets?.length) {
          s.addText(buildBulletRuns(sl.bullets, SZ.body), {
            x: PAD_L, y: bY, w: LEFT_W, h: BODY_H - (bY - BODY_Y),
            valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
          });
        }
        addPhotoFrame(s, prs, RIGHT_X, CONTENT_Y + 0.1, RIGHT_W, CONTENT_H - 0.28, sl.suggestedVisual);

      } else {
        // Full-width content
        const FULL_W = 13.33 - PAD_L - 0.18;

        s.addText(sl.title, {
          x: PAD_L, y: CONTENT_Y + 0.1, w: FULL_W, h: TITLE_H,
          fontSize: SZ.slideTitle, bold: true, color: C.dark,
          fontFace: FONT, wrap: true,
        });
        s.addShape(prs.ShapeType.rect, {
          x: PAD_L, y: UL_Y, w: FULL_W, h: 0.045,
          fill: { color: C.accent }, line: { pt: 0, color: C.accent },
        });

        let bY = BODY_Y;
        if (sl.headline) {
          s.addText(sl.headline, {
            x: PAD_L, y: bY, w: FULL_W, h: 0.36,
            fontSize: SZ.headline, color: C.accentMid, italic: true, fontFace: FONT,
          });
          bY += 0.36;
        }
        if (sl.bullets?.length) {
          s.addText(buildBulletRuns(sl.bullets, SZ.body), {
            x: PAD_L, y: bY, w: FULL_W, h: BODY_H - (bY - BODY_Y),
            valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
          });
        }
      }
    }

    if (includeNotes && sl.notes) s.addNotes(sl.notes);
  }

  // ── 3. References slide ─────────────────────────────────────────────────────
  if (references.length) {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);
    addContentDecor(s, prs);
    const FULL_W = 13.33 - PAD_L - 0.18;
    s.addText('References & Sources', {
      x: PAD_L, y: CONTENT_Y + 0.14, w: FULL_W, h: 0.65,
      fontSize: SZ.slideTitle, bold: true, color: C.dark, fontFace: FONT,
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
      x: PAD_L, y: CONTENT_Y + 0.95, w: FULL_W, h: CONTENT_H - 1.1,
      valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
    });
    s.addNotes('References sourced from DepEd Philippines MATATAG curriculum materials via AI research.');
  }

  // ── 4. Closing slide ────────────────────────────────────────────────────────
  {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);
    s.addShape(prs.ShapeType.ellipse, {
      x: -1.2, y: CONTENT_Y - 0.4, w: 4.5, h: 4.5,
      fill: { color: C.accent, transparency: 78 }, line: { pt: 0, color: C.accent },
    });
    s.addShape(prs.ShapeType.ellipse, {
      x: 11.0, y: LINE2_Y - 4.0, w: 4.2, h: 4.2,
      fill: { color: C.headerBg, transparency: 86 }, line: { pt: 0, color: C.headerBg },
    });
    s.addShape(prs.ShapeType.diamond, {
      x: 0.6, y: CONTENT_Y + 0.5, w: 0.35, h: 0.35,
      fill: { color: C.accentMid }, line: { pt: 0, color: C.accentMid },
    });
    s.addShape(prs.ShapeType.diamond, {
      x: 12.3, y: LINE2_Y - 0.9, w: 0.35, h: 0.35,
      fill: { color: C.accent }, line: { pt: 0, color: C.accent },
    });
    const cardY = CONTENT_Y + 0.6;
    const cardH = CONTENT_H - 1.3;
    s.addShape(prs.ShapeType.rect, {
      x: 0.7, y: cardY, w: 11.93, h: cardH,
      fill: { color: C.headerBg },
      line: { color: C.blueLine, pt: 2 },
    });
    s.addText('Thank You!', {
      x: 0.7, y: cardY + 0.3, w: 11.93, h: cardH * 0.52,
      fontSize: 48, bold: true, color: C.white,
      align: 'center', valign: 'middle', fontFace: FONT,
    });
    s.addText(title, {
      x: 0.7, y: cardY + cardH * 0.58, w: 11.93, h: cardH * 0.22,
      fontSize: SZ.meta, color: C.accent,
      align: 'center', valign: 'middle', bold: true, fontFace: FONT, wrap: true,
    });
    s.addText(`${gradeLevel}  ·  ${subject}`, {
      x: 0.7, y: cardY + cardH * 0.80, w: 11.93, h: cardH * 0.16,
      fontSize: 13, color: C.white,
      align: 'center', valign: 'middle', fontFace: FONT,
    });
  }

  const safeName = title.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_') || 'presentation';
  await prs.writeFile({ fileName: `${safeName}.pptx` });
}
