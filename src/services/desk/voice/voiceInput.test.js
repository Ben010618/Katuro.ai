import { describe, it, expect, vi, beforeEach } from 'vitest';

const proxy = vi.fn();
vi.mock('../../geminiConfig', () => ({ callGeminiProxy: (...a) => proxy(...a) }));

const { encodeWav, downsample, cleanTranscript, transcribeAudio, TRANSCRIBE_PROMPT, VoiceError } = await import('./voiceInput');

const ascii = (bytes, from, n) => String.fromCharCode(...bytes.slice(from, from + n));

describe('voice input', () => {
  beforeEach(() => proxy.mockReset());

  it('encodes 16 kHz mono 16-bit PCM WAV', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16000);
    const view = new DataView(wav.buffer);
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(ascii(wav, 36, 4)).toBe('data');
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 16383]);
  });

  it('downsamples 48 kHz to 16 kHz by averaging', () => {
    const out = downsample(new Float32Array([0.3, 0.3, 0.3, 0.6, 0.6, 0.6]), 48000, 16000);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(0.6);
    expect(downsample(new Float32Array([1]), 16000, 16000)).toHaveLength(1);
  });

  it('cleans the transcript; "[no speech]" means nothing was said', () => {
    expect(cleanTranscript('  "Gawan mo ako ng 5-item quiz."  ')).toBe('Gawan mo ako ng 5-item quiz.');
    expect(cleanTranscript('Transcript: Alvarez 18, Bautista 15')).toBe('Alvarez 18, Bautista 15');
    expect(cleanTranscript('[no speech]')).toBe('');
    expect(cleanTranscript('')).toBe('');
  });

  it('sends one WAV clip under desk_voice with the transcribe-only prompt', async () => {
    proxy.mockResolvedValue({ text: 'Make a quiz about the water cycle.' });
    await expect(transcribeAudio(new Uint8Array([1, 2, 3]))).resolves.toBe('Make a quiz about the water cycle.');
    const call = proxy.mock.calls[0][0];
    expect(call).toMatchObject({ action: 'desk_voice', temperature: 0, region: 'asia-southeast1' });
    expect(call.contents).toHaveLength(1);
    expect(call.contents[0].parts).toEqual([{ text: TRANSCRIBE_PROMPT }, { inlineData: { mimeType: 'audio/wav', data: 'AQID' } }]);
    expect(TRANSCRIBE_PROMPT).toMatch(/Do not translate/);
    expect(TRANSCRIBE_PROMPT).toMatch(/Do not answer/);
  });

  it('turns gateway failures into plain messages', async () => {
    proxy.mockRejectedValueOnce(Object.assign(new Error('limit'), { dailyLimit: true }));
    await expect(transcribeAudio(new Uint8Array([1]))).rejects.toMatchObject({ code: 'limit', message: expect.stringMatching(/today's voice input limit/) });
    proxy.mockRejectedValueOnce(new Error('functions/unavailable'));
    const err = await transcribeAudio(new Uint8Array([1])).catch((e) => e);
    expect(err).toBeInstanceOf(VoiceError);
    expect(err.code).toBe('network');
  });
});
