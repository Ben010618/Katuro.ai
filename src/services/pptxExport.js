import pptxgen from 'pptxgenjs';

// ── Intelligent Subject-Tailored Theme Engine ─────────────────────────────────
const THEMES = {
  science: {
    name: 'Cyber Teal & Emerald',
    primary:        '0F172A', // Deep Slate
    primaryLight:   '1E293B',
    accent:         '0EA5E9', // Sky Cyan
    accentGlow:     '38BDF8',
    secondary:      '10B981', // Emerald Green
    secondaryLight: 'D1FAE5',
    cardBg:         'FFFFFF',
    cardBorder:     'E2E8F0',
    textDark:       '0F172A',
    textMuted:      '475569',
    white:          'FFFFFF',
    badgeBg:        'E0F2FE',
    badgeText:      '0369A1',
    highlightBg:    'FEF3C7',
    highlightText:  '92400E',
    icon:           '🔬',
  },
  math: {
    name: 'Royal Indigo & Electric Cyan',
    primary:        '1E1B4B', // Deep Indigo
    primaryLight:   '312E81',
    accent:         '4F46E5', // Indigo 600
    accentGlow:     '6366F1',
    secondary:      '06B6D4', // Electric Cyan
    secondaryLight: 'CFFAFE',
    cardBg:         'FFFFFF',
    cardBorder:     'E0E7FF',
    textDark:       '0F172A',
    textMuted:      '475569',
    white:          'FFFFFF',
    badgeBg:        'EEF2FF',
    badgeText:      '3730A3',
    highlightBg:    'FEF3C7',
    highlightText:  '92400E',
    icon:           '📐',
  },
  english: {
    name: 'Burgundy & Warm Amber',
    primary:        '450A0A', // Deep Burgundy
    primaryLight:   '881337',
    accent:         'E11D48', // Crimson Rose
    accentGlow:     'FB7185',
    secondary:      'D97706', // Warm Amber
    secondaryLight: 'FEF3C7',
    cardBg:         'FFFFFF',
    cardBorder:     'FFE4E6',
    textDark:       '18181B',
    textMuted:      '52525B',
    white:          'FFFFFF',
    badgeBg:        'FFF1F2',
    badgeText:      '9F1239',
    highlightBg:    'FEF3C7',
    highlightText:  '92400E',
    icon:           '📚',
  },
  filipino: {
    name: 'DepEd Royal Blue & Sun Gold',
    primary:        '1E3A8A', // Royal Blue
    primaryLight:   '1E40AF',
    accent:         '2563EB', // Vibrant Blue
    accentGlow:     '60A5FA',
    secondary:      'D97706', // Sun Gold
    secondaryLight: 'FEF3C7',
    cardBg:         'FFFFFF',
    cardBorder:     'DBEAFE',
    textDark:       '0F172A',
    textMuted:      '475569',
    white:          'FFFFFF',
    badgeBg:        'EFF6FF',
    badgeText:      '1D4ED8',
    highlightBg:    'FEF3C7',
    highlightText:  '92400E',
    icon:           '🇵🇭',
  },
  ap: { // Araling Panlipunan / History
    name: 'Terracotta & Heritage Gold',
    primary:        '7C2D12', // Warm Earth
    primaryLight:   '9A3412',
    accent:         'EA580C', // Vibrant Terracotta
    accentGlow:     'FB923C',
    secondary:      'D97706', // Gold
    secondaryLight: 'FEF3C7',
    cardBg:         'FFFFFF',
    cardBorder:     'FFEDD5',
    textDark:       '1C1917',
    textMuted:      '57534E',
    white:          'FFFFFF',
    badgeBg:        'FFF7ED',
    badgeText:      '9A3412',
    highlightBg:    'FEF3C7',
    highlightText:  '92400E',
    icon:           '🏛️',
  },
  mapeh: {
    name: 'Magenta & Sunset Coral',
    primary:        '831843', // Deep Pink
    primaryLight:   '9D174D',
    accent:         'DB2777', // Vivid Pink
    accentGlow:     'F472B6',
    secondary:      'F97316', // Sunset Coral
    secondaryLight: 'FFEDD5',
    cardBg:         'FFFFFF',
    cardBorder:     'FCE7F3',
    textDark:       '18181B',
    textMuted:      '52525B',
    white:          'FFFFFF',
    badgeBg:        'FDF2F8',
    badgeText:      '9D174D',
    highlightBg:    'FEF3C7',
    highlightText:  '92400E',
    icon:           '🎨',
  },
  values: { // ESP / GMRC
    name: 'Forest Sage & Warm Honey',
    primary:        '14532D', // Deep Forest
    primaryLight:   '166534',
    accent:         '16A34A', // Sage Emerald
    accentGlow:     '4ADE80',
    secondary:      'EAB308', // Honey
    secondaryLight: 'FEF9C3',
    cardBg:         'FFFFFF',
    cardBorder:     'DCFCE7',
    textDark:       '0F172A',
    textMuted:      '475569',
    white:          'FFFFFF',
    badgeBg:        'F0FDF4',
    badgeText:      '15803D',
    highlightBg:    'FEF9C3',
    highlightText:  '854D0E',
    icon:           '🌱',
  },
  tle: { // TVL / TLE / ICT
    name: 'Modern Tech Cobalt & Cyan',
    primary:        '0B192C',
    primaryLight:   '1E3E62',
    accent:         '00ADB5',
    accentGlow:     '38BDF8',
    secondary:      'FF6500',
    secondaryLight: 'FFE5D0',
    cardBg:         'FFFFFF',
    cardBorder:     'E2E8F0',
    textDark:       '0F172A',
    textMuted:      '475569',
    white:          'FFFFFF',
    badgeBg:        'E0F7FA',
    badgeText:      '006064',
    highlightBg:    'FFF3E0',
    highlightText:  'E65100',
    icon:           '⚙️',
  },
};

/** Match subject name to tailored theme */
export function getThemeForSubject(subject = '') {
  const s = subject.toLowerCase();
  if (/science|agham|biology|chemistry|physics|astronomy|nature/.test(s)) return THEMES.science;
  if (/math|matematika|algebra|geometry|calculus|statistics|trigonometry/.test(s)) return THEMES.math;
  if (/english|reading|literature|language|grammar|writing/.test(s)) return THEMES.english;
  if (/filipino|makabansa|panitikan|wika/.test(s)) return THEMES.filipino;
  if (/araling panlipunan|history|kasaysayan|social|ap\b|heograpiya/.test(s)) return THEMES.ap;
  if (/mapeh|music|arts|pe|physical education|health|sayaw|musika/.test(s)) return THEMES.mapeh;
  if (/esp|gmrc|values|edukasyon sa pagpapakatao|kagandahang-asal/.test(s)) return THEMES.values;
  if (/tle|tvl|ict|computer|technology|livelihood|drafting|agri/.test(s)) return THEMES.tle;
  return THEMES.science;
}

const FONT_HEAD = 'Segoe UI';
const FONT_BODY = 'Segoe UI';

const SZ = {
  heroTitle:    38,
  slideTitle:   26,
  headline:     14,
  body:         16,
  cardBody:     15,
  badge:        10.5,
  footer:       10,
  meta:         13,
};

// ── Widescreen Geometry (13.33 × 7.5 in) ──────────────────────────────────────
const PAD_L = 0.75;
const PAD_R = 0.75;
const CONTENT_W = 13.33 - PAD_L - PAD_R; // 11.83 in
const TOP_NAV_Y = 0.45;
const BODY_Y    = 1.45;
const BODY_H    = 5.4;
const FOOTER_Y  = 7.08;

// ── Clean Modern Slide Canvas ────────────────────────────────────────────────
function addSlideCanvas(s, prs, th, { subject, gradeLevel, slideNum, totalSlides, schoolName }) {
  // Pure crisp background
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: 'F8FAFC' } });

  // Top header hairline accent
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.05, fill: { color: th.accent } });

  // Subject & Grade Pill Badge (Top Left)
  s.addShape(prs.ShapeType.roundRect, {
    x: PAD_L, y: TOP_NAV_Y, w: 2.8, h: 0.32,
    fill: { color: th.badgeBg },
    line: { color: th.accent, pt: 1 },
    rectRadius: 0.08,
  });
  s.addText(`${th.icon}  ${subject ? subject.toUpperCase() : 'LESSON'} · ${gradeLevel || 'DEPED'}`, {
    x: PAD_L, y: TOP_NAV_Y, w: 2.8, h: 0.32,
    fontSize: SZ.badge, bold: true, color: th.badgeText, align: 'center', valign: 'middle', fontFace: FONT_HEAD,
  });

  // Slide Number Pill (Top Right)
  if (slideNum && totalSlides) {
    s.addShape(prs.ShapeType.roundRect, {
      x: 13.33 - PAD_R - 1.3, y: TOP_NAV_Y, w: 1.3, h: 0.32,
      fill: { color: 'FFFFFF' },
      line: { color: 'E2E8F0', pt: 1 },
      rectRadius: 0.08,
    });
    s.addText(`${String(slideNum).padStart(2, '0')} / ${String(totalSlides).padStart(2, '0')}`, {
      x: 13.33 - PAD_R - 1.3, y: TOP_NAV_Y, w: 1.3, h: 0.32,
      fontSize: 10, bold: true, color: th.textMuted, align: 'center', valign: 'middle', fontFace: FONT_HEAD,
    });
  }

  // Footer subtle line
  s.addShape(prs.ShapeType.rect, { x: PAD_L, y: FOOTER_Y, w: CONTENT_W, h: 0.015, fill: { color: 'E2E8F0' } });

  // Footer branding
  s.addText(`🏫 ${schoolName || 'DepEd Philippines · MATATAG Curriculum Standard'}`, {
    x: PAD_L, y: FOOTER_Y + 0.05, w: 7.0, h: 0.3,
    fontSize: SZ.footer, color: th.textMuted, valign: 'middle', fontFace: FONT_BODY,
  });
  s.addText('kaTuro AI Lesson Presentation', {
    x: 13.33 - PAD_R - 4.0, y: FOOTER_Y + 0.05, w: 4.0, h: 0.3,
    fontSize: SZ.footer, color: th.textMuted, align: 'right', valign: 'middle', fontFace: FONT_BODY,
  });
}

// ── Parse markdown bold into pptxgenjs text run objects ───────────────────────
function parseTextRuns(text = '', defaultColor = '0F172A', accentColor = '0EA5E9', fontSize = 15) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const runs = [];
  parts.forEach(part => {
    if (!part) return;
    const isBold = part.startsWith('**') && part.endsWith('**');
    runs.push({
      text: isBold ? part.slice(2, -2) : part,
      options: {
        bold:     isBold,
        color:    isBold ? accentColor : defaultColor,
        fontFace: FONT_BODY,
        fontSize,
      },
    });
  });
  return runs;
}

function buildBulletRuns(bullets = [], defaultColor = '0F172A', accentColor = '0EA5E9', fontSize = 15) {
  const runs = [];
  bullets.forEach(bullet => {
    const parsed = parseTextRuns(bullet, defaultColor, accentColor, fontSize);
    parsed.forEach((run, idx) => {
      runs.push({
        ...run,
        options: {
          ...run.options,
          ...(idx === 0 ? { bullet: { type: 'bullet', indent: 14 }, paraSpaceAfter: 10 } : {}),
        },
      });
    });
    runs.push({ text: '', options: { breakLine: true } });
  });
  return runs;
}

// ── Slide Layout 1: Hero Cover Slide ──────────────────────────────────────────
function renderTitleSlide(s, prs, th, { title, subject, gradeLevel, schoolName, melcCode, includeNotes }) {
  // Dark luxury slate background
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: th.primary } });

  // Decorative glowing geometric shapes
  s.addShape(prs.ShapeType.ellipse, {
    x: -1.2, y: -1.2, w: 5.5, h: 5.5,
    fill: { color: th.accent, transparency: 85 }, line: { pt: 0, color: th.accent },
  });
  s.addShape(prs.ShapeType.ellipse, {
    x: 9.5, y: 3.5, w: 5.0, h: 5.0,
    fill: { color: th.secondary, transparency: 88 }, line: { pt: 0, color: th.secondary },
  });

  // Hero Card Container
  s.addShape(prs.ShapeType.roundRect, {
    x: 0.85, y: 0.85, w: 11.63, h: 5.8,
    fill: { color: th.primaryLight },
    line: { color: th.accent, pt: 2 },
    rectRadius: 0.12,
  });

  // Top Category Pill
  s.addShape(prs.ShapeType.roundRect, {
    x: 1.35, y: 1.35, w: 3.8, h: 0.44,
    fill: { color: th.accent },
    rectRadius: 0.08,
  });
  s.addText(`${th.icon}  ${subject ? subject.toUpperCase() : 'LESSON'}  ·  ${gradeLevel || 'GRADE'}`, {
    x: 1.35, y: 1.35, w: 3.8, h: 0.44,
    fontSize: 12, bold: true, color: th.primary, align: 'center', valign: 'middle', fontFace: FONT_HEAD,
  });

  // Main Lesson Title (High Impact)
  s.addText(title, {
    x: 1.35, y: 2.0, w: 10.6, h: 2.2,
    fontSize: SZ.heroTitle, bold: true, color: 'FFFFFF',
    align: 'left', valign: 'middle', wrap: true, fontFace: FONT_HEAD,
  });

  // DepEd Curriculum Subtitle
  s.addText('DepEd K–12 / MATATAG Curriculum Standardized Presentation', {
    x: 1.35, y: 4.25, w: 10.6, h: 0.35,
    fontSize: 14, color: th.accentGlow, italic: true, fontFace: FONT_BODY,
  });

  // 3 Bottom Metadata Stat Cards
  const metaY = 4.85;
  const metaW = 3.35;
  const metas = [
    { label: 'COMPETENCY / MELC', val: melcCode || 'DepEd MATATAG Aligned', icon: '🎯' },
    { label: 'GRADE & LEVEL', val: `${gradeLevel || 'Classroom Lesson'}`, icon: '📖' },
    { label: 'INSTITUTION', val: schoolName || 'kaTuro AI Verified', icon: '🏫' },
  ];

  metas.forEach((m, idx) => {
    const mX = 1.35 + idx * (metaW + 0.3);
    s.addShape(prs.ShapeType.roundRect, {
      x: mX, y: metaY, w: metaW, h: 1.3,
      fill: { color: th.primary },
      line: { color: '334155', pt: 1 },
      rectRadius: 0.08,
    });
    s.addText(`${m.icon}  ${m.label}`, {
      x: mX + 0.15, y: metaY + 0.15, w: metaW - 0.3, h: 0.3,
      fontSize: 9.5, bold: true, color: th.accentGlow, fontFace: FONT_HEAD,
    });
    s.addText(m.val, {
      x: mX + 0.15, y: metaY + 0.48, w: metaW - 0.3, h: 0.65,
      fontSize: 12, bold: true, color: 'FFFFFF', wrap: true, valign: 'top', fontFace: FONT_BODY,
    });
  });

  if (includeNotes) {
    s.addNotes(`Teacher Guide Script:\n"Good morning / afternoon class! Welcome to today's lesson on ${title} for ${subject} ${gradeLevel}. Please prepare your notebooks and active learning materials."`);
  }
}

// ── Slide Layout 2: Learning Targets (3-Pillar Goal Cards) ────────────────────
function renderObjectivesSlide(s, prs, th, sl) {
  // Title & Subtitle Header
  s.addText(sl.title || 'Learning Objectives', {
    x: PAD_L, y: 0.88, w: CONTENT_W, h: 0.55,
    fontSize: SZ.slideTitle, bold: true, color: th.textDark, fontFace: FONT_HEAD,
  });
  s.addText(sl.headline || 'By the end of this lesson, learners are expected to achieve the following competencies:', {
    x: PAD_L, y: 1.42, w: CONTENT_W, h: 0.35,
    fontSize: SZ.headline, color: th.accent, italic: true, bold: true, fontFace: FONT_BODY,
  });

  const objectives = sl.bullets?.length ? sl.bullets : [
    '**Understand Core Principles**: Master fundamental definitions and underlying concepts.',
    '**Analyze Real Scenarios**: Connect theories to practical everyday Philippine contexts.',
    '**Demonstrate Mastery**: Complete interactive exercises and formative assessments accurately.',
  ];

  const count = Math.min(objectives.length, 3);
  const cardW = (CONTENT_W - (count - 1) * 0.35) / count;
  const cardH = 4.7;
  const cardY = 1.95;

  const goalTypes = ['Cognitive Goal', 'Practical & Skills Goal', 'Affective / Values Goal'];
  const goalIcons = ['🧠', '⚡', '🌟'];

  objectives.slice(0, count).forEach((obj, idx) => {
    const cardX = PAD_L + idx * (cardW + 0.35);

    // Card Container with top colored accent line
    s.addShape(prs.ShapeType.roundRect, {
      x: cardX, y: cardY, w: cardW, h: cardH,
      fill: { color: th.cardBg },
      line: { color: th.cardBorder, pt: 1.5 },
      rectRadius: 0.1,
    });
    s.addShape(prs.ShapeType.rect, {
      x: cardX, y: cardY, w: cardW, h: 0.08,
      fill: { color: idx === 0 ? th.accent : idx === 1 ? th.secondary : th.primaryLight },
    });

    // Circular Number Pill
    s.addShape(prs.ShapeType.ellipse, {
      x: cardX + 0.25, y: cardY + 0.3, w: 0.55, h: 0.55,
      fill: { color: idx === 0 ? th.accent : idx === 1 ? th.secondary : th.primary },
    });
    s.addText(`0${idx + 1}`, {
      x: cardX + 0.25, y: cardY + 0.3, w: 0.55, h: 0.55,
      fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: FONT_HEAD,
    });

    // Goal Type Badge
    s.addText(`${goalIcons[idx]} ${goalTypes[idx]}`, {
      x: cardX + 0.95, y: cardY + 0.38, w: cardW - 1.1, h: 0.38,
      fontSize: 12, bold: true, color: th.textMuted, fontFace: FONT_HEAD,
    });

    // Objective Content
    const runs = parseTextRuns(obj, th.textDark, th.accent, SZ.cardBody);
    s.addText(runs, {
      x: cardX + 0.25, y: cardY + 1.1, w: cardW - 0.5, h: cardH - 1.3,
      valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
    });
  });
}

// ── Slide Layout 3: Visual Split Slide (with AI Visual or Graphic Framework) ───
function renderVisualSlide(s, prs, th, sl) {
  const LEFT_W  = 6.5;
  const RIGHT_X = PAD_L + LEFT_W + 0.4;
  const RIGHT_W = CONTENT_W - LEFT_W - 0.4; // 4.93 in

  // Header Tag
  s.addShape(prs.ShapeType.roundRect, {
    x: PAD_L, y: 0.88, w: 2.6, h: 0.3,
    fill: { color: th.badgeBg },
    line: { color: th.accent, pt: 1 },
    rectRadius: 0.06,
  });
  s.addText(sl.type === 'activity' ? '💡 INTERACTIVE FOCUS' : sl.type === 'example' ? '🔍 REAL-WORLD CASE' : '📖 CONCEPT ANALYSIS', {
    x: PAD_L, y: 0.88, w: 2.6, h: 0.3,
    fontSize: 9.5, bold: true, color: th.badgeText, align: 'center', valign: 'middle', fontFace: FONT_HEAD,
  });

  // Title
  s.addText(sl.title, {
    x: PAD_L, y: 1.25, w: LEFT_W, h: 0.65,
    fontSize: SZ.slideTitle, bold: true, color: th.textDark, fontFace: FONT_HEAD, wrap: true,
  });

  let curY = 1.95;
  if (sl.headline) {
    s.addText(sl.headline, {
      x: PAD_L, y: curY, w: LEFT_W, h: 0.35,
      fontSize: SZ.headline, color: th.accent, italic: true, bold: true, fontFace: FONT_BODY,
    });
    curY += 0.45;
  }

  // Bullets on the Left Column
  const bullets = sl.bullets?.length ? sl.bullets : (sl.body ? [sl.body] : []);
  if (bullets.length) {
    s.addText(buildBulletRuns(bullets, th.textDark, th.accent, SZ.body), {
      x: PAD_L, y: curY, w: LEFT_W, h: FOOTER_Y - curY - 0.2,
      valign: 'top', wrap: true, lineSpacingMultiple: 1.35,
    });
  }

  // Right Column: Real AI Image or Structured Concept Card
  const boxY = 0.95;
  const boxH = 5.8;

  if (sl.imageBase64 || sl.imageUrl) {
    // Image Frame
    s.addShape(prs.ShapeType.roundRect, {
      x: RIGHT_X, y: boxY, w: RIGHT_W, h: boxH,
      fill: { color: th.cardBg },
      line: { color: th.cardBorder, pt: 1.5 },
      rectRadius: 0.1,
    });

    const imgPad = 0.15;
    const imgH = boxH - 0.75;
    try {
      if (sl.imageBase64) {
        s.addImage({ data: sl.imageBase64, x: RIGHT_X + imgPad, y: boxY + imgPad, w: RIGHT_W - imgPad * 2, h: imgH, rounding: true });
      } else {
        s.addImage({ path: sl.imageUrl, x: RIGHT_X + imgPad, y: boxY + imgPad, w: RIGHT_W - imgPad * 2, h: imgH, rounding: true });
      }
    } catch (e) {
      console.warn('Image render warning:', e);
    }

    // Caption Pill at bottom
    s.addShape(prs.ShapeType.roundRect, {
      x: RIGHT_X + imgPad, y: boxY + boxH - 0.52, w: RIGHT_W - imgPad * 2, h: 0.38,
      fill: { color: th.primaryLight },
      rectRadius: 0.06,
    });
    s.addText(`✨ Visual Aid: ${sl.suggestedVisual ? sl.suggestedVisual.slice(0, 48) : 'Classroom Concept Illustration'}`, {
      x: RIGHT_X + imgPad + 0.1, y: boxY + boxH - 0.52, w: RIGHT_W - imgPad * 2 - 0.2, h: 0.38,
      fontSize: 10, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: FONT_HEAD, bold: true,
    });
  } else {
    // Rich Fallback Concept Bento Card (Never empty or boring!)
    s.addShape(prs.ShapeType.roundRect, {
      x: RIGHT_X, y: boxY, w: RIGHT_W, h: boxH,
      fill: { color: th.cardBg },
      line: { color: th.accent, pt: 2 },
      rectRadius: 0.12,
    });

    // Top Header Banner inside card
    s.addShape(prs.ShapeType.roundRect, {
      x: RIGHT_X + 0.2, y: boxY + 0.25, w: RIGHT_W - 0.4, h: 0.5,
      fill: { color: th.badgeBg },
      rectRadius: 0.08,
    });
    s.addText(`📌 ${sl.suggestedVisual ? sl.suggestedVisual.slice(0, 35) : 'Core Concept Framework'}`, {
      x: RIGHT_X + 0.2, y: boxY + 0.25, w: RIGHT_W - 0.4, h: 0.5,
      fontSize: 12, bold: true, color: th.badgeText, align: 'center', valign: 'middle', fontFace: FONT_HEAD,
    });

    // Main Takeaway Quote Box
    s.addShape(prs.ShapeType.roundRect, {
      x: RIGHT_X + 0.2, y: boxY + 0.9, w: RIGHT_W - 0.4, h: 2.2,
      fill: { color: 'F8FAFC' },
      line: { color: 'E2E8F0', pt: 1 },
      rectRadius: 0.08,
    });
    s.addText('“', {
      x: RIGHT_X + 0.35, y: boxY + 0.95, w: 0.6, h: 0.6,
      fontSize: 32, bold: true, color: th.accent, fontFace: FONT_HEAD,
    });
    s.addText(sl.headline || sl.title, {
      x: RIGHT_X + 0.4, y: boxY + 1.4, w: RIGHT_W - 0.8, h: 1.4,
      fontSize: 14, bold: true, color: th.textDark, fontFace: FONT_BODY, wrap: true, lineSpacingMultiple: 1.2,
    });

    // 2 Key Highlights Pills
    s.addShape(prs.ShapeType.roundRect, {
      x: RIGHT_X + 0.2, y: boxY + 3.3, w: RIGHT_W - 0.4, h: 1.0,
      fill: { color: th.secondaryLight },
      rectRadius: 0.08,
    });
    s.addText('💡 Classroom Quick Tip:', {
      x: RIGHT_X + 0.35, y: boxY + 3.4, w: RIGHT_W - 0.7, h: 0.3,
      fontSize: 11, bold: true, color: th.secondary, fontFace: FONT_HEAD,
    });
    s.addText('Engage students by asking how this concept applies in their household or school.', {
      x: RIGHT_X + 0.35, y: boxY + 3.7, w: RIGHT_W - 0.7, h: 0.5,
      fontSize: 11, color: th.textDark, fontFace: FONT_BODY, wrap: true,
    });

    s.addShape(prs.ShapeType.roundRect, {
      x: RIGHT_X + 0.2, y: boxY + 4.5, w: RIGHT_W - 0.4, h: 0.95,
      fill: { color: th.primaryLight },
      rectRadius: 0.08,
    });
    s.addText('🎯 Standard Competency:', {
      x: RIGHT_X + 0.35, y: boxY + 4.6, w: RIGHT_W - 0.7, h: 0.3,
      fontSize: 10, bold: true, color: th.accentGlow, fontFace: FONT_HEAD,
    });
    s.addText('DepEd MATATAG Essential Learning Competency', {
      x: RIGHT_X + 0.35, y: boxY + 4.9, w: RIGHT_W - 0.7, h: 0.45,
      fontSize: 11, color: 'FFFFFF', fontFace: FONT_BODY,
    });
  }
}

// ── Slide Layout 4: Multi-Card Bento Grid (for Concept Deep Dive) ─────────────
function renderContentSlide(s, prs, th, sl) {
  // Title & Headline
  s.addText(sl.title, {
    x: PAD_L, y: 0.88, w: CONTENT_W, h: 0.55,
    fontSize: SZ.slideTitle, bold: true, color: th.textDark, fontFace: FONT_HEAD,
  });

  let curY = 1.45;
  if (sl.headline) {
    s.addText(sl.headline, {
      x: PAD_L, y: curY, w: CONTENT_W, h: 0.35,
      fontSize: SZ.headline, color: th.accent, italic: true, bold: true, fontFace: FONT_BODY,
    });
    curY += 0.45;
  }

  const bullets = sl.bullets?.length ? sl.bullets : (sl.body ? [sl.body] : []);
  const count = bullets.length;

  if (count >= 2 && count <= 4) {
    // Render as distinct Bento Cards
    const cardW = (CONTENT_W - (count - 1) * 0.3) / count;
    const cardH = FOOTER_Y - curY - 0.2;

    bullets.forEach((bText, idx) => {
      const cardX = PAD_L + idx * (cardW + 0.3);

      s.addShape(prs.ShapeType.roundRect, {
        x: cardX, y: curY, w: cardW, h: cardH,
        fill: { color: th.cardBg },
        line: { color: th.cardBorder, pt: 1.5 },
        rectRadius: 0.1,
      });

      // Card Header Tag
      s.addShape(prs.ShapeType.roundRect, {
        x: cardX + 0.2, y: curY + 0.2, w: cardW - 0.4, h: 0.38,
        fill: { color: idx === 0 ? th.accent : idx === 1 ? th.secondary : th.primaryLight },
        rectRadius: 0.06,
      });
      s.addText(`Key Point 0${idx + 1}`, {
        x: cardX + 0.2, y: curY + 0.2, w: cardW - 0.4, h: 0.38,
        fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: FONT_HEAD,
      });

      // Content
      const runs = parseTextRuns(bText, th.textDark, th.accent, SZ.cardBody);
      s.addText(runs, {
        x: cardX + 0.2, y: curY + 0.8, w: cardW - 0.4, h: cardH - 1.0,
        valign: 'top', wrap: true, lineSpacingMultiple: 1.3,
      });
    });
  } else {
    // 2-Column Structured Bullet List
    s.addText(buildBulletRuns(bullets, th.textDark, th.accent, SZ.body), {
      x: PAD_L, y: curY, w: CONTENT_W, h: FOOTER_Y - curY - 0.2,
      valign: 'top', wrap: true, lineSpacingMultiple: 1.35,
    });
  }
}

// ── Slide Layout 5: Interactive Classroom Challenge ──────────────────────────
function renderActivitySlide(s, prs, th, sl) {
  // Activity Tag
  s.addShape(prs.ShapeType.roundRect, {
    x: PAD_L, y: 0.88, w: 3.2, h: 0.32,
    fill: { color: th.highlightBg },
    line: { color: th.secondary, pt: 1 },
    rectRadius: 0.08,
  });
  s.addText('💡 INTERACTIVE CLASSROOM CHALLENGE', {
    x: PAD_L, y: 0.88, w: 3.2, h: 0.32,
    fontSize: 9.5, bold: true, color: th.highlightText, align: 'center', valign: 'middle', fontFace: FONT_HEAD,
  });

  s.addText(sl.title || 'Guided Practice & Collaboration', {
    x: PAD_L, y: 1.25, w: CONTENT_W, h: 0.6,
    fontSize: SZ.slideTitle, bold: true, color: th.textDark, fontFace: FONT_HEAD,
  });

  const boxY = 1.95;
  const boxH = 4.8;
  const LEFT_W = 7.4;
  const RIGHT_X = PAD_L + LEFT_W + 0.35;
  const RIGHT_W = CONTENT_W - LEFT_W - 0.35;

  // Left: Instructions Board
  s.addShape(prs.ShapeType.roundRect, {
    x: PAD_L, y: boxY, w: LEFT_W, h: boxH,
    fill: { color: th.cardBg },
    line: { color: th.accent, pt: 2 },
    rectRadius: 0.1,
  });

  s.addText('📋 Step-by-Step Task Instructions:', {
    x: PAD_L + 0.3, y: boxY + 0.3, w: LEFT_W - 0.6, h: 0.35,
    fontSize: 14, bold: true, color: th.accent, fontFace: FONT_HEAD,
  });

  const bullets = sl.bullets?.length ? sl.bullets : [
    '**Step 1 — Form Groups**: Group into 4–5 members and assign a facilitator and reporter.',
    '**Step 2 — Analyze & Solve**: Examine the given situation and apply the lesson principles.',
    '**Step 3 — Present & Share**: Share your findings in a 2-minute concise presentation.',
  ];

  s.addText(buildBulletRuns(bullets, th.textDark, th.accent, SZ.body), {
    x: PAD_L + 0.3, y: boxY + 0.85, w: LEFT_W - 0.6, h: boxH - 1.1,
    valign: 'top', wrap: true, lineSpacingMultiple: 1.35,
  });

  // Right: Timer & Mechanics Bento Card
  s.addShape(prs.ShapeType.roundRect, {
    x: RIGHT_X, y: boxY, w: RIGHT_W, h: boxH,
    fill: { color: th.primaryLight },
    rectRadius: 0.1,
  });

  s.addText('⏱️ TIME ALLOTMENT', {
    x: RIGHT_X + 0.25, y: boxY + 0.35, w: RIGHT_W - 0.5, h: 0.3,
    fontSize: 11, bold: true, color: th.accentGlow, fontFace: FONT_HEAD,
  });
  s.addText('10 – 15 Minutes', {
    x: RIGHT_X + 0.25, y: boxY + 0.68, w: RIGHT_W - 0.5, h: 0.5,
    fontSize: 22, bold: true, color: 'FFFFFF', fontFace: FONT_HEAD,
  });

  // Success Criteria Box
  s.addShape(prs.ShapeType.roundRect, {
    x: RIGHT_X + 0.25, y: boxY + 1.4, w: RIGHT_W - 0.5, h: 3.0,
    fill: { color: th.primary },
    line: { color: '334155', pt: 1 },
    rectRadius: 0.08,
  });
  s.addText('🎯 Success Rubric:', {
    x: RIGHT_X + 0.45, y: boxY + 1.6, w: RIGHT_W - 0.9, h: 0.3,
    fontSize: 12, bold: true, color: th.secondary, fontFace: FONT_HEAD,
  });

  const rubric = [
    '✓ Accurate concept application',
    '✓ Clear active collaboration',
    '✓ Concise presentation output',
  ];
  rubric.forEach((r, i) => {
    s.addText(r, {
      x: RIGHT_X + 0.45, y: boxY + 2.0 + i * 0.55, w: RIGHT_W - 0.9, h: 0.45,
      fontSize: 12, color: 'FFFFFF', fontFace: FONT_BODY,
    });
  });
}

// ── Slide Layout 6: Lesson Synthesis & Key Takeaways ──────────────────────────
function renderSummarySlide(s, prs, th, sl) {
  s.addText('📌 Lesson Synthesis & Key Takeaways', {
    x: PAD_L, y: 0.88, w: CONTENT_W, h: 0.55,
    fontSize: SZ.slideTitle, bold: true, color: th.textDark, fontFace: FONT_HEAD,
  });
  s.addText('Essential principles to remember and apply from today\'s discussion:', {
    x: PAD_L, y: 1.42, w: CONTENT_W, h: 0.35,
    fontSize: SZ.headline, color: th.accent, italic: true, bold: true, fontFace: FONT_BODY,
  });

  const boxY = 1.95;
  const boxH = 4.8;

  // Dark Master Summary Card
  s.addShape(prs.ShapeType.roundRect, {
    x: PAD_L, y: boxY, w: CONTENT_W, h: boxH,
    fill: { color: th.primaryLight },
    line: { color: th.accent, pt: 2 },
    rectRadius: 0.12,
  });

  const bullets = sl.bullets?.length ? sl.bullets : [
    '**Foundational Principle**: Mastered core concepts aligned with DepEd learning goals.',
    '**Contextual Application**: Connected lesson ideas to practical everyday situations.',
    '**Continuous Learning**: Ready for the succeeding competency in the curriculum.',
  ];

  const runs = [];
  bullets.forEach(b => {
    const clean = b.replace(/^\*\*/, '').replace(/\*\*$/, '');
    runs.push({
      text: `✓   ${clean}`,
      options: { bold: true, color: 'FFFFFF', fontFace: FONT_HEAD, fontSize: 17, paraSpaceAfter: 18 },
    });
    runs.push({ text: '', options: { breakLine: true } });
  });

  s.addText(runs, {
    x: PAD_L + 0.5, y: boxY + 0.5, w: CONTENT_W - 1.0, h: boxH - 1.0,
    valign: 'top', wrap: true, lineSpacingMultiple: 1.35,
  });
}

// ── Slide Layout 7: References Slide ──────────────────────────────────────────
function renderReferencesSlide(s, prs, th, references = []) {
  s.addText('References & Learning Resources', {
    x: PAD_L, y: 0.88, w: CONTENT_W, h: 0.55,
    fontSize: SZ.slideTitle, bold: true, color: th.textDark, fontFace: FONT_HEAD,
  });
  s.addText('Curriculum guides, official textbook modules, and academic learning references:', {
    x: PAD_L, y: 1.42, w: CONTENT_W, h: 0.35,
    fontSize: SZ.headline, color: th.accent, italic: true, fontFace: FONT_BODY,
  });

  const boxY = 1.95;
  const boxH = 4.8;

  s.addShape(prs.ShapeType.roundRect, {
    x: PAD_L, y: boxY, w: CONTENT_W, h: boxH,
    fill: { color: th.cardBg },
    line: { color: th.cardBorder, pt: 1.5 },
    rectRadius: 0.1,
  });

  const refList = references.length ? references : [
    'Department of Education (DepEd) Philippines — K to 12 / MATATAG Curriculum Guide',
    'DepEd Learning Resource Management and Development System (LRMDS) Official Modules',
    'Philippine Basic Education Development Plan (BEDP 2030) Standards',
  ];

  const refRuns = refList.flatMap((ref, i) => [
    { text: `[${i + 1}]  `, options: { bold: true, color: th.accent, fontFace: FONT_HEAD, fontSize: 14 } },
    { text: `${ref}`, options: { color: th.textDark, fontFace: FONT_BODY, fontSize: 14, paraSpaceAfter: 14 } },
    { text: '', options: { breakLine: true } },
  ]);

  s.addText(refRuns, {
    x: PAD_L + 0.4, y: boxY + 0.4, w: CONTENT_W - 0.8, h: boxH - 0.8,
    valign: 'top', wrap: true, lineSpacingMultiple: 1.35,
  });
}

// ── Slide Layout 8: Closing Hero Slide ────────────────────────────────────────
function renderClosingSlide(s, prs, th, { title, subject, gradeLevel }) {
  s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: th.primary } });

  s.addShape(prs.ShapeType.ellipse, {
    x: -1.2, y: -1.2, w: 5.5, h: 5.5,
    fill: { color: th.accent, transparency: 85 },
  });
  s.addShape(prs.ShapeType.ellipse, {
    x: 9.5, y: 3.5, w: 5.0, h: 5.0,
    fill: { color: th.secondary, transparency: 88 },
  });

  s.addShape(prs.ShapeType.roundRect, {
    x: 0.85, y: 0.85, w: 11.63, h: 5.8,
    fill: { color: th.primaryLight },
    line: { color: th.accent, pt: 2 },
    rectRadius: 0.12,
  });

  s.addText('Maraming Salamat! · Great Job Today!', {
    x: 1.35, y: 1.5, w: 10.6, h: 1.2,
    fontSize: 42, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: FONT_HEAD,
  });

  s.addText(`Topic Completed: "${title}"`, {
    x: 1.35, y: 2.8, w: 10.6, h: 0.6,
    fontSize: 18, color: th.accentGlow, align: 'center', valign: 'middle', bold: true, fontFace: FONT_BODY,
  });

  s.addShape(prs.ShapeType.roundRect, {
    x: 3.65, y: 3.7, w: 6.0, h: 0.5,
    fill: { color: th.accent },
    rectRadius: 0.1,
  });
  s.addText(`${th.icon}  ${subject ? subject.toUpperCase() : 'DEPED LESSON'} · ${gradeLevel || 'GRADE LEVEL'}`, {
    x: 3.65, y: 3.7, w: 6.0, h: 0.5,
    fontSize: 13, bold: true, color: th.primary, align: 'center', valign: 'middle', fontFace: FONT_HEAD,
  });

  s.addText('kaTuro AI Powered Lesson Presentation · DepEd Philippines', {
    x: 1.35, y: 4.8, w: 10.6, h: 0.4,
    fontSize: 12, color: '94A3B8', align: 'center', valign: 'middle', fontFace: FONT_BODY,
  });
}

/**
 * Build and download a state-of-the-art, beautifully styled .pptx deck.
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
  prs.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5 in

  // Pick intelligent theme based on subject
  const th = getThemeForSubject(subject);
  const totalSlides = slides.length + 2 + (references.length ? 1 : 0); // + Title + Closing (+ References)

  // 1. Hero Title Slide
  {
    const s = prs.addSlide();
    renderTitleSlide(s, prs, th, { title, subject, gradeLevel, schoolName, melcCode: slides[0]?.melcCode, includeNotes });
  }

  // 2. Content & Pedagogical Slides
  slides.forEach((sl, idx) => {
    const s = prs.addSlide();
    const slideNum = idx + 2;
    addSlideCanvas(s, prs, th, { subject, gradeLevel, slideNum, totalSlides, schoolName });

    const layout = sl.layout || (sl.type === 'objectives' ? 'objectives' : sl.type === 'summary' ? 'summary' : sl.type === 'activity' ? 'activity' : 'visual');

    if (layout === 'objectives') {
      renderObjectivesSlide(s, prs, th, sl);
    } else if (layout === 'activity') {
      renderActivitySlide(s, prs, th, sl);
    } else if (layout === 'summary') {
      renderSummarySlide(s, prs, th, sl);
    } else if (layout === 'content') {
      renderContentSlide(s, prs, th, sl);
    } else {
      // Default to Visual Split Slide (High-impact visual card or concept framework)
      renderVisualSlide(s, prs, th, sl);
    }

    if (includeNotes && sl.notes) {
      s.addNotes(`Teacher Guide Script:\n${sl.notes}`);
    }
  });

  // 3. References Slide
  if (references.length) {
    const s = prs.addSlide();
    addSlideCanvas(s, prs, th, { subject, gradeLevel, slideNum: totalSlides - 1, totalSlides, schoolName });
    renderReferencesSlide(s, prs, th, references);
  }

  // 4. Closing Slide
  {
    const s = prs.addSlide();
    renderClosingSlide(s, prs, th, { title, subject, gradeLevel });
  }

  const safeName = (title || 'Presentation').replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_') || 'presentation';
  await prs.writeFile({ fileName: `${safeName}.pptx` });
}
