// Gemini vision — reads a photographed/scanned bubble answer sheet and
// returns the marked answers as structured JSON. Mirrors the vision call
// pattern already proven in lessonGenAI.js's prepareFileContent().

import { callGeminiProxy } from './geminiConfig';
import { parseAIJson } from './aiJsonParse';

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
export async function scanAnswerSheet(imageFile, { numQuestions, numChoices, isRetry }) {
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

  let text, finishReason;
  try {
    ({ text, finishReason } = await callGeminiProxy({
      action: 'scan_answer_sheet',
      contents: [{
        parts: [
          { inlineData: { mimeType: imageFile.type, data: b64 } },
          { text: prompt },
        ],
      }],
      temperature: 0.1,
      maxTokens: 2048,
      responseMimeType: 'application/json',
      isRetry,
    }));
  } catch (err) {
    if (!err.reason && err.status !== 429) err.reason = 'api_error';
    throw err;
  }

  const rawText = text?.trim();

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
