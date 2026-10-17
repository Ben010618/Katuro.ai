import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Plus, Save, Trash2, ThumbsUp, ThumbsDown, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { db } from '../../firebase';
import { loadRuleCards, saveRuleCards, cleanCard, CARD_LIMITS } from '../../services/desk/knowledge/ruleCards';
import { summarizeFeedback } from '../../services/desk/feedback';

const card = { background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 12, padding: 20, marginBottom: 20 };
const label = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 };
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1.5px solid rgba(45,106,79,0.2)', borderRadius: 8, fontSize: 13.5, background: 'var(--kt-input-bg)', color: 'var(--kt-text-primary)', fontFamily: 'inherit' };
const btn = { background: 'var(--kt-surface)', color: 'var(--kt-text-primary)', border: '1px solid rgba(45,106,79,0.25)', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 };
const primary = { ...btn, background: '#2d6a4f', color: '#fff', border: '1px solid #2d6a4f' };

function Notice({ ok, children }) {
  return (
    <p style={{ margin: '10px 0 0', fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'flex-start', color: ok ? 'var(--kt-green-ink, #2d6a4f)' : '#c0392b' }}>
      {ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {children}
    </p>
  );
}

/** Rule cards: official DepEd rules every teacher's KaTuroDesk follows (no app update needed). */
function RuleCardsEditor({ adminUid }) {
  const [cards, setCards] = useState(null);
  const [draft, setDraft] = useState(null); // card being edited (new or existing)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { loadRuleCards({ force: true }).then((c) => setCards(c || [])).catch(() => setCards([])); }, []);

  const persist = async (next, okText) => {
    setBusy(true); setMsg(null);
    try {
      const saved = await saveRuleCards(next, adminUid);
      setCards(saved); setDraft(null);
      setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(false); }
  };

  const saveDraft = () => {
    const { card: c, error } = cleanCard(draft);
    if (error) { setMsg({ ok: false, text: error }); return; }
    const exists = cards.some((x) => x.id === c.id);
    persist(exists ? cards.map((x) => (x.id === c.id ? c : x)) : [...cards, c], 'Saved. Teachers\' KaTuroDesk uses it within 10 minutes.');
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}><BookOpen size={17} /> Rule cards</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--kt-text-secondary)', maxWidth: 680 }}>
            Official DepEd rules KaTuroDesk follows. When a teacher's request contains a card's trigger words, the card is given to the AI. Every card needs its official source; KaTuro never uses uncited rules.
          </p>
        </div>
        <button type="button" style={primary} disabled={busy || cards === null} onClick={() => { setMsg(null); setDraft({ title: '', triggers: '', text: '', source: '', active: true }); }}>
          <Plus size={14} /> New card
        </button>
      </div>

      {cards === null ? <Loader2 size={16} style={{ marginTop: 14, animation: 'spin 1s linear infinite' }} /> : (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!cards.length && !draft && <p style={{ fontSize: 13, color: 'var(--kt-text-secondary)', margin: 0 }}>No cards yet. Add one for each DepEd rule teachers ask about (e.g. DLL parts under DO 42, s. 2016).</p>}
          {cards.map((c) => (
            <div key={c.id} style={{ border: '1px solid var(--kt-border)', borderRadius: 10, padding: '10px 12px', opacity: c.active === false ? 0.55 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{c.title}{c.active === false ? ' (off)' : ''}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>Triggers: {c.triggers}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>Source: {c.source}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" style={btn} disabled={busy} onClick={() => { setMsg(null); setDraft({ ...c }); }}>Edit</button>
                  <button type="button" style={btn} disabled={busy} onClick={() => persist(cards.map((x) => (x.id === c.id ? { ...x, active: x.active === false } : x)), c.active === false ? 'Card turned on.' : 'Card turned off.')}>{c.active === false ? 'Turn on' : 'Turn off'}</button>
                  <button type="button" style={btn} disabled={busy} aria-label={`Delete ${c.title}`} onClick={() => { if (window.confirm(`Delete the card "${c.title}"?`)) persist(cards.filter((x) => x.id !== c.id), 'Card deleted.'); }}><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div style={{ marginTop: 14, borderTop: '1px dashed var(--kt-border)', paddingTop: 14, display: 'grid', gap: 10 }}>
          <div><span style={label}>Title</span><input style={input} maxLength={CARD_LIMITS.title} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Parts of the Daily Lesson Log (DLL)" /></div>
          <div><span style={label}>Trigger words (comma-separated)</span><input style={input} maxLength={CARD_LIMITS.triggers} value={draft.triggers} onChange={(e) => setDraft({ ...draft, triggers: e.target.value })} placeholder="DLL, daily lesson log, lesson log" /></div>
          <div><span style={label}>Rule (what the AI must follow)</span><textarea style={{ ...input, minHeight: 110, resize: 'vertical' }} maxLength={CARD_LIMITS.text} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="Write the rule exactly as the DepEd order states it." /><span style={{ fontSize: 11, color: 'var(--kt-text-secondary)' }}>{draft.text.length}/{CARD_LIMITS.text}</span></div>
          <div><span style={label}>Official source (required)</span><input style={input} maxLength={CARD_LIMITS.source} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="DepEd Order No. 42, s. 2016, Section VI" /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={primary} disabled={busy} onClick={saveDraft}>{busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Save card</button>
            <button type="button" style={btn} disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
    </div>
  );
}

/** What teachers told KaTuroDesk: thumbs, reasons, corrections (no prompts or learner data). */
function FeedbackSummary() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getDocs(query(collection(db, 'deskFeedback'), orderBy('at', 'desc'), limit(500)))
      .then((snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data(), at: d.data().at?.toDate?.() || null }))))
      .catch((e) => { setError(e.message); setRows([]); });
  }, []);
  const s = useMemo(() => (rows ? summarizeFeedback(rows, { days: 30 }) : null), [rows]);

  return (
    <div style={card}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary)' }}>What teachers told KaTuroDesk (last 30 days)</h2>
      <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: 'var(--kt-text-secondary)' }}>Thumbs and reasons teachers gave, plus automatic "no, I meant…" corrections. Only categories and the teacher's own comment are stored, never their files, learners or the conversation.</p>
      {rows === null ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : error ? <Notice ok={false}>{error}</Notice> : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {[['Helpful', s.up, ThumbsUp], ['Not helpful', s.down, ThumbsDown], ['Corrections', s.corrections, RotateCcw]].map(([name, n, Icon]) => (
              <div key={name} style={{ border: '1px solid var(--kt-border)', borderRadius: 10, padding: '10px 14px', minWidth: 130 }}>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}><Icon size={12} /> {name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{n}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <div>
              <span style={label}>Top reasons</span>
              {s.reasons.length ? s.reasons.map(([r, n]) => <p key={r} style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--kt-text-primary)' }}>{r}: <strong>{n}</strong></p>) : <p style={{ fontSize: 13, color: 'var(--kt-text-secondary)', margin: 0 }}>None yet.</p>}
            </div>
            <div>
              <span style={label}>Tools with the most problems</span>
              {s.tools.length ? s.tools.map(([t, n]) => <p key={t} style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--kt-text-primary)' }}>{t}: <strong>{n}</strong></p>) : <p style={{ fontSize: 13, color: 'var(--kt-text-secondary)', margin: 0 }}>None yet.</p>}
            </div>
          </div>
          <span style={{ ...label, marginTop: 14 }}>Latest comments</span>
          {s.comments.length ? s.comments.slice(0, 15).map((c) => (
            <p key={c.id} style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--kt-text-primary)' }}>
              <span style={{ color: 'var(--kt-text-secondary)' }}>{c.reason || 'Comment'}{c.tools?.length ? ` · ${c.tools.join(', ')}` : ''}: </span>{c.comment}
            </p>
          )) : <p style={{ fontSize: 13, color: 'var(--kt-text-secondary)', margin: 0 }}>No comments yet.</p>}
        </>
      )}
    </div>
  );
}

const manilaDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

/** Natural voice use by day (the deskSpeak function keeps the totals; no names). */
function VoiceUsage() {
  const [days, setDays] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const ids = Array.from({ length: 7 }, (_, i) => manilaDay(Date.now() - i * 86400000));
    Promise.all(ids.map((id) => getDoc(doc(db, 'deskVoiceStats', id)).then((d) => ({ id, ...(d.exists() ? d.data() : {}) }))))
      .then(setDays)
      .catch((e) => { setError(e.message); setDays([]); });
  }, []);
  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--kt-text-secondary)', borderBottom: '1px solid var(--kt-border)' };
  const td = { padding: '6px 8px', fontSize: 13, color: 'var(--kt-text-primary)', borderBottom: '1px solid var(--kt-border)' };
  return (
    <div style={card}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Persona voice (last 7 days)</h2>
      <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: 'var(--kt-text-secondary)' }}>Natural voice spoken by KaTuroDesk personas. Each teacher has 5 minutes a day; after that the persona uses the computer's own voice (free). Totals only, no names.</p>
      {days === null ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : error ? <Notice ok={false}>{error}</Notice> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Day</th><th style={th}>Minutes spoken</th><th style={th}>Replies spoken</th><th style={th}>Google / Azure / Gemini</th><th style={th}>Reached the 5-minute limit</th><th style={th}>No service answered</th></tr></thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.id}>
                <td style={td}>{d.id}</td>
                <td style={td}>{((d.seconds || 0) / 60).toFixed(1)}</td>
                <td style={td}>{d.replies || 0}</td>
                <td style={td}>{d.by_google || 0} / {d.by_azure || 0} / {d.by_gemini || 0}</td>
                <td style={td}>{d.limited || 0}</td>
                <td style={td}>{d.failed || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const SERVICES = [
  ['google', 'Google Chirp 3 HD', 'Uses this Google Cloud project (no key). The Cloud Text-to-Speech API must be turned on.'],
  ['azure', 'Microsoft Azure AI Speech', 'Needs an Azure Speech key and its region.'],
  ['gemini', 'Gemini voices', 'Uses the KaTuroDesk Gemini key (needs a paid plan for voices).'],
];
const AZURE_REGIONS = ['southeastasia', 'eastasia', 'japaneast', 'australiaeast', 'eastus', 'westus2', 'westeurope'];
const ENABLE_GOOGLE_TTS = 'https://console.cloud.google.com/apis/library/texttospeech.googleapis.com?project=katuro-ai';

/** Online persona voices: which services, the Azure key, and a test of each (adminConfig/deskVoice). */
function OnlineVoices() {
  const [cfg, setCfg] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [msg, setMsg] = useState(null);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState(null);
  useEffect(() => {
    getDoc(doc(db, 'adminConfig', 'deskVoice'))
      .then((d) => setCfg({ providers: ['google', 'azure', 'gemini'], azureRegion: 'southeastasia', ...(d.exists() ? d.data() : {}) }))
      .catch((e) => { setCfg({ providers: ['google', 'azure', 'gemini'], azureRegion: 'southeastasia' }); setMsg({ ok: false, text: e.message }); });
  }, []);
  if (!cfg) return <div style={card}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /></div>;

  const toggle = (id) => setCfg((c) => {
    const on = c.providers.includes(id);
    const next = on ? c.providers.filter((p) => p !== id) : SERVICES.map(([s]) => s).filter((s) => s === id || c.providers.includes(s));
    return { ...c, providers: next };
  });
  const save = async () => {
    setMsg(null);
    try {
      const data = { providers: cfg.providers, azureRegion: cfg.azureRegion, updatedAt: new Date() };
      if (keyInput.trim()) data.azureKey = keyInput.trim();
      await setDoc(doc(db, 'adminConfig', 'deskVoice'), data, { merge: true });
      if (keyInput.trim()) setCfg((c) => ({ ...c, azureKey: keyInput.trim() }));
      setKeyInput('');
      setMsg({ ok: true, text: 'Saved. Teachers get it within a minute.' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  };
  const test = async () => {
    setTesting(true);
    setResults(null);
    try {
      const res = await httpsCallable(getFunctions(app, 'us-central1'), 'adminTestDeskVoice', { timeout: 120000 })({});
      setResults(res.data.results);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setTesting(false);
    }
  };
  const masked = cfg.azureKey ? `saved (ends in ${String(cfg.azureKey).slice(-4)})` : 'not saved';

  return (
    <div style={card}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Persona voice: online services</h2>
      <p style={{ margin: '4px 0 12px', fontSize: 12.5, color: 'var(--kt-text-secondary)' }}>The personas speak with the first service that answers, in this order, within each teacher's 5 minutes a day. Filipino or Taglish replies use a Filipino voice. When none answers, or the 5 minutes are used up, KaTuroDesk uses the free voice on the teacher's laptop.</p>
      {SERVICES.map(([id, name, note]) => (
        <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={cfg.providers.includes(id)} onChange={() => toggle(id)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 13, color: 'var(--kt-text-primary)' }}><strong>{name}</strong><span style={{ display: 'block', fontSize: 12, color: 'var(--kt-text-secondary)' }}>{note}</span></span>
        </label>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', margin: '10px 0' }}>
        <label style={{ fontSize: 12, color: 'var(--kt-text-secondary)' }}>Azure Speech key ({masked})
          <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder={cfg.azureKey ? 'Paste a new key to replace it' : 'Paste the key'} autoComplete="off" style={{ display: 'block', marginTop: 4, padding: '6px 8px', fontSize: 13, borderRadius: 8, border: '1px solid var(--kt-border)', minWidth: 260 }} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--kt-text-secondary)' }}>Azure region
          <select value={cfg.azureRegion} onChange={(e) => setCfg((c) => ({ ...c, azureRegion: e.target.value }))} style={{ display: 'block', marginTop: 4, padding: '6px 8px', fontSize: 13, borderRadius: 8, border: '1px solid var(--kt-border)' }}>
            {AZURE_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <button type="button" onClick={save} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><Save size={13} /> Save</button>
        <button type="button" onClick={test} disabled={testing} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--kt-surface)', color: 'var(--kt-text-primary)', border: '1px solid var(--kt-border)', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{testing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null} Test each service</button>
      </div>
      {msg && <Notice ok={msg.ok}>{msg.text}</Notice>}
      {results && results.map((r) => (
        <div key={r.provider} style={{ fontSize: 13, margin: '6px 0', color: 'var(--kt-text-primary)' }}>
          <strong>{r.name}:</strong> {r.ok ? <span style={{ color: '#2d6a4f' }}>works ({(r.ms / 1000).toFixed(1)} s)</span> : <span style={{ color: '#b42318' }}>{r.error}</span>}
          {r.provider === 'google' && !r.ok && /has not been used|disabled|SERVICE_DISABLED|403/.test(r.error || '') && (
            <span style={{ display: 'block', fontSize: 12 }}>Turn it on here (one time): <a href={ENABLE_GOOGLE_TTS} target="_blank" rel="noreferrer">Cloud Text-to-Speech API for katuro-ai</a>, wait 2 minutes, then test again.</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DeskAiAdmin({ adminUid }) {
  return (
    <div>
      <RuleCardsEditor adminUid={adminUid} />
      <FeedbackSummary />
      <OnlineVoices />
      <VoiceUsage />
    </div>
  );
}
