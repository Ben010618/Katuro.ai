import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseCheck, checkScript, allowScript, RULE } = require('../electron/phoneFirewall.cjs');

describe('Windows Firewall and the phone link', () => {
  it('reads the check: allowed, blocked, or a network Windows does not report', () => {
    expect(parseCheck('{"categories":["Public"],"allow":true,"block":false}')).toEqual({ checked: true, public: true, allowed: true, blocked: false });
    expect(parseCheck('{"categories":"Private","allow":false,"block":true}')).toEqual({ checked: true, public: false, allowed: false, blocked: true });
    expect(parseCheck('{"categories":null,"allow":false,"block":false}')).toMatchObject({ checked: true, allowed: true });
    expect(parseCheck('')).toEqual({ checked: false });
    expect(parseCheck('not json')).toEqual({ checked: false });
  });

  it('the check counts only this program\'s rules; the allow command replaces them with one for the whole program', () => {
    const check = checkScript("C:\\Users\\O'Neil\\k.exe");
    expect(check).toContain("-ieq 'C:\\Users\\O''Neil\\k.exe'");
    expect(check).not.toContain('DisplayName'); // a rule's name alone never counts
    expect(checkScript('C:\\Users\\O\u2019Neil\\k.exe')).toContain('O\u2019\u2019Neil');
    const s = allowScript('C:\\Program Files\\KaTuroDesk\\KaTuroDesk.exe');
    expect(s).toContain('-Verb RunAs');
    expect(s).toContain('delete rule name=all dir=in program="C:\\Program Files\\KaTuroDesk\\KaTuroDesk.exe"');
    expect(s).toContain(`add rule name="${RULE}" dir=in action=allow program="C:\\Program Files\\KaTuroDesk\\KaTuroDesk.exe" protocol=TCP profile=any`);
    expect(s).not.toContain('localport'); // the phone capture page has a port of its own
    expect(allowScript('C:\\a"b.exe')).toBeNull();
    expect(allowScript('C:\\%TEMP%\\k.exe')).toBeNull();
  });
});
