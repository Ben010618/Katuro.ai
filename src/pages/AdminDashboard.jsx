import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import {
  getAllTeachers, adminCreateUser, adminSetDisabled, adminAddTokens,
} from '../services/db';
import ktLogo from '../assets/KT Favicon.png';
import {
  Users, Plus, Coins, ShieldOff, ShieldCheck, LogOut,
  X, Loader2, AlertCircle, RefreshCw, LayoutDashboard,
  Key, Eye, EyeOff, CheckCircle2, FlaskConical,
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

  const [teachers,      setTeachers]      = useState([]);
  const [loadingList,   setLoadingList]   = useState(true);
  const [listErr,       setListErr]       = useState('');
  const [addUserOpen,   setAddUserOpen]   = useState(false);
  const [tokensTarget,  setTokensTarget]  = useState(null);
  const [togglingUid,   setTogglingUid]   = useState(null);

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

  const totalTokens = teachers.reduce((s, t) => s + (t.tokenBalance ?? 0), 0);
  const activeCount = teachers.filter(t => !t.disabled).length;

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Users',    value: teachers.length,  Icon: Users       },
            { label: 'Active Users',   value: activeCount,      Icon: ShieldCheck },
            { label: 'Tokens in Pool', value: totalTokens,      Icon: Coins       },
          ].map(({ label, value, Icon }) => (
            <div key={label} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#d8f3dc', display: 'grid', placeItems: 'center' }}>
                <Icon size={18} color="#2d6a4f" />
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
                  {teachers.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid rgba(45,106,79,0.06)' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafcfa'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: t.isAdmin ? 'linear-gradient(135deg,#e8a320,#b47a10)' : 'linear-gradient(135deg,#2d6a4f,#52b788)',
                            display: 'grid', placeItems: 'center',
                            fontSize: 10, fontWeight: 700, color: '#fff',
                          }}>
                            {(t.email?.[0] || 'T').toUpperCase()}
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 600, color: '#0d2218' }}>{t.email}</p>
                            {t.isAdmin && <span style={{ fontSize: 10, fontWeight: 700, color: '#b47a10', background: 'rgba(232,163,32,0.12)', borderRadius: 4, padding: '1px 5px' }}>Admin</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: 15, color: '#0d2218' }}>
                          {t.tokenBalance ?? 0}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 9px',
                          background: t.disabled ? 'rgba(224,92,92,0.1)' : '#d8f3dc',
                          color:      t.disabled ? '#c0392b'             : '#1a3d2b',
                        }}>
                          {t.disabled ? 'Disabled' : 'Active'}
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
    </div>
  );
}
