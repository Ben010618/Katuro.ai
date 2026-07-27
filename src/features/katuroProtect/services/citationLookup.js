// Parses [[<real legal citation>]] markers out of a chat response — e.g.
// [[RA 7610]] or [[DepEd Order No. 40, s. 2012]] — and looks each one up
// against the REAL bundled reference text, so a citation chip always shows
// genuine content, never something the model just asserted. A citation that
// doesn't actually match anything in the text surfaces as "could not
// verify" rather than silently failing — that itself is a signal the model
// may have fabricated or misremembered a reference. Nothing here or in the
// UI ever names the internal reference document — only real law/issuance
// names are shown.
import brainBankText from './brainBankSource';

const CITATION_REGEX = /\[\[([^\]]+)\]\]/g;

/** Splits response text into alternating {type:'text'} and {type:'citation', text} segments. */
export function splitTextWithCitations(text) {
  const segments = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(CITATION_REGEX);
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    segments.push({ type: 'citation', text: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) });
  return segments;
}

// Pulls the distinctive law/issuance identifier out of a citation string so
// small wording differences elsewhere in the phrase (e.g. a trailing
// ", Sec. 14") don't prevent a match — the identifier itself is what the
// model was told to copy exactly.
const IDENTIFIER_PATTERNS = [
  /R\.?\s*A\.?\s*(?:No\.?\s*)?\d+/i,
  /DepEd\s+Order\s+No\.?\s*\d+,?\s*s\.?\s*\d+/i,
  /D\.?\s*O\.?\s*No\.?\s*\d+,?\s*s\.?\s*\d+/i,
  /DepEd\s+Memorandum\s+No\.?\s*\d+,?\s*s\.?\s*\d+/i,
  /DM\s*\d+,?\s*s\.?\s*\d+/i,
  /P\.?\s*D\.?\s*(?:No\.?\s*)?\d+/i,
];

function extractIdentifier(citationText) {
  for (const pattern of IDENTIFIER_PATTERNS) {
    const m = citationText.match(pattern);
    if (m) return m[0];
  }
  return citationText;
}

function toFlexibleRegex(identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexible = escaped.replace(/\s+/g, '\\s+');
  return new RegExp(flexible, 'i');
}

/** Looks up a citation (e.g. "RA 7610", "DepEd Order No. 40, s. 2012") against the real reference text. Returns null if not found. */
export function lookupCitation(citationText) {
  const identifier = extractIdentifier(citationText);
  const regex = toFlexibleRegex(identifier);
  const match = regex.exec(brainBankText);
  if (!match) return null;

  const before = brainBankText.slice(0, match.index);
  const headingRe = /^(#{2,3})\s+([^\n]+)/gm;
  let lastHeading = null;
  let m;
  while ((m = headingRe.exec(before)) !== null) lastHeading = m;
  if (!lastHeading) return null;

  const sectionStart = lastHeading.index + lastHeading[0].length;
  const rest = brainBankText.slice(sectionStart);
  const nextHeadingOffset = rest.search(/\n#{2,3} /);
  const body = (nextHeadingOffset === -1 ? rest : rest.slice(0, nextHeadingOffset)).trim();

  return { heading: lastHeading[2].trim(), body };
}
