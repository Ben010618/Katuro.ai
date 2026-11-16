import { describe, it, expect } from 'vitest';
import { createLinkClient } from './linkClient.js';

const LINK = { deskId: 'd', deskName: 'Ana-PC', deviceId: 'p1', key: 'A'.repeat(43), hosts: ['10.0.0.2', '10.0.0.3'], port: 47821, uid: 'u' };

// A KaTuroDesk that got the message but never answers in time.
const hanging = (calls) => (url, { signal }) => {
  calls.push(url);
  return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
};

describe('a file change that runs out of time', () => {
  it('is not sent again to the computer\'s other address, and is not kept to send later', async () => {
    const calls = [];
    const client = createLinkClient(LINK, { fetchImpl: hanging(calls) });
    await expect(client.request('replace', { path: 'Lessons/a.pdf', data: 'AA==' }, { timeoutMs: 30 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(calls).toHaveLength(1);
  });

  it('an upload that runs out of time tries the next address and can be kept to send later (UNREACHABLE)', async () => {
    const calls = [];
    const client = createLinkClient(LINK, { fetchImpl: hanging(calls) });
    await expect(client.request('upload', { folder: 'Lessons', name: 'a.jpg', data: 'AA==' }, { timeoutMs: 30 })).rejects.toMatchObject({ code: 'UNREACHABLE' });
    expect(calls).toHaveLength(2);
  });

  it('a read that runs out of time still tries the next address', async () => {
    const calls = [];
    const client = createLinkClient(LINK, { fetchImpl: hanging(calls) });
    await expect(client.request('classes', {}, { timeoutMs: 30 })).rejects.toMatchObject({ code: 'UNREACHABLE' });
    expect(calls).toHaveLength(2);
  });
});
