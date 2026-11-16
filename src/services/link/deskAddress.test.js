import { describe, it, expect } from 'vitest';
import { deskAddressDoc, deskAddressKey } from './deskAddress.js';

const status = { running: true, deskId: 'desk-1', deskName: "Ana's laptop", port: 47821, addresses: ['192.168.1.5', '10.0.0.2', '192.168.1.5'], devices: [{ id: 'p1', name: 'phone' }], pairing: null };

describe('where KaTuroDesk listens, for the phone to find it again', () => {
  it('publishes only the addresses, port and name — nothing about phones or learners', () => {
    expect(deskAddressDoc(status)).toEqual({ deskId: 'desk-1', deskName: "Ana's laptop", addresses: ['192.168.1.5', '10.0.0.2'], port: 47821 });
  });

  it('publishes nothing when the link is not running or has no address', () => {
    expect(deskAddressDoc(null)).toBeNull();
    expect(deskAddressDoc({ ...status, running: false })).toBeNull();
    expect(deskAddressDoc({ ...status, addresses: [] })).toBeNull();
    expect(deskAddressDoc({ ...status, port: null })).toBeNull();
  });

  it('a change of address is noticed; a change of linked phones is not (no write needed)', () => {
    const a = deskAddressKey(deskAddressDoc(status));
    expect(deskAddressKey(deskAddressDoc({ ...status, devices: [] }))).toBe(a);
    expect(deskAddressKey(deskAddressDoc({ ...status, addresses: ['192.168.43.10'] }))).not.toBe(a);
    expect(deskAddressKey(null)).toBe('');
  });
});
