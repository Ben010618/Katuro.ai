import { describe, it, expect, vi } from 'vitest';
import { retryAsync } from './retry';

describe('retryAsync', () => {
  it('returns the result immediately on first success, no retries', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryAsync(fn, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries after a transient failure and succeeds on a later attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce('ok');
    const result = await retryAsync(fn, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error once every attempt is exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanently down'));
    await expect(retryAsync(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow('permanently down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('defaults to 3 attempts when no options are given', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(retryAsync(fn, { baseDelayMs: 1 })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
