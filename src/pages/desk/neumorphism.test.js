import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Every color class used in the Desk must be re-skinned by neumorphism.css, or be
 * listed here as deliberately unchanged, so no strip stays white in Dark mode
 * (or dark in Light mode) when someone adds a new color.
 */
const dir = new URL('./', import.meta.url);
const css = readFileSync(new URL('neumorphism.css', dir), 'utf8');
// Every .jsx in the Desk folder and its subfolders (e.g. calendar/).
const jsx = readdirSync(dir, { recursive: true })
  .map((f) => String(f).split('\\').join('/'))
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]);

// Kept as they are in both themes, on purpose.
const UNCHANGED = new Set([
  'text-white', 'bg-transparent', 'border-transparent', 'bg-black/40',
  // Strong solid colors with their own readable text (buttons, badges, warnings).
  'bg-amber-400', 'bg-amber-500', 'text-slate-950', 'bg-red-600', 'bg-red-700', 'bg-emerald-500', 'bg-emerald-800',
  'border-amber-500', 'border-amber-500/30', 'border-red-500', 'border-emerald-300', 'border-emerald-400', 'border-emerald-500',
  'border-emerald-600/40', 'border-emerald-700', 'border-emerald-800', 'border-gray-400', 'border-[#2d6a4f]', 'border-[#408a65]',
  // The resize bar and the slide preview (document content, not the app's chrome).
  'bg-emerald-400/70', 'bg-[#1F3A2E]', 'bg-emerald-900/40',
  // Light text on the green accent or on the slide preview.
  'text-emerald-100/90', 'text-emerald-50', 'text-emerald-100',
  // Readable on both surfaces.
  'text-amber-400', 'text-red-400', 'text-blue-400', 'text-slate-400',
  // Mapped through ::placeholder.
  'placeholder-[#647c6e]', 'placeholder-gray-400',
  // Hover-only shades of accent buttons (mapped by the accent hover rule or harmless).
  'bg-[#235841]', 'bg-[#25352a]', 'bg-[#26372d]', 'bg-[#2b4133]', 'bg-[#2d4436]', 'bg-[#e4ede7]',
]);

const escape = (cls) => `.${cls.replace(/([[\]#/:.])/g, '\\$1')}`;

describe('neumorphic theme covers every Desk color', () => {
  it('no color class is left unthemed', () => {
    const found = new Map();
    const re = /(?<![\w:-])(?:bg|text|border)-(?:\[#[0-9a-fA-F]{3,8}\]|(?:white|gray|emerald|amber|red|blue|slate|green)(?:-\d{2,3})?(?:\/\d+)?)(?![\w-])/g;
    for (const [file, src] of jsx) for (const m of src.matchAll(re)) if (!found.has(m[0])) found.set(m[0], file);
    const missing = [...found.entries()].filter(([cls]) => !UNCHANGED.has(cls) && !css.includes(escape(cls)));
    expect(missing.map(([cls, file]) => `${cls} (${file})`)).toEqual([]);
  });
});
