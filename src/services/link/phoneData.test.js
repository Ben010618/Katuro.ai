import { describe, it, expect, beforeEach } from 'vitest';
import { forgetPhoneData, unsentOnPhone } from './phoneData.js';
import { queueRecording, sendQueued, cacheClass, cachedClasses } from './scoreEntry.js';
import { saveLink, loadLink } from './linkStore.js';

beforeEach(() => localStorage.clear());

describe("clearing a teacher's data from the phone", () => {
  it('removes the link, class lists, waiting recordings, schedule and chat', async () => {
    saveLink({ deviceId: 'd', key: 'k', hosts: ['1.2.3.4'], port: 1 });
    cacheClass('Records/A.xlsx', { learners: [{ lrn: '136512340001', name: 'Dela Cruz, Juan P.' }] });
    queueRecording({ id: 'q1', path: 'Records/A.xlsx', column: 'ww1', hps: 10, scores: [] });
    localStorage.setItem('katuro-phone-schedule-v1', '{"days":[]}');
    localStorage.setItem('katuro-phone-chat-v1', '[{"role":"assistant","content":"Juan failed"}]');
    expect((await unsentOnPhone()).recordings).toBe(1);

    await forgetPhoneData();

    expect(loadLink()).toBeNull();
    expect(cachedClasses().classes).toEqual({});
    expect((await unsentOnPhone()).recordings).toBe(0);
    expect(localStorage.getItem('katuro-phone-schedule-v1')).toBeNull();
    expect(localStorage.getItem('katuro-phone-chat-v1')).toBeNull();
  });
});

describe('waiting recordings are sent once, even when two sends start together', () => {
  it('a second send while one is running joins it', async () => {
    queueRecording({ id: 'q1', path: 'Records/A.xlsx', column: 'ww1', hps: 10, scores: [] });
    let calls = 0;
    const client = { request: async () => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return { ok: true }; } };
    const [a, b] = await Promise.all([sendQueued(client), sendQueued(client)]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });
});
