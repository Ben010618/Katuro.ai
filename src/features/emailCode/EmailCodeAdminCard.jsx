import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Mail, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  getEmailCodeAdminStatus, saveResendConfig, setEmailCodesEnabled, sendTestEmail,
} from '../../services/emailCode';

const label = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
};
const input = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid rgba(45,106,79,0.2)',
  borderRadius: 8, fontSize: 14, background: 'var(--kt-input-bg)', color: 'var(--kt-text-primary)', outline: 'none', fontFamily: 'inherit',
};
const btn = {
  background: 'var(--kt-surface)', color: '#1a3d2b', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 8,
  padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
};

function Notice({ ok, children }) {
  return (
    <div style={{
      marginTop: 12, display: 'flex', gap: 7, alignItems: 'flex-start',
      background: ok ? '#dcfce7' : 'rgba(224,92,92,0.08)',
      border: `1px solid ${ok ? 'rgba(21,128,61,0.3)' : 'rgba(224,92,92,0.3)'}`, borderRadius: 8, padding: '8px 12px',
    }}>
      {ok ? <CheckCircle2 size={14} color="#15803d" style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={14} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />}
      <p style={{ margin: 0, fontSize: 12, color: ok ? '#14532d' : '#c0392b' }}>{children}</p>
    </div>
  );
}

/** Admin Dashboard → API settings: email codes for website sign-up and sign-in (Resend). */
export default function EmailCodeAdminCard({ adminUid }) {
  const [status, setStatus] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null); // { ok, text }
  const [testedOk, setTestedOk] = useState(false);

  useEffect(() => {
    getEmailCodeAdminStatus()
      .then((s) => { setStatus(s); setFromInput(s.from); })
      .catch((e) => setStatus({ error: e.message }));
  }, []);

  async function run(kind, fn) {
    setBusy(kind); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  }

  const save = () => run('save', async () => {
    await saveResendConfig({ apiKey: keyInput, from: fromInput }, adminUid);
    setKeyInput(''); setTestedOk(false);
    setStatus(await getEmailCodeAdminStatus());
    setMsg({ ok: true, text: 'Saved. Send a test email to check it works.' });
  });

  const test = () => run('test', async () => {
    const r = await sendTestEmail();
    setTestedOk(Boolean(r?.ok));
    setMsg(r?.ok
      ? { ok: true, text: `Test email sent to ${r.to}. Check that inbox (and spam). Network seen by the server: ${r.ip || 'unknown'}.` }
      : { ok: false, text: `Test email failed: ${r?.error || 'unknown error'}` });
  });

  const toggle = () => run('toggle', async () => {
    const next = !status?.enabled;
    await setEmailCodesEnabled(next, adminUid);
    setStatus((s) => ({ ...s, enabled: next }));
    setMsg({ ok: true, text: next
      ? 'Email codes are on. New website sign-ups need a code, and website sign-in asks every 30 days. KaTuroDesk does not ask.'
      : 'Email codes are off. Sign-up and sign-in work as before.' });
  });

  const loading = status === null;
  const canTurnOn = status?.hasKey && testedOk;

  return (
    <div style={{ marginTop: 20, paddingTop: 18, borderTop: '2px dashed rgba(45,106,79,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: '#dcfce7', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Email codes
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--kt-text-primary)' }}>Resend</span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)', maxWidth: 640 }}>
            When on, the website emails a 6-digit code before a new account is made, and asks for a code on sign-in every 30 days.
            KaTuroDesk never asks. If the email service fails, teachers are let in rather than locked out.
          </p>
        </div>
        {loading ? <Loader2 size={14} color="#15803d" style={{ animation: 'spin 1s linear infinite' }} /> : !status.error && (
          <div style={{ background: status.enabled ? '#dcfce7' : '#f3f4f6', padding: '4px 10px', borderRadius: 20, border: `1px solid ${status.enabled ? 'rgba(21,128,61,0.3)' : 'rgba(107,114,128,0.3)'}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: status.enabled ? '#15803d' : '#4b5563' }}>{status.enabled ? 'Codes on' : 'Codes off'}</span>
          </div>
        )}
      </div>

      {status?.error ? <Notice ok={false}>Could not load: {status.error}</Notice> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={label}>Resend API key {status?.hasKey ? `(saved: ${status.keyHint})` : ''}</label>
              <input type="password" autoComplete="off" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
                placeholder={status?.hasKey ? 'Leave empty to keep the saved key' : 're_...'} style={input} />
            </div>
            <div>
              <label style={label}>Sender</label>
              <input value={fromInput} onChange={(e) => setFromInput(e.target.value)} placeholder="KaTuro AI <no-reply@katuro.website>" style={input} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={save} disabled={loading || !!busy} style={{ ...btn, opacity: loading || busy ? 0.6 : 1 }}>
              {busy === 'save' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Save
            </button>
            <button type="button" onClick={test} disabled={loading || !!busy || !status?.hasKey} title="Send a sample code email to your own address"
              style={{ ...btn, opacity: loading || busy || !status?.hasKey ? 0.6 : 1 }}>
              {busy === 'test' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={13} />} Send test email
            </button>
            <button type="button" onClick={toggle} disabled={loading || !!busy || (!status?.enabled && !canTurnOn)}
              title={!status?.enabled && !canTurnOn ? 'Send a test email that arrives first' : ''}
              style={{ ...btn, opacity: loading || busy || (!status?.enabled && !canTurnOn) ? 0.6 : 1 }}>
              {status?.enabled ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
              {status?.enabled ? 'Turn codes off' : 'Turn codes on'}
            </button>
          </div>
          {!status?.enabled && !loading && !canTurnOn && (
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)' }}>
              To turn codes on: save the key, then send a test email and check that it arrives.
            </p>
          )}
        </>
      )}
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
    </div>
  );
}
