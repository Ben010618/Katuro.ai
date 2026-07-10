// Gemini vision — reads a photographed/scanned bubble answer sheet and
// returns the marked answers as structured JSON. Mirrors the vision call
// pattern already proven in lessonGenAI.js's prepareFileContent().

import { getGeminiKey, geminiWithRetry } from './geminiConfig';
import { parseAIJson } from './aiJsonParse';

const GEMINI_MODEL = 'gemini-2.5-flash';
const NO_THINKING  = { thinkingConfig: { thinkingBudget: 0 } };

function geminiUrl(key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const LETTERS = { 4: 'A, B, C, D', 5: 'A, B, C, D, E' };

/**
 * Reads one photographed answer sheet and extracts the marked bubbles.
 * @param {File} imageFile - a photo/scan of a single filled BubbleSheetPrint sheet
 * @param {{ numQuestions: number, numChoices: number }} config
 * @returns {Promise<{ studentNo: string, section: string, answers: Record<string,string|null>, uncertain: string[] }>}
 */
export async function scanAnswerSheet(imageFile, { numQuestions, numChoices }) {
  const letters = LETTERS[numChoices] || LETTERS[4];

  const prompt = `You are reading a photo of a shaded bubble answer sheet (OMR format).

The sheet has:
- A "STUDENT NO." bubble grid (4 digit columns, rows 0-5)
- A "SECTION" bubble grid (3 digit columns, rows 0-5)
- ${numQuestions} answer rows, each with bubbles for choices ${letters}

For each answer row, determine which single bubble (if any) is clearly shaded darker than the others. If a row has no clearly shaded bubble, or two bubbles are shaded about equally, mark it as uncertain instead of guessing.

Return ONLY valid JSON, no markdown, no explanation:
{
  "studentNo": "digits read from the STUDENT NO. grid, or empty string if unclear",
  "section": "digits read from the SECTION grid, or empty string if unclear",
  "answers": { "1": "A", "2": "C", "3": null, ... up to "${numQuestions}" },
  "uncertain": ["3", "7"]
}`;

  const b64 = await fileToBase64(imageFile);
  const key = await getGeminiKey();

  const res = await geminiWithRetry(geminiUrl(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: imageFile.type, data: b64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048, ...NO_THINKING },
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const err = new Error(`Gemini error: ${res.status} — ${errData?.error?.message || res.statusText}`);
    err.status = res.status;
    err.reason = 'api_error';
    throw err;
  }

  const data       = await res.json();
  const candidate  = data.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const rawText    = candidate?.content?.parts?.[0]?.text?.trim();

  if (!rawText) {
    const err = new Error('Empty response from AI while reading the answer sheet.');
    err.reason = finishReason === 'SAFETY' ? 'safety_block' : 'empty_response';
    throw err;
  }

  let parsed;
  try {
    parsed = parseAIJson(rawText);
  } catch (e) {
    const err = new Error('AI could not read this answer sheet — the photo may be blurry or misaligned.', { cause: e });
    err.reason = finishReason === 'MAX_TOKENS' ? 'truncated' : 'invalid_json';
    throw err;
  }

  return {
    studentNo: parsed.studentNo || '',
    section:   parsed.section   || '',
    answers:   parsed.answers   || {},
    uncertain: Array.isArray(parsed.uncertain) ? parsed.uncertain : [],
  };
}
