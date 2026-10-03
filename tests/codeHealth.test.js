/**
 * Code health guards (run in CI before every deploy):
 *  1. Every source file is reachable from src/main.jsx — dead files hide stale logic
 *     and fake data (src/data/mockData.js sat unused next to a page that showed it).
 *  2. Every in-app link points to a route that exists — the plan badge linked to
 *     /settings for weeks while no such route existed, silently bouncing to /dashboard.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../src');
const IMPORT_RE = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+|export\s[^'"]*?from\s*)['"]([^'"]+)['"]/g;
const isTest = (p) => /\.test\.|__tests__|\.spec\./.test(p);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const ext of ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx']) {
    const candidate = path.normalize(base + ext);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

describe('code health', () => {
  const files = walk(SRC);

  it('every source file is used by the app', () => {
    const seen = new Set();
    const stack = [path.join(SRC, 'main.jsx')];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      if (f.endsWith('.css')) continue;
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(IMPORT_RE)) {
        const r = resolveImport(f, m[1]);
        if (r) stack.push(r);
      }
    }
    const unused = files.filter((f) => !isTest(f) && !seen.has(f)).map((f) => path.relative(SRC, f));
    expect(unused, 'Delete these files or import them where they are needed').toEqual([]);
  });

  it('every in-app link points to an existing route', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
    const routeSegments = new Set(
      [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1].replace(/^\//, '').split('/')[0].replace('*', '')),
    );
    const links = new Map();
    for (const f of files.filter((p) => /\.jsx?$/.test(p) && !isTest(p))) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/(?:navigate\(\s*|\bto=\{?\s*|\bto:\s*)['"`]\/([a-z0-9_-]*)/gi)) {
        if (!links.has(m[1])) links.set(m[1], path.relative(SRC, f));
      }
    }
    const broken = [...links.entries()].filter(([seg]) => seg && !routeSegments.has(seg)).map(([seg, file]) => `/${seg} (in ${file})`);
    expect(broken, 'Add a <Route> in App.jsx or fix the link').toEqual([]);
    expect(links.size).toBeGreaterThan(10); // the scan really found the app's links
  });
});
