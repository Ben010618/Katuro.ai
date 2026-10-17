/**
 * customBrain.cjs — the teacher's OWN AI key (hidden tab: 4 clicks on the Settings gear).
 *
 * Runs in the Electron main process only: the key is encrypted on this computer
 * (Windows DPAPI through safeStorage), decrypted here for each request, and never
 * given to the page or sent to KaTuro's servers. Requests arrive in KaTuroDesk's
 * own (Gemini-style) shape and are converted for the chosen service:
 *   gemini  — Google Gemini API
 *   claude  — Anthropic Messages API
 *   openai  — OpenAI and every OpenAI-compatible service (OpenRouter, Groq, xAI,
 *             NVIDIA, DeepSeek, Mistral, Together, a local Ollama, …) via baseUrl
 * Pure helpers are exported for tests; createBrain() wires storage and fetch.
 */

const PROVIDERS = ['gemini', 'openai', 'claude'];
const OPENAI_URL = 'https://api.openai.com/v1';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';
const CLAUDE_URL = 'https://api.anthropic.com/v1';
const TIMEOUT_MS = 300000;

/** Known key shapes → service (the teacher can still change it). */
const KEY_SHAPES = [
  { test: /^AIza[\w-]{20,}$/, provider: 'gemini', label: 'Google Gemini' },
  { test: /^sk-ant-/, provider: 'claude', label: 'Anthropic Claude' },
  { test: /^sk-or-/, provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1', label: 'OpenRouter' },
  { test: /^gsk_/, provider: 'openai', baseUrl: 'https://api.groq.com/openai/v1', label: 'Groq' },
  { test: /^xai-/, provider: 'openai', baseUrl: 'https://api.x.ai/v1', label: 'xAI' },
  { test: /^nvapi-/, provider: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', label: 'NVIDIA' },
  { test: /^sk-/, provider: 'openai', baseUrl: OPENAI_URL, label: 'OpenAI' },
];

/** → { provider, baseUrl, label } or null when the key's shape is not known. */
function detectService(key) {
  const k = String(key || '').trim();
  const hit = KEY_SHAPES.find((s) => s.test.test(k));
  return hit ? { provider: hit.provider, baseUrl: hit.baseUrl || '', label: hit.label } : null;
}

const cleanBase = (url, fallback) => {
  const u = String(url || '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : fallback;
};

function unsupported(what) {
  const e = new Error(`This service cannot read ${what}.`);
  e.unsupported = true;
  return e;
}

/** Gemini parts → plain text (for assistant turns). */
const textOf = (parts) => (parts || []).map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
const wantsJson = (contents, responseMimeType) => responseMimeType === 'application/json' && /json/i.test(JSON.stringify(contents.map((c) => textOf(c.parts))));

/** Same-role turns merged (Claude and some OpenAI-style services need alternating roles). */
function mergeTurns(contents) {
  const out = [];
  for (const c of contents || []) {
    const role = c?.role === 'model' || c?.role === 'assistant' ? 'model' : 'user';
    const parts = Array.isArray(c?.parts) ? c.parts : [];
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].parts.push(...parts);
    else out.push({ role, parts: [...parts] });
  }
  return out;
}

const IMAGE = /^image\/(png|jpe?g|gif|webp)$/i;

function toOpenAI(contents, { model, temperature, maxTokens, responseMimeType, official }) {
  const messages = mergeTurns(contents).map((c) => {
    if (c.role === 'model') return { role: 'assistant', content: textOf(c.parts) };
    const content = c.parts.map((p) => {
      if (typeof p?.text === 'string') return { type: 'text', text: p.text };
      const d = p?.inlineData;
      if (!d) return null;
      if (IMAGE.test(d.mimeType)) return { type: 'image_url', image_url: { url: `data:${d.mimeType};base64,${d.data}` } };
      if (d.mimeType === 'application/pdf') return { type: 'file', file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${d.data}` } };
      if (/^audio\/(wav|x-wav)$/i.test(d.mimeType)) return { type: 'input_audio', input_audio: { data: d.data, format: 'wav' } };
      throw unsupported(d.mimeType);
    }).filter(Boolean);
    return { role: 'user', content: content.every((x) => x.type === 'text') ? content.map((x) => x.text).join('\n') : content };
  });
  const body = { model, messages };
  if (maxTokens) body[official ? 'max_completion_tokens' : 'max_tokens'] = maxTokens;
  if (typeof temperature === 'number') body.temperature = temperature;
  if (wantsJson(contents, responseMimeType)) body.response_format = { type: 'json_object' };
  return body;
}

function toClaude(contents, { model, temperature, maxTokens, responseMimeType }) {
  const messages = mergeTurns(contents).map((c) => ({
    role: c.role === 'model' ? 'assistant' : 'user',
    content: c.parts.map((p) => {
      if (typeof p?.text === 'string') return p.text ? { type: 'text', text: p.text } : null;
      const d = p?.inlineData;
      if (!d) return null;
      if (IMAGE.test(d.mimeType)) return { type: 'image', source: { type: 'base64', media_type: d.mimeType.toLowerCase().replace('jpg', 'jpeg'), data: d.data } };
      if (d.mimeType === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d.data } };
      throw unsupported(d.mimeType);
    }).filter(Boolean),
  })).filter((m) => m.content.length);
  if (messages[0]?.role !== 'user') messages.unshift({ role: 'user', content: [{ type: 'text', text: '(continue)' }] });
  const body = { model, max_tokens: maxTokens || 4096, messages };
  if (typeof temperature === 'number') body.temperature = Math.min(1, Math.max(0, temperature));
  if (responseMimeType === 'application/json') body.system = 'Reply with valid JSON only, with no text before or after it.';
  return body;
}

function toGemini(contents, { temperature, maxTokens, responseMimeType }) {
  const generationConfig = {};
  if (typeof temperature === 'number') generationConfig.temperature = temperature;
  if (maxTokens) generationConfig.maxOutputTokens = maxTokens;
  if (responseMimeType) generationConfig.responseMimeType = responseMimeType;
  return { contents: mergeTurns(contents), generationConfig };
}

const FINISH = { length: 'MAX_TOKENS', max_tokens: 'MAX_TOKENS', MAX_TOKENS: 'MAX_TOKENS' };

/** Provider reply → { text, finishReason }. */
function readReply(provider, data) {
  if (provider === 'gemini') {
    const c = data?.candidates?.[0];
    return { text: (c?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join(''), finishReason: FINISH[c?.finishReason] || (c?.finishReason ? 'STOP' : null) };
  }
  if (provider === 'claude') {
    return { text: (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''), finishReason: FINISH[data?.stop_reason] || 'STOP' };
  }
  const ch = data?.choices?.[0];
  const content = ch?.message?.content;
  const text = Array.isArray(content) ? content.map((x) => x?.text || '').join('') : String(content ?? '');
  return { text, finishReason: FINISH[ch?.finish_reason] || 'STOP' };
}

/** The request to send: { url, headers, body }. */
function buildRequest(cfg, key, req) {
  const model = String(cfg.model || '').trim();
  if (!model) throw new Error('Choose a model for your key first.');
  if (cfg.provider === 'gemini') {
    return { url: `${GEMINI_URL}/models/${encodeURIComponent(model)}:generateContent`, headers: { 'x-goog-api-key': key }, body: toGemini(req.contents, req) };
  }
  if (cfg.provider === 'claude') {
    return { url: `${CLAUDE_URL}/messages`, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: toClaude(req.contents, { ...req, model }) };
  }
  const base = cleanBase(cfg.baseUrl, OPENAI_URL);
  return { url: `${base}/chat/completions`, headers: key ? { Authorization: `Bearer ${key}` } : {}, body: toOpenAI(req.contents, { ...req, model, official: base === OPENAI_URL }) };
}

/** Models the key can use, newest first. → string[] */
function readModels(provider, data, official = true) {
  if (provider === 'gemini') {
    return (data?.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((id) => /^gemini-/.test(id) && !/(tts|image|embedding|live|audio|robotics|computer-use)/i.test(id));
  }
  const ids = (data?.data || data?.models || []).map((m) => String(m.id || m.name || '')).filter(Boolean);
  if (provider === 'openai' && official) return ids.filter((id) => /^(gpt|o\d|chatgpt)/i.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation)/i.test(id));
  return ids;
}

/** A sensible first choice from the list (the teacher can change it). */
function suggestModel(provider, models) {
  const ver = (id) => Number((id.match(/(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const byNewest = (list) => [...list].sort((a, b) => ver(b) - ver(a) || a.length - b.length);
  const prefer = {
    gemini: [/flash$/i, /flash/i, /pro/i],
    claude: [/sonnet/i, /opus/i, /haiku/i],
    openai: [/^gpt-[\d.]+$/i, /^gpt-[\d.]+-mini$/i, /^gpt/i],
  }[provider] || [];
  for (const re of prefer) {
    const hit = byNewest(models.filter((m) => re.test(m) && !/(preview|exp|lite|nano)/i.test(m)));
    if (hit.length) return hit[0];
  }
  return models[0] || '';
}

/** Short, teacher-friendly reason from a failed provider reply. */
function problemText(status, data) {
  const msg = String(data?.error?.message || data?.error || data?.message || '').slice(0, 200);
  if (status === 401 || status === 403) return 'The key was not accepted (check it, or whether it is still active).';
  if (status === 402 || status === 429) return `The key has no credit left or hit its limit${msg ? `: ${msg}` : '.'}`;
  if (status === 404) return `The model or server address was not found${msg ? `: ${msg}` : '.'}`;
  return msg ? `The service answered: ${msg}` : `The service answered with an error (${status}).`;
}

/**
 * deps: { fetch, read(): object|null, write(obj), remove(), encrypt(str) → base64, decrypt(base64) → str, canEncrypt() }
 */
function createBrain(deps) {
  const { fetch } = deps;

  const config = () => {
    const c = deps.read() || {};
    return { provider: PROVIDERS.includes(c.provider) ? c.provider : '', model: c.model || '', baseUrl: c.baseUrl || '', enabled: c.enabled !== false, keyEnc: c.keyEnc || '', label: c.label || '', keyHint: c.keyHint || '' };
  };
  const keyOf = (c) => {
    if (!c.keyEnc) return '';
    try { return deps.decrypt(c.keyEnc); } catch { return ''; }
  };

  async function send(url, init) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  }

  async function post(cfg, key, req) {
    let r = buildRequest(cfg, key, req);
    const go = (b) => send(r.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...r.headers }, body: JSON.stringify(b) });
    let res = await go(r.body);
    // Some models refuse a set temperature, JSON mode or the token field: try once without it.
    if (res.status === 400) {
      const msg = JSON.stringify(res.data || '').toLowerCase();
      const body = { ...r.body };
      let changed = false;
      if (msg.includes('temperature') && 'temperature' in body) { delete body.temperature; changed = true; }
      if (msg.includes('response_format') && body.response_format) { delete body.response_format; changed = true; }
      if (msg.includes('max_completion_tokens') && body.max_completion_tokens) { body.max_tokens = body.max_completion_tokens; delete body.max_completion_tokens; changed = true; }
      else if (msg.includes('max_tokens') && body.max_tokens && cfg.provider === 'openai') { body.max_completion_tokens = body.max_tokens; delete body.max_tokens; changed = true; }
      if (changed) res = await go(body);
    }
    if (!res.ok) {
      const e = new Error(problemText(res.status, res.data));
      e.status = res.status;
      throw e;
    }
    return readReply(cfg.provider, res.data);
  }

  return {
    detectService,

    /** What the hidden tab shows (never the key itself). */
    status() {
      const c = config();
      return { provider: c.provider, model: c.model, baseUrl: c.baseUrl, enabled: c.enabled, label: c.label, hasKey: Boolean(c.keyEnc), keyHint: c.keyHint, canEncrypt: deps.canEncrypt() };
    },

    /** { provider, model, baseUrl, enabled, label, key? } — a new key replaces the saved one. */
    save(input = {}) {
      const c = config();
      const next = { ...c };
      if (input.key !== undefined && String(input.key).trim()) {
        if (!deps.canEncrypt()) throw new Error('This computer cannot protect the key (Windows encryption is not available), so it was not saved.');
        const key = String(input.key).trim();
        next.keyEnc = deps.encrypt(key);
        next.keyHint = key.length > 8 ? `…${key.slice(-4)}` : '…';
      }
      if (input.provider !== undefined) {
        if (!PROVIDERS.includes(input.provider)) throw new Error('Choose the AI service for this key.');
        next.provider = input.provider;
      }
      if (input.model !== undefined) next.model = String(input.model || '').trim().slice(0, 200);
      if (input.baseUrl !== undefined) next.baseUrl = input.baseUrl ? cleanBase(input.baseUrl, '') : '';
      if (input.label !== undefined) next.label = String(input.label || '').slice(0, 60);
      if (input.enabled !== undefined) next.enabled = Boolean(input.enabled);
      if (next.provider === 'openai' && input.baseUrl && !next.baseUrl) throw new Error('The server address must start with http:// or https://');
      deps.write(next);
      return this.status();
    },

    remove() {
      deps.remove();
      return this.status();
    },

    /** { provider, baseUrl, key? } (key omitted = the saved one) → { models, suggested } */
    async models(input = {}) {
      const c = config();
      const provider = PROVIDERS.includes(input.provider) ? input.provider : c.provider;
      const key = String(input.key || '').trim() || keyOf(c);
      const base = cleanBase(input.baseUrl ?? c.baseUrl, OPENAI_URL);
      let res;
      if (provider === 'gemini') res = await send(`${GEMINI_URL}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
      else if (provider === 'claude') res = await send(`${CLAUDE_URL}/models?limit=100`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
      else res = await send(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
      if (!res.ok) throw new Error(problemText(res.status, res.data));
      const models = readModels(provider, res.data, base === OPENAI_URL);
      return { models, suggested: suggestModel(provider, models) };
    },

    /** One KaTuroDesk request through the teacher's key → { text, finishReason } */
    async call(req = {}) {
      const c = config();
      if (!c.enabled || !c.provider) throw new Error('Your own AI key is off.');
      const key = keyOf(c);
      if (!key && !(c.provider === 'openai' && c.baseUrl && c.baseUrl !== OPENAI_URL)) throw new Error('No key is saved.');
      return post(c, key, req);
    },

    /** A tiny request to prove the key and model work. */
    async test() {
      const c = config();
      const out = await post(c, keyOf(c), { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], maxTokens: 2000 });
      return { ok: true, reply: out.text.trim().slice(0, 40) };
    },
  };
}

/**
 * The IPC channels the preload's katuroDeskApi.brain uses. Only the window allowed by
 * isAllowed(event) may call them; the key is stored encrypted in file().
 */
function registerBrainIpc({ ipcMain, file, isAllowed }) {
  const fs = require('fs');
  const { safeStorage } = require('electron');
  const brain = createBrain({
    fetch: (...args) => fetch(...args),
    read: () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return null; } },
    write: (obj) => fs.writeFileSync(file(), JSON.stringify(obj)),
    remove: () => { try { fs.unlinkSync(file()); } catch { /* already gone */ } },
    canEncrypt: () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } },
    encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
    decrypt: (b64) => safeStorage.decryptString(Buffer.from(b64, 'base64')),
  });
  const handle = (channel, fn) => ipcMain.handle(channel, async (e, arg) => {
    if (!isAllowed(e)) return { error: 'Not allowed.' };
    try {
      return await fn(arg || {});
    } catch (err) {
      return { error: String(err?.message || err), status: err?.status || 0, unsupported: Boolean(err?.unsupported) };
    }
  });
  handle('brain:status', () => brain.status());
  handle('brain:detect', ({ key }) => brain.detectService(key));
  handle('brain:save', (input) => brain.save(input));
  handle('brain:remove', () => brain.remove());
  handle('brain:models', (input) => brain.models(input));
  handle('brain:test', () => brain.test());
  handle('brain:call', (req) => brain.call(req));
  return brain;
}

module.exports = { registerBrainIpc, createBrain, detectService, toOpenAI, toClaude, toGemini, readReply, readModels, suggestModel, buildRequest, mergeTurns, problemText, PROVIDERS };
