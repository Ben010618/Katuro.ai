/**
 * Security guards for Routines (docs/ROUTINES.md §Security). The holes used against n8n,
 * Node-RED, Langflow and Flowise were: user text run as code, open editors/APIs, cards that run
 * system commands, and web-request/webhook nodes. None of these may ever appear in the routine
 * engine, the Builder or the phone requests.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  ...['src/services/desk/routines', 'src/pages/desk/routines'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.(js|jsx)$/.test(f) && !/\.test\./.test(f)).map((f) => `${d}/${f}`)),
  'src/store/routineStore.js',
  'src/services/link/deskRoutineRequests.js',
  'src/pages/phone/PhoneApprovals.jsx',
];

describe('routines: no way to run code, commands or web requests', () => {
  it('the files exist (the guard is not looking at nothing)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(15);
    for (const f of FILES) expect(fs.existsSync(path.join(ROOT, f)), f).toBe(true);
  });

  it('no eval, Function(), vm, child_process, timers with strings, innerHTML, fetch or sockets', () => {
    const banned = [
      [/\beval\s*\(/, 'eval('],
      [/\bnew\s+Function\b|[^.\w]Function\s*\(/, 'Function('],
      [/\brequire\(\s*['"](vm|child_process|node:vm|node:child_process)['"]/, 'vm/child_process'],
      [/from\s+['"](node:)?(vm|child_process)['"]/, 'vm/child_process import'],
      [/set(Timeout|Interval)\(\s*['"`]/, 'string timer'],
      [/dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML/, 'raw HTML'],
      [/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource\(/, 'network call'],
      [/\bimport\s*\(\s*[^'"`\s]/, 'import() of a computed name'],
    ];
    for (const f of FILES) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const [re, what] of banned) expect(re.test(src), `${f} uses ${what}`).toBe(false);
    }
  });

  it('the card catalog has no command, web, webhook or code cards and no code fields', async () => {
    const { CARDS } = await import('../src/services/desk/routines/catalog.js');
    for (const c of CARDS) {
      expect(c.type).not.toMatch(/exec|shell|command|http|web|hook|script|code|eval|program|sql/i);
      for (const f of c.fields) expect(['text', 'number', 'choice', 'days', 'time', 'file', 'folder', 'offset']).toContain(f.kind);
    }
  });
});
