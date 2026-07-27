// Gemini calls for kaTuro Protect chat. Grounded in the internal reference
// document's Layer 1 only — Layer 2 (verbatim law/DepEd-order text) hasn't
// been ingested yet (empty katuroProtect/corpus/). Per that document's own
// Part O1 readiness gate #1 ("No deployment on Layer 1 alone") this is
// deliberately NOT presented as production-ready legal guidance: the system
// prompt below biases every sanction/deadline/penalty question toward the
// Tier 2 "OUTSIDE KNOWLEDGE BASE" fallback, and only routing/procedural
// questions (which Part K's Next-Move Engine already encodes as DepEd
// procedure, not a legal citation) get confident answers.
//
// The reference document (~55KB) is small enough to inject wholesale as
// context instead of building real chunked retrieval — a deliberate
// simplification for a Layer-1-only, low-volume, admin-only chat. Real RAG
// (Firestore vector search over chunked Layer 1 + Layer 2) is Phase 3 once
// the corpus exists.
//
// The document is an internal reference only — the user-facing product
// requirement is that the AI never names it. Citations must read like real
// legal citations (e.g. "RA 7610", "DepEd Order No. 40, s. 2012"), not an
// internal document label. See citationLookup.js for how those citations
// get verified against the real text without exposing that label either.
import brainBankText from './brainBankSource';
import { callGeminiProxy } from '../../../services/geminiConfig';
import { parseAIJson } from '../../../services/aiJsonParse';

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
Only the reference document's Layer 1 (summaries, routing logic, procedures, form schemas,
the Next-Move Engine) is loaded right now. Layer 2 (verbatim RA/DepEd-order text) has NOT
been ingested yet. Because of this:
- You may confidently answer ROUTING and PROCEDURAL questions (which law/office likely
  applies, what the next procedural step is, who to talk to).
- You must treat ANY question asking for sanction ranges, penalty amounts, fines, exact
  day-count deadlines, or a verbatim quote as Tier 2 by default: open with
  "⚠️ OUTSIDE KNOWLEDGE BASE — VERIFY BEFORE ACTING", still name the specific law/issuance,
  NEVER state a specific range/amount/deadline as if quoted from the text, and close with
  "Please verify with your Division Legal Officer or the LRPO before acting on this."
- Never fabricate a section number or quote. If you are not certain a source says what
  you're about to claim, say so and route to Tier 2/3 instead.

LANGUAGE — respond in formal conversational Tagalog by default: warm and natural, the way a
CPC member or school head actually speaks with a colleague, while staying professionally
formal (not casual slang/jejemon). Explain the case, the to-dos, and any sanctions/penalties
in this register. If the user writes in English and clearly wants an English reply, you may
answer in English instead.

CITATION RULES — read carefully, this is a hard product requirement:
- NEVER use the word "BrainBank" or refer to "the knowledge base," "the document," "my
  reference material," or similar in your response. That source is internal only — the user
  must never see it named. If you need to refer to where something comes from, name the
  actual law or issuance instead.
- Cite the REAL legal/DepEd source for every claim you draw from the reference material —
  e.g. "RA 7610", "DepEd Order No. 40, s. 2012", "Revised IRR of RA 10627, Sec. 14" — using
  EXACTLY the same wording the source text uses for that law/issuance (don't paraphrase or
  reformat the name), wrapped in double square brackets: [[RA 7610]], [[DepEd Order No. 40,
  s. 2012]]. This lets the app verify your citation against the real text — an invented or
  reworded name can't be verified, so copy it exactly.
- If a procedural step's governing source in the reference material lists multiple
  issuances (e.g. "Revised IRR of RA 10627; DepEd Order No. 40, s. 2012"), cite whichever
  one is most directly relevant to the specific point you're making, not the whole list.
- Cite every factual claim immediately after the sentence it supports. Do not cite anything
  you did not actually draw from the provided material, and never invent a law/issuance name
  that doesn't appear in it.
`;

const SYSTEM_PROMPT = `${PART_H_SYSTEM_PROMPT}\n${CORPUS_STATE_NOTE}`;

export async function askProtectChat(userMessage, history = []) {
  const contents = [
    { role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n=== REFERENCE MATERIAL (internal — never name this to the user) ===\n${brainBankText}` }] },
    { role: 'model', parts: [{ text: 'Understood. I will respond in formal conversational Tagalog by default, cite only the real law/issuance names in [[double brackets]], never mention the reference material by name, and use the Tier 2/3 fallback for anything requiring verbatim Layer 2 text.' }] },
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

/**
 * Drafts an Incident Narrative + Immediate Actions Taken suggestion for the
 * Intake Wizard from the prior chat conversation — the user still has to
 * review and can edit both fields freely; this only pre-fills a starting
 * point instead of leaving the wizard blank when a real conversation
 * already happened. Reuses the protect_chat proxy action (no new backend
 * action/deploy needed) but with its own narrow prompt, not the full
 * conversational system prompt — this is a one-shot structured extraction,
 * not a chat turn.
 */
export async function suggestIntakeNarrative(chatHistory) {
  if (!chatHistory || chatHistory.length === 0) return null;

  const transcript = chatHistory
    .map((m) => `${m.role === 'user' ? 'Reporter' : 'Assistant'}: ${m.text}`)
    .join('\n\n');

  const prompt = `You are drafting two fields of a formal Case Intake Sheet for a Philippine public school's Child Protection Committee, based on the conversation transcript below.

RULES:
- Write in formal English regardless of what language the conversation used — this goes into an official case record.
- Use coded terms only: "Learner A", "Learner B", "the respondent", etc. NEVER use a real name even if one appears in the transcript — replace it with a generic code label.
- Be factual and neutral. Do not assign blame, guilt, or a legal conclusion — describe only what was reported.
- immediate_actions must be concrete, doable right now (e.g. "Ensure the learner's immediate safety and separate them from the respondent if still on campus; document the report in the secure case logbook; notify the guidance counselor."), not a citation or legal analysis.

Return ONLY valid JSON, no markdown, no explanation:
{"narrative": "2-4 sentence factual incident summary, de-identified", "immediate_actions": "1-2 sentence suggested immediate next action(s)"}

CONVERSATION TRANSCRIPT:
${transcript}`;

  const { text } = await callGeminiProxy({
    action: 'protect_chat',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    temperature: 0.3,
    maxTokens: 512,
    responseMimeType: 'application/json',
  });

  try {
    const parsed = parseAIJson(text);
    if (!parsed?.narrative && !parsed?.immediate_actions) return null;
    return { narrative: parsed.narrative || '', immediate_actions: parsed.immediate_actions || '' };
  } catch {
    return null;
  }
}
