/**
 * phoneFirewall.cjs: does Windows Firewall let a phone reach KaTuroDesk's phone link?
 *
 * On a network Windows calls "Public" (school Wi-Fi often is) phones are blocked unless
 * KaTuroDesk is allowed there, and a "Cancel" on Windows' first prompt leaves Block rules that
 * stop phones on every network. Settings → Phones shows either case; one click (Windows asks the
 * teacher's OK once) replaces KaTuroDesk's incoming rules with one Allow for the link's port.
 */
const { execFile } = require('child_process');

const RULE = 'KaTuroDesk phone link';

function powershell(script, timeout = 15000) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, timeout }, (err, stdout) => resolve(err ? null : String(stdout || '').trim()));
  });
}

/** The PowerShell that reports the network kinds and KaTuroDesk's incoming rules (as JSON). */
function checkScript(exe) {
  const program = String(exe).replace(/'/g, "''");
  return [
    "$c = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.NetworkCategory })",
    `$mine = @(Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue | Where-Object { $_.Program -ieq '${program}' } | Get-NetFirewallRule | Where-Object { [string]$_.Enabled -eq 'True' -and [string]$_.Direction -eq 'Inbound' })`,
    `$named = [bool](Get-NetFirewallRule -DisplayName '${RULE}' -ErrorAction SilentlyContinue)`,
    // Allowed on the kind of network this computer is on now (Public / Private / Domain).
    "$want = @($c | ForEach-Object { if ($_ -eq 'DomainAuthenticated') { 'Domain' } else { $_ } })",
    "$allow = $named -or [bool]($mine | Where-Object { $p = [string]$_.Profile; [string]$_.Action -eq 'Allow' -and ($p -match 'Any' -or ($want | Where-Object { $p -match $_ })) })",
    "$block = [bool]($mine | Where-Object { [string]$_.Action -eq 'Block' })",
    '[pscustomobject]@{ categories = $c; allow = $allow; block = $block } | ConvertTo-Json -Compress',
  ].join('; ');
}

/** The check's JSON → { checked, public, allowed, blocked }. */
function parseCheck(out) {
  if (!out) return { checked: false };
  try {
    const { categories, allow, block } = JSON.parse(out);
    const list = [].concat(categories || []).map(String);
    return { checked: true, public: list.includes('Public'), allowed: Boolean(allow) || !list.length, blocked: Boolean(block) };
  } catch {
    return { checked: false };
  }
}

/** The elevated command: KaTuroDesk's old incoming rules (a Block too) go, one Allow for the port comes. */
function allowScript(exe, port) {
  if (/"/.test(String(exe)) || !Number.isInteger(port)) return null;
  const netsh = `/c netsh advfirewall firewall delete rule name=all dir=in program="${exe}" & netsh advfirewall firewall delete rule name="${RULE}" & netsh advfirewall firewall add rule name="${RULE}" dir=in action=allow program="${exe}" protocol=TCP localport=${port} profile=any enable=yes`;
  return `try { Start-Process -FilePath cmd.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '${netsh.replace(/'/g, "''")}'; 'ok' } catch { 'canceled' }`;
}

const check = async (exe) => parseCheck(await powershell(checkScript(exe)));
async function allow(exe, port) {
  const script = allowScript(exe, port);
  return { ok: Boolean(script) && (await powershell(script, 120000)) === 'ok' };
}

module.exports = { RULE, checkScript, parseCheck, allowScript, check, allow };
