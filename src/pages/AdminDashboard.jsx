import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import {
  getAllTeachers, adminCreateUser, adminSetDisabled, adminAddTokens,
  adminChangePassword, adminSendPasswordReset, adminDeleteUser,
  subscribeAdminNotifications, markAllNotificationsRead,
  adminSetFreeMode, subscribeFreeModeStatus,
} from '../services/db';
import { collection, getDocs, query, orderBy, limit, doc, updateDoc, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import ktLogo from '../assets/KT-Favicon.webp';
import {
  Users, Plus, Coins, ShieldOff, ShieldCheck, LogOut,
  X, Loader2, AlertCircle, RefreshCw, LayoutDashboard,
  Key, Eye, EyeOff, CheckCircle2, FlaskConical, Lock,
  Bell, UserPlus, Clock, Moon, Sun, Trash2,
  ToggleLeft, ToggleRight, Bug, Gift, BarChart2, Download,
  FileSpreadsheet, UserCheck,
} from 'lucide-react';
import { saveGeminiKey, getGeminiKeyStatus, testGeminiKey } from '../services/geminiConfig';
import { saveAs } from 'file-saver';

// Mirrors MAX_ACCOUNTS in functions/index.js's registerUser — keep in sync.
// Bulk-approving pending accounts must never push active users past this cap.
const MAX_ACCOUNTS = 500;

// ── style tokens ──────────────────────────────────────────────────────────────
const card = {
  background: 'var(--kt-card)', borderRadius: 14,
  border: '1px solid var(--kt-border)', padding: '20px 22px',
};
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', border: '1.5px solid rgba(45,106,79,0.2)',
  borderRadius: 8, fontSize: 14, background: 'var(--kt-input-bg)',
  color: 'var(--kt-text-primary)', outline: 'none', fontFamily: 'inherit',
};
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'var(--kt-text-secondary)', textTransform: 'uppercase',
  letterSpacing: '0.07em', marginBottom: 6,
};
const btnPrimary = {
  background: '#2d6a4f', color: '#fff', border: 'none',
  borderRadius: 8, padding: '10px 20px', fontSize: 13,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 6,
};
const btnSecondary = {
  background: 'var(--kt-surface)', color: '#1a3d2b', border: '1px solid rgba(45,106,79,0.2)',
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
        background: 'var(--kt-card)', borderRadius: 16, padding: '28px 28px 24px',
        width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(13,34,24,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)', padding: 4 }}>
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
          <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)' }}>3 tokens = 1 Lesson Plan or 1 Quiz</p>
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
        <div style={{ background: 'var(--kt-surface)', borderRadius: 8, padding: '10px 14px' }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)' }}>Current balance</p>
          <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: '"DM Mono", monospace' }}>
            {target.tokenBalance ?? 0} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--kt-text-secondary)' }}>tokens</span>
          </p>
        </div>
        <div>
          <label style={labelStyle}>Tokens to Add</label>
          <input style={inputStyle} type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 9" required />
          <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--kt-text-secondary)' }}>3 tokens = 1 AI action</p>
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
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)', padding: 0 }}
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
                <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Password set successfully.</p>
                {!target.password && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)' }}>
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
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)', padding: 0 }}
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
        <span style={{ fontSize: 13, color: 'var(--kt-text-primary)', fontWeight: 500, flex: 1, wordBreak: 'break-word' }}>{value || '—'}</span>
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
        background: 'var(--kt-card)', borderRadius: 18, padding: 0,
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

// ── Analytics Section ─────────────────────────────────────────────────────────
const FEATURE_LABELS = {
  ilaw_generated:        'ILAW Lesson',
  dll_generated:         'Daily Lesson Log',
  cot_generated:         'COT Plan',
  quiz_generated:        'Quiz',
  bubble_sheet_generated:'Bubble Sheet',
  lesson_exported_docx:  'DOCX Export',
  lesson_shared:         'Share Link',
  login:                 'Site Visit',
  shares_post_created:   'Shares Post',
  shares_comment_added:  'Shares Comment',
  shares_reaction_added: 'Shares Reaction',
  shares_follow_added:   'Shares Follow',
  test_builder_tos_generated:   'Test Builder TOS',
  test_builder_items_generated: 'Test Builder Items',
  classroom_section_created:    'Class Created',
  classroom_grades_saved:       'Grades Saved',
  classroom_grades_submitted:   'Grades Submitted',
  action_research_phase1_generated: 'Action Research P1',
  action_research_phase2_generated: 'Action Research P2',
  action_research_phase3_generated: 'Action Research P3',
  action_research_phase4_generated: 'Action Research P4',
  action_research_phase5_generated: 'Action Research P5',
  action_research_phase6_generated: 'Action Research P6',
  action_research_completed:        'Action Research Completed',
};

// Diagnostic event types — power specific charts (reliability, funnels) but
// don't represent a teacher "using a feature," so they're excluded from
// feature-popularity and adoption-depth aggregates.
const NON_FEATURE_EVENTS = new Set([
  'login', 'ai_generation',
  'lessongen_step_viewed', 'dllgen_step_viewed', 'cotgen_step_viewed', 'test_builder_step_viewed',
]);

const FEATURE_COLORS = [
  '#2d6a4f','#40916c','#52b788','#74c69d',
  '#e8a320','#6d28d9','#0284c7','#e05c5c','#16a34a',
];

function buildDailyData(events, days = 30) {
  const buckets = {};
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { count: 0, uids: new Set() };
  }
  events.forEach(e => {
    const d = e.ts?.toDate ? e.ts.toDate() : new Date(e.ts);
    const key = d.toISOString().slice(0, 10);
    if (key in buckets) {
      buckets[key].count++;
      buckets[key].uids.add(e.uid);
    }
  });
  return Object.entries(buckets).map(([date, { count, uids }]) => ({
    date: date.slice(5), // MM-DD
    count,
    users: uids.size,
  }));
}

function buildTopVisitors(events, teachers, top = 5) {
  const counts = {};
  events.forEach(e => {
    if (e.feature !== 'login') return;
    counts[e.uid] = (counts[e.uid] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([uid, visits]) => {
      const t = teachers.find(t => t.id === uid);
      const label = t
        ? (t.givenName && t.surname ? `${t.givenName} ${t.surname}` : t.email || uid)
        : uid;
      return { uid, label, visits };
    });
}

function buildHourData(events) {
  const counts = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: 0 }));
  events.forEach(e => {
    const d = e.ts?.toDate ? e.ts.toDate() : new Date(e.ts);
    counts[d.getHours()].count++;
  });
  return counts;
}

function buildFeatureData(events) {
  const counts = {};
  events.forEach(e => {
    const label = FEATURE_LABELS[e.feature] || e.feature;
    counts[label] = (counts[label] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

const TOOL_LABELS = {
  ilaw: 'ILAW Lesson',
  dll:  'Daily Lesson Log',
  cot:  'COT Plan',
  quiz: 'Quiz',
  test_builder_items: 'Test Builder Items',
  ar_phase1: 'Action Research P1',
  ar_phase2: 'Action Research P2',
  ar_phase3: 'Action Research P3',
  ar_phase4: 'Action Research P4',
  ar_phase5_data: 'Action Research P5 (Data)',
  ar_phase5_instrument: 'Action Research P5 (Instrument)',
  ar_phase6: 'Action Research P6',
};

function formatDuration(ms) {
  if (ms == null) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Reliability of AI generation calls — separate from feature-popularity
 * counts, since a failed attempt still logs an 'ai_generation' event but
 * must never be confused with a successful '*_generated' feature use.
 */
function buildGenerationStats(events) {
  const genEvents = events.filter(e => e.feature === 'ai_generation');
  const total     = genEvents.length;
  const successes = genEvents.filter(e => e.success).length;
  const successRate = total > 0 ? Math.round((successes / total) * 100) : null;

  const durations = genEvents
    .filter(e => e.success && typeof e.durationMs === 'number')
    .map(e => e.durationMs);
  const avgDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  const recentErrors = genEvents
    .filter(e => !e.success)
    .sort((a, b) => (b.ts?.toMillis?.() || 0) - (a.ts?.toMillis?.() || 0))
    .slice(0, 5);

  return { total, successes, failures: total - successes, successRate, avgDurationMs, recentErrors };
}

function teacherCreatedMs(t) {
  return t?.createdAt?.toMillis ? t.createdAt.toMillis() : null;
}

/** New signups per day, from teachers.createdAt — no new instrumentation needed. */
function buildSignupData(teachers, days = 30) {
  const buckets = {};
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(now - i * 86400000).toISOString().slice(0, 10);
    buckets[key] = 0;
  }
  teachers.forEach(t => {
    const ms = teacherCreatedMs(t);
    if (!ms) return;
    const key = new Date(ms).toISOString().slice(0, 10);
    if (key in buckets) buckets[key]++;
  });
  return Object.entries(buckets).map(([date, count]) => ({ date: date.slice(5), count }));
}

/** Top schools by teacher count — reuses the school field already collected at signup. */
function buildTopSchools(teachers, top = 8) {
  const counts = {};
  teachers.forEach(t => {
    const school = (t.school || '').trim();
    if (school) counts[school] = (counts[school] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([school, count]) => ({ school, count }));
}

/** How many distinct features each active teacher touched — depth, not just volume. */
function buildAdoptionDepth(featureEvents) {
  const perUser = {};
  featureEvents.forEach(e => {
    (perUser[e.uid] ||= new Set()).add(e.feature);
  });
  const buckets = { '1 feature': 0, '2 features': 0, '3+ features': 0 };
  Object.values(perUser).forEach(set => {
    if (set.size === 1) buckets['1 feature']++;
    else if (set.size === 2) buckets['2 features']++;
    else if (set.size >= 3) buckets['3+ features']++;
  });
  return Object.entries(buckets).map(([name, count]) => ({ name, count }));
}

/** New vs. returning active users in the selected window, by signup date. */
function buildNewVsReturning(events, teachers, days) {
  const cutoff = Date.now() - days * 86400000;
  const activeUids = new Set(events.map(e => e.uid));
  let newCount = 0;
  let returningCount = 0;
  activeUids.forEach(uid => {
    const ms = teacherCreatedMs(teachers.find(t => t.id === uid));
    if (ms && ms >= cutoff) newCount++;
    else returningCount++;
  });
  return { newCount, returningCount };
}

/** Teachers who existed before the window but logged zero activity inside it. */
function buildInactiveCount(events, teachers, days) {
  const cutoff = Date.now() - days * 86400000;
  const activeUids = new Set(events.map(e => e.uid));
  return teachers.filter(t => {
    const ms = teacherCreatedMs(t);
    return ms && ms < cutoff && !activeUids.has(t.id);
  }).length;
}

/**
 * Weekly signup cohorts × Day-1/7/30 retention. A checkpoint only counts
 * toward the denominator once the cohort has actually reached that many
 * days since signup — a teacher who joined 3 days ago is excluded from the
 * Day-7 calculation entirely rather than counted as churned.
 */
function buildRetentionCohorts(events, teachers, days) {
  const now = Date.now();
  const weeksBack = Math.max(1, Math.min(8, Math.ceil(days / 7)));
  const eventsByUid = {};
  events.forEach(e => {
    const ms = e.ts?.toMillis ? e.ts.toMillis() : null;
    if (ms) (eventsByUid[e.uid] ||= []).push(ms);
  });

  const cohorts = [];
  for (let w = weeksBack - 1; w >= 0; w--) {
    const weekStart = now - (w + 1) * 7 * 86400000;
    const weekEnd   = now - w * 7 * 86400000;
    const cohortTeachers = teachers.filter(t => {
      const ms = teacherCreatedMs(t);
      return ms && ms >= weekStart && ms < weekEnd;
    });
    if (cohortTeachers.length === 0) continue;

    const checkpoint = (dayN) => {
      let retained = 0;
      let eligible = 0;
      cohortTeachers.forEach(t => {
        const signupMs = teacherCreatedMs(t);
        const checkMs = signupMs + dayN * 86400000;
        if (checkMs > now) return;
        eligible++;
        const hits = eventsByUid[t.id] || [];
        if (hits.some(ms => ms >= signupMs && ms <= checkMs)) retained++;
      });
      return eligible > 0 ? Math.round((retained / eligible) * 100) : null;
    };

    cohorts.push({
      label: new Date(weekStart).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
      size: cohortTeachers.length,
      day1:  checkpoint(1),
      day7:  checkpoint(7),
      day30: checkpoint(30),
    });
  }
  return cohorts;
}

/** Sessions per active user (30-minute inactivity gap closes a session) and average length. */
function buildSessionStats(events) {
  const byUser = {};
  events.forEach(e => {
    const ms = e.ts?.toMillis ? e.ts.toMillis() : null;
    if (ms) (byUser[e.uid] ||= []).push(ms);
  });

  const GAP_MS = 30 * 60 * 1000;
  let totalSessions = 0;
  const durations = [];

  Object.values(byUser).forEach(timestamps => {
    timestamps.sort((a, b) => a - b);
    let sessionStart = timestamps[0];
    let lastTs = timestamps[0];
    totalSessions++;
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] - lastTs > GAP_MS) {
        durations.push(lastTs - sessionStart);
        totalSessions++;
        sessionStart = timestamps[i];
      }
      lastTs = timestamps[i];
    }
    durations.push(lastTs - sessionStart);
  });

  const avgSessionMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  return { totalSessions, avgSessionMs };
}

/** Generation demand by subject and grade level — already logged in event metadata. */
function buildSubjectGradeData(featureEvents) {
  const subjectCounts = {};
  const gradeCounts   = {};
  featureEvents.forEach(e => {
    if (e.subject) subjectCounts[e.subject] = (subjectCounts[e.subject] || 0) + 1;
    if (e.grade)   gradeCounts[e.grade]     = (gradeCounts[e.grade]     || 0) + 1;
  });
  const toSorted = counts => Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  return { bySubject: toSorted(subjectCounts), byGrade: toSorted(gradeCounts) };
}

/** Unique teachers reaching each named step of a wizard, in declared order. */
function buildFunnel(events, eventName, stepOrder) {
  const stepUsers = {};
  stepOrder.forEach(s => { stepUsers[s] = new Set(); });
  events.forEach(e => {
    if (e.feature === eventName && stepUsers[e.step]) stepUsers[e.step].add(e.uid);
  });
  let prevCount = null;
  return stepOrder.map(step => {
    const count = stepUsers[step].size;
    const pctOfPrev = prevCount != null && prevCount > 0 ? Math.round((count / prevCount) * 100) : null;
    prevCount = count;
    return { step, count, pctOfPrev };
  });
}

const LESSONGEN_STEPS     = { step1: 'Session Setup', step2: 'Competency', step3: 'Generate' };
const DLLGEN_STEPS        = { step1: 'Setup', step2: 'Generate' };
const COTGEN_STEPS        = { step1: 'Lesson Info', step2: 'COT Indicators', step3: 'Generate' };
const TEST_BUILDER_STEPS  = { setup: 'Setup', blooms: "Bloom's Levels", tos: 'TOS', review: 'Review' };

function FunnelCard({ title, stepLabels, funnel }) {
  const maxCount = funnel[0]?.count || 0;
  if (maxCount === 0) return null;
  return (
    <div style={card}>
      <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {funnel.map((f, i) => (
          <div key={f.step}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--kt-text-primary)' }}>{stepLabels[f.step] || f.step}</span>
              <span style={{ fontSize: 12, fontFamily: '"DM Mono", monospace', color: 'var(--kt-text-secondary)' }}>
                {f.count}{i > 0 && f.pctOfPrev != null ? ` (${f.pctOfPrev}% of prev step)` : ''}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--kt-surface)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${maxCount > 0 ? (f.count / maxCount) * 100 : 0}%`,
                background: FEATURE_COLORS[i % FEATURE_COLORS.length],
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatChip({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--kt-surface)', borderRadius: 10,
      padding: '12px 18px', border: '1px solid var(--kt-border)',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--kt-text-primary)', fontFamily: '"DM Mono", monospace' }}>{value}</span>
    </div>
  );
}

/** Rasterizes one chart DOM node to a small compressed JPEG (data URL) for PDF embedding. */
async function captureChartJPEG(el, html2canvas, maxWidth = 800, quality = 0.7) {
  if (!el) return null;
  const canvas = await html2canvas(el, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true, logging: false });
  let out = canvas;
  if (canvas.width > maxWidth) {
    const scale = maxWidth / canvas.width;
    const resized = document.createElement('canvas');
    resized.width = maxWidth;
    resized.height = Math.round(canvas.height * scale);
    resized.getContext('2d').drawImage(canvas, 0, 0, resized.width, resized.height);
    out = resized;
  }
  return { dataUrl: out.toDataURL('image/jpeg', quality), width: out.width, height: out.height };
}

function csvRow(cells) {
  return cells.map(c => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

function AnalyticsSection({ teachers = [] }) {
  const [events,     setEvents]     = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [range,      setRange]      = useState(30);
  const [exporting,  setExporting]  = useState(false);
  const featureChartRef = useRef(null);
  const dailyChartRef   = useRef(null);
  const signupChartRef  = useRef(null);
  const subjectChartRef = useRef(null);
  const gradeChartRef   = useRef(null);

  async function handleExportPDF() {
    if (exporting) return;
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const html2canvas = (await import('html2canvas')).default;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginX = 14;
      const marginTop = 20;
      const marginBottom = 16;
      const contentW = pageW - marginX * 2;

      const now = new Date();
      const rangeStart = new Date(now.getTime() - (range - 1) * 86400000);
      const fmtDate = d => d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
      const exportedAt = now.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

      let y = marginTop;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(26, 61, 43);
      doc.text('kaTuro AI — Usage Analytics Report', marginX, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.text(`Date range: ${fmtDate(rangeStart)} – ${fmtDate(now)} (last ${range} days)`, marginX, y);
      y += 5;
      doc.text(`Exported ${exportedAt}`, marginX, y);
      y += 9;

      const sectionTitle = (text) => {
        if (y > pageH - marginBottom - 20) { doc.addPage(); y = marginTop; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(26, 61, 43);
        doc.text(text, marginX, y);
        y += 6;
      };

      const table = (opts) => {
        autoTable(doc, {
          startY: y,
          margin: { left: marginX, right: marginX, bottom: marginBottom },
          styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: [40, 40, 40], overflow: 'linebreak' },
          headStyles: { fillColor: [45, 106, 79], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [244, 249, 246] },
          ...opts,
        });
        y = doc.lastAutoTable.finalY + 8;
      };

      const addChartImage = async (ref) => {
        const captured = await captureChartJPEG(ref.current, html2canvas);
        if (!captured) return;
        const imgW = contentW;
        const imgH = (captured.height / captured.width) * imgW;
        if (y + imgH > pageH - marginBottom) { doc.addPage(); y = marginTop; }
        doc.addImage(captured.dataUrl, 'JPEG', marginX, y, imgW, imgH);
        y += imgH + 9;
      };

      // KPI summary
      sectionTitle('KPI Summary');
      table({
        head: [['Metric', 'Value']],
        body: [
          ['Total Events', String(totalEvents)],
          ['Unique Users', String(uniqueUsers)],
          ['Site Visits', String(siteVisits)],
          ['Sessions', String(sessionStats.totalSessions)],
          ['Stickiness', stickiness == null ? '—' : `${stickiness}%`],
          ['Generation Success Rate', genStats.successRate == null ? '—' : `${genStats.successRate}%`],
          ['Avg Generation Time', formatDuration(genStats.avgDurationMs)],
          ['Avg Session Length', formatDuration(sessionStats.avgSessionMs)],
          ['New Users', String(newCount)],
          ['Returning Users', String(returningCount)],
          ['Inactive Users', String(inactiveCount)],
          ['Top Feature', topFeature],
          ['Peak Hour', peakHour],
        ],
        columnStyles: { 0: { cellWidth: 70 } },
      });

      // Most Used Features
      sectionTitle('Most Used Features');
      table({ head: [['Feature', 'Uses']], body: featureData.map(f => [f.name, String(f.count)]) });
      await addChartImage(featureChartRef);

      // Daily Usage
      sectionTitle(`Daily Usage — Last ${range} Days`);
      table({ head: [['Date', 'Events', 'Active Users']], body: dailyData.map(d => [d.date, String(d.count), String(d.users)]) });
      await addChartImage(dailyChartRef);

      // New Signups
      sectionTitle(`New Signups — Last ${range} Days`);
      table({ head: [['Date', 'Signups']], body: signupData.map(d => [d.date, String(d.count)]) });
      await addChartImage(signupChartRef);

      // Retention Cohorts
      if (retentionCohorts.length > 0) {
        sectionTitle('Weekly Retention Cohorts');
        table({
          head: [['Cohort (week of)', 'Size', 'Day 1', 'Day 7', 'Day 30']],
          body: retentionCohorts.map(c => [
            c.label, String(c.size),
            c.day1 == null ? '—' : `${c.day1}%`,
            c.day7 == null ? '—' : `${c.day7}%`,
            c.day30 == null ? '—' : `${c.day30}%`,
          ]),
        });
      }

      // Wizard Funnels
      const funnelSection = (title, stepLabels, funnel) => {
        if (!(funnel[0]?.count > 0)) return;
        sectionTitle(title);
        table({
          head: [['Step', 'Users', '% of Prev Step']],
          body: funnel.map(f => [stepLabels[f.step] || f.step, String(f.count), f.pctOfPrev == null ? '—' : `${f.pctOfPrev}%`]),
        });
      };
      funnelSection('Wizard Funnel — Lesson Gen (ILAW)', LESSONGEN_STEPS, lessonGenFunnel);
      funnelSection('Wizard Funnel — DLL Gen', DLLGEN_STEPS, dllGenFunnel);
      funnelSection('Wizard Funnel — COT Gen', COTGEN_STEPS, cotGenFunnel);
      funnelSection('Wizard Funnel — Test Builder', TEST_BUILDER_STEPS, testBuilderFunnel);

      // Generations by Subject / Grade
      if (bySubject.length > 0) {
        sectionTitle('Generations by Subject');
        table({ head: [['Subject', 'Generations']], body: bySubject.map(s => [s.name, String(s.count)]) });
        await addChartImage(subjectChartRef);
      }
      if (byGrade.length > 0) {
        sectionTitle('Generations by Grade Level');
        table({ head: [['Grade', 'Generations']], body: byGrade.map(g => [g.name, String(g.count)]) });
        await addChartImage(gradeChartRef);
      }

      // Top Schools
      if (topSchools.length > 0) {
        sectionTitle('Top Schools');
        table({ head: [['#', 'School', 'Teachers']], body: topSchools.map((s, i) => [String(i + 1), s.school, String(s.count)]) });
      }

      // Most Frequent Visitors
      if (topVisitors.length > 0) {
        sectionTitle('Most Frequent Visitors');
        table({ head: [['#', 'Teacher', 'Visits']], body: topVisitors.map((v, i) => [String(i + 1), v.label, String(v.visits)]) });
      }

      // Recent Generation Errors
      if (genStats.recentErrors.length > 0) {
        sectionTitle('Recent Generation Errors');
        table({
          head: [['Tool', 'When', 'Duration', 'Error']],
          body: genStats.recentErrors.map(e => [
            TOOL_LABELS[e.tool] || e.tool || '—',
            e.ts?.toDate ? e.ts.toDate().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
            typeof e.durationMs === 'number' ? formatDuration(e.durationMs) : '—',
            e.error || 'Unknown error',
          ]),
          columnStyles: { 3: { cellWidth: 70 } },
        });
      }

      // Footer on every page
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`kaTuro AI Analytics — Exported ${exportedAt}`, marginX, pageH - 8);
        doc.text(`Page ${i} of ${pageCount}`, pageW - marginX, pageH - 8, { align: 'right' });
      }

      doc.save(`katuro-analytics-${range}d-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Analytics PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }

  function handleExportCSV() {
    const lines = [];
    const section = (title, head, body) => {
      lines.push(csvRow([title]));
      if (head) lines.push(csvRow(head));
      body.forEach(r => lines.push(csvRow(r)));
      lines.push('');
    };

    section('KPI Summary', ['Metric', 'Value'], [
      ['Total Events', totalEvents],
      ['Unique Users', uniqueUsers],
      ['Site Visits', siteVisits],
      ['Sessions', sessionStats.totalSessions],
      ['Stickiness %', stickiness ?? ''],
      ['Generation Success Rate %', genStats.successRate ?? ''],
      ['Avg Generation Time', formatDuration(genStats.avgDurationMs)],
      ['Avg Session Length', formatDuration(sessionStats.avgSessionMs)],
      ['New Users', newCount],
      ['Returning Users', returningCount],
      ['Inactive Users', inactiveCount],
      ['Top Feature', topFeature],
      ['Peak Hour', peakHour],
    ]);

    section('Most Used Features', ['Feature', 'Uses'], featureData.map(f => [f.name, f.count]));
    section(`Daily Usage (Last ${range} Days)`, ['Date', 'Events', 'Active Users'], dailyData.map(d => [d.date, d.count, d.users]));
    section(`New Signups (Last ${range} Days)`, ['Date', 'Signups'], signupData.map(d => [d.date, d.count]));

    if (retentionCohorts.length > 0) {
      section('Retention Cohorts', ['Cohort (week of)', 'Size', 'Day 1 %', 'Day 7 %', 'Day 30 %'],
        retentionCohorts.map(c => [c.label, c.size, c.day1 ?? '', c.day7 ?? '', c.day30 ?? '']));
    }

    const funnelRows = (funnel, stepLabels) => funnel.map(f => [stepLabels[f.step] || f.step, f.count, f.pctOfPrev ?? '']);
    if (lessonGenFunnel[0]?.count > 0) section('Wizard Funnel - Lesson Gen (ILAW)', ['Step', 'Users', '% of Prev Step'], funnelRows(lessonGenFunnel, LESSONGEN_STEPS));
    if (dllGenFunnel[0]?.count > 0) section('Wizard Funnel - DLL Gen', ['Step', 'Users', '% of Prev Step'], funnelRows(dllGenFunnel, DLLGEN_STEPS));
    if (cotGenFunnel[0]?.count > 0) section('Wizard Funnel - COT Gen', ['Step', 'Users', '% of Prev Step'], funnelRows(cotGenFunnel, COTGEN_STEPS));
    if (testBuilderFunnel[0]?.count > 0) section('Wizard Funnel - Test Builder', ['Step', 'Users', '% of Prev Step'], funnelRows(testBuilderFunnel, TEST_BUILDER_STEPS));

    if (bySubject.length > 0) section('Generations by Subject', ['Subject', 'Generations'], bySubject.map(s => [s.name, s.count]));
    if (byGrade.length > 0) section('Generations by Grade Level', ['Grade', 'Generations'], byGrade.map(g => [g.name, g.count]));
    if (topSchools.length > 0) section('Top Schools', ['#', 'School', 'Teachers'], topSchools.map((s, i) => [i + 1, s.school, s.count]));
    if (topVisitors.length > 0) section('Most Frequent Visitors', ['#', 'Teacher', 'Visits'], topVisitors.map((v, i) => [i + 1, v.label, v.visits]));
    if (genStats.recentErrors.length > 0) {
      section('Recent Generation Errors', ['Tool', 'When', 'Duration', 'Error'], genStats.recentErrors.map(e => [
        TOOL_LABELS[e.tool] || e.tool || '',
        e.ts?.toDate ? e.ts.toDate().toISOString() : '',
        typeof e.durationMs === 'number' ? formatDuration(e.durationMs) : '',
        e.error || 'Unknown error',
      ]));
    }

    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `katuro-analytics-${range}d-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function load(days) {
    setLoading(true);
    try {
      const cutoff = Timestamp.fromMillis(Date.now() - days * 86400000);
      const snap = await getDocs(
        query(
          collection(db, 'usageEvents'),
          where('ts', '>=', cutoff),
          orderBy('ts', 'asc'),
        )
      );
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (_) {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(range); }, [range]);

  // Admin accounts are excluded from analytics entirely — their logins,
  // visits, and feature usage shouldn't skew what's meant to measure
  // teacher behavior.
  const adminUids       = new Set(teachers.filter(t => t.isAdmin).map(t => t.id));
  const visibleTeachers = teachers.filter(t => !t.isAdmin);
  const visibleEvents   = events.filter(e => !adminUids.has(e.uid));

  const featureEvents = visibleEvents.filter(e => !NON_FEATURE_EVENTS.has(e.feature));
  const featureData = buildFeatureData(featureEvents);
  const dailyData   = buildDailyData(visibleEvents, range);
  const hourData    = buildHourData(visibleEvents);
  const topVisitors = buildTopVisitors(visibleEvents, visibleTeachers);
  const genStats    = buildGenerationStats(visibleEvents);
  const signupData  = buildSignupData(visibleTeachers, range);
  const topSchools  = buildTopSchools(visibleTeachers);
  const adoptionData = buildAdoptionDepth(featureEvents);
  const { newCount, returningCount } = buildNewVsReturning(visibleEvents, visibleTeachers, range);
  const inactiveCount = buildInactiveCount(visibleEvents, visibleTeachers, range);
  const { bySubject, byGrade } = buildSubjectGradeData(featureEvents);
  const retentionCohorts = buildRetentionCohorts(visibleEvents, visibleTeachers, range);
  const sessionStats = buildSessionStats(visibleEvents);
  const lessonGenFunnel    = buildFunnel(visibleEvents, 'lessongen_step_viewed', ['step1', 'step2', 'step3']);
  const dllGenFunnel       = buildFunnel(visibleEvents, 'dllgen_step_viewed', ['step1', 'step2']);
  const cotGenFunnel       = buildFunnel(visibleEvents, 'cotgen_step_viewed', ['step1', 'step2', 'step3']);
  const testBuilderFunnel  = buildFunnel(visibleEvents, 'test_builder_step_viewed', ['setup', 'blooms', 'tos', 'review']);

  const totalEvents  = visibleEvents.length;
  const uniqueUsers  = new Set(visibleEvents.map(e => e.uid)).size;
  const dailyUsersAvg = dailyData.length > 0
    ? dailyData.reduce((sum, d) => sum + d.users, 0) / dailyData.length
    : 0;
  const stickiness = uniqueUsers > 0 ? Math.round((dailyUsersAvg / uniqueUsers) * 100) : null;
  const siteVisits   = visibleEvents.filter(e => e.feature === 'login').length;
  const topFeature   = featureData[0]?.name || '—';
  const peakHour     = hourData.reduce((best, h) => h.count > best.count ? h : best, { hour: '—', count: 0 }).hour;

  const successRateColor = genStats.successRate == null ? undefined
    : genStats.successRate >= 90 ? '#16a34a'
    : genStats.successRate >= 70 ? '#e8a320'
    : '#e05c5c';

  const chartHeight = 220;

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Usage Analytics</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setRange(d)}
              style={{
                ...btnSecondary,
                fontSize: 11,
                padding: '5px 12px',
                background: range === d ? '#d8f3dc' : undefined,
                color: range === d ? '#1a3d2b' : undefined,
                fontWeight: range === d ? 700 : 500,
              }}
            >
              {d}d
            </button>
          ))}
          <button onClick={() => load(range)} style={{ ...btnSecondary, fontSize: 11, padding: '5px 10px' }} title="Refresh">
            <RefreshCw size={12} />
          </button>
          <button
            onClick={handleExportCSV}
            disabled={loading || visibleEvents.length === 0}
            style={{ ...btnSecondary, fontSize: 11, padding: '5px 12px', opacity: (loading || visibleEvents.length === 0) ? 0.6 : 1 }}
            title="Export raw metrics as CSV"
          >
            <FileSpreadsheet size={12} /> Export CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting || loading || visibleEvents.length === 0}
            style={{ ...btnPrimary, fontSize: 11, padding: '5px 12px', opacity: (exporting || loading || visibleEvents.length === 0) ? 0.6 : 1 }}
            title="Export analytics as PDF"
          >
            {exporting
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Exporting…</>
              : <><Download size={12} /> Export PDF</>
            }
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={24} color="#2d6a4f" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : visibleEvents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--kt-text-secondary)' }}>
          <BarChart2 size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>No usage data yet</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.7 }}>Events will appear here once teachers start using the app.</p>
        </div>
      ) : (
        <div>
          {/* KPI chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatChip label="Total Events"   value={totalEvents}  color="#2d6a4f" />
            <StatChip label="Unique Users"   value={uniqueUsers}  color="#0284c7" />
            <StatChip label="Site Visits"    value={siteVisits}   color="#16a34a" />
            <StatChip label="Top Feature"    value={topFeature}   color="#e8a320" />
            <StatChip label="Peak Hour"      value={peakHour}     color="#6d28d9" />
            <StatChip
              label="Generation Success"
              value={genStats.successRate == null ? '—' : `${genStats.successRate}%`}
              color={successRateColor}
            />
            <StatChip label="Avg Generation Time" value={formatDuration(genStats.avgDurationMs)} color="#0284c7" />
            <StatChip label="Stickiness" value={stickiness == null ? '—' : `${stickiness}%`} color="#6d28d9" />
            <StatChip label="New Users" value={newCount} color="#16a34a" />
            <StatChip label="Returning Users" value={returningCount} color="#0284c7" />
            <StatChip label="Inactive Users" value={inactiveCount} color="#e05c5c" />
            <StatChip label="Sessions" value={sessionStats.totalSessions} color="#2d6a4f" />
            <StatChip label="Avg Session Length" value={formatDuration(sessionStats.avgSessionMs)} color="#e8a320" />
          </div>

          {/* Chart 1 — Most Used Features */}
          <div style={{ ...card, marginBottom: 20 }}>
            <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Most Used Features</p>
            <div ref={featureChartRef}>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={featureData} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(45,106,79,0.08)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }}
                  cursor={{ fill: 'rgba(45,106,79,0.05)' }}
                />
                <Bar dataKey="count" name="Uses" radius={[0, 4, 4, 0]}>
                  {featureData.map((_, i) => (
                    <Cell key={i} fill={FEATURE_COLORS[i % FEATURE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2 — Daily Usage Trend */}
          <div style={{ ...card, marginBottom: 20 }}>
            <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Daily Usage &amp; Active Users — Last {range} Days</p>
            <div ref={dailyChartRef}>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={dailyData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,106,79,0.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4a6357' }} tickLine={false} axisLine={false} interval={Math.floor(dailyData.length / 8)} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: '#0284c7' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="count" name="Events" stroke="#2d6a4f" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#2d6a4f' }} />
                <Line yAxisId="right" type="monotone" dataKey="users" name="Active Users" stroke="#0284c7" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#0284c7' }} />
              </LineChart>
            </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3 — Hour of Day Distribution */}
          <div style={card}>
            <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Activity by Hour of Day</p>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={hourData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,106,79,0.08)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#4a6357' }} tickLine={false} axisLine={false} interval={2} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }}
                />
                <Bar dataKey="count" name="Events" fill="#52b788" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 4 — New Signups */}
          <div style={{ ...card, marginTop: 20 }}>
            <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>New Signups — Last {range} Days</p>
            <div ref={signupChartRef}>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={signupData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,106,79,0.08)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4a6357' }} tickLine={false} axisLine={false} interval={Math.floor(signupData.length / 8)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }} />
                <Bar dataKey="count" name="Signups" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 5 — Feature Adoption Depth */}
          <div style={{ ...card, marginTop: 20 }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Feature Adoption Depth</p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--kt-text-secondary)' }}>How many distinct features each active teacher touched this period</p>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={adoptionData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,106,79,0.08)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }} />
                <Bar dataKey="count" name="Teachers" fill="#6d28d9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Weekly Retention Cohorts */}
          {retentionCohorts.length > 0 && (
            <div style={{ ...card, marginTop: 20 }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Weekly Retention Cohorts</p>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--kt-text-secondary)' }}>% of each signup-week cohort still active on Day 1 / 7 / 30 — a cell reads "—" until that cohort has actually reached that many days since signup</p>
              <div className="kt-scroll-x">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 420 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 70px 70px', gap: 8, padding: '0 12px 6px', borderBottom: '1px solid var(--kt-border)' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cohort (week of)</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Size</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Day 1</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Day 7</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Day 30</span>
                </div>
                {retentionCohorts.map(c => (
                  <div key={c.label} style={{
                    display: 'grid', gridTemplateColumns: '1fr 70px 70px 70px 70px', gap: 8,
                    padding: '8px 12px', background: 'var(--kt-surface)', borderRadius: 8,
                    border: '1px solid var(--kt-border)', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)' }}>{c.label}</span>
                    <span style={{ fontSize: 12, fontFamily: '"DM Mono", monospace', color: 'var(--kt-text-secondary)', textAlign: 'center' }}>{c.size}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: '"DM Mono", monospace', color: c.day1 == null ? 'var(--kt-text-secondary)' : '#16a34a', textAlign: 'center' }}>{c.day1 == null ? '—' : `${c.day1}%`}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: '"DM Mono", monospace', color: c.day7 == null ? 'var(--kt-text-secondary)' : '#0284c7', textAlign: 'center' }}>{c.day7 == null ? '—' : `${c.day7}%`}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: '"DM Mono", monospace', color: c.day30 == null ? 'var(--kt-text-secondary)' : '#6d28d9', textAlign: 'center' }}>{c.day30 == null ? '—' : `${c.day30}%`}</span>
                  </div>
                ))}
              </div>
              </div>
            </div>
          )}

          {/* Wizard Funnels — where teachers drop off mid-flow */}
          {(lessonGenFunnel[0]?.count > 0 || dllGenFunnel[0]?.count > 0 || cotGenFunnel[0]?.count > 0 || testBuilderFunnel[0]?.count > 0) && (
            <div style={{ marginTop: 20 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Wizard Funnels</p>
              <div className="kt-grid-2" style={{ gap: 20 }}>
                <FunnelCard title="Lesson Gen (ILAW)" stepLabels={LESSONGEN_STEPS} funnel={lessonGenFunnel} />
                <FunnelCard title="DLL Gen" stepLabels={DLLGEN_STEPS} funnel={dllGenFunnel} />
                <FunnelCard title="COT Gen" stepLabels={COTGEN_STEPS} funnel={cotGenFunnel} />
                <FunnelCard title="Test Builder" stepLabels={TEST_BUILDER_STEPS} funnel={testBuilderFunnel} />
              </div>
            </div>
          )}

          {/* Chart 6 & 7 — Subject / Grade Demand */}
          {(bySubject.length > 0 || byGrade.length > 0) && (
            <div className="kt-grid-2" style={{ gap: 20, marginTop: 20 }}>
              {bySubject.length > 0 && (
                <div style={card}>
                  <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Generations by Subject</p>
                  <div ref={subjectChartRef}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart data={bySubject} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(45,106,79,0.08)" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }} cursor={{ fill: 'rgba(45,106,79,0.05)' }} />
                      <Bar dataKey="count" name="Generations" radius={[0, 4, 4, 0]}>
                        {bySubject.map((_, i) => <Cell key={i} fill={FEATURE_COLORS[i % FEATURE_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              )}
              {byGrade.length > 0 && (
                <div style={card}>
                  <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Generations by Grade Level</p>
                  <div ref={gradeChartRef}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart data={byGrade} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(45,106,79,0.08)" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#4a6357' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }} cursor={{ fill: 'rgba(45,106,79,0.05)' }} />
                      <Bar dataKey="count" name="Generations" radius={[0, 4, 4, 0]}>
                        {byGrade.map((_, i) => <Cell key={i} fill={FEATURE_COLORS[i % FEATURE_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top Schools */}
          {topSchools.length > 0 && (
            <div style={{ ...card, marginTop: 20 }}>
              <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Top Schools</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topSchools.map((s, i) => (
                  <div key={s.school} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: 'var(--kt-surface)', borderRadius: 8,
                    border: '1px solid var(--kt-border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', width: 18, flexShrink: 0 }}>#{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.school}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{s.count} teacher{s.count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Most Frequent Visitors */}
          {topVisitors.length > 0 && (
            <div style={{ ...card, marginTop: 20 }}>
              <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Most Frequent Visitors</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topVisitors.map((u, i) => (
                  <div key={u.uid} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: 'var(--kt-surface)', borderRadius: 8,
                    border: '1px solid var(--kt-border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', width: 18, flexShrink: 0 }}>#{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{u.visits} visits</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Generation Errors */}
          {genStats.recentErrors.length > 0 && (
            <div style={{ ...card, marginTop: 20 }}>
              <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} color="#e05c5c" /> Recent Generation Errors
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {genStats.recentErrors.map(e => (
                  <div key={e.id} style={{
                    padding: '8px 12px', background: '#fdf2f2', borderRadius: 8,
                    border: '1px solid rgba(224,92,92,0.25)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{TOOL_LABELS[e.tool] || e.tool}</span>
                      <span style={{ fontSize: 11, color: 'var(--kt-text-secondary)' }}>
                        {e.ts?.toDate ? e.ts.toDate().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        {typeof e.durationMs === 'number' ? ` · ${formatDuration(e.durationMs)}` : ''}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#a13327', fontFamily: '"DM Mono", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.error || 'Unknown error'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Gemini API Settings</h2>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>
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
        <div style={{ background: 'var(--kt-surface)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={12} color="#4a6357" />
          <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: 'var(--kt-text-primary)', flex: 1 }}>{status.preview}</span>
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
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)', padding: 0 }}
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

// ── Free Mode control section ─────────────────────────────────────────────────
function FreeModeSection({ adminUid }) {
  const [freeMode, setFreeMode] = useState(false);
  const [note,     setNote]     = useState('');
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');
  const [ok,       setOk]       = useState('');

  useEffect(() => subscribeFreeModeStatus(setFreeMode), []);

  async function handleToggle() {
    setSaving(true); setErr(''); setOk('');
    try {
      const next = !freeMode;
      await adminSetFreeMode(next, note.trim() || undefined);
      setOk(next ? 'Free mode enabled — all AI features are now free for all teachers.' : 'Free mode disabled — tokens are now required.');
      setNote('');
    } catch (e) {
      setErr(e.message || 'Failed to update free mode.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: freeMode ? '#d8f3dc' : '#fef3c7', display: 'grid', placeItems: 'center' }}>
          <Gift size={16} color={freeMode ? '#2d6a4f' : '#d97706'} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Free Mode</h3>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>
            When ON, all AI features are completely free — no tokens deducted. Use during the launch phase to build habit.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: freeMode ? '#2d6a4f' : '#9bb8a5' }}>
            {freeMode ? 'ON' : 'OFF'}
          </span>
          <button
            onClick={handleToggle}
            disabled={saving}
            style={{ background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', padding: 0, opacity: saving ? 0.6 : 1 }}
            title={freeMode ? 'Disable free mode' : 'Enable free mode'}
          >
            {freeMode
              ? <ToggleRight size={38} color="#2d6a4f" />
              : <ToggleLeft  size={38} color="#9bb8a5" />
            }
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Note (optional — shown in logs)</label>
          <input
            style={inputStyle}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={freeMode ? 'Reason for disabling…' : 'Launch phase — free until 500 active users'}
          />
        </div>
      </div>

      {ok && (
        <div style={{ marginTop: 10, display: 'flex', gap: 7, background: '#d8f3dc', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 8, padding: '8px 12px' }}>
          <CheckCircle2 size={14} color="#2d6a4f" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: '#163828' }}>{ok}</p>
        </div>
      )}
      {err && (
        <div style={{ marginTop: 10, display: 'flex', gap: 7, background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 8, padding: '8px 12px' }}>
          <AlertCircle size={14} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: '#c0392b' }}>{err}</p>
        </div>
      )}
    </div>
  );
}

// ── AI Error reports section ──────────────────────────────────────────────────
function AIErrorSection() {
  const [reports,  setReports]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [open,     setOpen]     = useState(false);

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'aiErrorReports'), orderBy('createdAt', 'desc'), limit(30))
      );
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (_e) {}
    finally { setLoading(false); }
  }

  async function markResolved(id) {
    await updateDoc(doc(db, 'aiErrorReports', id), { resolved: true }).catch(() => {});
    setReports(prev => prev.map(r => r.id === id ? { ...r, resolved: true } : r));
  }

  function ts(t) {
    if (!t) return '';
    const d = t.toDate ? t.toDate() : new Date(t);
    return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const unresolved = reports.filter(r => !r.resolved).length;

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: unresolved > 0 ? 'rgba(224,92,92,0.1)' : '#f5faf7', display: 'grid', placeItems: 'center' }}>
            <Bug size={16} color={unresolved > 0 ? '#e05c5c' : '#9bb8a5'} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
              AI Error Reports
              {unresolved > 0 && <span style={{ marginLeft: 8, fontSize: 11, background: '#fef0f0', color: '#e05c5c', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 20, padding: '1px 8px' }}>{unresolved} open</span>}
            </h3>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>Teacher-reported AI errors (wrong MELC codes, bad outputs, etc.)</p>
          </div>
        </div>
        <button
          onClick={() => { setOpen(v => !v); if (!open) load(); }}
          style={{ ...btnSecondary, fontSize: 12 }}
        >
          {open ? 'Hide' : 'View Reports'}
        </button>
      </div>

      {open && (
        loading
          ? <div style={{ textAlign: 'center', padding: 20 }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /></div>
          : reports.length === 0
            ? <p style={{ margin: 0, fontSize: 12, color: '#9bb8a5', textAlign: 'center', padding: 16 }}>No error reports yet.</p>
            : reports.map(r => (
              <div key={r.id} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 12px', borderRadius: 8, marginBottom: 6,
                background: r.resolved ? 'var(--kt-surface)' : 'rgba(224,92,92,0.05)',
                border: `1px solid ${r.resolved ? 'var(--kt-border)' : 'rgba(224,92,92,0.15)'}`,
                opacity: r.resolved ? 0.65 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#e8f7ee', color: '#2d6a4f', borderRadius: 4, padding: '1px 6px' }}>{r.feature}</span>
                    <span style={{ fontSize: 10, color: '#9bb8a5' }}>{ts(r.createdAt)}</span>
                    {r.resolved && <span style={{ fontSize: 10, color: '#9bb8a5' }}>✓ Resolved</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-primary)', wordBreak: 'break-word' }}>{r.errorMessage || '(no message)'}</p>
                  {r.inputContext && Object.keys(r.inputContext).length > 0 && (
                    <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9bb8a5', fontFamily: 'monospace' }}>
                      {JSON.stringify(r.inputContext).slice(0, 120)}
                    </p>
                  )}
                </div>
                {!r.resolved && (
                  <button onClick={() => markResolved(r.id)} style={{ ...btnSecondary, fontSize: 10, padding: '4px 10px', flexShrink: 0 }}>
                    <CheckCircle2 size={11} /> Resolve
                  </button>
                )}
              </div>
            ))
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { dark, toggle } = useTheme();

  const [activeTab,      setActiveTab]       = useState('users');
  const [teachers,       setTeachers]       = useState([]);
  const [loadingList,    setLoadingList]     = useState(true);
  const [listErr,        setListErr]         = useState('');
  const [addUserOpen,    setAddUserOpen]     = useState(false);
  const [tokensTarget,   setTokensTarget]    = useState(null);
  const [togglingUid,    setTogglingUid]     = useState(null);
  const [pwTarget,       setPwTarget]        = useState(null);
  const [detailUser,     setDetailUser]      = useState(null);
  const [deleteTarget,   setDeleteTarget]    = useState(null);
  const [deleting,       setDeleting]        = useState(false);
  const [deleteError,    setDeleteError]     = useState('');
  const [approving,      setApproving]       = useState(false);
  const [approveMsg,     setApproveMsg]      = useState('');

  // Notifications
  const [notifications,  setNotifications]  = useState([]);
  const [showNotifs,     setShowNotifs]      = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;
  const prevNotifsLen = useRef(null);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    return subscribeAdminNotifications(setNotifications);
  }, []);

  useEffect(() => {
    if (prevNotifsLen.current === null) {
      prevNotifsLen.current = notifications.length;
      return;
    }
    if (notifications.length > prevNotifsLen.current) {
      const latest = notifications[0];
      if (latest && !latest.read && 'Notification' in window && Notification.permission === 'granted') {
        const name = latest.givenName && latest.surname
          ? `${latest.givenName} ${latest.surname}`
          : latest.displayName || latest.email;
        new Notification('New kaTuro Registration!', {
          body: `${name} from ${latest.school || latest.email} just registered.`,
        });
      }
    }
    prevNotifsLen.current = notifications.length;
  }, [notifications]);

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

  // Approves pending accounts oldest-first, but never past MAX_ACCOUNTS active
  // users — mirrors the registration cap enforced server-side in registerUser.
  async function handleApproveAllPending() {
    setApproving(true); setApproveMsg('');
    try {
      const activeNow = teachers.filter(t => !t.disabled).length;
      const slots = MAX_ACCOUNTS - activeNow;
      if (slots <= 0) {
        setApproveMsg(`Already at the ${MAX_ACCOUNTS}-user cap (${activeNow} active) — no pending accounts approved.`);
        return;
      }

      const pending = teachers
        .filter(t => t.pendingApproval)
        .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
      if (pending.length === 0) {
        setApproveMsg('No pending accounts to approve.');
        return;
      }

      const toApprove = pending.slice(0, slots);
      for (const t of toApprove) {
        await adminSetDisabled(t.id, false);
      }
      const approvedIds = new Set(toApprove.map(t => t.id));
      setTeachers(prev => prev.map(t =>
        approvedIds.has(t.id) ? { ...t, disabled: false, pendingApproval: false } : t
      ));

      const leftover = pending.length - toApprove.length;
      setApproveMsg(
        `Approved ${toApprove.length} pending account${toApprove.length !== 1 ? 's' : ''}.` +
        (leftover > 0 ? ` ${leftover} still pending — cap reached at ${MAX_ACCOUNTS} active users.` : '')
      );
    } catch (err) {
      setApproveMsg(err.message || 'Failed to approve pending accounts.');
    } finally {
      setApproving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError('');
    try {
      await adminDeleteUser(deleteTarget.id);
      setTeachers(prev => prev.filter(t => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    navigate('/login', { replace: true });
  }

  const totalTokens   = teachers.reduce((s, t) => s + (t.tokenBalance ?? 0), 0);
  const activeCount   = teachers.filter(t => !t.disabled).length;
  const pendingCount  = teachers.filter(t => t.pendingApproval).length;

  // Pending users appear first, then sort all groups by registration date (oldest → newest)
  const toMs = ts => ts?.toDate?.()?.getTime() ?? (ts?.seconds ? ts.seconds * 1000 : 0);
  const sortedTeachers = [...teachers].sort((a, b) => {
    const rank = t => t.pendingApproval ? 0 : t.disabled ? 2 : 1;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return toMs(a.createdAt) - toMs(b.createdAt);
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--kt-surface)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Topbar */}
      <header style={{
        height: 56, background: 'var(--kt-card)', borderBottom: '1px solid var(--kt-border)',
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14,
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <img src={ktLogo} alt="kaTuro AI" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>kaTuro AI</span>
        <span style={{ fontSize: 12, color: 'rgba(45,106,79,0.4)', margin: '0 2px' }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#2d6a4f' }}>Admin Dashboard</span>
        <div style={{ flex: 1 }} />

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          style={{ ...btnSecondary, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
          {dark ? 'Light' : 'Dark'}
        </button>

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
              width: 340, maxWidth: 'calc(100vw - 24px)', background: 'var(--kt-card)', borderRadius: 14,
              border: '1px solid var(--kt-border)',
              boxShadow: '0 12px 40px rgba(13,34,24,0.16)',
              zIndex: 100, overflow: 'hidden',
            }}>
              {/* Panel header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid rgba(45,106,79,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Bell size={13} color="#2d6a4f" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Notifications</span>
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
                  <button onClick={() => setShowNotifs(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)', padding: 2 }}>
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
                      <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
                        {n.givenName && n.surname ? `${n.givenName} ${n.surname}` : n.displayName || n.email}
                      </p>
                      <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--kt-text-secondary)' }}>{n.school || n.email}</p>
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

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--kt-card)', borderRadius: 12, padding: 4, border: '1px solid var(--kt-border)', width: 'fit-content' }}>
          {[
            { id: 'users',     label: 'Users',     Icon: Users },
            { id: 'analytics', label: 'Analytics', Icon: BarChart2 },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: activeTab === id ? 700 : 500,
                fontFamily: 'inherit',
                background: activeTab === id ? '#2d6a4f' : 'transparent',
                color: activeTab === id ? '#fff' : 'var(--kt-text-secondary)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="kt-grid-4" style={{ gap: 14, marginBottom: 24 }}>
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
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: '"DM Mono", monospace' }}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {activeTab === 'analytics' && (
          <div style={card}>
            <AnalyticsSection teachers={teachers} />
          </div>
        )}

        {activeTab === 'users' && <>

        {/* API Key settings */}
        <ApiKeySection adminUid={user?.uid} />

        {/* Free Mode control */}
        <FreeModeSection adminUid={user?.uid} />

        {/* AI Error Reports */}
        <AIErrorSection />

        {/* Users table */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Users</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={fetchTeachers} style={btnSecondary} title="Refresh">
                <RefreshCw size={13} />
              </button>
              {pendingCount > 0 && (
                <button
                  onClick={handleApproveAllPending}
                  disabled={approving}
                  style={{ ...btnSecondary, opacity: approving ? 0.6 : 1 }}
                  title={`Approve pending accounts, up to the ${MAX_ACCOUNTS}-user cap`}
                >
                  {approving
                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Approving…</>
                    : <><UserCheck size={13} /> Approve All Pending ({pendingCount})</>
                  }
                </button>
              )}
              <button onClick={() => setAddUserOpen(true)} style={btnPrimary}>
                <Plus size={14} /> Add User
              </button>
            </div>
          </div>

          {approveMsg && (
            <div style={{ display: 'flex', gap: 8, background: 'rgba(45,106,79,0.08)', border: '1px solid rgba(45,106,79,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <CheckCircle2 size={15} color="#2d6a4f" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)', flex: 1 }}>{approveMsg}</p>
              <button onClick={() => setApproveMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)', padding: 0, flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>
          )}

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10, color: 'var(--kt-text-secondary)' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Loading users…</span>
            </div>
          ) : teachers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--kt-text-secondary)' }}>
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
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px 10px', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
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
                                <p style={{ margin: '0 0 1px', fontWeight: 700, fontSize: 13, color: 'var(--kt-text-primary)' }}>
                                  {[t.givenName, t.mi ? `${t.mi}.` : '', t.surname].filter(Boolean).join(' ')}
                                </p>
                              )}
                              <p style={{ margin: 0, fontWeight: 600, color: 'var(--kt-text-secondary)', fontSize: 12, textDecoration: 'underline dotted' }}>{t.email}</p>
                              {t.isAdmin && <span style={{ fontSize: 10, fontWeight: 700, color: '#b47a10', background: 'rgba(232,163,32,0.12)', borderRadius: 4, padding: '1px 5px' }}>Admin</span>}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontFamily: '"DM Mono", monospace', fontWeight: 700, fontSize: 15, color: 'var(--kt-text-primary)' }}>
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
                          {!t.isAdmin && (
                            <button
                              onClick={() => { setDeleteTarget(t); setDeleteError(''); }}
                              style={{
                                ...btnSecondary, padding: '5px 10px', fontSize: 11,
                                color: '#c0392b', borderColor: 'rgba(224,92,92,0.25)',
                              }}
                              title="Delete account permanently"
                            >
                              <Trash2 size={12} />
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

        </> }

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

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(13,34,24,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }} onClick={() => !deleting && setDeleteTarget(null)}>
          <div style={{
            background: 'var(--kt-card)', borderRadius: 16, padding: '28px 28px 24px',
            width: '100%', maxWidth: 400,
            boxShadow: '0 20px 60px rgba(13,34,24,0.22)',
          }} onClick={e => e.stopPropagation()}>
            {/* Icon */}
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(224,92,92,0.1)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
              <Trash2 size={22} color="#c0392b" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
              Delete Account?
            </h3>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.5 }}>
              This will permanently delete:
            </p>
            <div style={{ background: 'rgba(224,92,92,0.06)', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#c0392b' }}>
                {[deleteTarget.givenName, deleteTarget.mi ? `${deleteTarget.mi}.` : '', deleteTarget.surname].filter(Boolean).join(' ') || deleteTarget.email}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)' }}>{deleteTarget.email}</p>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#c0392b' }}>
                All lessons, quizzes, token logs, and classroom data will be erased. This cannot be undone.
              </p>
            </div>
            {deleteError && (
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                <AlertCircle size={14} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12, color: '#c0392b' }}>{deleteError}</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{ ...btnSecondary }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  background: deleting ? 'rgba(192,57,43,0.5)' : '#c0392b',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 20px', fontSize: 13, fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {deleting
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</>
                  : <><Trash2 size={14} /> Yes, Delete Account</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
