import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/firebase.js', () => ({ db: {}, auth: {}, firebaseConfig: { projectId: 'x' }, USE_EMULATORS: false }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => async () => ({ data: {} }) }));

const { extractLinks, linkDomain, fileProblem, formatBytes, MAX_FILE_BYTES } = await import('../src/services/messages/chatService.js');

describe('chat helpers', () => {
  it('finds links, lowercases a capitalised scheme, trims trailing punctuation, max 5', () => {
    expect(extractLinks('See Https://www.deped.gov.ph/orders.')).toEqual(['https://www.deped.gov.ph/orders']);
    expect(extractLinks('HTTP://a.ph and http://a.ph')).toEqual(['http://a.ph']);
    expect(extractLinks('no link here, javascript:alert(1)')).toEqual([]);
    const many = Array.from({ length: 8 }, (_, i) => `https://s${i}.ph`).join(' ');
    expect(extractLinks(many)).toHaveLength(5);
  });

  it('link domain drops www; bad URLs give empty', () => {
    expect(linkDomain('https://www.deped.gov.ph/x')).toBe('deped.gov.ph');
    expect(linkDomain('not a url')).toBe('');
  });

  it('files: only Word, Excel, PowerPoint, PDF and images, up to 25 MB', () => {
    expect(fileProblem('TOS.docx', 1000)).toBeFalsy();
    expect(fileProblem('photo.JPG', 1000)).toBeFalsy();
    expect(fileProblem('setup.exe', 1000)).toBeTruthy();
    expect(fileProblem('big.pdf', MAX_FILE_BYTES + 1)).toBeTruthy();
    expect(formatBytes(25 * 1024 * 1024)).toMatch(/25/);
  });
});
