// Shared game worksheet components used by ILAW OutputPage and DLL OutputPage

export const GAME_TYPES = [
  { id: 'matching',   label: 'Matching Type',     desc: 'Match terms to definitions',          color: '#0284c7', bg: '#e0f2fe', defaultCount: 10 },
  { id: 'jumbled',    label: 'Jumbled Letters',    desc: 'Unscramble vocabulary words',         color: '#7c3aed', bg: '#ede9fe', defaultCount: 10 },
  { id: 'truefalse',  label: 'True or False',      desc: 'Comprehension check statements',      color: '#0d9488', bg: '#ccfbf1', defaultCount: 12 },
  { id: 'crossword',  label: 'Crossword Puzzle',   desc: 'Word puzzle with Across/Down clues',  color: '#b45309', bg: '#fef3c7', defaultCount: 12 },
  { id: 'wordhunt',   label: 'Word Hunt',          desc: 'Find hidden words in a letter grid',  color: '#15803d', bg: '#dcfce7', defaultCount: 15 },
  { id: 'fillblanks', label: 'Fill in the Blanks', desc: 'Complete sentences with choices',     color: '#be185d', bg: '#fce7f3', defaultCount: 10 },
];

export function gShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function gScramble(word) {
  const arr = word.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (arr.join('') === word && word.length > 1) [arr[0], arr[word.length - 1]] = [arr[word.length - 1], arr[0]];
  return arr.join('');
}

export function buildWordSearch(wordList, SIZE = 15) {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(''));
  const placed = [];
  const DIRS = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const item of wordList) {
    const w = (item.word || item).toUpperCase().replace(/[^A-Z]/g, '');
    if (!w || w.length > SIZE) continue;
    let ok = false;
    for (let attempt = 0; attempt < 200 && !ok; attempt++) {
      const [dr, dc] = DIRS[Math.floor(Math.random() * DIRS.length)];
      const r = Math.floor(Math.random() * SIZE);
      const c = Math.floor(Math.random() * SIZE);
      const eR = r + dr * (w.length - 1), eC = c + dc * (w.length - 1);
      if (eR < 0 || eR >= SIZE || eC < 0 || eC >= SIZE) continue;
      let valid = true;
      for (let i = 0; i < w.length; i++) {
        const ch = grid[r + dr * i][c + dc * i];
        if (ch && ch !== w[i]) { valid = false; break; }
      }
      if (valid) {
        for (let i = 0; i < w.length; i++) grid[r + dr * i][c + dc * i] = w[i];
        placed.push({ word: w, r, c, dr, dc });
        ok = true;
      }
    }
  }
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (!grid[r][c]) grid[r][c] = ALPHA[Math.floor(Math.random() * 26)];
  return { grid, placed, SIZE };
}

function cwCanPlace(cells, word, r, c, dir, SIZE) {
  for (let i = 0; i < word.length; i++) {
    const rr = dir === 'down' ? r + i : r;
    const cc = dir === 'across' ? c + i : c;
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) return false;
    const key = `${rr},${cc}`;
    if (cells[key] && cells[key] !== word[i]) return false;
  }
  return true;
}

export function buildCrossword(pairs) {
  const SIZE = 21;
  const cells = {};
  const placed = [];
  let n = 1;
  const words = [...pairs]
    .map(p => ({ ...p, word: String(p.word).toUpperCase().replace(/[^A-Z]/g, '') }))
    .filter(p => p.word.length >= 3)
    .sort((a, b) => b.word.length - a.word.length);
  if (!words.length) return { cells, placed, SIZE };
  const w0 = words[0];
  const r0 = Math.floor(SIZE / 2), c0 = Math.floor((SIZE - w0.word.length) / 2);
  for (let i = 0; i < w0.word.length; i++) cells[`${r0},${c0 + i}`] = w0.word[i];
  placed.push({ ...w0, row: r0, col: c0, dir: 'across', num: n++ });
  for (let wi = 1; wi < words.length; wi++) {
    const w = words[wi];
    let done = false;
    for (const pw of placed) {
      if (done) break;
      const nd = pw.dir === 'across' ? 'down' : 'across';
      for (let pi = 0; pi < pw.word.length && !done; pi++) {
        for (let wj = 0; wj < w.word.length && !done; wj++) {
          if (pw.word[pi] !== w.word[wj]) continue;
          const nr = pw.dir === 'across' ? pw.row - wj : pw.row + pi;
          const nc = pw.dir === 'across' ? pw.col + pi : pw.col - wj;
          if (cwCanPlace(cells, w.word, nr, nc, nd, SIZE)) {
            for (let i = 0; i < w.word.length; i++) {
              const r = nd === 'down' ? nr + i : nr;
              const c = nd === 'across' ? nc + i : nc;
              cells[`${r},${c}`] = w.word[i];
            }
            placed.push({ ...w, row: nr, col: nc, dir: nd, num: n++ });
            done = true;
          }
        }
      }
    }
  }
  return { cells, placed, SIZE };
}

function MatchingDisplay({ data }) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const { pairs, shuffledDefs } = data;
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Direction: Match Column A with Column B. Write the letter of the correct answer in the blank.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['No.', 'Column A', 'Ans.', 'Column B'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #0284c7', background: '#f0f9ff', fontSize: 11 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pairs.map((p, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '5px 8px', width: 28 }}>{i + 1}.</td>
              <td style={{ padding: '5px 8px' }}>{p.term}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center', width: 36, color: '#9ca3af', fontSize: 10 }}>___</td>
              <td style={{ padding: '5px 8px' }}>{i < (shuffledDefs || []).length ? `${letters[i]}. ${shuffledDefs[i].definition}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JumbledDisplay({ data }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Direction: Rearrange the scrambled letters to form the correct word based on the clue.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['No.', 'Scrambled Letters', 'Clue', 'Answer'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #7c3aed', background: '#f5f3ff', fontSize: 11 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '5px 8px', width: 28 }}>{i + 1}.</td>
              <td style={{ padding: '5px 8px', fontWeight: 800, letterSpacing: 3, fontSize: 13 }}>{item.jumbled}</td>
              <td style={{ padding: '5px 8px', fontStyle: 'italic', color: '#4b5563' }}>{item.clue}</td>
              <td style={{ padding: '5px 8px' }}><span style={{ display: 'inline-block', width: 110, borderBottom: '1px solid #999' }}></span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrueFalseDisplay({ data }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Direction: Write <strong>TRUE</strong> if the statement is correct and <strong>FALSE</strong> if it is not.</p>
      <ol style={{ paddingLeft: 18, margin: 0 }}>
        {data.items.map((item, i) => (
          <li key={i} style={{ marginBottom: 9, fontSize: 12, lineHeight: 1.6 }}>
            {item.statement}{' '}
            <span style={{ display: 'inline-block', width: 80, borderBottom: '1px solid #999', marginLeft: 6 }}></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CrosswordDisplay({ data }) {
  const { pairs, layout } = data;
  const across = layout?.placed?.filter(p => p.dir === 'across') || [];
  const down   = layout?.placed?.filter(p => p.dir === 'down')   || [];
  const SIZE   = layout?.SIZE || 21;
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Direction: Fill in the crossword puzzle using the clues provided.</p>
      {layout?.cells && (
        <div style={{ overflowX: 'auto', marginBottom: 14 }}>
          {Array.from({ length: SIZE }, (_, r) => (
            <div key={r} style={{ display: 'flex' }}>
              {Array.from({ length: SIZE }, (_, c) => {
                const cell = layout.cells[`${r},${c}`];
                const pw = layout.placed?.find(p => p.row === r && p.col === c);
                return (
                  <div key={c} style={{ width: 20, height: 20, border: cell ? '1px solid #9ca3af' : 'none', background: cell ? '#fff' : 'transparent', position: 'relative', boxSizing: 'border-box', flexShrink: 0 }}>
                    {pw && <span style={{ position: 'absolute', top: 1, left: 1, fontSize: 6, color: '#1d4ed8', lineHeight: 1, fontWeight: 700 }}>{pw.num}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#b45309', margin: '0 0 6px' }}>Across</p>
          {(across.length ? across : pairs.filter((_, i) => i % 2 === 0).map((p, i) => ({ num: i * 2 + 1, clue: p.clue }))).map((p, i) => (
            <div key={i} style={{ fontSize: 11, marginBottom: 4, display: 'flex', gap: 5 }}>
              <span style={{ fontWeight: 700, minWidth: 20 }}>{p.num}.</span>
              <span>{p.clue}</span>
            </div>
          ))}
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#b45309', margin: '0 0 6px' }}>Down</p>
          {(down.length ? down : pairs.filter((_, i) => i % 2 !== 0).map((p, i) => ({ num: i * 2 + 2, clue: p.clue }))).map((p, i) => (
            <div key={i} style={{ fontSize: 11, marginBottom: 4, display: 'flex', gap: 5 }}>
              <span style={{ fontWeight: 700, minWidth: 20 }}>{p.num}.</span>
              <span>{p.clue}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WordHuntDisplay({ data }) {
  const { words, wsGrid } = data;
  if (!wsGrid) return null;
  const { grid } = wsGrid;
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Direction: Find and circle the words hidden in the puzzle. Words may go in any direction.</p>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ overflowX: 'auto' }}>
          {grid.map((row, r) => (
            <div key={r} style={{ display: 'flex' }}>
              {row.map((cell, c) => (
                <div key={c} style={{ width: 19, height: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#1e3a8a', border: '0.5px solid #d1d5db', background: '#f8fafc', boxSizing: 'border-box' }}>
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', margin: '0 0 8px' }}>Find these words:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 14px' }}>
            {words.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#1e3a8a', fontWeight: 700 }}>□ {w.word}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FillBlanksDisplay({ data }) {
  const letters = ['A', 'B', 'C', 'D'];
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Direction: Choose the word that best completes each sentence. Write the letter of your answer in the blank.</p>
      <ol style={{ paddingLeft: 18, margin: 0 }}>
        {data.items.map((item, i) => (
          <li key={i} style={{ marginBottom: 11 }}>
            <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 3 }}>
              <span style={{ display: 'inline-block', width: 28, borderBottom: '1px solid #999', marginRight: 4, textAlign: 'center' }}></span>
              {item.sentence}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', paddingLeft: 6, fontSize: 11, color: '#374151' }}>
              {(item.shuffledChoices || item.choices || []).map((ch, j) => (
                <span key={j}>{letters[j]}. {ch}</span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GameWorksheetDisplay({ data, lesson, session }) {
  if (!data) return null;
  const topic = session?.keyContentFocus || lesson?.lessonName || '';
  const gameInfo = GAME_TYPES.find(g => g.id === data.type);
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#111', lineHeight: 1.7 }}>
      <div style={{ textAlign: 'center', marginBottom: 14, paddingBottom: 12, borderBottom: `2px solid ${gameInfo?.color || '#1d4ed8'}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#6b7280' }}>
          {lesson.subject} · {lesson.gradeLevel}
        </div>
        <h2 style={{ margin: '5px 0 2px', fontSize: 15, fontWeight: 800, color: gameInfo?.color || '#1e3a8a' }}>
          {gameInfo?.label || 'Game Worksheet'}
        </h2>
        {topic && <div style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>{topic}</div>}
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11 }}>
        <span>Name: <span style={{ display: 'inline-block', width: 140, borderBottom: '1px solid #999' }}></span></span>
        <span>Section: <span style={{ display: 'inline-block', width: 90, borderBottom: '1px solid #999' }}></span></span>
        <span>Score: ___/{ data.pairs?.length || data.items?.length || data.words?.length || '' }</span>
      </div>
      {data.type === 'matching'   && <MatchingDisplay   data={data} />}
      {data.type === 'jumbled'    && <JumbledDisplay    data={data} />}
      {data.type === 'truefalse'  && <TrueFalseDisplay  data={data} />}
      {data.type === 'crossword'  && <CrosswordDisplay  data={data} />}
      {data.type === 'wordhunt'   && <WordHuntDisplay   data={data} />}
      {data.type === 'fillblanks' && <FillBlanksDisplay data={data} />}
    </div>
  );
}
