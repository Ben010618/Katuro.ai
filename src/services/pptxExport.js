import pptxgen from 'pptxgenjs';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  headerBg: '0d1b2a',
  footerBg: '2d6a4f',
  blueLine: '1565c0',
  fbBlue:   '1877f2',
  dark:     '163828',
  accent:   '52b788',
  white:    'FFFFFF',
  text:     '1a1a2a',
  refText:  '374151',
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

// ── Stamp school template on a slide ─────────────────────────────────────────
function addTemplate(s, prs, schoolName, schoolEmail) {
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.white } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: HEADER_H, fill: { color: C.headerBg } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: LINE1_Y, w: '100%', h: LINE_H, fill: { color: C.blueLine } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: LINE2_Y, w: '100%', h: LINE_H, fill: { color: C.blueLine } });
  s.addShape(prs.ShapeType.rect, { x: 0, y: FOOTER_Y, w: '100%', h: FOOTER_H, fill: { color: C.footerBg } });

  const iconY = FOOTER_Y + (FOOTER_H - 0.33) / 2;
  s.addShape(prs.ShapeType.ellipse, { x: 0.28, y: iconY, w: 0.33, h: 0.33, fill: { color: C.fbBlue }, line: { color: C.fbBlue } });
  s.addText('f', { x: 0.28, y: iconY, w: 0.33, h: 0.33, fontSize: 13, bold: true, color: C.white, align: 'center', valign: 'middle' });
  s.addText(schoolName || 'School Name', { x: 0.68, y: FOOTER_Y, w: 5.8, h: FOOTER_H, fontSize: 13, color: C.white, valign: 'middle' });
  s.addText('✉', { x: 7.1, y: FOOTER_Y, w: 0.4, h: FOOTER_H, fontSize: 15, color: C.white, valign: 'middle', align: 'center' });
  s.addText(schoolEmail || 'school@deped.gov.ph', { x: 7.55, y: FOOTER_Y, w: 5.5, h: FOOTER_H, fontSize: 13, color: C.white, valign: 'middle' });
}

// ── Parse **bold** markdown into pptxgenjs text run objects ──────────────────
// Returns an array of { text, options } runs suitable for s.addText([...]).
function buildBulletRuns(bullets) {
  const PARA = { bullet: { type: 'bullet', indent: 15 }, paraSpaceAfter: 9 };
  const runs = [];

  bullets.forEach(bullet => {
    // Split on **...**  e.g. ["Normal ", "**Bold Term**", " rest of sentence."]
    const parts = bullet.split(/(\*\*[^*]+\*\*)/g);
    let firstRunOfBullet = true;

    parts.forEach(part => {
      if (!part) return;
      const isBold = part.startsWith('**') && part.endsWith('**');
      const text   = isBold ? part.slice(2, -2) : part;

      runs.push({
        text,
        options: {
          bold: isBold,
          color: isBold ? C.dark : C.text,
          ...(firstRunOfBullet ? PARA : {}),
        },
      });
      firstRunOfBullet = false;
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
 *   slides:       Array<{ layout, title, bullets, notes }>,
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
    s.addText(title, {
      x: 0.6, y: CONTENT_Y + 0.5, w: 12.13, h: CONTENT_H - 1.8,
      fontSize: 40, bold: true, color: C.headerBg,
      align: 'center', valign: 'middle', wrap: true,
    });
    s.addText(`${gradeLevel}  ·  ${subject}`, {
      x: 0.6, y: CONTENT_Y + CONTENT_H - 1.3, w: 12.13, h: 0.6,
      fontSize: 18, color: C.footerBg, align: 'center', bold: true,
    });
  }

  // ── 2. Content & section slides ─────────────────────────────────────────────
  for (const sl of slides) {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);

    if (sl.layout === 'section') {
      s.addShape(prs.ShapeType.rect, { x: 0, y: CONTENT_Y, w: '100%', h: CONTENT_H, fill: { color: C.accent } });
      s.addText(sl.title, {
        x: 0.6, y: CONTENT_Y, w: 12.13, h: CONTENT_H,
        fontSize: 36, bold: true, color: C.headerBg,
        align: 'center', valign: 'middle', wrap: true,
      });
    } else {
      // Slide title
      s.addText(sl.title, {
        x: 0.5, y: CONTENT_Y + 0.14, w: 12.33, h: 0.65,
        fontSize: 21, bold: true, color: C.dark,
      });
      // Underline
      s.addShape(prs.ShapeType.rect, {
        x: 0.5, y: CONTENT_Y + 0.82, w: 12.33, h: 0.025,
        fill: { color: C.accent },
      });

      // Bullets — full explanatory sentences with **bold** support
      if (sl.bullets?.length) {
        const runs = buildBulletRuns(sl.bullets);
        s.addText(runs, {
          x: 0.5, y: CONTENT_Y + 0.9, w: 12.33, h: CONTENT_H - 1.0,
          fontSize: 15, valign: 'top', wrap: true,
          lineSpacingMultiple: 1.25,
        });
      }
    }

    if (includeNotes && sl.notes) s.addNotes(sl.notes);
  }

  // ── 3. References slide (if any sources were found) ─────────────────────────
  if (references.length) {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);

    s.addText('References & Sources', {
      x: 0.5, y: CONTENT_Y + 0.14, w: 12.33, h: 0.65,
      fontSize: 21, bold: true, color: C.dark,
    });
    s.addShape(prs.ShapeType.rect, {
      x: 0.5, y: CONTENT_Y + 0.82, w: 12.33, h: 0.025,
      fill: { color: C.accent },
    });

    const refRuns = references.map((ref, i) => ([
      {
        text: `${i + 1}.  ${ref}`,
        options: { paraSpaceAfter: 10, color: C.refText },
      },
      { text: '', options: { breakLine: true } },
    ])).flat();

    s.addText(refRuns, {
      x: 0.5, y: CONTENT_Y + 0.95, w: 12.33, h: CONTENT_H - 1.1,
      fontSize: 13, valign: 'top', wrap: true,
      lineSpacingMultiple: 1.3,
    });

    s.addNotes('References sourced from DepEd Philippines MATATAG curriculum materials via AI research.');
  }

  // ── 4. Closing slide ────────────────────────────────────────────────────────
  {
    const s = prs.addSlide();
    addTemplate(s, prs, schoolName, schoolEmail);
    s.addText('Thank You!', {
      x: 0.6, y: CONTENT_Y + 0.8, w: 12.13, h: CONTENT_H - 2.0,
      fontSize: 48, bold: true, color: C.headerBg,
      align: 'center', valign: 'middle',
    });
    s.addText(title, {
      x: 0.6, y: CONTENT_Y + CONTENT_H - 1.3, w: 12.13, h: 0.55,
      fontSize: 16, color: C.footerBg, align: 'center', bold: true,
    });
    s.addText(`${gradeLevel}  ·  ${subject}`, {
      x: 0.6, y: CONTENT_Y + CONTENT_H - 0.75, w: 12.13, h: 0.45,
      fontSize: 13, color: C.text, align: 'center',
    });
  }

  const safeName = title.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_') || 'presentation';
  await prs.writeFile({ fileName: `${safeName}.pptx` });
}
