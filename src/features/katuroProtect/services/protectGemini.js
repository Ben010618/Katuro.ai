// Gemini calls for kaTuro Protect chat. Grounded in BrainBank Layer 1 only —
// Layer 2 (verbatim law/DepEd-order text) hasn't been ingested yet (empty
// katuroProtect/corpus/). Per the BrainBank's own Part O1 readiness gate #1
// ("No deployment on Layer 1 alone") this is deliberately NOT presented as
// production-ready legal guidance: the system prompt below biases every
// sanction/deadline/penalty question toward the Tier 2 "OUTSIDE KNOWLEDGE
// BASE" fallback, and only routing/procedural questions (which Part K's
// Next-Move Engine already encodes as DepEd procedure, not a legal citation)
// get confident answers.
//
// The BrainBank markdown (~55KB) is small enough to inject wholesale as
// context instead of building real chunked retrieval — a deliberate
// simplification for a Layer-1-only, low-volume, admin-only chat. Real RAG
// (Firestore vector search over chunked Layer 1 + Layer 2) is Phase 3 once
// the corpus exists.
import brainBankText from './brainBankSource';
import { callGeminiProxy } from '../../../services/geminiConfig';

function extractPartH(fullText) {
  const start = fullText.indexOf('## PART H');
  const end = fullText.indexOf('## PART I', start);
  const section = start === -1 ? '' : fullText.slice(start, end === -1 ? undefined : end);
  const codeBlock = section.match(/```\n([\s\S]*?)\n```/);
  return codeBlock ? codeBlock[1].trim() : section.trim();
}

const PART_H_SYSTEM_PROMPT = extractPartH(brainBankText);

const CORPUS_STATE_NOTE = `
IMPORTANT — CURRENT CORPUS STATE:
Only BrainBank Layer 1 (summaries, routing logic, procedures, form schemas, the Part K
Next-Move Engine) is loaded right now. Layer 2 (verbatim RA/DepEd-order text) has NOT been
ingested yet. Because of this:
- You may confidently answer ROUTING and PROCEDURAL questions (which law/office likely
  applies, what the next procedural step is, who to talk to).
- You must treat ANY question asking for sanction ranges, penalty amounts, fines, exact
  day-count deadlines, or a verbatim quote as Tier 2 by default: open with
  "⚠️ OUTSIDE KNOWLEDGE BASE — VERIFY BEFORE ACTING", still name the specific law/issuance,
  NEVER state a specific range/amount/deadline as if quoted from the text, and close with
  "Please verify with your Division Legal Officer or the LRPO before acting on this."
- Never fabricate a section number or quote. If you are not certain a section says what
  you're about to claim, say so and route to Tier 2/3 instead.

CITATION FORMAT — follow this EXACTLY, every time you reference the knowledge base, so the
app can verify your citation against the real text and show it to the user:
- For a lettered sub-section (the "### X1." headings, e.g. "### A1. RA 7610..."), cite as
  [BrainBank A1] — just the code in brackets, no extra words, no "Part" prefix.
- For a whole top-level Part with no sub-heading (e.g. "## PART D"), cite as [BrainBank Part D].
- Cite EVERY factual claim that comes from the knowledge base, immediately after the sentence
  it supports. Do not cite anything you did not actually draw from the provided text.
- Never invent a code that doesn't exist in the knowledge base above.
`;

const SYSTEM_PROMPT = `${PART_H_SYSTEM_PROMPT}\n${CORPUS_STATE_NOTE}`;

export async function askProtectChat(userMessage, history = []) {
  const contents = [
    { role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n=== KNOWLEDGE BASE (BrainBank Layer 1, full text) ===\n${brainBankText}` }] },
    { role: 'model', parts: [{ text: 'Understood. I will follow these rules, answer only from the provided knowledge base with BrainBank Part citations, and use the Tier 2/3 fallback for anything requiring verbatim Layer 2 text.' }] },
    ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const { text } = await callGeminiProxy({
    action: 'protect_chat',
    contents,
    temperature: 0.3,
    maxTokens: 2048,
  });
  return text;
}
