/**
 * universalAiConfig.js — Admin Dashboard > AI Engines > Universal AI key.
 * The admin pastes any AI service key; the server (functions/universalAI.js) then answers
 * every AI request with it first, keeping the Gemini chain as the automatic backup.
 * Saved in adminConfig/aiProvider (admin-only). The key is never shown back, only its end.
 */
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import app, { db } from '../../firebase';
import { assertHeaderSafeKey } from '../../services/nvidiaConfig';

const REF = () => doc(db, 'adminConfig', 'aiProvider');

/** Services the admin can choose; "other" = any OpenAI-compatible service (server address needed). */
export const SERVICES = [
  { id: 'gemini', label: 'Google Gemini', provider: 'gemini', baseUrl: '' },
  { id: 'openai', label: 'OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com/v1' },
  { id: 'claude', label: 'Anthropic Claude', provider: 'claude', baseUrl: '' },
  { id: 'openrouter', label: 'OpenRouter', provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'groq', label: 'Groq', provider: 'openai', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'xai', label: 'xAI', provider: 'openai', baseUrl: 'https://api.x.ai/v1' },
  { id: 'nvidia', label: 'NVIDIA', provider: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  { id: 'deepseek', label: 'DeepSeek', provider: 'openai', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'mistral', label: 'Mistral', provider: 'openai', baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'other', label: 'Other service (OpenAI-compatible)', provider: 'openai', baseUrl: '' },
];

/** Known key shapes → the service (the admin can still change it). */
const KEY_SHAPES = [
  [/^AIza[\w-]{20,}$/, 'gemini'],
  [/^sk-ant-/, 'claude'],
  [/^sk-or-/, 'openrouter'],
  [/^gsk_/, 'groq'],
  [/^xai-/, 'xai'],
  [/^nvapi-/, 'nvidia'],
  [/^sk-/, 'openai'],
];
export function detectService(key) {
  const k = String(key || '').trim();
  const hit = KEY_SHAPES.find(([re]) => re.test(k));
  return hit ? hit[1] : null;
}

/** The service entry for saved settings. */
export function serviceOf(provider, baseUrl = '', label = '') {
  if (provider !== 'openai') return SERVICES.find((s) => s.id === provider) || null;
  return SERVICES.find((s) => s.provider === 'openai' && s.baseUrl && s.baseUrl === String(baseUrl || '').replace(/\/+$/, ''))
    || (label ? SERVICES.find((s) => s.label === label) : null)
    || SERVICES.find((s) => s.id === 'other');
}

export const keyHint = (key) => (key.length > 8 ? `…${key.slice(-4)}` : '…');

/** → { enabled, provider, baseUrl, model, label, hasKey, keyHint, updatedAt } (never the key) */
export async function getUniversalAiStatus() {
  const snap = await getDoc(REF());
  if (!snap.exists()) return { enabled: false, hasKey: false };
  const d = snap.data() || {};
  return {
    enabled: d.enabled === true,
    provider: d.provider || '',
    baseUrl: d.baseUrl || '',
    model: d.model || '',
    label: d.label || '',
    hasKey: Boolean(d.apiKey),
    keyHint: d.keyHint || '',
    updatedAt: d.updatedAt || null,
  };
}

/** Saves the settings; a new apiKey replaces the saved one (omit it to keep the saved key). */
export async function saveUniversalAi({ provider, baseUrl = '', model, label = '', enabled, apiKey }, adminUid) {
  if (!SERVICES.some((s) => s.provider === provider)) throw new Error('Choose the AI service for this key.');
  const m = String(model || '').trim();
  if (!m) throw new Error('Choose or type the model to use.');
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (provider === 'openai' && !/^https?:\/\/\S+$/i.test(base)) throw new Error('Type the service\'s server address (it starts with https:// or http://).');
  const patch = {
    provider,
    baseUrl: provider === 'openai' ? base : '',
    model: m.slice(0, 200),
    label: String(label || '').slice(0, 60),
    enabled: Boolean(enabled),
    updatedAt: new Date(),
    updatedBy: adminUid || '',
  };
  const key = String(apiKey || '').trim();
  if (key) {
    assertHeaderSafeKey(key, 'API key');
    patch.apiKey = key;
    patch.keyHint = keyHint(key);
  }
  await setDoc(REF(), patch, { merge: true });
  await callAdmin({ op: 'saved' }).catch(() => {}); // the server reads the new settings at once
}

/** Turns the universal key on or off (keeps everything saved). */
export async function setUniversalAiEnabled(enabled, adminUid) {
  await setDoc(REF(), { enabled: Boolean(enabled), updatedAt: new Date(), updatedBy: adminUid || '' }, { merge: true });
  await callAdmin({ op: 'saved' }).catch(() => {});
}

/** Removes the key and settings: the Gemini chain answers everything again. */
export async function removeUniversalAi() {
  await deleteDoc(REF());
  await callAdmin({ op: 'saved' }).catch(() => {});
}

async function callAdmin(data) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const res = await httpsCallable(getFunctions(app, 'us-central1'), 'adminUniversalAi', { timeout: 90000 })(data);
  return res.data;
}

/** The models a key can use → { ok, models, suggested } or { ok: false, error } */
export const listUniversalModels = ({ provider, baseUrl, apiKey }) => callAdmin({ op: 'models', provider, baseUrl, apiKey: apiKey || undefined });
/** One tiny real request with the saved settings → { ok, reply, ms, model } or { ok: false, error } */
export const testUniversalAi = () => callAdmin({ op: 'test' });
/** Is the key resting after a failure → { ok, resting, lastProblem } */
export const universalAiHealth = () => callAdmin({ op: 'health' });
