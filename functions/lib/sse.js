/**
 * Incremental parser for Gemini `streamGenerateContent?alt=sse` responses.
 *
 * Gemini sends Server-Sent Events whose `data:` payload is one
 * GenerateContentResponse JSON object per event:
 *
 *   data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\r\n\r\n
 *   data: {"candidates":[{"content":{"parts":[{"text":"lo"}]},"finishReason":"STOP"}]}\r\n\r\n
 *
 * Network chunks do NOT line up with events — a `data:` line (or even a
 * multi-byte character, which is the caller's TextDecoder's job) can be split
 * across chunks — so this buffers until a full event (blank line) is seen.
 *
 * Text extraction mirrors callGeminiRaw's non-streaming parse exactly: only
 * candidates[0] is used, and every part's `text` is concatenated. That way a
 * streamed reply and a non-streamed reply of the same request assemble to the
 * same string.
 *
 * Pure (no I/O) so it is unit-testable without network: see sse.test.mjs.
 */

function extractEvent(json) {
  if (json && json.error) {
    return { error: json.error };
  }
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  // Only the first candidate, like the non-streaming path (candidates?.[0]).
  // A streamed candidate carries `index`; treat a missing index as 0.
  const candidate = candidates.find((c) => (c?.index ?? 0) === 0);
  if (!candidate) return { text: '', finishReason: null };
  const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
  const text = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
  return { text, finishReason: candidate.finishReason ?? null };
}

/**
 * createGeminiSseParser() -> { push(textChunk), end(), finishReason, text }
 *
 * push()/end() return an array of events:
 *   { text: '<delta>' }          — a non-empty text delta
 *   { error: {code,message,...} } — Gemini reported an error mid-stream
 * finishReason/text accumulate over the whole stream.
 */
function createGeminiSseParser() {
  let buffer = '';
  let dataLines = [];
  let finishReason = null;
  let text = '';

  function dispatch(out) {
    if (!dataLines.length) return;
    const payload = dataLines.join('\n').trim();
    dataLines = [];
    if (!payload || payload === '[DONE]') return;
    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      // A malformed event is skipped rather than aborting the whole stream.
      return;
    }
    const ev = extractEvent(json);
    if (ev.error) {
      out.push({ error: ev.error });
      return;
    }
    if (ev.finishReason) finishReason = ev.finishReason;
    if (ev.text) {
      text += ev.text;
      out.push({ text: ev.text });
    }
  }

  function processLine(rawLine, out) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      dispatch(out); // blank line terminates an event
      return;
    }
    if (line.startsWith(':')) return; // SSE comment / keep-alive
    if (line.startsWith('data:')) {
      let value = line.slice(5);
      if (value.startsWith(' ')) value = value.slice(1);
      dataLines.push(value);
    }
    // event:/id:/retry: fields are irrelevant for Gemini and ignored.
  }

  return {
    push(chunk) {
      const out = [];
      if (typeof chunk !== 'string' || !chunk) return out;
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        processLine(line, out);
      }
      return out;
    },
    /** Flush a trailing event the server did not terminate with a blank line. */
    end() {
      const out = [];
      if (buffer) {
        processLine(buffer, out);
        buffer = '';
      }
      dispatch(out);
      return out;
    },
    get finishReason() {
      return finishReason;
    },
    get text() {
      return text;
    },
  };
}

module.exports = { createGeminiSseParser, extractEvent };
