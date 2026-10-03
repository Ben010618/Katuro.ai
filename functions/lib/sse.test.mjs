import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// functions/ is a CommonJS package (Cloud Functions runtime); load it natively.
const require = createRequire(import.meta.url);
const { createGeminiSseParser } = require('./sse.js');

const ev = (obj) => `data: ${JSON.stringify(obj)}\r\n\r\n`;
const textEv = (text, finishReason) => ev({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, ...(finishReason ? { finishReason } : {}), index: 0 }],
});

function runAll(chunks) {
  const p = createGeminiSseParser();
  const deltas = [];
  const errors = [];
  for (const c of chunks) {
    for (const e of p.push(c)) (e.error ? errors : deltas).push(e.error ?? e.text);
  }
  for (const e of p.end()) (e.error ? errors : deltas).push(e.error ?? e.text);
  return { deltas, errors, finishReason: p.finishReason, text: p.text };
}

describe('createGeminiSseParser', () => {
  it('yields text deltas and the final finishReason', () => {
    const r = runAll([textEv('Hel') + textEv('lo') + textEv(' world', 'STOP')]);
    expect(r.deltas).toEqual(['Hel', 'lo', ' world']);
    expect(r.text).toBe('Hello world');
    expect(r.finishReason).toBe('STOP');
    expect(r.errors).toEqual([]);
  });

  it('handles a data: line split across network chunks', () => {
    const full = textEv('{"a":1,') + textEv('"b":2}', 'STOP');
    // Split at every possible position — result must be identical.
    for (let i = 1; i < full.length; i++) {
      const r = runAll([full.slice(0, i), full.slice(i)]);
      expect(r.text).toBe('{"a":1,"b":2}');
      expect(r.finishReason).toBe('STOP');
    }
  });

  it('handles byte-by-byte delivery', () => {
    const full = textEv('abc') + textEv('def', 'MAX_TOKENS');
    const r = runAll(full.split(''));
    expect(r.deltas).toEqual(['abc', 'def']);
    expect(r.finishReason).toBe('MAX_TOKENS');
  });

  it('ignores [DONE], comments/keep-alives and empty lines', () => {
    const r = runAll([': ping\n\n', '\n', textEv('x'), 'data: [DONE]\n\n', ':keepalive\r\n\r\n', textEv('y', 'STOP')]);
    expect(r.deltas).toEqual(['x', 'y']);
    expect(r.finishReason).toBe('STOP');
  });

  it('concatenates multiple parts and uses only the first candidate', () => {
    const r = runAll([ev({
      candidates: [
        { index: 0, content: { parts: [{ text: 'A' }, { text: 'B' }, { inlineData: {} }] } },
        { index: 1, content: { parts: [{ text: 'IGNORED' }] }, finishReason: 'SAFETY' },
      ],
    }), ev({ candidates: [{ index: 0, content: { parts: [{ text: 'C' }] }, finishReason: 'STOP' }] })]);
    expect(r.text).toBe('ABC');
    expect(r.deltas).toEqual(['AB', 'C']);
    expect(r.finishReason).toBe('STOP');
  });

  it('records finishReason from an event with no text (e.g. a final usage-only event)', () => {
    const r = runAll([textEv('hi'), ev({ candidates: [{ index: 0, content: { parts: [] }, finishReason: 'STOP' }], usageMetadata: {} })]);
    expect(r.deltas).toEqual(['hi']);
    expect(r.finishReason).toBe('STOP');
  });

  it('flushes a trailing event that lacks the terminating blank line', () => {
    const r = runAll([textEv('a'), `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'b' }] }, finishReason: 'STOP' }] })}`]);
    expect(r.text).toBe('ab');
    expect(r.finishReason).toBe('STOP');
  });

  it('joins multi-line data fields per the SSE spec', () => {
    const json = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'multi' }] }, finishReason: 'STOP' }] }, null, 2);
    const chunk = json.split('\n').map((l) => `data: ${l}`).join('\n') + '\n\n';
    const r = runAll([chunk]);
    expect(r.text).toBe('multi');
    expect(r.finishReason).toBe('STOP');
  });

  it('surfaces a mid-stream error event', () => {
    const r = runAll([textEv('part'), ev({ error: { code: 503, message: 'overloaded', status: 'UNAVAILABLE' } })]);
    expect(r.deltas).toEqual(['part']);
    expect(r.errors).toEqual([{ code: 503, message: 'overloaded', status: 'UNAVAILABLE' }]);
    expect(r.finishReason).toBeNull();
  });

  it('skips malformed JSON events without aborting', () => {
    const r = runAll(['data: {not json\n\n', textEv('ok', 'STOP')]);
    expect(r.deltas).toEqual(['ok']);
  });

  it('returns no events for empty / non-string input', () => {
    const p = createGeminiSseParser();
    expect(p.push('')).toEqual([]);
    expect(p.push(undefined)).toEqual([]);
    expect(p.end()).toEqual([]);
    expect(p.finishReason).toBeNull();
    expect(p.text).toBe('');
  });
});
