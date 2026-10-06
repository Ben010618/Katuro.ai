import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../hooks/useEmailCodeGate', () => ({ useEmailCodeGate: vi.fn() }));
vi.mock('./emailCode', async (orig) => ({ ...(await orig()), sendSignInCode: vi.fn(() => new Promise(() => {})) }));

const { needsEmailCode, cleanCode, RECHECK_AFTER_MS } = await import('./emailCode');
const { useEmailCodeGate } = await import('../hooks/useEmailCodeGate');
const { default: EmailCodeGate } = await import('../components/EmailCodeGate');

const NOW = Date.UTC(2026, 9, 6);
const DAY = 24 * 60 * 60 * 1000;

describe('when the website asks for an email code', () => {
  it('waits until both the switch and the last check are loaded', () => {
    expect(needsEmailCode(undefined, null, NOW)).toBeUndefined();
    expect(needsEmailCode({ enabled: true }, undefined, NOW)).toBeUndefined();
  });

  it('never asks while codes are switched off', () => {
    expect(needsEmailCode(null, null, NOW)).toBe(false);
    expect(needsEmailCode({ enabled: false }, null, NOW)).toBe(false);
    expect(needsEmailCode({ enabled: 'yes' }, null, NOW)).toBe(false);
  });

  it('asks teachers who never typed a code, and again after 30 days', () => {
    expect(needsEmailCode({ enabled: true }, null, NOW)).toBe(true);
    expect(needsEmailCode({ enabled: true }, { verifiedAt: NOW - 29 * DAY }, NOW)).toBe(false);
    expect(needsEmailCode({ enabled: true }, { verifiedAt: NOW - RECHECK_AFTER_MS }, NOW)).toBe(true);
    expect(needsEmailCode({ enabled: true }, { verifiedAt: 'junk' }, NOW)).toBe(true);
  });

  it('keeps only the 6 digits people type or paste', () => {
    expect(cleanCode(' 482 913 ')).toBe('482913');
    expect(cleanCode('4829135555')).toBe('482913');
    expect(cleanCode('abc')).toBe('');
  });
});

describe('website pages behind the email code', () => {
  const page = <p>workspace</p>;
  const render = () => renderToStaticMarkup(<EmailCodeGate uid="u1" fallback={<p>loading</p>}>{page}</EmailCodeGate>);

  it('shows the page when no code is needed', () => {
    useEmailCodeGate.mockReturnValue('pass');
    expect(render()).toBe('<p>workspace</p>');
  });

  it('shows the loading screen, not the page, while checking', () => {
    useEmailCodeGate.mockReturnValue('loading');
    expect(render()).toBe('<p>loading</p>');
  });

  it('shows the code screen instead of the page when a code is needed', () => {
    useEmailCodeGate.mockReturnValue('ask');
    const html = render();
    expect(html).toContain('Check your email');
    expect(html).toContain('Sign out');
    expect(html).not.toContain('workspace');
  });
});
