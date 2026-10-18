/**
 * universalAI.js — the Admin's universal AI key (Admin Dashboard > AI Engines > Universal AI key).
 *
 * Any service works: Google Gemini, Anthropic Claude, OpenAI, or any OpenAI-compatible
 * service (OpenRouter, Groq, xAI, NVIDIA, DeepSeek, Mistral, Together, ...). When it is on,
 * it answers first for every AI request of the website and KaTuroDesk; the existing chain
 * (Gemini, then the Vertex AI and NVIDIA backups) stays as the automatic backup. A key that
 * fails is rested for a short while, so a broken key never slows teachers down.
 *
 * Settings: Firestore adminConfig/aiProvider (admin-only by the catch-all rule):
 *   { enabled, provider: 'gemini'|'openai'|'claude', baseUrl, model, label, apiKey, keyHint, updatedAt, updatedBy,
 *     lastProblem, lastProblemAt }  (the last two are written here so the admin panel can show them)
 */

const F = require('./lib/aiFormats');

const CONFIG_TTL_MS = 15 * 1000; // a change in the admin panel is used within 15 s by every server
const REST_AFTER_REFUSAL_MS = 2 * 60 * 1000; // wrong key, no credit, rate limit
const REST_AFTER_ERROR_MS = 30 * 1000; // network trouble, server error
const CALL_TIMEOUT_MS = 150 * 1000; // leaves time for the backup chain inside the 300 s function budget

const hasAudio = (contents) => (contents || []).some((c) => (c?.parts || []).some((p) => /^audio\//i.test(p?.inlineData?.mimeType || '')));

/**
 * deps: { db, fetchFn, now?, log? }
 */
function createUniversalAI({ db, fetchFn, now = () => Date.now(), log = console }) {
  const REF = () => db.doc('adminConfig/aiProvider');
  let cache = null; // { data, at }
  let restUntil = 0;
  let version = null; // when the admin last saved: new settings are tried again at once

  const millis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : Number(v) || 0);

  async function config() {
    if (cache && now() - cache.at < CONFIG_TTL_MS) return cache.data;
    const snap = await REF().get();
    const data = snap.exists ? snap.data() || {} : null;
    const v = data ? millis(data.updatedAt) : 0;
    if (v !== version) {
      version = v;
      restUntil = 0;
    }
    cache = { data, at: now() };
    return data;
  }

  /** Kept in the settings document so the admin panel (another server) can show it (update: never re-creates removed settings). */
  const record = (lastProblem) => Promise.resolve().then(() => REF().update({ lastProblem, lastProblemAt: new Date(now()) })).catch(() => {});

  /** On and complete (a local OpenAI-compatible server may need no key). */
  const ready = (c) => Boolean(c && c.enabled === true && F.PROVIDERS.includes(c.provider) && String(c.model || '').trim()
    && (String(c.apiKey || '').trim() || (c.provider === 'openai' && c.baseUrl && F.cleanBase(c.baseUrl, '') && F.cleanBase(c.baseUrl, '') !== F.OPENAI_URL)));

  async function send(url, init, timeoutMs) {
    const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    let data;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  }

  /** One request through the given settings → { text, finishReason } (throws with .status on failure). */
  async function post(cfg, req, timeoutMs = CALL_TIMEOUT_MS) {
    const key = String(cfg.apiKey || '').trim();
    const r = F.buildRequest(cfg, key, req);
    const go = (body) => send(r.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...r.headers }, body: JSON.stringify(body) }, timeoutMs);
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
      const e = new Error(F.problemText(res.status, res.data));
      e.status = res.status;
      throw e;
    }
    return F.readReply(cfg.provider, res.data);
  }

  return {
    /**
     * The universal key answers, or null when it is off, resting, cannot handle this request
     * (a voice clip on a service that does not hear audio) or failed (then the caller uses
     * its usual Gemini chain). Never throws.
     *   req: { contents, temperature, maxTokens, responseMimeType }
     * → { text, finishReason, engine: 'universal' } | null
     */
    async callIfActive(req = {}) {
      try {
        const cfg = await config(); // read first: newly saved settings end a rest at once
        if (!ready(cfg) || now() < restUntil) return null;
        if (hasAudio(req.contents) && cfg.provider !== 'gemini') return null;
        const out = await post(cfg, req);
        if (!String(out.text || '').trim()) throw new Error('The service gave an empty answer.');
        if (cfg.lastProblem) {
          cfg.lastProblem = '';
          record('');
        }
        return { text: out.text, finishReason: out.finishReason || 'STOP', engine: 'universal' };
      } catch (err) {
        const refused = [401, 402, 403, 429].includes(err?.status);
        restUntil = now() + (refused ? REST_AFTER_REFUSAL_MS : REST_AFTER_ERROR_MS);
        const problem = String(err?.message || err).slice(0, 300);
        log.warn?.(`[universalAI] key failed, the Gemini chain answers instead: ${problem}`);
        record(problem);
        return null;
      }
    },

    /** A text prompt (features that send one prompt string) → text, or null (see callIfActive). */
    async textIfActive(prompt, { temperature, maxTokens } = {}) {
      const out = await this.callIfActive({ contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }], temperature, maxTokens });
      return out ? out.text : null;
    },

    /**
     * Admin panel: the models a key can use. input: { provider, baseUrl, apiKey? } (no apiKey =
     * the saved one) → { models, suggested }
     */
    async models(input = {}) {
      const saved = (await config()) || {};
      const provider = F.PROVIDERS.includes(input.provider) ? input.provider : saved.provider;
      if (!F.PROVIDERS.includes(provider)) throw new Error('Choose the AI service first.');
      const key = String(input.apiKey || '').trim() || String(saved.apiKey || '').trim();
      const base = F.cleanBase(input.baseUrl ?? saved.baseUrl, F.OPENAI_URL);
      let res;
      if (provider === 'gemini') res = await send(`${F.GEMINI_URL}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } }, 30000);
      else if (provider === 'claude') res = await send(`${F.CLAUDE_URL}/models?limit=100`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } }, 30000);
      else res = await send(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {} }, 30000);
      if (!res.ok) throw new Error(F.problemText(res.status, res.data));
      const models = F.readModels(provider, res.data, base === F.OPENAI_URL);
      return { models, suggested: F.suggestModel(provider, models) };
    },

    /** Admin panel: one tiny real request with the saved settings (ignores on/off and resting). */
    async test() {
      cache = null;
      const cfg = await config();
      if (!cfg || !F.PROVIDERS.includes(cfg.provider) || !String(cfg.model || '').trim()) throw new Error('Save the key, service and model first.');
      const t0 = now();
      const out = await post(cfg, { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], maxTokens: 2000 }, 60000);
      restUntil = 0;
      if (cfg.lastProblem) await record('');
      return { ok: true, reply: String(out.text || '').trim().slice(0, 40), ms: now() - t0, model: cfg.model };
    },

    /** After the admin saves: read the new settings on the next call and try the key again. */
    forget() {
      cache = null;
      restUntil = 0;
    },

    /** For the admin panel: the last problem any server had with the key, and if it is still resting. */
    async health() {
      const snap = await REF().get();
      const d = snap.exists ? snap.data() || {} : {};
      const at = millis(d.lastProblemAt);
      const lastProblem = String(d.lastProblem || '');
      return { resting: Boolean(lastProblem) && now() - at < REST_AFTER_REFUSAL_MS, lastProblem, lastProblemAt: at || null };
    },
  };
}

module.exports = { createUniversalAI, CALL_TIMEOUT_MS };
