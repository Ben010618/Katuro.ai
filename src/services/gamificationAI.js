import { getGeminiKey, geminiWithRetry } from './geminiConfig';
const GEMINI_MODEL = 'gemini-2.5-flash';

function buildCtx(lesson) {
  const grade      = lesson.gradeLevel || lesson.grade || '';
  const topic      = lesson.lessonName || lesson.title || lesson.topic || '';
  const competency = lesson.competencyText || lesson.melc || '';
  let objectives;

  if (lesson.type === 'dll') {
    // DLL stores objectives[] directly; contentList[] has per-day lesson content
    const dllObjs = (lesson.objectives || []).filter(Boolean).slice(0, 4).join('; ');
    const content  = (lesson.contentList || []).filter(Boolean).slice(0, 2).join('; ');
    objectives = [dllObjs, content].filter(Boolean).join(' | ');
  } else if (lesson.type === 'cot') {
    // COT stores the full plan text and MELC
    objectives = typeof lesson.plan === 'string'
      ? lesson.plan.substring(0, 500)
      : (lesson.melc || '');
  } else {
    // ILAW: sessions array, each has an objective field
    objectives = (lesson.sessions || []).slice(0, 4).map(s => s.objective).filter(Boolean).join('; ');
  }

  return `Subject: ${lesson.subject || ''} | Grade: ${grade} | Topic: ${topic}
Competency: ${competency}
Objectives: ${objectives || 'Not specified'}`;
}

async function callGemini(prompt) {
  const key = await getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const res = await geminiWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('');
  const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/s);
  if (!m) throw new Error('AI returned no valid JSON');
  return JSON.parse(m[1] ?? m[0]);
}

export async function genMatching(lesson, count = 10) {
  const data = await callGemini(
    `Generate ${count} term-definition pairs for a Filipino classroom Matching Type worksheet.\n${buildCtx(lesson)}\nReturn ONLY JSON: { "pairs": [{ "term": "...", "definition": "..." }] }`
  );
  return data.pairs || [];
}

export async function genJumbled(lesson, count = 10) {
  const data = await callGemini(
    `Generate ${count} vocabulary words for a Jumbled Letters worksheet.\n${buildCtx(lesson)}\nRules: word = ALL CAPS single word, min 4 letters. clue = 1 sentence (don't say the word).\nReturn ONLY JSON: { "items": [{ "word": "PHOTOSYNTHESIS", "clue": "..." }] }`
  );
  return data.items || [];
}

export async function genTrueFalse(lesson, count = 12) {
  const data = await callGemini(
    `Generate ${count} True/False statements for a Filipino classroom worksheet.\n${buildCtx(lesson)}\nMix ~50% true and ~50% false. Each = 1 clear sentence from lesson content.\nReturn ONLY JSON: { "items": [{ "statement": "...", "answer": true }] }`
  );
  return data.items || [];
}

export async function genCrossword(lesson, count = 12) {
  const data = await callGemini(
    `Generate ${count} word-clue pairs for a Crossword Puzzle.\n${buildCtx(lesson)}\nRules: word = single word ALL CAPS 3-14 letters. clue = concise definition. Mix short and long words.\nReturn ONLY JSON: { "pairs": [{ "word": "CHLOROPHYLL", "clue": "Green pigment in leaves" }] }`
  );
  return data.pairs || [];
}

export async function genWordHunt(lesson, count = 15) {
  const data = await callGemini(
    `Generate ${count} vocabulary words for a Word Hunt puzzle.\n${buildCtx(lesson)}\nRules: single word ALL CAPS 3-12 letters, no hyphens. Include short definition.\nReturn ONLY JSON: { "words": [{ "word": "MITOSIS", "definition": "Cell division process" }] }`
  );
  return data.words || [];
}

export async function genFillBlanks(lesson, count = 10) {
  const data = await callGemini(
    `Generate ${count} Fill-in-the-Blank items for a Filipino classroom worksheet.\n${buildCtx(lesson)}\nEach: 1 sentence with a key term replaced by _______. 4 choices (1 correct + 3 wrong). Vary blank position.\nReturn ONLY JSON: { "items": [{ "sentence": "Plants use _______ to make food.", "answer": "sunlight", "choices": ["sunlight","water","soil","air"] }] }`
  );
  return data.items || [];
}
