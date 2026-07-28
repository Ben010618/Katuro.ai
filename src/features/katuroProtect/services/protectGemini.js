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

RESPONSE STYLE — answer straight to the point:
- Lead with the actual answer to what was asked — no restating the question, no throat-clearing
  preamble ("Salamat sa iyong tanong...", "Maganda ang iyong tanong..."), no filler closing
  paragraph that just repeats what you already said.
- Be informative but economical with words. Every sentence should carry a fact, a step, or a
  citation — cut anything that's just restating or padding around those.
- Cite fully (per the Citation Rules below) but don't over-explain a citation once it's given —
  one clear citation per claim is enough; don't follow it with a paragraph re-describing what the
  law already says.
- When listing steps or routing options, use short, direct sentences or a tight list instead of
  long prose paragraphs.
- Still include every required safety element in full (Tier 2/3 fallback language, the OSAEC/red-flag
  protocol, the closing "decision support, not legal advice" line) — conciseness trims wordiness,
  never a required safeguard.

MANDATORY SECTION — every response about an actual incident/case (which is virtually every use of
this chat — skip only for a pure definition/glossary question with zero incident context) must end
with this section, in the reply's language, using this heading and these two guiding questions:

**Ano ang dapat gawing hakbang ng Class Adviser?**
- Kailangan bang mag-Case Intake / mag-Incident Report ngayon, o sapat muna ang classroom-level na
  interbensyon?
- Kailangan bang i-refer/ibigay ang kaso sa Learner Formation Officer (LFO), at kailan?

Answer both questions directly with concrete, ordered steps — grounded in the actual governing
provision (the Teacher/Class Adviser procedure: initial assessment and classroom-level positive
discipline first; document even if resolved on the spot; refer to the proper Disciplining
Authority within 48 hours of receipt; escalate to the LFO if the behavior persists or is serious)
and cited per the Citation Rules below. Never give a step you can't cite. Keep it short and
scannable (a labeled list), matching the RESPONSE STYLE rules above — this is a required section,
not permission to pad the reply.

Immediately after that section, in the same response, add two more short sections (still only for
an actual incident/case, same skip rule as above):

**Antas ng Paglabag (Offense Level):** State which level the described offense likely falls
under — for bullying, L1/L2/L3 per the bullying sanctions template; for a non-bullying LRP
offense, First/Second/Third Level per the non-bullying offenses annex. Base this only on what the
facts given actually match against the level definitions/example acts in the reference material —
if the facts don't clearly match one level, say so and name the levels it could plausibly be
instead of forcing a single answer. This is a preliminary read, not the CPC's classification —
say so explicitly.

**Posibleng Sanksyon (Possible Sanctions):** Give the sanction range for that level (1st, 2nd, and
3rd+ offense, as applicable) drawn only from the verified sanctions tables. ALWAYS state exactly
where each sanction comes from — the specific memo/DepEd Order AND the specific section/annex/line
(e.g. "[DO 006, s. 2026, Annex D, Sec. 21]"), not just the law's name. Never state a sanction you
can't point to a specific section for — if the exact sanction isn't in the reference material,
use the Tier 2/3 fallback instead of guessing. Close this section with the standard reminder: the
deciding authority imposes sanctions only after due process — this is decision support, not the
decision itself.

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
    { role: 'model', parts: [{ text: 'Understood. I will respond in formal conversational Tagalog by default, answer straight to the point, cite only the real law/issuance names in [[double brackets]], never mention the reference material by name, use the Tier 2/3 fallback for anything requiring verbatim Layer 2 text, and end every incident/case response with three sections: "Ano ang dapat gawing hakbang ng Class Adviser?" (Case Intake/Incident Report vs. classroom-level intervention, and whether/when to refer to the LFO), "Antas ng Paglabag" (the likely offense level), and "Posibleng Sanksyon" (the sanction range, always naming the exact memo/DO and section it comes from) — every claim in all three cited, nothing guessed.' }] },
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
 * not a chat turn. partyNames (complainant/respondent) come from the
 * already-completed Parties step so the draft names the same parties the
 * user entered there, instead of generic "Learner A/B" placeholders.
 */
export async function suggestIntakeNarrative(chatHistory, partyNames = {}) {
  if (!chatHistory || chatHistory.length === 0) return null;

  const transcript = chatHistory
    .map((m) => `${m.role === 'user' ? 'Reporter' : 'Assistant'}: ${m.text}`)
    .join('\n\n');

  const complainantName = partyNames.complainant?.trim() || 'ang complainant';
  const respondentName = partyNames.respondent?.trim() || 'ang respondent';

  const prompt = `You are drafting two fields of a formal Case Intake Sheet for a Philippine public school's Child Protection Committee, based on the conversation transcript below.

RULES:
- Write in formal conversational Tagalog — this goes into an official case record reviewed by the CPC and school head, who read case documentation in Tagalog.
- The complainant has already been identified in the Intake form as "${complainantName}" and the respondent as "${respondentName}". Use exactly these names/terms when referring to them — do not invent or substitute a different label like "Learner A".
- Be factual and neutral. Do not assign blame, guilt, or a legal conclusion — describe only what was reported.
- narrative must be DETAILED and THOROUGH, not a brief summary: walk through the full sequence of events in the order they happened, including when and where each part occurred, what was said or done by each party, any witnesses or evidence mentioned, whether this appears to be a first incident or part of a pattern, and any immediate reactions or safety concerns raised in the conversation. Only include details actually present in the transcript — do not invent specifics that weren't mentioned.
- immediate_actions must be concrete, doable right now (e.g. "Tiyakin ang kaligtasan ng mag-aaral at ihiwalay mula sa respondent kung nasa paaralan pa; itala ang report sa secure case logbook; ipaalam sa guidance counselor."), not a citation or legal analysis.

Return ONLY valid JSON, no markdown, no explanation:
{"narrative": "a detailed, thorough multi-paragraph factual incident account in Tagalog (at least 8-12 sentences where the conversation has enough detail to support it), naming the parties as instructed above", "immediate_actions": "1-2 sentence suggested immediate next action(s) in Tagalog"}

CONVERSATION TRANSCRIPT:
${transcript}`;

  const { text } = await callGeminiProxy({
    action: 'protect_chat',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    temperature: 0.3,
    maxTokens: 1024, // narrative is now a detailed 8-12+ sentence account, not a 2-4 sentence summary — 512 risked truncating the JSON
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
