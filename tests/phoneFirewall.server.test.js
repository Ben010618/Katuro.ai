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

  it('the check names this program; the allow command replaces its rules with one for the port', () => {
    expect(checkScript("C:\\Users\\O'Neil\\k.exe")).toContain("-ieq 'C:\\Users\\O''Neil\\k.exe'");
    const s = allowScript('C:\\Program Files\\KaTuroDesk\\KaTuroDesk.exe', 47821);
    expect(s).toContain('-Verb RunAs');
    expect(s).toContain('delete rule name=all dir=in program="C:\\Program Files\\KaTuroDesk\\KaTuroDesk.exe"');
    expect(s).toContain(`add rule name="${RULE}" dir=in action=allow`);
    expect(s).toContain('localport=47821 profile=any');
    expect(allowScript('C:\\a"b.exe', 47821)).toBeNull();
    expect(allowScript('C:\\k.exe', 'x')).toBeNull();
  });
});
