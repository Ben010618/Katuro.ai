/**
 * deskSpeech.js — KaTuroDesk personas speak with natural online voices.
 *
 * One call = one short piece of text spoken in the persona's voice. The voice services are
 * tried in the admin's order (adminConfig/deskVoice.providers), each with its own voice per
 * persona, and a Filipino voice when the text is Filipino or Taglish:
 *   google  Google Cloud Text-to-Speech, Chirp 3 HD voices (the server's own Google identity)
 *   azure   Microsoft Azure AI Speech, neural voices (adminConfig/deskVoice.azureKey/azureRegion)
 *   gemini  Gemini text-to-speech (the KaTuroDesk Gemini key)
 * Each teacher has a daily allowance of online voice (DAILY_SECONDS of audio, on the Manila
 * calendar day, in teachers/{uid}/usage/{date}.desk_speech_seconds), whichever service speaks.
 * When it is used up, or no service answers, the call answers { fallback } instead of failing:
 * KaTuroDesk then speaks with the voice on the laptop, so the persona never goes silent.
 */

const DAILY_SECONDS = 300; // 5 minutes of online voice per teacher per day
const MAX_CHARS = 600;
const SAMPLE_RATE = 24000; // every service is asked for 16-bit mono PCM at 24 kHz
const CHARS_PER_SECOND = 13; // about 150 words a minute, for the advance reservation
const MODEL_CACHE_MS = 6 * 60 * 60 * 1000;
const CONFIG_CACHE_MS = 60 * 1000;
const KNOWN_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'];
const DEFAULT_PROVIDERS = ['google', 'azure', 'gemini'];
const PROVIDER_NAMES = { google: 'Google Chirp 3 HD', azure: 'Microsoft Azure', gemini: 'Gemini' };

// Voice and speaking style per persona, per service.
// Fixed per persona (the persona always sounds like itself): voice, speed and pitch follow
// the character. Matt jolly and funny, Grey serious and smart, Luna sweet and professional,
// Lola Carmen brutally strict.
const PERSONA_VOICES = {
  matt: { voice: 'Puck', azure: 'en-US-AndrewMultilingualNeural', gender: 'male', rate: '+8%', pitch: '+4%', speakingRate: 1.08, style: 'Say this like a jolly, funny, energetic young guy cracking a smile while talking to his co-teacher friend, upbeat, bright and playful' },
  luna: { voice: 'Sulafat', azure: 'en-US-AvaMultilingualNeural', gender: 'female', rate: '0%', pitch: '+2%', speakingRate: 1.0, style: 'Say this like a sweet, warm, polite and professional young woman, gentle and courteous' },
  grey: { voice: 'Charon', azure: 'en-US-BrianMultilingualNeural', gender: 'male', rate: '-3%', pitch: '-3%', speakingRate: 0.97, style: 'Say this like a serious, highly intelligent scientist: calm, precise, measured and matter-of-fact' },
  carmen: { voice: 'Gacrux', azure: 'en-US-CoraMultilingualNeural', gender: 'female', rate: '-6%', pitch: '-6%', speakingRate: 0.94, style: 'Say this like a ruthlessly strict, stern retired college dean who has no patience for sloppy work: blunt, firm, clipped and commanding, never warm' },
};
// Filipino and Taglish replies: Filipino neural voices (Azure), Chirp 3 HD in fil-PH (Google).
const AZURE_FILIPINO = { male: 'fil-PH-AngeloNeural', female: 'fil-PH-BlessicaNeural' };

const estimateSeconds = (text) => Math.ceil(text.length / CHARS_PER_SECOND) + 1;

const FILIPINO_WORDS = new Set(['ang', 'ng', 'mga', 'po', 'opo', 'sa', 'ko', 'mo', 'naman', 'ba', 'lang', 'yung', 'iyong', 'ito', 'iyan', 'yan', 'salamat', 'sige', 'anak', 'sandali', 'kayo', 'ako', 'ikaw', 'natin', 'namin', 'niya', 'nila', 'hindi', 'oo', 'wala', 'meron', 'kasi', 'pero', 'para', 'ninyo', 'kailangan', 'gagawin', 'tapos', 'muna', 'din', 'rin', 'pa', 'nga', 'talaga']);
/** 'fil' when the text is mostly Filipino or Taglish, else 'en'. */
function languageOf(text) {
  const words = String(text).toLowerCase().match(/[a-zñ']+/g) || [];
  if (!words.length) return 'en';
  const fil = words.filter((w) => FILIPINO_WORDS.has(w)).length;
  return fil / words.length >= 0.18 ? 'fil' : 'en';
}

/** Which TTS model to use: the newest flash TTS model, then pro; stable before preview. */
function pickTtsModel(ids) {
  const scored = ids
    .map((id) => {
      const m = /^gemini-(\d+)(?:\.(\d+))?-(flash|pro)(-preview)?(?:-[\w-]+)?-tts$/.exec(id);
      if (!m) return null;
      return { id, score: (m[3] === 'flash' ? 1e6 : 0) + (m[4] ? 0 : 1e5) + Number(m[1]) * 100 + Number(m[2] || 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}

/**
 * The text as it should be spoken: no markdown or links read aloud, and sentences that
 * name folder paths are left out (they are shown on screen; read aloud they are noise).
 */
function speakable(raw) {
  const flat = String(raw ?? '')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/\*\*|__|`|#+\s/g, '')
    .replace(/^[\s]*[-•*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = flat.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !/[\w)]\/[\w(]|[A-Za-z]:\\/.test(s));
  return (kept.length ? kept : sentences).join(' ').trim();
}

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

/** A WAV file's sound data (16-bit PCM) as base64, without its header. */
function wavToPcmBase64(b64) {
  const buf = Buffer.from(b64, 'base64');
  if (buf.slice(0, 4).toString('ascii') !== 'RIFF') return b64;
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.slice(i, i + 4).toString('ascii');
    const size = buf.readUInt32LE(i + 4);
    if (id === 'data') return buf.slice(i + 8, i + 8 + size).toString('base64');
    i += 8 + size + (size % 2);
  }
  return b64;
}

/** A refusal that means "stop asking this service for a while" (billing, permission, rate). */
function refusal(provider, status, why) {
  const err = new Error(`${provider}: ${status} ${why}`);
  if (status === 402 || status === 403 || status === 401) err.pauseMs = 10 * 60 * 1000;
  if (status === 429) err.pauseMs = 2 * 60 * 1000;
  return err;
}

function createDeskSpeech({ db, admin, fetchFn, getKey, getGoogleToken = null, HttpsError, today }) {
  let modelCache = { list: null, at: 0 };
  let configCache = { data: null, at: 0 };
  // Skipped without asking (asking costs time on every reply): Gemini models that do not exist
  // for this key, and each service for a while after it refuses (402 billing, 403, 429).
  const badModels = new Map(); // model → until (ms)
  const pausedUntil = new Map(); // provider → until (ms)
  const now = () => Date.now();

  async function config() {
    if (configCache.data && now() - configCache.at < CONFIG_CACHE_MS) return configCache.data;
    let data;
    try {
      const snap = await db.doc('adminConfig/deskVoice').get();
      data = (snap.exists && snap.data()) || {};
    } catch {
      data = {};
    }
    configCache = { data, at: now() };
    return data;
  }

  /** The services to try, in order, that are set up. */
  async function providers() {
    const cfg = await config();
    const order = Array.isArray(cfg.providers) && cfg.providers.length ? cfg.providers.filter((p) => DEFAULT_PROVIDERS.includes(p)) : DEFAULT_PROVIDERS;
    return order.filter((p) => (p === 'google' ? Boolean(getGoogleToken) : p === 'azure' ? Boolean(cfg.azureKey && cfg.azureRegion) : true));
  }

  async function geminiModels(key) {
    if (modelCache.list && now() - modelCache.at < MODEL_CACHE_MS) return modelCache.list;
    let list = [];
    try {
      const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json();
        list = pickTtsModel((data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => String(m.name).replace('models/', '')));
      }
    } catch {
      list = [];
    }
    const merged = [...new Set([...list, ...KNOWN_MODELS])];
    modelCache = { list: merged, at: now() };
    return merged;
  }

  async function failText(res) {
    return (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
  }

  // ── The services ──
  async function viaGoogle(text, persona, lang) {
    const p = PERSONA_VOICES[persona] || PERSONA_VOICES.matt;
    const token = await getGoogleToken();
    const call = (locale) => fetchFn('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ input: { text }, voice: { languageCode: locale, name: `${locale}-Chirp3-HD-${p.voice}` }, audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: SAMPLE_RATE, speakingRate: p.speakingRate || 1 } }),
      signal: AbortSignal.timeout(30000),
    });
    let res = await call(lang === 'fil' ? 'fil-PH' : 'en-US');
    if (!res.ok && res.status === 400 && lang === 'fil') res = await call('en-US'); // no Filipino voice: English one
    if (!res.ok) throw refusal('google', res.status, await failText(res));
    const data = await res.json();
    if (!data.audioContent) throw new Error('google: no audio');
    return { audio: wavToPcmBase64(data.audioContent), sampleRate: SAMPLE_RATE };
  }

  async function viaAzure(text, persona, lang) {
    const cfg = await config();
    const p = PERSONA_VOICES[persona] || PERSONA_VOICES.matt;
    const voice = lang === 'fil' ? AZURE_FILIPINO[p.gender] : p.azure;
    const locale = lang === 'fil' ? 'fil-PH' : 'en-US';
    const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}"><prosody rate="${p.rate}" pitch="${p.pitch || '0%'}">${escapeXml(text)}</prosody></voice></speak>`;
    const res = await fetchFn(`https://${cfg.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': cfg.azureKey, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'raw-24khz-16bit-mono-pcm', 'User-Agent': 'KaTuroDesk' },
      body: ssml,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw refusal('azure', res.status, await failText(res));
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error('azure: no audio');
    return { audio: buf.toString('base64'), sampleRate: SAMPLE_RATE };
  }

  async function viaGemini(text, persona) {
    const key = await getKey();
    const p = PERSONA_VOICES[persona] || PERSONA_VOICES.matt;
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${p.style}:\n${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: p.voice } } } },
    });
    let lastErr = null;
    for (const model of await geminiModels(key)) {
      if ((badModels.get(model) || 0) > now()) continue;
      const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) {
        const why = await failText(res);
        if ([401, 402, 403, 429].includes(res.status)) throw refusal(`gemini ${model}`, res.status, why);
        if (res.status === 404 || res.status === 400) badModels.set(model, now() + MODEL_CACHE_MS);
        lastErr = new Error(`gemini ${model}: ${res.status} ${why}`);
        continue;
      }
      const data = await res.json();
      const part = (data.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData?.data);
      if (!part) { lastErr = new Error(`gemini ${model}: no audio`); continue; }
      const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1]) || SAMPLE_RATE;
      return { audio: part.inlineData.data, sampleRate: rate };
    }
    throw lastErr || new Error('gemini: no voice model answered');
  }

  const VIA = { google: viaGoogle, azure: viaAzure, gemini: viaGemini };

  /** The first service that answers; a refusing service is paused. → { audio, sampleRate, provider } */
  async function synthesize(text, persona, { only = null } = {}) {
    const lang = languageOf(text);
    let lastErr = null;
    for (const provider of only ? [only] : await providers()) {
      if (!only && (pausedUntil.get(provider) || 0) > now()) continue;
      try {
        const out = await VIA[provider](text, persona, lang);
        return { ...out, provider };
      } catch (err) {
        if (err.pauseMs) pausedUntil.set(provider, now() + err.pauseMs);
        console.warn(`[deskSpeak] ${provider} did not answer:`, err?.message || err);
        lastErr = err;
      }
    }
    throw lastErr || new Error('No online voice service is set up.');
  }

  /** Adds seconds to today's count; returns the new total, or null when it would pass the limit. */
  async function reserve(ref, seconds) {
    let total = null;
    await db.runTransaction(async (tx) => {
      const used = (await tx.get(ref)).data()?.desk_speech_seconds ?? 0;
      if (used + seconds > DAILY_SECONDS) {
        total = null;
        return;
      }
      total = used + seconds;
      tx.set(ref, { desk_speech_seconds: admin.firestore.FieldValue.increment(seconds), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    return total;
  }

  // Daily totals for the admin (no names): seconds spoken, replies, limit reached, failures.
  const stat = (fields) => {
    const inc = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, admin.firestore.FieldValue.increment(v)]));
    return db.doc(`deskVoiceStats/${today()}`).set({ ...inc, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
  };

  const adjust = (ref, delta) => (delta ? ref.set({ desk_speech_seconds: admin.firestore.FieldValue.increment(delta) }, { merge: true }).catch(() => {}) : Promise.resolve());

  /** callable: { text, persona } → { audio, sampleRate, seconds, provider, usedSeconds, limitSeconds } | { fallback, usedSeconds, limitSeconds } */
  async function speak(req) {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
    const text = speakable(req.data?.text);
    const persona = String(req.data?.persona || 'matt');
    if (!text) throw new HttpsError('invalid-argument', 'Nothing to say.');
    if (text.length > MAX_CHARS) throw new HttpsError('invalid-argument', `Too long to speak (up to ${MAX_CHARS} characters).`);
    const ref = db.doc(`teachers/${req.auth.uid}/usage/${today()}`);
    const live = (await providers()).filter((p) => (pausedUntil.get(p) || 0) <= now());
    if (!live.length) {
      // Every service refused a moment ago: answer at once (the app uses the laptop's voice).
      const used = (await ref.get()).data()?.desk_speech_seconds ?? 0;
      return { fallback: 'unavailable', usedSeconds: Math.round(used), limitSeconds: DAILY_SECONDS };
    }
    const estimate = estimateSeconds(text);
    const reserved = await reserve(ref, estimate);
    if (reserved === null) {
      const used = (await ref.get()).data()?.desk_speech_seconds ?? 0;
      await stat({ limited: 1 });
      return { fallback: 'limit', usedSeconds: Math.round(used), limitSeconds: DAILY_SECONDS };
    }
    try {
      const out = await synthesize(text, persona);
      const bytes = Math.floor((out.audio.length * 3) / 4);
      const seconds = Math.max(1, Math.round(bytes / (out.sampleRate * 2)));
      await adjust(ref, seconds - estimate); // charge what was really spoken
      await stat({ seconds, replies: 1, [`by_${out.provider}`]: 1 });
      return { audio: out.audio, sampleRate: out.sampleRate, seconds, provider: out.provider, usedSeconds: reserved - estimate + seconds, limitSeconds: DAILY_SECONDS };
    } catch (err) {
      await adjust(ref, -estimate); // nothing was spoken: give the time back
      await stat({ failed: 1 });
      console.warn('[deskSpeak] no online voice answered:', err?.message || err);
      return { fallback: 'unavailable', usedSeconds: reserved - estimate, limitSeconds: DAILY_SECONDS };
    }
  }

  /** Admin "Test": one short sentence through each service → [{ provider, name, ok, ms, error }] */
  async function test() {
    const cfg = await config();
    const out = [];
    for (const provider of DEFAULT_PROVIDERS) {
      const t = now();
      const setUp = provider === 'google' ? Boolean(getGoogleToken) : provider === 'azure' ? Boolean(cfg.azureKey && cfg.azureRegion) : true;
      if (!setUp) {
        out.push({ provider, name: PROVIDER_NAMES[provider], ok: false, ms: 0, error: provider === 'azure' ? 'No Azure key and region saved yet.' : 'Not available on this server.' });
        continue;
      }
      try {
        const r = await synthesize('Hello! This is a voice test.', 'luna', { only: provider });
        pausedUntil.delete(provider);
        out.push({ provider, name: PROVIDER_NAMES[provider], ok: true, ms: now() - t, bytes: Math.floor((r.audio.length * 3) / 4) });
      } catch (err) {
        out.push({ provider, name: PROVIDER_NAMES[provider], ok: false, ms: now() - t, error: String(err?.message || err).slice(0, 300) });
      }
    }
    return out;
  }

  return { speak, test, forget: () => { configCache = { data: null, at: 0 }; pausedUntil.clear(); } };
}

module.exports = { createDeskSpeech, pickTtsModel, speakable, estimateSeconds, languageOf, wavToPcmBase64, PERSONA_VOICES, DAILY_SECONDS, MAX_CHARS, DEFAULT_PROVIDERS };
