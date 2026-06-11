import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLessonPlans } from '../hooks/useLessonPlans';
import { deductTokens } from '../services/db';
import { downloadGameDocx } from '../services/gamificationDocx';
import { useToast } from '../context/ToastContext';
import {
  genMatching, genJumbled, genTrueFalse,
  genCrossword, genWordHunt, genFillBlanks,
} from '../services/gamificationAI';
import {
  Gamepad2, Search, ChevronRight, Loader2, Download,
  RefreshCw, AlertCircle, CheckCircle, BookOpen, ArrowLeft,
} from 'lucide-react';

// ── helpers ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scramble(word) {
  const arr = word.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (arr.join('') === word && word.length > 1) [arr[0], arr[word.length - 1]] = [arr[word.length - 1], arr[0]];
  return arr.join('');
}

// ── Word Search grid builder ──────────────────────────────────────────────────
function buildWordSearch(wordList, SIZE = 15) {
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

// ── Crossword layout ──────────────────────────────────────────────────────────
function buildCrossword(pairs) {
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

function cwCanPlace(cells, word, row, col, dir, SIZE) {
  const isA = dir === 'across';
  const eR = isA ? row : row + word.length - 1;
  const eC = isA ? col + word.length - 1 : col;
  if (row < 1 || col < 1 || eR > SIZE - 2 || eC > SIZE - 2) return false;
  if (cells[`${isA ? row : row - 1},${isA ? col - 1 : col}`]) return false;
  if (cells[`${isA ? row : eR + 1},${isA ? eC + 1 : col}`]) return false;
  for (let i = 0; i < word.length; i++) {
    const r = isA ? row : row + i, c = isA ? col + i : col;
    const ex = cells[`${r},${c}`];
    if (ex) { if (ex !== word[i]) return false; }
    else {
      if (isA && (cells[`${r-1},${c}`] || cells[`${r+1},${c}`])) return false;
      if (!isA && (cells[`${r},${c-1}`] || cells[`${r},${c+1}`])) return false;
    }
  }
  return true;
}

// ── Shared worksheet header ───────────────────────────────────────────────────
function SheetHeader({ lesson, gameLabel, answerKey }) {
  const { profile } = useAuth();
  const school      = profile?.school      || localStorage.getItem('teacherSchool')      || '';
  const teacherName = profile?.name        || localStorage.getItem('teacherName')        || '';
  const designation = profile?.designation || localStorage.getItem('teacherDesignation') || '';
  return (
    <div style={{ borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 14 }}>
      {school && <p style={{ margin: 0, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{school}</p>}
      {(teacherName || designation) && (
        <p style={{ margin: 0, textAlign: 'center', fontSize: 11 }}>
          {[teacherName, designation].filter(Boolean).join(' · ')}
        </p>
      )}
      <p style={{ margin: '6px 0 2px', textAlign: 'center', fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {gameLabel}{answerKey ? ' — Answer Key' : ''}
      </p>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 11, color: '#333' }}>
        {[lesson.subject, lesson.gradeLevel, lesson.lessonName || lesson.title].filter(Boolean).join(' | ')}
      </p>
      {!answerKey && (
        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: 11, flex: 2 }}>Name: _____________________________</p>
          <p style={{ margin: 0, fontSize: 11, flex: 1 }}>Section: _______________</p>
          <p style={{ margin: 0, fontSize: 11, flex: 1 }}>Date: _______________</p>
          <p style={{ margin: 0, fontSize: 11, flex: 1, textAlign: 'right' }}>Score: ______</p>
        </div>
      )}
    </div>
  );
}

// ── MATCHING sheet ────────────────────────────────────────────────────────────
function MatchingSheet({ data, lesson, answerKey }) {
  const { pairs, shuffledDefs } = data;
  return (
    <div>
      <SheetHeader lesson={lesson} gameLabel="Matching Type" answerKey={answerKey} />
      {!answerKey ? (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontStyle: 'italic' }}>
            Directions: Match column A with column B. Write the letter of the correct answer on the blank.
          </p>
          <div style={{ display: 'flex', gap: 32 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700 }}>Column A</p>
              {pairs.map((p, i) => (
                <p key={i} style={{ margin: '0 0 10px', fontSize: 12 }}>
                  <strong>___</strong> {i + 1}. {p.term}
                </p>
              ))}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700 }}>Column B</p>
              {shuffledDefs.map((d, i) => (
                <p key={i} style={{ margin: '0 0 10px', fontSize: 12 }}>
                  {String.fromCharCode(65 + i)}. {d.definition}
                </p>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700 }}>Answer Key</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {pairs.map((p, i) => {
              const letter = String.fromCharCode(65 + shuffledDefs.findIndex(d => d.definition === p.definition));
              return (
                <p key={i} style={{ margin: 0, fontSize: 12, fontFamily: 'monospace' }}>
                  {i + 1}. <strong>{letter}</strong>
                </p>
              );
            })}
          </div>
          <div style={{ marginTop: 14 }}>
            {pairs.map((p, i) => (
              <p key={i} style={{ margin: '0 0 4px', fontSize: 11 }}>
                {String.fromCharCode(65 + shuffledDefs.findIndex(d => d.definition === p.definition))}. {p.definition} → <em>{p.term}</em>
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── JUMBLED LETTERS sheet ─────────────────────────────────────────────────────
function JumbledSheet({ data, lesson, answerKey }) {
  const { items } = data;
  return (
    <div>
      <SheetHeader lesson={lesson} gameLabel="Jumbled Letters" answerKey={answerKey} />
      {!answerKey ? (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontStyle: 'italic' }}>
            Directions: Rearrange the jumbled letters to form the correct word based on the clue.
          </p>
          {items.map((item, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <p style={{ margin: '0 0 2px', fontSize: 12 }}>
                {i + 1}. <span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 3, fontSize: 14, color: '#1a3d2b' }}>{item.jumbled}</span>
              </p>
              <p style={{ margin: '0 0 2px', fontSize: 11, color: '#333', paddingLeft: 16 }}>Clue: {item.clue}</p>
              <p style={{ margin: 0, fontSize: 11, paddingLeft: 16 }}>Answer: _______________________</p>
            </div>
          ))}
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700 }}>Answer Key</p>
          {items.map((item, i) => (
            <p key={i} style={{ margin: '0 0 6px', fontSize: 12 }}>
              {i + 1}. <span style={{ fontFamily: 'monospace', letterSpacing: 2 }}>{item.jumbled}</span> → <strong>{item.word}</strong>
            </p>
          ))}
        </>
      )}
    </div>
  );
}

// ── TRUE OR FALSE sheet ───────────────────────────────────────────────────────
function TrueFalseSheet({ data, lesson, answerKey }) {
  const { items } = data;
  return (
    <div>
      <SheetHeader lesson={lesson} gameLabel="True or False" answerKey={answerKey} />
      {!answerKey ? (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontStyle: 'italic' }}>
            Directions: Write TRUE if the statement is correct and FALSE if it is not.
          </p>
          {items.map((item, i) => (
            <p key={i} style={{ margin: '0 0 10px', fontSize: 12 }}>
              <strong>____________</strong> {i + 1}. {item.statement}
            </p>
          ))}
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700 }}>Answer Key</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
            {items.map((item, i) => (
              <p key={i} style={{ margin: 0, fontSize: 12 }}>
                {i + 1}. <strong style={{ color: item.answer ? '#166534' : '#991b1b' }}>{item.answer ? 'TRUE' : 'FALSE'}</strong>
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── CROSSWORD sheet ───────────────────────────────────────────────────────────
function CrosswordSheet({ data, lesson, answerKey }) {
  const { pairs, layout } = data;
  const { cells, placed } = layout;
  const keys = Object.keys(cells);
  if (!keys.length) return <p>Could not generate crossword grid.</p>;
  const rs = keys.map(k => +k.split(',')[0]), cs = keys.map(k => +k.split(',')[1]);
  const minR = Math.min(...rs) - 1, maxR = Math.max(...rs) + 1;
  const minC = Math.min(...cs) - 1, maxC = Math.max(...cs) + 1;
  const numC = maxC - minC + 1, numR = maxR - minR + 1;
  const cellPx = Math.min(30, Math.floor(630 / Math.max(numC, numR)));
  const across = placed.filter(p => p.dir === 'across').sort((a, b) => a.num - b.num);
  const down   = placed.filter(p => p.dir === 'down').sort((a, b) => a.num - b.num);
  return (
    <div>
      <SheetHeader lesson={lesson} gameLabel="Crossword Puzzle" answerKey={answerKey} />
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Grid */}
        <div style={{ lineHeight: 0, border: '2px solid #000', flexShrink: 0 }}>
          {Array.from({ length: numR }, (_, ri) => (
            <div key={ri} style={{ display: 'flex' }}>
              {Array.from({ length: numC }, (_, ci) => {
                const r = minR + ri, c = minC + ci;
                const letter = cells[`${r},${c}`];
                const ws = placed.find(p => p.row === r && p.col === c);
                return (
                  <div key={ci} style={{
                    width: cellPx, height: cellPx, flexShrink: 0,
                    border: letter ? '1px solid #555' : 'none',
                    background: letter ? '#fff' : '#1a1a1a',
                    position: 'relative',
                  }}>
                    {ws && <span style={{ position: 'absolute', top: 1, left: 2, fontSize: Math.max(6, cellPx * 0.28), lineHeight: 1, fontFamily: 'Arial', fontWeight: 600 }}>{ws.num}</span>}
                    {answerKey && letter && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(9, cellPx * 0.52), fontFamily: 'Arial', fontWeight: 700 }}>{letter}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {/* Clues */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700 }}>ACROSS</p>
          {across.map(p => <p key={p.num} style={{ margin: '0 0 4px', fontSize: 10, lineHeight: 1.4 }}><strong>{p.num}.</strong> {p.clue}</p>)}
          <p style={{ margin: '10px 0 5px', fontSize: 11, fontWeight: 700 }}>DOWN</p>
          {down.map(p => <p key={p.num} style={{ margin: '0 0 4px', fontSize: 10, lineHeight: 1.4 }}><strong>{p.num}.</strong> {p.clue}</p>)}
        </div>
      </div>
    </div>
  );
}

// ── WORD HUNT sheet ───────────────────────────────────────────────────────────
function WordHuntSheet({ data, lesson, answerKey }) {
  const { words, wsGrid } = data;
  const { grid, placed, SIZE } = wsGrid;
  const cellPx = Math.min(32, Math.floor(580 / SIZE));
  return (
    <div>
      <SheetHeader lesson={lesson} gameLabel="Word Hunt" answerKey={answerKey} />
      <p style={{ margin: '0 0 8px', fontSize: 11, fontStyle: 'italic' }}>
        Directions: Find the hidden words in the grid. Words can go horizontal, vertical, or diagonal.
      </p>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        {/* Grid */}
        <div style={{ lineHeight: 0, border: '1px solid #888', flexShrink: 0 }}>
          {grid.map((row, ri) => (
            <div key={ri} style={{ display: 'flex' }}>
              {row.map((letter, ci) => {
                const isFound = answerKey && placed.some(p => {
                  for (let i = 0; i < p.word.length; i++)
                    if (p.r + p.dr * i === ri && p.c + p.dc * i === ci) return true;
                  return false;
                });
                return (
                  <div key={ci} style={{
                    width: cellPx, height: cellPx, flexShrink: 0,
                    border: '1px solid #ddd',
                    background: isFound ? '#bbf7d0' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: Math.max(8, cellPx * 0.5), fontFamily: 'Courier, monospace', fontWeight: 700,
                  }}>{letter}</div>
                );
              })}
            </div>
          ))}
        </div>
        {/* Word list */}
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700 }}>Find these words:</p>
          {words.map((w, i) => (
            <p key={i} style={{ margin: '0 0 5px', fontSize: 11, fontFamily: 'Courier, monospace' }}>
              {answerKey ? '✓' : '☐'} {w.word}
              {w.definition && <span style={{ fontFamily: 'Arial, sans-serif', fontSize: 10, color: '#555' }}> — {w.definition}</span>}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── FILL IN THE BLANKS sheet ──────────────────────────────────────────────────
function FillBlanksSheet({ data, lesson, answerKey }) {
  const { items } = data;
  return (
    <div>
      <SheetHeader lesson={lesson} gameLabel="Fill in the Blanks" answerKey={answerKey} />
      {!answerKey ? (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontStyle: 'italic' }}>
            Directions: Choose the word from the choices that best completes each sentence. Write the letter on the blank.
          </p>
          {items.map((item, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <p style={{ margin: '0 0 3px', fontSize: 12 }}><strong>___</strong> {i + 1}. {item.sentence}</p>
              <p style={{ margin: 0, fontSize: 11, paddingLeft: 18, color: '#333' }}>
                {item.shuffledChoices.map((ch, j) => `${String.fromCharCode(65+j)}. ${ch}`).join('    ')}
              </p>
            </div>
          ))}
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700 }}>Answer Key</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12 }}>
            {items.map((item, i) => {
              const letter = String.fromCharCode(65 + item.shuffledChoices.indexOf(item.answer));
              return <p key={i} style={{ margin: 0, fontSize: 12 }}>{i + 1}. <strong>{letter} ({item.answer})</strong></p>;
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── GAME CONFIG ───────────────────────────────────────────────────────────────
const GAMES = [
  { id: 'matching',   label: 'Matching Type',      desc: 'Match terms to definitions',          color: '#0284c7', bg: '#e0f2fe', defaultCount: 10 },
  { id: 'jumbled',    label: 'Jumbled Letters',     desc: 'Unscramble vocabulary words',         color: '#7c3aed', bg: '#ede9fe', defaultCount: 10 },
  { id: 'truefalse',  label: 'True or False',       desc: 'Comprehension check statements',      color: '#0d9488', bg: '#ccfbf1', defaultCount: 12 },
  { id: 'crossword',  label: 'Crossword Puzzle',    desc: 'Word puzzle with Across/Down clues',  color: '#b45309', bg: '#fef3c7', defaultCount: 12 },
  { id: 'wordhunt',   label: 'Word Hunt',           desc: 'Find hidden words in a letter grid',  color: '#15803d', bg: '#dcfce7', defaultCount: 15 },
  { id: 'fillblanks', label: 'Fill in the Blanks',  desc: 'Complete sentences with choices',     color: '#be185d', bg: '#fce7f3', defaultCount: 10 },
];

const GAME_MAP = Object.fromEntries(GAMES.map(g => [g.id, g]));

function sheetComponent(type, data, lesson, answerKey) {
  const props = { data, lesson, answerKey };
  if (type === 'matching')   return <MatchingSheet   {...props} />;
  if (type === 'jumbled')    return <JumbledSheet    {...props} />;
  if (type === 'truefalse')  return <TrueFalseSheet  {...props} />;
  if (type === 'crossword')  return <CrosswordSheet  {...props} />;
  if (type === 'wordhunt')   return <WordHuntSheet   {...props} />;
  if (type === 'fillblanks') return <FillBlanksSheet {...props} />;
  return null;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GamificationPage() {
  const { user, profile } = useAuth();
  const { addToast } = useToast();
  const { lessonPlans, loading: plansLoading } = useLessonPlans(user?.uid);

  const [step,        setStep]        = useState('pick');    // pick | config | result
  const [lesson,      setLesson]      = useState(null);
  const [gameType,    setGameType]    = useState('matching');
  const [count,       setCount]       = useState(10);
  const [inclKey,     setInclKey]     = useState(true);
  const [generating,  setGenerating]  = useState(false);
  const [gameData,    setGameData]    = useState(null);
  const [genError,    setGenError]    = useState('');
  const [downloading, setDownloading] = useState(false);
  const [search,      setSearch]      = useState('');

  const activePlans = useMemo(
    () => lessonPlans.filter(l => l.status !== 'archived'),
    [lessonPlans]
  );
  const filtered = useMemo(() => {
    if (!search.trim()) return activePlans;
    const s = search.toLowerCase();
    return activePlans.filter(l =>
      (l.lessonName || l.title || '').toLowerCase().includes(s) ||
      (l.subject || '').toLowerCase().includes(s) ||
      (l.gradeLevel || '').toLowerCase().includes(s)
    );
  }, [activePlans, search]);

  function selectLesson(plan) {
    setLesson(plan);
    setCount(GAME_MAP[gameType].defaultCount);
    setStep('config');
  }

  function reset() {
    setStep('pick'); setLesson(null); setGameData(null); setGenError('');
  }

  async function handleGenerate() {
    setGenerating(true); setGenError('');
    try {
      await deductTokens(user.uid, 'gamification', 0.5);
    } catch (err) {
      setGenError(err.message); setGenerating(false); return;
    }
    try {
      let data;
      if (gameType === 'matching') {
        const pairs = await genMatching(lesson, count);
        const shuffledDefs = shuffle(pairs.map(p => ({ definition: p.definition })));
        data = { type: 'matching', pairs, shuffledDefs };
      } else if (gameType === 'jumbled') {
        const raw = await genJumbled(lesson, count);
        const items = raw.map(r => ({ ...r, jumbled: scramble(r.word) }));
        data = { type: 'jumbled', items };
      } else if (gameType === 'truefalse') {
        const items = await genTrueFalse(lesson, count);
        data = { type: 'truefalse', items };
      } else if (gameType === 'crossword') {
        const pairs = await genCrossword(lesson, count);
        const layout = buildCrossword(pairs);
        data = { type: 'crossword', pairs, layout };
      } else if (gameType === 'wordhunt') {
        const words = await genWordHunt(lesson, count);
        const wsGrid = buildWordSearch(words);
        data = { type: 'wordhunt', words, wsGrid };
      } else if (gameType === 'fillblanks') {
        const raw = await genFillBlanks(lesson, count);
        const items = raw.map(r => ({ ...r, shuffledChoices: shuffle(r.choices) }));
        data = { type: 'fillblanks', items };
      }
      setGameData(data);
      setStep('result');
    } catch (err) {
      setGenError(err.message || 'Generation failed. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadGameDocx({ gameData, lesson, inclKey, profile });
      addToast('Word document downloaded!', 'success');
    } catch (err) {
      addToast('Download failed: ' + err.message, 'error');
    } finally {
      setDownloading(false);
    }
  }, [gameData, inclKey, lesson, profile, addToast]);

  const gameInfo = GAME_MAP[gameType];

  // ── Step: Pick Lesson ──────────────────────────────────────────────────────
  if (step === 'pick') return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <span style={{ background: 'rgba(45,106,79,0.1)', color: '#2d6a4f', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
          Intervention Games
        </span>
        <h2 style={{ margin: '10px 0 4px', fontSize: 22, fontWeight: 700, color: '#0d2218' }}>Select a Lesson Plan</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#4a6357' }}>AI will generate a game worksheet based on your lesson's vocabulary and objectives.</p>
      </div>

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={15} color="#4a6357" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search lessons…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 36px', border: '1.5px solid rgba(45,106,79,0.2)', borderRadius: 9, fontSize: 13, background: '#fff', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>

      {plansLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 30, color: '#4a6357' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13 }}>Loading lessons…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: '#4a6357' }}>
          <BookOpen size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
          <p style={{ margin: 0, fontWeight: 600 }}>No lesson plans found</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.7 }}>Create a lesson plan in Lesson Gen first.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(plan => (
            <button key={plan.id} onClick={() => selectLesson(plan)} style={{
              background: '#fff', border: '1px solid rgba(45,106,79,0.15)', borderRadius: 12,
              padding: '14px 18px', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: 'inherit', transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2d6a4f'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(45,106,79,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.15)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div>
                <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: '#0d2218' }}>{plan.lessonName || plan.title || 'Untitled'}</p>
                <p style={{ margin: 0, fontSize: 11, color: '#4a6357' }}>{[plan.subject, plan.gradeLevel, plan.term, plan.weekNumber].filter(Boolean).join(' · ')}</p>
              </div>
              <ChevronRight size={16} color="#4a6357" style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Step: Configure ────────────────────────────────────────────────────────
  if (step === 'config') return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a6357', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, padding: '0 0 16px', fontFamily: 'inherit' }}>
        <ArrowLeft size={15} /> Back to lessons
      </button>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(45,106,79,0.12)', padding: '14px 18px', marginBottom: 20 }}>
        <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#0d2218' }}>{lesson.lessonName || lesson.title}</p>
        <p style={{ margin: 0, fontSize: 11, color: '#4a6357' }}>{[lesson.subject, lesson.gradeLevel].filter(Boolean).join(' · ')}</p>
      </div>

      <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0d2218' }}>Choose Game Type</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
        {GAMES.map(g => (
          <button key={g.id} onClick={() => { setGameType(g.id); setCount(g.defaultCount); }} style={{
            background: gameType === g.id ? g.bg : '#fff',
            border: `2px solid ${gameType === g.id ? g.color : 'rgba(45,106,79,0.12)'}`,
            borderRadius: 12, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}>
            <p style={{ margin: '0 0 3px', fontSize: 12, fontWeight: 700, color: gameType === g.id ? g.color : '#0d2218' }}>{g.label}</p>
            <p style={{ margin: 0, fontSize: 10, color: '#4a6357', lineHeight: 1.4 }}>{g.desc}</p>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(45,106,79,0.12)', padding: '16px 18px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Number of Items</label>
          <input type="number" min={4} max={20} value={count} onChange={e => setCount(+e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1.5px solid rgba(45,106,79,0.2)', borderRadius: 8, fontSize: 15, fontFamily: 'monospace', fontWeight: 700, outline: 'none' }} />
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(45,106,79,0.12)', padding: '16px 18px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Answer Key</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={inclKey} onChange={e => setInclKey(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#2d6a4f' }} />
            <span style={{ fontSize: 13, color: '#0d2218', fontWeight: 600 }}>Include answer key page</span>
          </label>
        </div>
      </div>

      {genError && (
        <div style={{ display: 'flex', gap: 8, background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <AlertCircle size={15} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13, color: '#c0392b', fontWeight: 600 }}>{genError}</p>
        </div>
      )}

      <button onClick={handleGenerate} disabled={generating} style={{
        width: '100%', background: generating ? '#4a6357' : '#2d6a4f', color: '#fff',
        border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700,
        cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        {generating
          ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Generating game… (0.5 tokens)</>
          : <><Gamepad2 size={18} /> Generate {gameInfo.label} (0.5 tokens)</>
        }
      </button>
    </div>
  );

  // ── Step: Result ───────────────────────────────────────────────────────────
  const sheetStyle = {
    width: 750, background: '#fff', padding: '40px 50px', boxSizing: 'border-box',
    fontFamily: 'Arial, Helvetica, sans-serif', color: '#000',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', align: 'center', gap: 10 }}>
          <button onClick={() => setStep('config')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a6357', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
            <ArrowLeft size={15} /> Back
          </button>
          <span style={{ margin: '0 6px', color: 'rgba(45,106,79,0.3)' }}>|</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0d2218' }}>{gameInfo.label}</span>
          <span style={{ fontSize: 12, color: '#4a6357' }}>· {lesson?.lessonName || lesson?.title}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setStep('config')} style={{ background: '#f5faf7', color: '#1a3d2b', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <RefreshCw size={13} /> Regenerate
          </button>
          <button onClick={handleDownload} disabled={downloading} style={{ background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: downloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: downloading ? 0.7 : 1 }}>
            {downloading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
            {downloading ? 'Preparing DOCX…' : 'Download DOCX'}
          </button>
        </div>
      </div>

      {/* Game sheet — student version */}
      <div style={{ background: '#f5faf7', borderRadius: 14, padding: 16, marginBottom: inclKey ? 16 : 0 }}>
        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Game Sheet (Student)
        </p>
        <div style={{ overflowX: 'auto' }}>
          <div style={sheetStyle}>
            {sheetComponent(gameData.type, gameData, lesson, false)}
          </div>
        </div>
      </div>

      {/* Answer key */}
      {inclKey && (
        <div style={{ background: '#f5faf7', borderRadius: 14, padding: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Answer Key
          </p>
          <div style={{ overflowX: 'auto' }}>
            <div style={sheetStyle}>
              {sheetComponent(gameData.type, gameData, lesson, true)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
