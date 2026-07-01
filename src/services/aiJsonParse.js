// Shared AI JSON response repair. Gemini occasionally emits syntactically
// invalid JSON — most commonly a trailing comma before a closing brace/bracket
// (the exact cause of "Expected double-quoted property name in JSON" errors),
// or a truncated response if maxOutputTokens is hit mid-object. This mirrors
// the truncation-repair strategy already proven in ai.js's closeOpenJSON,
// extracted here so every Test Builder AI call can reuse the same fallback
// chain instead of each service re-implementing its own.

function closeOpenJSON(raw) {
  let s = raw.trim();
  const stack = [];
  let inStr = false, esc = false, safeEnd = -1;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc)                 { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true;  continue; }
    if (c === '"')           { inStr = !inStr; continue; }
    if (inStr)               continue;
    if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') {
      stack.pop();
      if (stack.length === 1) safeEnd = i;
    }
  }

  if (!stack.length) return s;

  let t = (safeEnd >= 0 ? s.slice(0, safeEnd + 1) : s).replace(/,\s*$/, '');
  const open = [];
  inStr = false; esc = false;
  for (const c of t) {
    if (esc)                 { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true;  continue; }
    if (c === '"')           { inStr = !inStr; continue; }
    if (inStr)               continue;
    if (c === '{' || c === '[') open.push(c === '{' ? '}' : ']');
    else if ((c === '}' || c === ']') && open.length) open.pop();
  }
  return t + open.reverse().join('');
}

// Trailing commas before a closing } or ] are the single most common way
// Gemini's JSON output fails strict parsing even when not truncated.
function stripTrailingCommas(s) {
  return s.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Extracts and parses a JSON object/array from a raw AI text response.
 * Tries a straight parse, then a trailing-comma strip, then a truncation
 * repair (closeOpenJSON) combined with the comma strip — in that order —
 * before giving up with a message that tells the caller what happened.
 */
export function parseAIJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/s);
  if (!m) throw new Error('AI returned no valid JSON');
  const raw = m[1] ?? m[0];

  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(stripTrailingCommas(raw));
    } catch {
      try {
        return JSON.parse(stripTrailingCommas(closeOpenJSON(raw)));
      } catch {
        throw new Error('AI response was malformed or cut short — please try again.');
      }
    }
  }
}
