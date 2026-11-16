import { describe, it, expect } from 'vitest';
import { withPublishedAddresses } from './findDesk.js';

const LINK = { deskId: 'desk-1', deviceId: 'd', key: 'k', hosts: ['192.168.1.5'], port: 47821, uid: 'u' };

describe('finding KaTuroDesk again after its Wi-Fi address changed', () => {
  it('puts the newly published addresses first and keeps the old ones', () => {
    expect(withPublishedAddresses(LINK, { deskId: 'desk-1', addresses: ['10.0.0.7'], port: 47821 }))
      .toMatchObject({ hosts: ['10.0.0.7', '192.168.1.5'], port: 47821 });
    expect(withPublishedAddresses(LINK, { deskId: 'desk-1', addresses: ['192.168.1.5'], port: 50000 })).toMatchObject({ port: 50000 });
  });

  it('ignores nothing-new, another computer, and bad values', () => {
    expect(withPublishedAddresses(LINK, { deskId: 'desk-1', addresses: ['192.168.1.5'], port: 47821 })).toBeNull();
    expect(withPublishedAddresses(LINK, { deskId: 'other', addresses: ['10.0.0.7'], port: 47821 })).toBeNull();
    expect(withPublishedAddresses(LINK, { deskId: 'desk-1', addresses: ['evil.example.com'], port: 47821 })).toBeNull();
    expect(withPublishedAddresses(LINK, { deskId: 'desk-1', addresses: ['10.0.0.7'], port: 0 })).toBeNull();
    expect(withPublishedAddresses(LINK, null)).toBeNull();
  });
});

describe('only private network addresses', () => {
  it('a public address is never used for the link', () => {
    expect(withPublishedAddresses(LINK, { deskId: 'desk-1', addresses: ['8.8.8.8'], port: 47821 })).toBeNull();
    expect(withPublishedAddresses(LINK, { deskId: 'desk-1', addresses: ['172.20.1.4', '8.8.8.8'], port: 47821 })).toMatchObject({ hosts: ['172.20.1.4', '192.168.1.5'] });
    const many = withPublishedAddresses(LINK, { deskId: 'desk-1', addresses: ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5', '10.0.0.6', '10.0.0.7'], port: 47821 });
    expect(many.hosts).toHaveLength(6);
  });
});
