/**
 * aiFormats.js — one AI request in KaTuro's own (Gemini-style) shape, converted for any
 * service: Google Gemini, Anthropic Claude, and OpenAI or any OpenAI-compatible service
 * (OpenRouter, Groq, xAI, NVIDIA, DeepSeek, Mistral, Together, ...).
 *
 * The section between the BEGIN/END markers is an exact copy of the same section in
 * electron/customBrain.cjs (the KaTuroDesk app has its own copy because the desktop
 * build does not include this folder). tests/universalAI.server.test.js fails if the two
 * copies ever differ.
 */

// ---- BEGIN shared AI formats ----
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
// ---- END shared AI formats ----

module.exports = { PROVIDERS, OPENAI_URL, GEMINI_URL, CLAUDE_URL, TIMEOUT_MS, detectService, cleanBase, toOpenAI, toClaude, toGemini, readReply, buildRequest, readModels, suggestModel, problemText, mergeTurns };
