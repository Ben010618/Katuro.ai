/**
 * privacy.js — learner name masking (RA 10173, Data Privacy Act of 2012).
 *
 * Before any text leaves the teacher's PC for the AI, known learner names are
 * replaced with codes ("Learner 03"). The AI's reply is un-masked locally, so
 * generated files still carry the real names. Names are learned from detected
 * score/attendance tables; free text the masker has never seen is sent as-is.
 */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function nameVariants(fullName) {
  const name = String(fullName || '').replace(/\s+/g, ' ').trim();
  if (name.length < 3) return [];
  const variants = new Set([name]);
  // "Dela Cruz, Juan P." → also "Juan P. Dela Cruz" and "Juan Dela Cruz"
  const comma = name.match(/^([^,]+),\s*(.+)$/);
  if (comma) {
    const last = comma[1].trim();
    const first = comma[2].trim();
    variants.add(`${first} ${last}`);
    const firstNoMiddle = first.replace(/\s+[A-Z]\.?$/i, '').trim();
    variants.add(`${firstNoMiddle} ${last}`);
    variants.add(`${last}, ${firstNoMiddle}`);
  }
  return [...variants].filter((v) => v.length >= 3).sort((a, b) => b.length - a.length);
}

export function createNameMasker({ enabled = true } = {}) {
  const codeByName = new Map(); // canonical name → code
  const nameByCode = new Map(); // code → canonical name
  let patterns = [];

  function rebuild() {
    const pairs = [];
    for (const [name, code] of codeByName) {
      for (const v of nameVariants(name)) pairs.push([v, code]);
    }
    pairs.sort((a, b) => b[0].length - a[0].length);
    patterns = pairs.map(([v, code]) => [new RegExp(`(?<![\\p{L}])${escapeRe(v)}(?![\\p{L}])`, 'giu'), code]);
  }

  return {
    get enabled() {
      return enabled;
    },
    get size() {
      return codeByName.size;
    },
    /** Registers learner names (idempotent). */
    addNames(names = []) {
      if (!enabled) return;
      let changed = false;
      for (const raw of names) {
        const name = String(raw || '').replace(/\s+/g, ' ').trim();
        if (name.length < 3 || codeByName.has(name)) continue;
        const code = `Learner ${String(codeByName.size + 1).padStart(2, '0')}`;
        codeByName.set(name, code);
        nameByCode.set(code, name);
        changed = true;
      }
      if (changed) rebuild();
    },
    codeFor(name) {
      return codeByName.get(String(name || '').replace(/\s+/g, ' ').trim()) || name;
    },
    mask(text) {
      if (!enabled || !codeByName.size || typeof text !== 'string') return text;
      let out = text;
      for (const [re, code] of patterns) out = out.replace(re, code);
      return out;
    },
    /** Restores real names in a string or (deeply) in a JSON value. */
    unmask(value) {
      if (!enabled || !nameByCode.size) return value;
      if (typeof value === 'string') {
        return value.replace(/Learner\s+(\d{2,3})/g, (m, num) => nameByCode.get(`Learner ${num.padStart(2, '0')}`) || m);
      }
      if (Array.isArray(value)) return value.map((v) => this.unmask(v));
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.unmask(v)]));
      }
      return value;
    },
  };
}
