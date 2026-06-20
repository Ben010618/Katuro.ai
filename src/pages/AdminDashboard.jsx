import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import {
  getAllTeachers, adminCreateUser, adminSetDisabled, adminAddTokens,
  adminChangePassword, adminSendPasswordReset,
  subscribeAdminNotifications, markAllNotificationsRead,
} from '../services/db';
import ktLogo from '../assets/KT Favicon.png';
import {
  Users, Plus, Coins, ShieldOff, ShieldCheck, LogOut,
  X, Loader2, AlertCircle, RefreshCw, LayoutDashboard,
  Key, Eye, EyeOff, CheckCircle2, FlaskConical, Lock,
  Bell, UserPlus, Clock,
} from 'lucide-react';
import { saveGeminiKey, getGeminiKeyStatus, testGeminiKey } from '../services/geminiConfig';

// ── style tokens ──────────────────────────────────────────────────────────────
const card = {
  background: '#fff', borderRadius: 14,
  border: '1px solid rgba(45,106,79,0.12)', padding: '20px 22px',
};
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', border: '1.5px solid rgba(45,106,79,0.2)',
  borderRadius: 8, fontSize: 14, background: '#f5faf7',
  color: '#163828', outline: 'none', fontFamily: 'inherit',
};
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: '#4a6357', textTransform: 'uppercase',
  letterSpacing: '0.07em', marginBottom: 6,
};
const btnPrimary = {
  background: '#2d6a4f', color: '#fff', border: 'none',
  borderRadius: 8, padding: '10px 20px', fontSize: 13,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 6,
};
const btnSecondary = {
  background: '#f5faf7', color: '#1a3d2b', border: '1px solid rgba(45,106,79,0.2)',
  borderRadius: 8, padding: '8px 14px', fontSize: 12,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 5,
};

// ── Modal backdrop ────────────────────────────────────────────────────────────
function Modal({ onClose, title, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(13,34,24,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '28px 28px 24px',
        width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(13,34,24,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0d2218' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a6357', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Add User modal ────────────────────────────────────────────────────────────
function AddUserModal({ adminUid, onClose, onSuccess }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [tokens,   setTokens]   = useState(0);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setErr('Email and password are required.'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setSaving(true); setErr('');
    try {
      await adminCreateUser(email.trim().toLowerCase(), password, Number(tokens) || 0, adminUid);
      onSuccess();
      onClose();
    } catch (ex) {
      setErr(ex.message || 'Failed to create account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Add New User">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Email</label>
          <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teacher@school.edu.ph" required />
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required />
        </div>
        <div>
          <label style={labelStyle}>Initial Tokens</label>
          <input style={inputStyle} type="number" min={0} value={tokens} onChange={e => setTokens(e.target.value)} placeholder="0" />
          <p style={{ margin: '5px 0 0', fontSize: 11, color: '#4a6357' }}>3 tokens = 1 Lesson Plan, 1 Quiz, or 1 Presentation</p>
        </div>
        {err && (
          <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 8, padding: '10px 12px' }}>
            <AlertCircle size={14} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: '#c0392b' }}>{err}</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : <><Plus size={14} /> Create Account</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Add Tokens modal ──────────────────────────────────────────────────────────
function AddTokensModal({ target, adminUid, onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n < 1) { setErr('Enter a positive token amount.'); return; }
    setSaving(true); setErr('');
    try {
      await adminAddTokens(target.id, n, note.trim() || `Admin top-up`, adminUid);
      onSuccess();
      onClose();
    } catch (ex) {
      setErr(ex.message || 'Failed to add tokens.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title={`Add Tokens — ${target.email}`}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#f5faf7', borderRadius: 8, padding: '10px 14px' }}>
          <p style={{ margin: 0, fontSize: 12, color: '#4a6357' }}>Current balance</p>
          <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: '#0d2218', fontFamily: '"DM Mono", monospace' }}>
            {target.tokenBalance ?? 0} <span style={{ fontSize: 12, fontWeight: 500, color: '#4a6357' }}>tokens</span>
          </p>
        </div>
        <div>
          <label style={labelStyle}>Tokens to Add</label>
          <input style={inputStyle} type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 9" required />
          <p style={{ margin: '5px 0 0', fontSize: 11, color: '#4a6357' }}>3 tokens = 1 AI action</p>
        </div>
        <div>
          <label style={labelStyle}>Note (optional)</label>
          <input style={inputStyle} type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. September allocation" />
        </div>
        {err && (
          <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 8, padding: '10px 12px' }}>
            <AlertCircle size={14} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: '#c0392b' }}>{err}</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Coins size={14} /> Add Tokens</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Change Password modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ target, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');
  const [done,        setDone]        = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setSaving(true); setErr('');
    try {
      await adminChangePassword(target.id, newPassword);
      onSuccess(target.id, target.password ? newPassword : null);
      setDone(true);
    } catch (ex) {
      setErr(ex.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title={`Password — ${target.email}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Current stored password */}
        <div>
          <label style={labelStyle}>Current Password</label>
          <div style={{ position: 'relative' }}>
            <input
              readOnly
              type={showCurrent ? 'text' : 'password'}
              value={target.password || ''}
              placeholder={target.password ? '' : '(self-registered — not stored)'}
              style={{ ...inputStyle, paddingRight: 42, fontFamily: '"DM Mono", monospace', fontSize: 13, color: target.password ? '#163828' : '#9BB8A5' }}
            />
            {target.password && (
              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#4a6357', padding: 0 }}
              >
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
        </div>

        {done ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#d8f3dc', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 8, padding: '12px 14px' }}>
              <CheckCircle2 size={15} color="#2d6a4f" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#163828' }}>Password set successfully.</p>
                {!target.password && (
                  <p style={{ margin: 0, fontSize: 12, color: '#4a6357' }}>
                    This user self-registered — the new password will take effect the next time they sign in.
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnPrimary}><CheckCircle2 size={14} /> Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setErr(''); }}
                  placeholder="Min 6 characters"
                  style={{ ...inputStyle, paddingRight: 42, fontFamily: '"DM Mono", monospace', fontSize: 13 }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#4a6357', padding: 0 }}
                >
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {err && (
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 8, padding: '10px 12px' }}>
                <AlertCircle size={14} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12, color: '#c0392b' }}>{err}</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
                {saving
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                  : <><Lock size={14} /> Set New Password</>
                }
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

// ── User Details modal ───────────────────────────────────────────────────────
function UserDetailsModal({ teacher: t, onClose }) {
  const statusLabel = t.pendingApproval ? 'Pending Approval' : t.disabled ? 'Disabled' : 'Active';
  const statusColor = t.pendingApproval ? '#d97706' : t.disabled ? '#c0392b' : '#1a3d2b';
  const statusBg    = t.pendingApproval ? '#fef9e7' : t.disabled ? 'rgba(224,92,92,0.1)' : '#d8f3dc';

  const createdAt = t.createdAt
    ? (t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt))
        .toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })
    : '—';

  function Row({ label, value }) {
    return (
      <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(45,106,79,0.08)' }}>
        <span style={{ ...labelStyle, marginBottom: 0, width: 120, flexShrink: 0, lineHeight: '1.4' }}>{label}</span>
        <span style={{ fontSize: 13, color: '#0d2218', fontWeight: 500, flex: 1, wordBreak: 'break-word' }}>{value || '—'}</span>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(13,34,24,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, overflowY: 'auto',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 18, padding: 0,
        width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(13,34,24,0.22)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #2d6a4f 0%, #52b788 100%)',
          padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.25)', display: 'grid', placeItems: 'center',
            fontSize: 18, fontWeight: 700, color: '#fff',
          }}>
            {(t.givenName?.[0] || t.email?.[0] || 'T').toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
              {t.givenName && t.surname ? `${t.givenName} ${t.mi ? t.mi + '. ' : ''}${t.surname}` : t.displayName || t.email}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{t.email}</p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '4px 10px', background: statusBg, color: statusColor }}>
            {statusLabel}
          </span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', borderRadius: 8, padding: 6 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Row label="First Name"   value={t.givenName} />
            <Row label="Middle Init." value={t.mi} />
            <Row label="Last Name"    value={t.surname} />
            <Row label="School"       value={t.school} />
            <Row label="Email"        value={t.email} />
            <Row label="Token Balance" value={t.tokenBalance !== undefined ? `${t.tokenBalance} tokens` : undefined} />
            <Row label="Signed Up"    value={createdAt} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(45,106,79,0.1)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnPrimary}><X size={14} /> Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
// ── API Key section ───────────────────────────────────────────────────────────
function ApiKeySection({ adminUid }) {
  const [keyInput,   setKeyInput]   = useState('');
  const [showKey,    setShowKey]    = useState(false);
  const [status,     setStatus]     = useState(null);  // { hasKey, preview, updatedAt } | null
  const [saving,     setSaving]     = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null);  // null | 'ok' | 'fail'
  const [testMsg,    setTestMsg]    = useState('');
  const [err,        setErr]        = useState('');

  useEffect(() => {
    getGeminiKeyStatus().then(setStatus).catch(() => setStatus({ hasKey: false }));
  }, []);

  async function handleSave() {
    setErr(''); setTestResult(null);
    setSaving(true);
    try {
      await saveGeminiKey(keyInput, adminUid);
      setKeyInput('');
      const fresh = await getGeminiKeyStatus();
      setStatus(fresh);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!keyInput.trim()) { setErr('Enter a key to test first.'); return; }
    setErr(''); setTestResult(null); setTestMsg('');
    setTesting(true);
    try {
      await testGeminiKey(keyInput.trim());
      setTestResult('ok');
      setTestMsg('Key is valid and responding correctly.');
    } catch (e) {
      setTestResult('fail');
      setTestMsg(e.message);
    } finally {
      setTesting(false);
    }
  }

  const formattedDate = status?.updatedAt
    ? (status.updatedAt.toDate ? status.updatedAt.toDate() : new Date(status.updatedAt))
        .toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ede9fe', display: 'grid', placeItems: 'center' }}>
          <Key size={17} color="#6d28d9" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0d2218' }}>Gemini API Settings</h2>
          <p style={{ margin: 0, fontSize: 11, color: '#4a6357' }}>
            Key stored in Firestore — teachers cannot read it
          </p>
        </div>
        {/* Current key status */}
        <div style={{ marginLeft: 'auto' }}>
          {status === null
            ? <Loader2 size={14} color="#9BB8A5" style={{ animation: 'spin 1s linear infinite' }} />
            : status.hasKey
              ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} color="#2d6a4f" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#2d6a4f' }}>Key active</span>
                </div>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#e05c5c' }}>No key set</span>
              )
          }
        </div>
      </div>

      {/* Current key preview */}
      {status?.hasKey && (
        <div style={{ background: '#f5faf7', borderRadius: 8, padding: '8px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={12} color="#4a6357" />
          <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#163828', flex: 1 }}>{status.preview}</span>
          {formattedDate && (
            <span style={{ fontSize: 10, color: '#9BB8A5' }}>Updated {formattedDate}</span>
          )}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>{status?.hasKey ? 'Replace API Key' : 'Set API Key'}</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={e => { setKeyInput(e.target.value); setErr(''); setTestResult(null); }}
              placeholder="AIzaSy••••••••••••••••••••••••••••••"
              style={{ ...inputStyle, paddingRight: 38, fontFamily: '"DM Mono", monospace', fontSize: 13 }}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#4a6357', padding: 0 }}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <button
          onClick={handleTest}
          disabled={testing || !keyInput.trim()}
          title="Test the key before saving"
          style={{ ...btnSecondary, whiteSpace: 'nowrap', opacity: (testing || !keyInput.trim()) ? 0.6 : 1 }}
        >
          {testing
            ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <FlaskConical size={13} />
          }
          Test
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !keyInput.trim()}
          style={{ ...btnPrimary, whiteSpace: 'nowrap', opacity: (saving || !keyInput.trim()) ? 0.6 : 1 }}
        >
          {saving
            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
            : <><Key size={13} /> Save Key</>
          }
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <div style={{
          marginTop: 10, display: 'flex', gap: 7, alignItems: 'flex-start',
          background: testResult === 'ok' ? '#d8f3dc' : 'rgba(224,92,92,0.08)',
          border: `1px solid ${testResult === 'ok' ? 'rgba(45,106,79,0.2)' : 'rgba(224,92,92,0.3)'}`,
          borderRadius: 8, padding: '8px 12px',
        }}>
          {testResult === 'ok'
            ? <CheckCircle2 size={14} color="#2d6a4f" style={{ flexShrink: 0, marginTop: 1 }} />
            : <AlertCircle size={14} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
          }
          <p style={{ margin: 0, fontSize: 12, color: testResult === 'ok' ? '#163828' : '#c0392b' }}>{testMsg}</p>
        </div>
      )}

      {/* Error */}
      {err && (
        <div style={{ marginTop: 10, display: 'flex', gap: 7, background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 8, padding: '8px 12px' }}>
          <AlertCircle size={14} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: '#c0392b' }}>{err}</p>
        </div>
      )}

      <p style={{ margin: '12px 0 0', fontSize: 11, color: '#9BB8A5', lineHeight: 1.6 }}>
        Get your key from{' '}
        <span style={{ color: '#6d28d9', fontWeight: 600 }}>console.cloud.google.com → APIs & Services → Credentials</span>.
        The key is write-only — regular teacher accounts cannot read it from Firestore.
      </p>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [teachers,       setTeachers]       = useState([]);
  const [loadingList,    setLoadingList]     = useState(true);
  const [listErr,        setListErr]         = useState('');
  const [addUserOpen,    setAddUserOpen]     = useState(false);
  const [tokensTarget,   setTokensTarget]    = useState(null);
  const [togglingUid,    setTogglingUid]     = useState(null);
  const [pwTarget,       setPwTarget]        = useState(null);
  const [detailUser,     setDetailUser]      = useState(null);

  // Notifications
  const [notifications,  setNotifications]  = useState([]);
  const [showNotifs,     setShowNotifs]      = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    return subscribeAdminNotifications(setNotifications);
  }, []);

  async function handleMarkAllRead() {
    await markAllNotificationsRead().catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }

  const fetchTeachers = useCallback(async () => {
    setLoadingList(true); setListErr('');
    try {
      const all = await getAllTeachers();
      all.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      setTeachers(all);
    } catch (ex) {
      setListErr(ex.message || 'Could not load users. Check Firestore rules.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  async function toggleDisabled(teacher) {
    setTogglingUid(teacher.id);
    try {
      await adminSetDisabled(teacher.id, !teacher.disabled);
      setTeachers(prev => prev.map(t => t.id === teacher.id ? { ...t, disabled: !t.disabled } : t));
    } finally {
      setTogglingUid(null);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    navigate('/login', { replace: true });
  }

  const totalTokens   = teachers.reduce((s, t) => s + (t.tokenBalance ?? 0), 0);
  const activeCount   = teachers.filter(t => !t.disabled).length;
  const pendingCount  = teachers.filter(t => t.pendingApproval).length;

  // Pending users appear first, then active, then manually-disabled
  const sortedTeachers = [...teachers].sort((a, b) => {
    const rank = t => t.pendingApproval ? 0 : t.disabled ? 2 : 1;
    return rank(a) - rank(b) || (a.email || '').localeCompare(b.email || '');
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f5faf7', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Topbar */}
      <header style={{
        height: 56, background: '#fff', borderBottom: '1px solid rgba(45,106,79,0.12)',
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14,
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <img src={ktLogo} alt="kaTuro AI" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0d2218' }}>kaTuro AI</span>
        <span style={{ fontSize: 12, color: 'rgba(45,106,79,0.4)', margin: '0 2px' }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#2d6a4f' }}>Admin Dashboard</span>
        <div style={{ flex: 1 }} />

        {/* Bell notification button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifs(v => !v)}
            style={{
              ...btnSecondary, fontSize: 12, position: 'relative',
              background: showNotifs ? '#f0f9f4' : undefined,
              borderColor: showNotifs ? 'rgba(45,106,79,0.3)' : undefined,
            }}
            title="Notifications"
          >
            <Bell size={14} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: '#e05c5c', color: '#fff',
                fontSize: 9, fontWeight: 800, lineHeight: 1,
                borderRadius: '50%', width: 16, height: 16,
                display: 'grid', placeItems: 'center',
                border: '2px solid #fff',
              }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {/* Notification panel */}
          {showNotifs && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              width: 340, background: '#fff', borderRadius: 14,
              border: '1px solid rgba(45,106,79,0.12)',
              boxShadow: '0 12px 40px rgba(13,34,24,0.16)',
              zIndex: 100, overflow: 'hidden',
            }}>
              {/* Panel header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid rgba(45,106,79,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Bell size={13} color="#2d6a4f" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0d2218' }}>Notifications</span>
                  {unreadCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#e05c5c', color: '#fff', borderRadius: 20, padding: '1px 7px' }}>
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 10, fontWeight: 700, color: '#2d6a4f', padding: '3px 6px',
                    }}>
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setShowNotifs(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a6357', padding: 2 }}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Notification list */}
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '28px 16px', textAlign: 'center', color: '#9bb8a5' }}>
                    <Bell size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <p style={{ margin: 0, fontSize: 12 }}>No notifications yet</p>
                  </div>
                ) : notifications.map(n => (
                  <div key={n.id} style={{
                    display: 'flex', gap: 10, padding: '12px 16px',
                    borderBottom: '1px solid rgba(45,106,79,0.06)',
                    background: n.read ? '#fff' : '#f0faf5',
                    transition: 'background 0.15s',
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg,#2d6a4f,#52b788)',
                      display: 'grid', placeItems: 'center',
                      fontSize: 12, fontWeight: 700, color: '#fff',
                    }}>
                      {(n.givenName?.[0] || n.email?.[0] || 'T').toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                        <UserPlus size={10} color="#2d6a4f" />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#2d6a4f', textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Registration</span>
                        {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e05c5c', flexShrink: 0 }} />}
                      </div>
                      <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#0d2218' }}>
                        {n.givenName && n.surname ? `${n.givenName} ${n.surname}` : n.displayName || n.email}
                      </p>
                      <p style={{ margin: '0 0 4px', fontSize: 11, color: '#4a6357' }}>{n.school || n.email}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {n.pendingApproval && (
                          <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 20, padding: '2px 7px', background: '#fef9e7', color: '#d97706' }}>
                            Pending Approval
                          </span>
                        )}
                        <span style={{ fontSize: 9, color: '#9bb8a5', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                          <Clock size={8} />{timeAgo(n.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/dashboard')}
          style={{ ...btnSecondary, fontSize: 12 }}
        >
          <LayoutDashboard size={13} /> App
        </button>
        <button onClick={handleLogout} style={{ ...btnSecondary, fontSize: 12 }}>
          <LogOut size={13} /> Sign Out
        </button>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Users',      value: teachers.length, Icon: Users,       accent: '#d8f3dc', iconColor: '#2d6a4f' },
            { label: 'Active Users',     value: activeCount,     Icon: ShieldCheck, accent: '#d8f3dc', iconColor: '#2d6a4f' },
            { label: 'Pending Approval', value: pendingCount,    Icon: ShieldOff,   accent: pendingCount > 0 ? '#fef9e7' : '#f5faf7', iconColor: pendingCount > 0 ? '#d97706' : '#9BB8A5' },
            { label: 'Tokens in Pool',   value: totalTokens,     Icon: Coins,       accent: '#d8f3dc', iconColor: '#2d6a4f' },
          ].map(({ label, value, Icon, accent, iconColor }) => (
            <div key={label} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: accent, display: 'grid', placeItems: 'center' }}>
                <Icon size={18} color={iconColor} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: '#0d2218', fontFamily: '"DM Mono", monospace' }}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* API Key settings */}
        <ApiKeySection adminUid={user?.uid} />

        {/* Users table */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0d2218' }}>Users</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={fetchTeachers} style={btnSecondary} title="Refresh">
                <RefreshCw size={13} />
              </button>
              <button onClick={() => setAddUserOpen(true)} style={btnPrimary}>
                <Plus size={14} /> Add User
              </button>
            </div>
          </div>

          {listErr && (
            <div style={{ display: 'flex', gap: 8, background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <AlertCircle size={15} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#c0392b' }}>{listErr}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#c0392b', opacity: 0.8 }}>
                  Make sure your Firestore security rules allow admins to read <code>/teachers</code>.
                </p>
              </div>
            </div>
          )}

          {loadingList ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10, color: '#4a6357' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Loading users…</span>
            </div>
          ) : teachers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#4a6357' }}>
              <Users size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>No users yet</p>
              <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.7 }}>Click "Add User" to create the first teacher account.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(45,106,79,0.1)' }}>
                    {['Email', 'Tokens', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px 10px', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTeachers.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(45,106,79,0.06)' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafcfa'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          onClick={() => setDetailUser(t)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%' }}
                          title="View user details"
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                              background: t.isAdmin ? 'linear-gradient(135deg,#e8a320,#b47a10)' : 'linear-gradient(135deg,#2d6a4f,#52b788)',
                              display: 'grid', placeItems: 'center',
                              fontSize: 10, fontWeight: 700, color: '#fff',
                            }}>
                              {(t.givenName?.[0] || t.email?.[0] || 'T').toUpperCase()}
                            </div>
                            <div>
                              {(t.givenName || t.surname) && (
                                <p style={{ margin: '0 0 1px', fontWeight: 700, fontSize: 13, color: '#0d2218' }}>
                                  {[t.givenName, t.mi ? `${t.mi}.` : '', t.surname].filter(Boolean).join(' ')}
                                </p>
                              )}
                              <p style={{ margin: 0, fontWeight: 600, color: '#4a6357', fontSize: 12, textDecoration: 'underline dotted' }}>{t.email}</p>
                              {t.isAdmin && <span style={{ fontSize: 10, fontWeight: 700, color: '#b47a10', background: 'rgba(232,163,32,0.12)', borderRadius: 4, padding: '1px 5px' }}>Admin</span>}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: 15, color: '#0d2218' }}>
                          {t.tokenBalance ?? 0}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 9px',
                          background: t.pendingApproval ? '#fef9e7'
                            : t.disabled ? 'rgba(224,92,92,0.1)'
                            : '#d8f3dc',
                          color: t.pendingApproval ? '#d97706'
                            : t.disabled ? '#c0392b'
                            : '#1a3d2b',
                        }}>
                          {t.pendingApproval ? 'Pending Approval' : t.disabled ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setTokensTarget(t)}
                            style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11 }}
                            title="Add tokens"
                          >
                            <Coins size={12} /> Tokens
                          </button>
                          <button
                            onClick={() => setPwTarget(t)}
                            style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11 }}
                            title="View / change password"
                          >
                            <Lock size={12} /> Password
                          </button>
                          {!t.isAdmin && (
                            <button
                              onClick={() => toggleDisabled(t)}
                              disabled={togglingUid === t.id}
                              style={{
                                ...btnSecondary, padding: '5px 10px', fontSize: 11,
                                opacity: togglingUid === t.id ? 0.6 : 1,
                                color: t.disabled ? '#2d6a4f' : '#c0392b',
                                borderColor: t.disabled ? 'rgba(45,106,79,0.2)' : 'rgba(224,92,92,0.25)',
                              }}
                              title={t.disabled ? 'Enable account' : 'Disable account'}
                            >
                              {togglingUid === t.id
                                ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                                : t.disabled
                                  ? <><ShieldCheck size={12} /> Enable</>
                                  : <><ShieldOff size={12} /> Disable</>
                              }
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Firestore rules reminder */}
        <div style={{ marginTop: 18, background: 'rgba(232,163,32,0.08)', border: '1px solid rgba(232,163,32,0.25)', borderRadius: 12, padding: '14px 18px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#b47a10' }}>Firestore Security Rules</p>
          <p style={{ margin: 0, fontSize: 12, color: '#7a5a10', lineHeight: 1.65 }}>
            Add this to your Firestore rules so admins can read/write all teacher docs:
          </p>
          <pre style={{ margin: '8px 0 0', fontSize: 11, background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '10px 14px', overflowX: 'auto', color: '#0d2218', lineHeight: 1.7 }}>{`function isAdmin() {
  return get(/databases/$(database)/documents/teachers/$(request.auth.uid)).data.isAdmin == true;
}
match /teachers/{uid} {
  allow read, write: if request.auth.uid == uid || isAdmin();
  match /{col}/{docId} {
    allow read, write: if request.auth.uid == uid || isAdmin();
  }
}`}</pre>
        </div>

      </div>

      {addUserOpen && (
        <AddUserModal
          adminUid={user?.uid}
          onClose={() => setAddUserOpen(false)}
          onSuccess={fetchTeachers}
        />
      )}
      {tokensTarget && (
        <AddTokensModal
          target={tokensTarget}
          adminUid={user?.uid}
          onClose={() => setTokensTarget(null)}
          onSuccess={() => {
            fetchTeachers();
            setTokensTarget(null);
          }}
        />
      )}
      {pwTarget && (
        <ChangePasswordModal
          target={pwTarget}
          onClose={() => setPwTarget(null)}
          onSuccess={(uid, newPw) => {
            setTeachers(prev => prev.map(t => t.id === uid ? { ...t, password: newPw } : t));
            setPwTarget(prev => prev ? { ...prev, password: newPw } : null);
          }}
        />
      )}
      {detailUser && (
        <UserDetailsModal
          teacher={detailUser}
          onClose={() => setDetailUser(null)}
        />
      )}
    </div>
  );
}
