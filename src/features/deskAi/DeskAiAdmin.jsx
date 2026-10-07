import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Plus, Save, Trash2, ThumbsUp, ThumbsDown, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
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

export default function DeskAiAdmin({ adminUid }) {
  return (
    <div>
      <RuleCardsEditor adminUid={adminUid} />
      <FeedbackSummary />
    </div>
  );
}
