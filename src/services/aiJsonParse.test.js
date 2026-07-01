import { describe, it, expect } from 'vitest';
import { parseAIJson } from './aiJsonParse';

describe('parseAIJson', () => {
  it('parses clean JSON directly', () => {
    expect(parseAIJson('{"a": 1, "b": [1, 2, 3]}')).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('strips a ```json markdown fence', () => {
    expect(parseAIJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('repairs a trailing comma inside a nested object (the "Expected double-quoted property name" bug)', () => {
    const raw = '{"items": [{"choices": {"A": "x", "B": "y", "C": "z", "D": "w",}, "answer": "A"}]}';
    expect(parseAIJson(raw)).toEqual({ items: [{ choices: { A: 'x', B: 'y', C: 'z', D: 'w' }, answer: 'A' }] });
  });

  it('repairs a trailing comma before a closing array bracket', () => {
    const raw = '{"items": [1, 2, 3,]}';
    expect(parseAIJson(raw)).toEqual({ items: [1, 2, 3] });
  });

  it('repairs a truncated response (unclosed array of complete objects)', () => {
    const raw = '{"items": [{"question": "a", "answer": "1"}, {"question": "b", "answer": "2"}, {"question": "c"';
    const result = parseAIJson(raw);
    expect(result.items).toHaveLength(2);
    expect(result.items[1]).toEqual({ question: 'b', answer: '2' });
  });

  it('throws a clear error when no JSON is present at all', () => {
    expect(() => parseAIJson('Sorry, I cannot help with that.')).toThrow('AI returned no valid JSON');
  });
});
