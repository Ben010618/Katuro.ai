import { callGeminiProxy } from './geminiConfig';
import { parseAIJson } from './aiJsonParse';

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
  const { text } = await callGeminiProxy({
    action: 'gamification_gen',
    contents: [{ parts: [{ text: prompt }] }],
    temperature: 0.7,
    maxTokens: 4096,
    responseMimeType: 'application/json',
  });
  return parseAIJson(text);
}

export async function genMatching(lesson, count = 10) {
  const data = await callGemini(
    `Generate ${count} term-definition pairs for a Filipino classroom Matching Type worksheet.\n${buildCtx(lesson)}\nReturn ONLY JSON: { "pairs": [{ "term": "...", "definition": "..." }] }`
  );
  if (Array.isArray(data)) return data;
  return data?.pairs || data?.items || [];
}

export async function genJumbled(lesson, count = 10) {
  const data = await callGemini(
    `Generate ${count} vocabulary words for a Jumbled Letters worksheet.\n${buildCtx(lesson)}\nRules: word = ALL CAPS single word, min 4 letters. clue = 1 sentence (don't say the word).\nReturn ONLY JSON: { "items": [{ "word": "PHOTOSYNTHESIS", "clue": "..." }] }`
  );
  if (Array.isArray(data)) return data;
  return data?.items || data?.words || [];
}

export async function genTrueFalse(lesson, count = 12) {
  const data = await callGemini(
    `Generate ${count} True/False statements for a Filipino classroom worksheet.\n${buildCtx(lesson)}\nMix ~50% true and ~50% false. Each = 1 clear sentence from lesson content.\nReturn ONLY JSON: { "items": [{ "statement": "...", "answer": true }] }`
  );
  if (Array.isArray(data)) return data;
  return data?.items || data?.statements || [];
}

export async function genCrossword(lesson, count = 12) {
  const data = await callGemini(
    `Generate ${count} word-clue pairs for a Crossword Puzzle.\n${buildCtx(lesson)}\nRules: word = single word ALL CAPS 3-14 letters. clue = concise definition. Mix short and long words.\nReturn ONLY JSON: { "pairs": [{ "word": "CHLOROPHYLL", "clue": "Green pigment in leaves" }] }`
  );
  if (Array.isArray(data)) return data;
  return data?.pairs || data?.items || [];
}

export async function genWordHunt(lesson, count = 15) {
  const data = await callGemini(
    `Generate ${count} vocabulary words for a Word Hunt puzzle.\n${buildCtx(lesson)}\nRules: single word ALL CAPS 3-12 letters, no hyphens. Include short definition.\nReturn ONLY JSON: { "words": [{ "word": "MITOSIS", "definition": "Cell division process" }] }`
  );
  if (Array.isArray(data)) return data;
  return data?.words || data?.items || [];
}

export async function genFillBlanks(lesson, count = 10) {
  const data = await callGemini(
    `Generate ${count} Fill-in-the-Blank items for a Filipino classroom worksheet.\n${buildCtx(lesson)}\nEach: 1 sentence with a key term replaced by _______. 4 choices (1 correct + 3 wrong). Vary blank position.\nReturn ONLY JSON: { "items": [{ "sentence": "Plants use _______ to make food.", "answer": "sunlight", "choices": ["sunlight","water","soil","air"] }] }`
  );
  if (Array.isArray(data)) return data;
  return data?.items || [];
}
