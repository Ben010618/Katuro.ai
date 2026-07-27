// Parses [BrainBank X1] / [BrainBank Part X] citation markers out of a chat
// response, and looks each one up against the REAL bundled BrainBank text —
// so a citation chip always shows genuine verbatim BrainBank content, never
// something the model just asserted. A citation whose code doesn't actually
// exist in the text surfaces as "not found" rather than silently failing —
// that itself is a signal the model may have fabricated a reference.
import brainBankText from './brainBankSource';

const CITATION_REGEX = /\[BrainBank(?:\s+Part)?\s+([A-Z]\d*)\]/g;

/** Splits response text into alternating {type:'text'} and {type:'citation', code} segments. */
export function splitTextWithCitations(text) {
  const segments = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(CITATION_REGEX);
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    segments.push({ type: 'citation', code: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) });
  return segments;
}

function extractSection(startIndex, headingLineEnd) {
  const rest = brainBankText.slice(headingLineEnd);
  const nextHeadingOffset = rest.search(/\n#{2,3} /);
  const body = nextHeadingOffset === -1 ? rest : rest.slice(0, nextHeadingOffset);
  return body.trim();
}

/** Looks up a citation code (e.g. "A1", "D") against the real BrainBank text. Returns null if not found. */
export function lookupCitation(code) {
  // Sub-section: "### A1." style heading
  const subRe = new RegExp(`^### ${code}\\.[^\n]*`, 'm');
  let match = subRe.exec(brainBankText);
  if (match) {
    const headingLineEnd = match.index + match[0].length;
    return { heading: match[0].replace(/^###\s*/, ''), body: extractSection(match.index, headingLineEnd) };
  }

  // Whole-part: "## PART D" style heading
  const partRe = new RegExp(`^## PART ${code}[^\n]*`, 'm');
  match = partRe.exec(brainBankText);
  if (match) {
    const headingLineEnd = match.index + match[0].length;
    return { heading: match[0].replace(/^##\s*/, ''), body: extractSection(match.index, headingLineEnd) };
  }

  return null;
}
