import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, HeightRule, VerticalAlign,
} from 'docx';

// ── Layout constants ──────────────────────────────────────────────────────────
// A4 portrait, 1-inch (25.4mm) margins → content = 159.2mm
const DXA = v => Math.round(v * 56.7);      // mm → DXA (1/1440 inch)
const PAGE_W = DXA(159.2);                   // content width
const MARGIN  = DXA(25.4);

// ── Primitive helpers ─────────────────────────────────────────────────────────
function run(text, { bold = false, italic = false, size = 22, color } = {}) {
  return new TextRun({
    text: String(text ?? ''), bold, italics: italic,
    size, font: 'Arial', color,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [run(children)],
    ...opts,
  });
}

function centered(children, opts = {}) {
  return para(
    Array.isArray(children) ? children : [run(children)],
    { alignment: AlignmentType.CENTER, ...opts },
  );
}

// ── Border presets ────────────────────────────────────────────────────────────
const BNone = { style: BorderStyle.NIL,    size: 0,  color: 'FFFFFF' };
const BThin = { style: BorderStyle.SINGLE, size: 4,  color: '999999' };
const BMed  = { style: BorderStyle.SINGLE, size: 10, color: '000000' };
const BAll  = { top: BThin, bottom: BThin, left: BThin, right: BThin };
const BNoneAll = { top: BNone, bottom: BNone, left: BNone, right: BNone };

// ── Page header ───────────────────────────────────────────────────────────────
function makeHeader(profile, lesson, gameLabel, answerKey = false) {
  const out = [];

  if (profile?.school) {
    out.push(centered([run(profile.school, { bold: true, size: 26 })]));
  }
  const nameDesig = [profile?.name, profile?.designation].filter(Boolean).join(' · ');
  if (nameDesig) out.push(centered([run(nameDesig, { size: 20 })]));

  const title = gameLabel.toUpperCase() + (answerKey ? ' — ANSWER KEY' : '');
  out.push(centered([run(title, { bold: true, size: 28 })], { spacing: { before: 80, after: 40 } }));

  const meta = [lesson?.subject, lesson?.gradeLevel, lesson?.lessonName || lesson?.title]
    .filter(Boolean).join(' | ');
  if (meta) out.push(centered([run(meta, { size: 20 })], { spacing: { after: 80 } }));

  if (!answerKey) {
    out.push(para(
      [run('Name: _______________________________   Section: _______________   Date: _______________   Score: ______', { size: 20 })],
      { spacing: { before: 120, after: 120 } },
    ));
  }

  // Divider line
  out.push(para([], {
    spacing: { before: 60, after: 220 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' } },
  }));

  return out;
}

// ── Answer key grid (5 answers per row) ──────────────────────────────────────
function answerGrid(answers) {
  const COLS = 5;
  const colW = Math.floor(PAGE_W / COLS);
  const rows = [];
  for (let r = 0; r < Math.ceil(answers.length / COLS); r++) {
    const cells = Array.from({ length: COLS }, (_, c) => {
      const i = r * COLS + c;
      return new TableCell({
        children: [para([run(i < answers.length ? answers[i] : '', { size: 22 })])],
        width: { size: colW, type: WidthType.DXA },
        borders: BNoneAll,
        margins: { left: DXA(3), right: DXA(3) },
      });
    });
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({ width: { size: PAGE_W, type: WidthType.DXA }, rows });
}

// ── Matching Type ─────────────────────────────────────────────────────────────
function matchingBlocks(data, profile, lesson, answerKey) {
  const { pairs, shuffledDefs } = data;
  const out = makeHeader(profile, lesson, 'Matching Type', answerKey);
  const half = Math.floor(PAGE_W / 2);

  if (!answerKey) {
    out.push(para(
      [run('Directions: Match Column A with Column B. Write the letter of the correct answer on the blank.', { italic: true, size: 20 })],
      { spacing: { after: 160 } },
    ));

    out.push(new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      rows: [
        // Column headers
        new TableRow({ children: [
          new TableCell({ children: [para([run('Column A', { bold: true, size: 22 })])], width: { size: half, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BMed, right: BThin }, margins: { left: DXA(3) } }),
          new TableCell({ children: [para([run('Column B', { bold: true, size: 22 })])], width: { size: half, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BMed, left: BThin }, margins: { left: DXA(3) } }),
        ] }),
        // Items
        ...pairs.map((p, i) => new TableRow({ children: [
          new TableCell({ children: [para([run(`___ ${i + 1}.  ${p.term}`, { size: 22 })], { spacing: { before: DXA(1.5), after: DXA(1.5) } })], width: { size: half, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BThin, right: BThin }, margins: { left: DXA(3), right: DXA(3) } }),
          new TableCell({ children: [para([run(`${String.fromCharCode(65 + i)}.  ${shuffledDefs[i].definition}`, { size: 22 })], { spacing: { before: DXA(1.5), after: DXA(1.5) } })], width: { size: half, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BThin, left: BThin }, margins: { left: DXA(3), right: DXA(3) } }),
        ] })),
      ],
    }));
  } else {
    out.push(para([run('Answer Key:', { bold: true, size: 22 })], { spacing: { after: 120 } }));
    const answers = pairs.map((p, i) => {
      const j = shuffledDefs.findIndex(d => d.definition === p.definition);
      return `${i + 1}. ${j >= 0 ? String.fromCharCode(65 + j) : '?'}`;
    });
    out.push(answerGrid(answers));
  }
  return out;
}

// ── Jumbled Letters ───────────────────────────────────────────────────────────
function jumbledBlocks(data, profile, lesson, answerKey) {
  const { items } = data;
  const out = makeHeader(profile, lesson, 'Jumbled Letters', answerKey);
  const colNum  = DXA(10);
  const colJum  = Math.floor(PAGE_W * 0.20);
  const colAns  = Math.floor(PAGE_W * 0.22);
  const colClue = PAGE_W - colNum - colJum - colAns;

  if (!answerKey) {
    out.push(para(
      [run('Directions: Unscramble the letters to form the correct vocabulary word. Use the clue to help you.', { italic: true, size: 20 })],
      { spacing: { after: 160 } },
    ));

    out.push(new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      rows: [
        // Header row
        new TableRow({ children: [
          new TableCell({ children: [centered([run('#', { bold: true, size: 20 })])], width: { size: colNum, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BMed, right: BThin }, margins: { left: DXA(2), right: DXA(2) } }),
          new TableCell({ children: [para([run('Jumbled', { bold: true, size: 20 })])], width: { size: colJum, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BMed, left: BThin, right: BThin }, margins: { left: DXA(2), right: DXA(2) } }),
          new TableCell({ children: [para([run('Answer', { bold: true, size: 20 })])], width: { size: colAns, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BMed, left: BThin, right: BThin }, margins: { left: DXA(2), right: DXA(2) } }),
          new TableCell({ children: [para([run('Clue', { bold: true, size: 20 })])], width: { size: colClue, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BMed, left: BThin }, margins: { left: DXA(2), right: DXA(2) } }),
        ] }),
        ...items.map((it, i) => new TableRow({ children: [
          new TableCell({ children: [centered([run(String(i + 1), { size: 22 })])], width: { size: colNum, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BThin, right: BThin }, margins: { left: DXA(2) } }),
          new TableCell({ children: [para([run(it.jumbled, { bold: true, size: 22, color: '1565c0' })])], width: { size: colJum, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BThin, left: BThin, right: BThin }, margins: { left: DXA(2), right: DXA(2) } }),
          new TableCell({ children: [para([run('_______________', { size: 22 })])], width: { size: colAns, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BThin, left: BThin, right: BThin }, margins: { left: DXA(2), right: DXA(2) } }),
          new TableCell({ children: [para([run(it.clue, { size: 20 })])], width: { size: colClue, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BThin, left: BThin }, margins: { left: DXA(2), right: DXA(2) } }),
        ] })),
      ],
    }));
  } else {
    out.push(para([run('Answer Key:', { bold: true, size: 22 })], { spacing: { after: 120 } }));
    out.push(answerGrid(items.map((it, i) => `${i + 1}. ${it.word}`)));
  }
  return out;
}

// ── True or False ─────────────────────────────────────────────────────────────
function trueFalseBlocks(data, profile, lesson, answerKey) {
  const { items } = data;
  const out = makeHeader(profile, lesson, 'True or False', answerKey);

  if (!answerKey) {
    out.push(para(
      [run('Directions: Write TRUE if the statement is correct and FALSE if it is not.', { italic: true, size: 20 })],
      { spacing: { after: 160 } },
    ));
    items.forEach((it, i) => {
      out.push(para(
        [run(`${i + 1}. _______________  `, { size: 22 }), run(it.statement, { size: 22 })],
        { spacing: { before: 0, after: 160 } },
      ));
    });
  } else {
    out.push(para([run('Answer Key:', { bold: true, size: 22 })], { spacing: { after: 120 } }));
    out.push(answerGrid(items.map((it, i) => `${i + 1}. ${it.answer ? 'TRUE' : 'FALSE'}`)));
  }
  return out;
}

// ── Crossword Puzzle ──────────────────────────────────────────────────────────
function crosswordBlocks(data, profile, lesson, answerKey) {
  const { pairs, layout } = data;
  const { cells, placed, SIZE } = layout;
  const out = makeHeader(profile, lesson, 'Crossword Puzzle', answerKey);

  const cellW = Math.floor(PAGE_W / SIZE);
  const cellH = DXA(7);   // ~7mm square cells

  // Build starting-cell number lookup
  const numAt = {};
  for (const pw of placed) numAt[`${pw.row},${pw.col}`] = pw.num;

  const rows = [];
  for (let r = 0; r < SIZE; r++) {
    const tCells = [];
    for (let c = 0; c < SIZE; c++) {
      const key  = `${r},${c}`;
      const letter = cells[key];
      if (!letter) {
        // Black cell
        tCells.push(new TableCell({
          children: [para([run('')])],
          shading: { type: ShadingType.SOLID, color: '000000' },
          borders: BNoneAll,
          width: { size: cellW, type: WidthType.DXA },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        }));
      } else {
        const num = numAt[key];
        tCells.push(new TableCell({
          children: [
            // Number label (tiny, top-left)
            para([run(num ? String(num) : '', { size: 12 })], { spacing: { before: 0, after: 0 } }),
            // Letter (for answer key) or blank
            centered([run(answerKey ? letter : '', { bold: true, size: 18 })]),
          ],
          verticalAlign: VerticalAlign.TOP,
          borders: BAll,
          width: { size: cellW, type: WidthType.DXA },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        }));
      }
    }
    rows.push(new TableRow({ children: tCells, height: { value: cellH, rule: HeightRule.EXACT } }));
  }

  out.push(new Table({ width: { size: PAGE_W, type: WidthType.DXA }, rows }));
  out.push(para([], { spacing: { before: 260, after: 120 } }));

  // Clue lists
  const across = placed.filter(p => p.dir === 'across').sort((a, b) => a.num - b.num);
  const down   = placed.filter(p => p.dir === 'down').sort((a, b) => a.num - b.num);

  out.push(para([run('ACROSS', { bold: true, size: 22 })], { spacing: { after: 80 } }));
  across.forEach(p => out.push(para([run(`${p.num}. ${p.clue}`, { size: 20 })], { spacing: { after: 60 } })));

  out.push(para([run('DOWN', { bold: true, size: 22 })], { spacing: { before: 140, after: 80 } }));
  down.forEach(p => out.push(para([run(`${p.num}. ${p.clue}`, { size: 20 })], { spacing: { after: 60 } })));

  return out;
}

// ── Word Hunt ─────────────────────────────────────────────────────────────────
function wordHuntBlocks(data, profile, lesson, answerKey) {
  const { words, wsGrid } = data;
  const { grid, SIZE } = wsGrid;
  const out = makeHeader(profile, lesson, 'Word Hunt', answerKey);

  if (!answerKey) {
    out.push(para(
      [run('Directions: Find and circle the hidden words in the letter grid. Words can go in any direction.', { italic: true, size: 20 })],
      { spacing: { after: 160 } },
    ));
  }

  const cellW = Math.floor(PAGE_W / SIZE);
  const cellH = DXA(9);

  const rows = [];
  for (let r = 0; r < SIZE; r++) {
    const tCells = grid[r].map(letter =>
      new TableCell({
        children: [centered([run(letter, { bold: true, size: 18 })])],
        verticalAlign: VerticalAlign.CENTER,
        borders: BAll,
        width: { size: cellW, type: WidthType.DXA },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      }),
    );
    rows.push(new TableRow({ children: tCells, height: { value: cellH, rule: HeightRule.EXACT } }));
  }

  out.push(new Table({ width: { size: PAGE_W, type: WidthType.DXA }, rows }));
  out.push(para([], { spacing: { before: 200, after: 120 } }));
  out.push(para([run('Words to Find:', { bold: true, size: 22 })], { spacing: { after: 100 } }));

  // Word list — 4 columns
  const WCOLS = 4;
  const wColW = Math.floor(PAGE_W / WCOLS);
  const wRows = [];
  for (let r = 0; r < Math.ceil(words.length / WCOLS); r++) {
    const cells = Array.from({ length: WCOLS }, (_, c) => {
      const i = r * WCOLS + c;
      const w = i < words.length ? words[i] : null;
      return new TableCell({
        children: [para([run(w ? `•  ${w.word}` : '', { size: 20 })])],
        width: { size: wColW, type: WidthType.DXA },
        borders: BNoneAll,
        margins: { left: DXA(2), right: DXA(2) },
      });
    });
    wRows.push(new TableRow({ children: cells }));
  }
  out.push(new Table({ width: { size: PAGE_W, type: WidthType.DXA }, rows: wRows }));

  if (answerKey) {
    out.push(para(
      [run('Note: All listed words are hidden in the grid above.', { italic: true, size: 20 })],
      { spacing: { before: 160 } },
    ));
  }

  return out;
}

// ── Fill in the Blanks ────────────────────────────────────────────────────────
function fillBlanksBlocks(data, profile, lesson, answerKey) {
  const { items } = data;
  const out = makeHeader(profile, lesson, 'Fill in the Blanks', answerKey);

  if (!answerKey) {
    out.push(para(
      [run('Directions: Choose the correct word from the choices to fill in the blank.', { italic: true, size: 20 })],
      { spacing: { after: 160 } },
    ));

    items.forEach((it, i) => {
      out.push(para([run(`${i + 1}.  ${it.sentence}`, { size: 22 })], { spacing: { before: 120, after: 60 } }));
      const choiceText = it.shuffledChoices
        .map((ch, ci) => `${String.fromCharCode(65 + ci)}. ${ch}`)
        .join('     ');
      out.push(para([run(choiceText, { size: 20, color: '374151' })], { spacing: { before: 0, after: 160 } }));
    });
  } else {
    out.push(para([run('Answer Key:', { bold: true, size: 22 })], { spacing: { after: 120 } }));
    const answers = items.map((it, i) => {
      const letter = String.fromCharCode(65 + it.shuffledChoices.indexOf(it.answer));
      return `${i + 1}. ${letter} (${it.answer})`;
    });
    out.push(answerGrid(answers));
  }
  return out;
}

// ── Builder map ───────────────────────────────────────────────────────────────
const LABELS = {
  matching:   'Matching Type',
  jumbled:    'Jumbled Letters',
  truefalse:  'True or False',
  crossword:  'Crossword Puzzle',
  wordhunt:   'Word Hunt',
  fillblanks: 'Fill in the Blanks',
};

function buildBlocks(gameData, profile, lesson, answerKey) {
  const { type } = gameData;
  if (type === 'matching')   return matchingBlocks(gameData, profile, lesson, answerKey);
  if (type === 'jumbled')    return jumbledBlocks(gameData, profile, lesson, answerKey);
  if (type === 'truefalse')  return trueFalseBlocks(gameData, profile, lesson, answerKey);
  if (type === 'crossword')  return crosswordBlocks(gameData, profile, lesson, answerKey);
  if (type === 'wordhunt')   return wordHuntBlocks(gameData, profile, lesson, answerKey);
  if (type === 'fillblanks') return fillBlanksBlocks(gameData, profile, lesson, answerKey);
  throw new Error(`Unknown game type: ${type}`);
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function downloadGameDocx({ gameData, lesson, inclKey, profile }) {
  const pageProps = {
    page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } },
  };

  const sections = [
    { properties: pageProps, children: buildBlocks(gameData, profile, lesson, false) },
  ];

  if (inclKey) {
    sections.push({
      properties: pageProps,
      children: buildBlocks(gameData, profile, lesson, true),
    });
  }

  const doc  = new Document({ sections });
  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const slug = (lesson?.lessonName || lesson?.title || 'game').replace(/[^a-zA-Z0-9]/g, '_');
  a.href     = url;
  a.download = `${slug}_${gameData.type}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
