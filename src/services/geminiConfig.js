/**
 * Gemini API key manager.
 *
 * The key lives in Firestore at adminConfig/gemini.apiKey — protected by
 * security rules so ONLY admin accounts can read/write it. Regular teacher
 * accounts cannot access this document.
 *
 * In-memory cache (5 min TTL) avoids a Firestore read on every AI call.
 * Falls back to VITE_GEMINI_API_KEY env var for local development.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const CONFIG_REF  = doc(db, 'adminConfig', 'gemini');
const CACHE_TTL   = 5 * 60 * 1000; // 5 minutes

let _key       = null;
let _fetchedAt = 0;

export async function getGeminiKey() {
  // In-memory cache
  if (_key && Date.now() - _fetchedAt < CACHE_TTL) return _key;

  // Try Firestore (admin-managed key, works in production)
  try {
    const snap = await getDoc(CONFIG_REF);
    if (snap.exists() && snap.data()?.apiKey) {
      _key       = snap.data().apiKey;
      _fetchedAt = Date.now();
      return _key;
    }
  } catch {
    // Firestore read failed (offline, rules, etc.) — fall through to env fallback
  }

  // Dev fallback: .env file
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (envKey) {
    _key       = envKey;
    _fetchedAt = Date.now();
    return _key;
  }

  throw new Error(
    'Gemini API key is not configured. Ask your administrator to set it in Admin → API Settings.'
  );
}

export function invalidateKeyCache() {
  _key       = null;
  _fetchedAt = 0;
}

/**
 * Wraps a Gemini fetch call with exponential backoff retry.
 * Retries up to 4 times on 429 (rate limit) or 503 (overloaded).
 * Delays: ~1s, ~2s, ~4s, ~8s (+ random jitter to avoid thundering herd).
 *
 * Usage: replace `await fetch(url, opts)` with `await geminiWithRetry(url, opts)`
 */
export async function geminiWithRetry(url, opts, attempt = 0) {
  const res = await fetch(url, opts);

  if ((res.status === 429 || res.status === 503) && attempt < 4) {
    const delay = (2 ** attempt) * 1000 + Math.random() * 600;
    await new Promise(r => setTimeout(r, delay));
    return geminiWithRetry(url, opts, attempt + 1);
  }

  if (!res.ok && res.status === 429) {
    throw new Error('The AI service is busy right now. Please try again in a moment.');
  }

  return res;
}

/** Admin-only: save a new key to Firestore */
export async function saveGeminiKey(apiKey, adminUid) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) throw new Error('API key cannot be empty.');

  const preview = trimmed.slice(0, 8) + '•'.repeat(16) + trimmed.slice(-4);

  await setDoc(CONFIG_REF, {
    apiKey:    trimmed,
    preview,
    hasKey:    true,
    updatedAt: new Date(),
    updatedBy: adminUid,
  });

  invalidateKeyCache();
}

/** Admin-only: read display info (never exposes the full key) */
export async function getGeminiKeyStatus() {
  try {
    const snap = await getDoc(CONFIG_REF);
    if (!snap.exists() || !snap.data().hasKey) return { hasKey: false };
    const d = snap.data();
    return {
      hasKey:    true,
      preview:   d.preview   || '••••••••••••••••••••••••••••',
      updatedAt: d.updatedAt ?? null,
    };
  } catch {
    return { hasKey: false, error: true };
  }
}

/** Quick validity test: send a tiny prompt to Gemini */
export async function testGeminiKey(apiKey) {
  const trimmed = (apiKey || '').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${trimmed}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: { maxOutputTokens: 8, temperature: 0 },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status} — key may be invalid or quota exceeded.`);
  }
  return true;
}
