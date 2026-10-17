/**
 * deskSpeech.js — KaTuroDesk personas speak with natural voices (Gemini text-to-speech).
 *
 * One call = one short piece of text spoken in the persona's voice. Each teacher has a
 * daily allowance of natural speech (DAILY_SECONDS, counted in seconds of audio, on the
 * Manila calendar day, in teachers/{uid}/usage/{date}.desk_speech_seconds). When it is used
 * up, or the voice service is unavailable, the call answers { fallback } instead of failing:
 * KaTuroDesk then speaks with the computer's own voice, so the persona never goes silent.
 */

const DAILY_SECONDS = 300; // 5 minutes of natural voice per teacher per day
const MAX_CHARS = 600;
const SAMPLE_RATE = 24000; // Gemini TTS: 16-bit mono PCM at 24 kHz
const CHARS_PER_SECOND = 13; // about 150 words a minute, for the advance reservation
const MODEL_CACHE_MS = 6 * 60 * 60 * 1000;
const KNOWN_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'];

// Voice and speaking style per persona (Gemini prebuilt voices).
const PERSONA_VOICES = {
  matt: { voice: 'Puck', style: 'Say this like a cheerful, energetic young Filipino teacher talking to a co-teacher friend, upbeat and natural' },
  luna: { voice: 'Sulafat', style: 'Say this like a calm, warm and polite young Filipino woman, soft-spoken and kind' },
  grey: { voice: 'Charon', style: 'Say this like a calm, precise and friendly young man who explains things clearly' },
  carmen: { voice: 'Gacrux', style: 'Say this like a gentle, wise Filipino grandmother who was a college dean, slow, warm and caring' },
};

const estimateSeconds = (text) => Math.ceil(text.length / CHARS_PER_SECOND) + 1;

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

function createDeskSpeech({ db, admin, fetchFn, getKey, HttpsError, today }) {
  let modelCache = { list: null, at: 0 };

  async function models(key) {
    if (modelCache.list && Date.now() - modelCache.at < MODEL_CACHE_MS) return modelCache.list;
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
    modelCache = { list: merged, at: Date.now() };
    return merged;
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

  const adjust = (ref, delta) => (delta ? ref.set({ desk_speech_seconds: admin.firestore.FieldValue.increment(delta) }, { merge: true }).catch(() => {}) : Promise.resolve());

  async function tts(key, text, persona) {
    const p = PERSONA_VOICES[persona] || PERSONA_VOICES.matt;
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${p.style}:\n${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: p.voice } } } },
    });
    let lastErr = null;
    for (const model of await models(key)) {
      try {
        const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(45000),
        });
        if (res.status === 404 || res.status === 400) { lastErr = new Error(`${model}: ${res.status}`); continue; }
        if (!res.ok) throw new Error(`${model}: ${res.status}`);
        const data = await res.json();
        const part = (data.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData?.data);
        if (!part) { lastErr = new Error(`${model}: no audio`); continue; }
        const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1]) || SAMPLE_RATE;
        return { audio: part.inlineData.data, sampleRate: rate, model };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('No voice model answered.');
  }

  /** callable: { text, persona } → { audio, sampleRate, seconds, usedSeconds, limitSeconds } | { fallback, usedSeconds, limitSeconds } */
  async function speak(req) {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
    const text = speakable(req.data?.text);
    const persona = String(req.data?.persona || 'matt');
    if (!text) throw new HttpsError('invalid-argument', 'Nothing to say.');
    if (text.length > MAX_CHARS) throw new HttpsError('invalid-argument', `Too long to speak (up to ${MAX_CHARS} characters).`);
    const ref = db.doc(`teachers/${req.auth.uid}/usage/${today()}`);
    const estimate = estimateSeconds(text);
    const reserved = await reserve(ref, estimate);
    if (reserved === null) {
      const used = (await ref.get()).data()?.desk_speech_seconds ?? 0;
      return { fallback: 'limit', usedSeconds: Math.round(used), limitSeconds: DAILY_SECONDS };
    }
    try {
      const key = await getKey();
      const out = await tts(key, text, persona);
      const bytes = Math.floor((out.audio.length * 3) / 4);
      const seconds = Math.max(1, Math.round(bytes / (out.sampleRate * 2)));
      await adjust(ref, seconds - estimate); // charge what was really spoken
      return { audio: out.audio, sampleRate: out.sampleRate, seconds, usedSeconds: reserved - estimate + seconds, limitSeconds: DAILY_SECONDS };
    } catch (err) {
      await adjust(ref, -estimate); // nothing was spoken: give the time back
      console.warn('[deskSpeak] natural voice unavailable:', err?.message || err);
      return { fallback: 'unavailable', usedSeconds: reserved - estimate, limitSeconds: DAILY_SECONDS };
    }
  }

  return { speak };
}

module.exports = { createDeskSpeech, pickTtsModel, speakable, estimateSeconds, PERSONA_VOICES, DAILY_SECONDS, MAX_CHARS };
