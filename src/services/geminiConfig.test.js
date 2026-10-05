import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────
const state = vi.hoisted(() => ({
  callImpl: null,   // (region, data) => Promise<{ data }>
  streamImpl: null, // (region, data, opts) => Promise<{ stream, data }> | undefined (no .stream)
  log: [],          // { kind: 'call'|'stream', region, data, opts }
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn((app, region) => ({ region })),
  httpsCallable: vi.fn((fns, name, opts) => {
    const fn = (data) => {
      state.log.push({ kind: 'call', region: fns.region, data, name, opts });
      return state.callImpl(fns.region, data);
    };
    if (state.streamImpl) {
      fn.stream = (data, streamOpts) => {
        state.log.push({ kind: 'stream', region: fns.region, data, name, opts, streamOpts });
        return state.streamImpl(fns.region, data, streamOpts);
      };
    }
    return fn;
  }),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => { throw new Error('offline'); }),
  setDoc: vi.fn(async () => {}),
}));
vi.mock('../firebase', () => ({ default: {}, db: {}, auth: { currentUser: { uid: 'u1' } } }));
vi.mock('./db', () => ({ reportAIError: vi.fn(async () => {}) }));
vi.mock('./nvidiaConfig', () => ({
  assertHeaderSafeKey: vi.fn(),
  getNvidiaConfig: vi.fn(async () => null), // no NVIDIA key -> fallback skipped
  callNvidiaChat: vi.fn(),
}));

// Each test gets a fresh module so the session-level region memory resets.
async function load() {
  vi.resetModules();
  return import('./geminiConfig');
}

function fnErr(code, message, details) {
  const e = new Error(message ?? code);
  e.code = `functions/${code}`;
  if (details !== undefined) e.details = details;
  return e;
}

function streamOf(chunks, final) {
  return {
    stream: (async function* gen() {
      for (const c of chunks) yield c;
    })(),
    data: final,
  };
}

const base = { action: 'desk_agent_run', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], temperature: 0.4, maxTokens: 1000 };

beforeEach(() => {
  state.callImpl = async () => ({ data: { text: 'plain', finishReason: 'STOP' } });
  state.streamImpl = null;
  state.log = [];
  // The direct-Gemini last-resort fallback must never hit the network in tests.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Non-streaming path (legacy callers) ─────────────────────────────────────
describe('callGeminiProxy — legacy non-streaming path', () => {
  it('sends exactly the old payload to us-central1 and returns { text, finishReason }', async () => {
    const { callGeminiProxy } = await load();
    const r = await callGeminiProxy({ ...base, responseMimeType: 'application/json', isRetry: false, unitCount: undefined });
    expect(r).toEqual({ text: 'plain', finishReason: 'STOP' });
    expect(state.log).toHaveLength(1);
    const [entry] = state.log;
    expect(entry).toMatchObject({ kind: 'call', region: 'us-central1', name: 'generateAI' });
    expect(entry.opts).toEqual({ timeout: 300000 }); // desk_agent_run is "heavy"
    expect(Object.keys(entry.data).sort()).toEqual(
      ['action', 'contents', 'isRetry', 'maxTokens', 'responseMimeType', 'temperature', 'unitCount'].sort()
    );
    expect(entry.data).not.toHaveProperty('tier');
    expect(entry.data).not.toHaveProperty('stream');
  });

  it('ignores stream:true without an onChunk callback', async () => {
    const { callGeminiProxy } = await load();
    state.streamImpl = vi.fn();
    await callGeminiProxy({ ...base, stream: true });
    expect(state.streamImpl).not.toHaveBeenCalled();
    expect(state.log[0].kind).toBe('call');
    expect(state.log[0].data).not.toHaveProperty('stream');
  });

  it('forwards tier when given', async () => {
    const { callGeminiProxy } = await load();
    await callGeminiProxy({ ...base, tier: 'fast' });
    expect(state.log[0].data.tier).toBe('fast');
  });

  it('missing null text/finishReason default like before', async () => {
    const { callGeminiProxy } = await load();
    state.callImpl = async () => ({ data: {} });
    expect(await callGeminiProxy(base)).toEqual({ text: '', finishReason: null });
  });
});

// ── Streaming path ───────────────────────────────────────────────────────────
describe('callGeminiProxy — streaming', () => {
  it('calls onChunk(delta, full) per chunk and resolves with the final data', async () => {
    const { callGeminiProxy } = await load();
    state.streamImpl = async () => streamOf([{ text: '{"a"' }, { text: ':1}' }], Promise.resolve({ text: '{"a":1}', finishReason: 'STOP' }));
    const onChunk = vi.fn();
    const r = await callGeminiProxy({ ...base, tier: 'fast', stream: true, onChunk });
    expect(r).toEqual({ text: '{"a":1}', finishReason: 'STOP' });
    expect(onChunk.mock.calls).toEqual([['{"a"', '{"a"'], [':1}', '{"a":1}']]);
    expect(state.log.map((l) => l.kind)).toEqual(['stream']);
    expect(state.log[0].data).toMatchObject({ stream: true, tier: 'fast' });
    expect(state.log[0].streamOpts.signal).toBeInstanceOf(AbortSignal);
  });

  it('works against an old deployed function that sends no chunks, only the result', async () => {
    const { callGeminiProxy } = await load();
    state.streamImpl = async () => streamOf([], Promise.resolve({ text: 'whole', finishReason: 'STOP' }));
    const onChunk = vi.fn();
    expect(await callGeminiProxy({ ...base, stream: true, onChunk })).toEqual({ text: 'whole', finishReason: 'STOP' });
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('a throwing onChunk does not break the generation', async () => {
    const { callGeminiProxy } = await load();
    state.streamImpl = async () => streamOf([{ text: 'x' }], Promise.resolve({ text: 'x', finishReason: 'STOP' }));
    const r = await callGeminiProxy({ ...base, stream: true, onChunk: () => { throw new Error('render bug'); } });
    expect(r.text).toBe('x');
  });

  it('falls back to the normal call when .stream is unavailable (same isRetry, no stream flag)', async () => {
    const { callGeminiProxy } = await load();
    state.streamImpl = null; // SDK without .stream
    const r = await callGeminiProxy({ ...base, stream: true, onChunk: vi.fn() });
    expect(r).toEqual({ text: 'plain', finishReason: 'STOP' });
    expect(state.log).toHaveLength(1);
    expect(state.log[0].kind).toBe('call');
    expect(state.log[0].data).not.toHaveProperty('stream');
    expect(state.log[0].data.isRetry).toBeUndefined();
  });

  it('falls back to the normal call (marked isRetry) when .stream throws a non-HTTP error', async () => {
    const { callGeminiProxy } = await load();
    state.streamImpl = async () => { throw new TypeError('response.body is null'); };
    const r = await callGeminiProxy({ ...base, stream: true, onChunk: vi.fn() });
    expect(r.text).toBe('plain');
    expect(state.log.map((l) => l.kind)).toEqual(['stream', 'call']);
    expect(state.log[1].data.isRetry).toBe(true);
    expect(state.log[1].data).not.toHaveProperty('stream');
  });

  it('falls back when the stream ends with neither chunks nor a result', async () => {
    const { callGeminiProxy } = await load();
    state.streamImpl = async () => streamOf([], new Promise(() => {})); // never settles (non-SSE body)
    const r = await callGeminiProxy({ ...base, stream: true, onChunk: vi.fn() });
    expect(r.text).toBe('plain');
    expect(state.log.map((l) => l.kind)).toEqual(['stream', 'call']);
  });

  it('a streamed server error goes through the normal error handling (message/status/dailyLimit/code/details)', async () => {
    const { callGeminiProxy } = await load();
    const details = { dailyLimit: true, plan: 'free', limit: 15 };
    const err = fnErr('resource-exhausted', "You've reached today's Free plan limit (15).", details);
    const rejected = Promise.reject(err);
    rejected.catch(() => {});
    state.streamImpl = async () => ({
      stream: (async function* gen() { throw err; })(), // eslint-disable-line require-yield
      data: rejected,
    });
    const e = await callGeminiProxy({ ...base, stream: true, onChunk: vi.fn() }).catch((x) => x);
    expect(e.message).toBe("You've reached today's Free plan limit (15).");
    expect(e.status).toBe(429);
    expect(e.dailyLimit).toBe(true);
    expect(e.code).toBe('functions/resource-exhausted');
    expect(e.details).toEqual(details);
    expect(state.log.map((l) => l.kind)).toEqual(['stream']); // no plain re-call
  });

  it('an error after chunks were received is rethrown (no silent re-call)', async () => {
    const { callGeminiProxy } = await load();
    const rejected = Promise.reject(fnErr('internal', 'The AI reply was interrupted mid-stream (m): x. Please try again.'));
    rejected.catch(() => {});
    state.streamImpl = async () => {
      return {
        stream: (async function* gen() {
          yield { text: 'par' };
          throw fnErr('internal', 'The AI reply was interrupted mid-stream (m): x. Please try again.');
        })(),
        data: rejected,
      };
    };
    const onChunk = vi.fn();
    const e = await callGeminiProxy({ ...base, stream: true, onChunk, region: 'asia-southeast1' }).catch((x) => x);
    expect(onChunk).toHaveBeenCalledWith('par', 'par');
    expect(e.code).toBe('functions/internal');
    expect(e.message).toMatch(/interrupted mid-stream/);
    expect(state.log.map((l) => `${l.kind}@${l.region}`)).toEqual(['stream@asia-southeast1']);
  });
});

// ── Region ───────────────────────────────────────────────────────────────────
describe('callGeminiProxy — region', () => {
  it('asia not-found -> retries once on us-central1 (same payload) and remembers for the session', async () => {
    const { callGeminiProxy } = await load();
    state.callImpl = async (region) => {
      if (region === 'asia-southeast1') throw fnErr('not-found', 'not-found');
      return { data: { text: 'from-us', finishReason: 'STOP' } };
    };
    const r1 = await callGeminiProxy({ ...base, region: 'asia-southeast1' });
    expect(r1.text).toBe('from-us');
    expect(state.log.map((l) => l.region)).toEqual(['asia-southeast1', 'us-central1']);
    expect(state.log[1].data.isRetry).toBeUndefined(); // 404 never reached the handler: charge normally

    state.log = [];
    await callGeminiProxy({ ...base, region: 'asia-southeast1' });
    expect(state.log.map((l) => l.region)).toEqual(['us-central1']);
  });

  it('asia bare "internal" (no response body) -> retries on us-central1 marked isRetry (never double-charged)', async () => {
    const { callGeminiProxy } = await load();
    state.callImpl = async (region) => {
      if (region === 'asia-southeast1') throw fnErr('internal', 'internal');
      return { data: { text: 'from-us', finishReason: 'STOP' } };
    };
    const r = await callGeminiProxy({ ...base, region: 'asia-southeast1' });
    expect(r.text).toBe('from-us');
    expect(state.log[1]).toMatchObject({ region: 'us-central1', data: { isRetry: true } });
  });

  it('a descriptive handler error in asia is NOT retried in another region', async () => {
    const { callGeminiProxy } = await load();
    state.callImpl = async () => { throw fnErr('invalid-argument', 'Unknown or missing action.'); };
    const e = await callGeminiProxy({ ...base, region: 'asia-southeast1' }).catch((x) => x);
    expect(e.message).toBe('Unknown or missing action.');
    expect(e.code).toBe('functions/invalid-argument');
    expect(state.log.map((l) => l.region)).toEqual(['asia-southeast1']);
  });

  it('streaming to a missing asia function falls back to us-central1', async () => {
    const { callGeminiProxy } = await load();
    state.streamImpl = async (region) => {
      if (region === 'asia-southeast1') {
        const rejected = Promise.reject(fnErr('internal', 'internal'));
        rejected.catch(() => {});
        return { stream: (async function* gen() { throw fnErr('internal', 'internal'); })(), data: rejected }; // eslint-disable-line require-yield
      }
      return streamOf([{ text: 'ok' }], Promise.resolve({ text: 'ok', finishReason: 'STOP' }));
    };
    const onChunk = vi.fn();
    const r = await callGeminiProxy({ ...base, region: 'asia-southeast1', stream: true, onChunk });
    expect(r).toEqual({ text: 'ok', finishReason: 'STOP' });
    expect(state.log.map((l) => `${l.kind}@${l.region}`)).toEqual(['stream@asia-southeast1', 'stream@us-central1']);
    expect(state.log[1].data.isRetry).toBe(true);
  });
});

// ── Voice: never a client-side fallback ─────────────────────────────────────
describe('callGeminiProxy — voice clips (desk_voice)', () => {
  it('a busy server is reported as is: no NVIDIA / direct-Gemini guess at the audio', async () => {
    const { callGeminiProxy } = await load();
    const nv = await import('./nvidiaConfig');
    nv.getNvidiaConfig.mockResolvedValueOnce({ apiKey: 'nv' }); // once: used up by the control call below
    nv.callNvidiaChat.mockResolvedValueOnce('Santos = 18'); // what an engine that cannot hear would invent
    state.callImpl = async () => { throw fnErr('unavailable', 'busy'); };

    const voice = { action: 'desk_voice', contents: [{ role: 'user', parts: [{ text: 'Transcribe' }, { inlineData: { mimeType: 'audio/wav', data: 'UklGRg==' } }] }], temperature: 0, maxTokens: 2048 };
    await expect(callGeminiProxy(voice)).rejects.toBeTruthy();
    expect(nv.callNvidiaChat).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    // Control: other actions still use the fallback (so the check above is meaningful).
    await expect(callGeminiProxy(base)).resolves.toMatchObject({ text: 'Santos = 18', engine: 'nvidia' });
  });
});

// ── Error metadata ───────────────────────────────────────────────────────────
describe('callGeminiProxy — error rethrow', () => {
  it('keeps message/status/dailyLimit and additionally exposes code + details', async () => {
    const { callGeminiProxy } = await load();
    const details = { dailyLimit: true, plan: 'subscription', limit: 50 };
    state.callImpl = async () => { throw fnErr('resource-exhausted', "You've reached today's limit (50).", details); };
    const e = await callGeminiProxy(base).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("You've reached today's limit (50).");
    expect(e.status).toBe(429);
    expect(e.dailyLimit).toBe(true);
    expect(e.code).toBe('functions/resource-exhausted');
    expect(e.details).toEqual(details);
  });

  it('quota exhaustion keeps quotaExhausted/retryAfter', async () => {
    const { callGeminiProxy } = await load();
    state.callImpl = async () => { throw fnErr('resource-exhausted', 'busy', { quotaExhausted: true, retryAfter: 12 }); };
    const e = await callGeminiProxy(base).catch((x) => x);
    expect(e.status).toBe(429);
    expect(e.quotaExhausted).toBe(true);
    expect(e.retryAfter).toBe(12);
    expect(e.dailyLimit).toBeUndefined();
  });

  it('deadline-exceeded keeps the rewritten message and status 408', async () => {
    const { callGeminiProxy } = await load();
    state.callImpl = async () => { throw fnErr('deadline-exceeded', 'deadline-exceeded'); };
    const e = await callGeminiProxy(base).catch((x) => x);
    expect(e.status).toBe(408);
    expect(e.message).toMatch(/took too long/);
    expect(e.code).toBe('functions/deadline-exceeded');
  });

  it('unauthenticated keeps reason', async () => {
    const { callGeminiProxy } = await load();
    state.callImpl = async () => { throw fnErr('unauthenticated', 'Must be signed in.'); };
    const e = await callGeminiProxy(base).catch((x) => x);
    expect(e.reason).toBe('unauthenticated');
    expect(e.message).toBe('Must be signed in.');
    expect(e.code).toBe('functions/unauthenticated');
  });

  it('unexplained internal keeps the generic rewritten message', async () => {
    const { callGeminiProxy } = await load();
    state.callImpl = async () => { throw fnErr('internal', 'internal'); };
    const e = await callGeminiProxy(base).catch((x) => x);
    expect(e.message).toMatch(/went wrong on our end/);
    expect(e.code).toBe('functions/internal');
    expect(e.status).toBeUndefined();
  });
});
