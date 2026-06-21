import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDLLStore } from '../../store/dllStore';
import { useAuth } from '../../hooks/useAuth';
import { deductTokens, saveDLLPlan } from '../../services/db';
import { generateDLLProcedure } from '../../services/dllAI';
import { useToast } from '../../context/ToastContext';
import { Sparkles, ArrowRight, ArrowLeft, CalendarDays, Plus, X } from 'lucide-react';

const MAX_DAYS = 5;

// One distinct color per BOW row (up to 5)
const ROW_COLORS = [
  { bg: '#d8f3dc', text: '#1a3d2b', border: '#2d6a4f', solid: '#52b788' },
  { bg: '#e0f2fe', text: '#0369a1', border: '#0284c7', solid: '#38bdf8' },
  { bg: 'rgba(232,163,32,0.15)', text: '#92400e', border: '#d97706', solid: '#fbbf24' },
  { bg: '#fde8e8', text: '#c0392b', border: '#e05c5c', solid: '#f87171' },
  { bg: '#ede9fe', text: '#6d28d9', border: '#7c3aed', solid: '#a78bfa' },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const inputBase = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 8,
  border: '1.5px solid rgba(45,106,79,0.2)',
  fontSize: 13, color: 'var(--kt-text-primary)', background: 'var(--kt-card)',
  outline: 'none', lineHeight: 1.6, fontFamily: 'inherit',
};

// ── Reusable BOW section (MELC or Content) ───────────────────────────────────
function BowSection({ label, sublabel, rowLabel, placeholder, list, onChange }) {
  const total      = list.reduce((s, r) => s + r.days, 0);
  const remaining  = MAX_DAYS - total;
  const canAdd     = list.length < 5 && remaining > 0;
  const atLimit    = remaining <= 0;

  function addRow() {
    if (!canAdd) return;
    onChange([...list, { text: '', days: 1 }]);
  }

  function removeRow(idx) {
    if (list.length === 1) return;
    onChange(list.filter((_, i) => i !== idx));
  }

  function updateText(idx, text) {
    onChange(list.map((r, i) => i === idx ? { ...r, text } : r));
  }

  function updateDays(idx, newDays) {
    const otherDays = list.reduce((s, r, i) => i === idx ? s : s + r.days, 0);
    if (otherDays + newDays > MAX_DAYS) return;
    onChange(list.map((r, i) => i === idx ? { ...r, days: newDays } : r));
  }

  function maxDaysForRow(idx) {
    const other = list.reduce((s, r, i) => i === idx ? s : s + r.days, 0);
    return Math.max(1, MAX_DAYS - other);
  }

  // Which row owns each day slot?
  function rowIdxForSlot(slot) {
    let cum = 0;
    for (let i = 0; i < list.length; i++) {
      cum += list[i].days;
      if (slot < cum) return i;
    }
    return -1;
  }

  return (
    <div style={{
      background: 'var(--kt-card)', borderRadius: 14,
      border: '1px solid var(--kt-border)',
      padding: '22px 24px', marginBottom: 18,
    }}>
      <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{label}</p>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{sublabel}</p>

      {/* Budget tracker */}
      <div style={{
        background: 'var(--kt-surface)', borderRadius: 10,
        border: '1px solid rgba(45,106,79,0.1)',
        padding: '10px 14px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Week Budget
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: atLimit ? '#1a3d2b' : '#4a6357' }}>
            {total} of {MAX_DAYS} days{atLimit ? ' · ✓ Full week' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {Array.from({ length: MAX_DAYS }, (_, i) => {
            const ri    = rowIdxForSlot(i);
            const color = ri >= 0 ? ROW_COLORS[ri] : null;
            return (
              <div key={i} style={{
                flex: 1, borderRadius: 7, overflow: 'hidden',
                border: `1.5px solid ${color ? color.border : 'rgba(45,106,79,0.15)'}`,
              }}>
                <div style={{
                  height: 24,
                  background: color ? color.solid : 'rgba(45,106,79,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 800, color: color ? '#fff' : '#b0c4b8',
                  letterSpacing: '0.04em',
                }}>
                  {ri >= 0 ? `#${ri + 1}` : '—'}
                </div>
                <div style={{
                  textAlign: 'center', padding: '2px 0',
                  fontSize: 9, fontWeight: 700, color: '#4a6357',
                  background: 'var(--kt-card)',
                }}>
                  {DAY_LABELS[i]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
        {list.map((row, idx) => {
          const color   = ROW_COLORS[idx];
          const maxDays = maxDaysForRow(idx);
          return (
            <div key={idx} style={{
              background: '#fafcfa', borderRadius: 10,
              border: '1px solid rgba(45,106,79,0.13)',
              borderLeft: `3px solid ${color.solid}`,
              padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  background: color.bg, color: color.text,
                  border: `1px solid ${color.border}`,
                  borderRadius: 20, padding: '2px 10px',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  {rowLabel} {idx + 1}
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: '#4a6357', fontWeight: 600 }}>Days:</span>
                <select
                  value={row.days}
                  onChange={e => updateDays(idx, Number(e.target.value))}
                  style={{
                    border: '1px solid rgba(45,106,79,0.25)', borderRadius: 7,
                    padding: '4px 8px', fontSize: 13, fontWeight: 700,
                    background: 'var(--kt-input-bg)', color: 'var(--kt-text-primary)',
                    cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                  }}
                >
                  {Array.from({ length: maxDays }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {list.length > 1 && (
                  <button
                    onClick={() => removeRow(idx)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#b0c4b8', padding: 4, borderRadius: 6,
                      display: 'flex', alignItems: 'center',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#e05c5c'}
                    onMouseLeave={e => e.currentTarget.style.color = '#b0c4b8'}
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <textarea
                rows={2}
                value={row.text}
                onChange={e => updateText(idx, e.target.value)}
                placeholder={placeholder(idx)}
                style={{
                  ...inputBase, resize: 'vertical', fontSize: 13,
                  border: '1px solid rgba(45,106,79,0.15)', background: 'var(--kt-card)',
                }}
                onFocus={e => { e.target.style.borderColor = '#2d6a4f'; }}
                onBlur={e  => { e.target.style.borderColor = 'rgba(45,106,79,0.15)'; }}
              />
            </div>
          );
        })}
      </div>

      {/* Add row button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={addRow}
          disabled={!canAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none',
            border: `1.5px dashed ${canAdd ? 'rgba(45,106,79,0.4)' : 'rgba(45,106,79,0.15)'}`,
            borderRadius: 8, padding: '6px 14px',
            fontSize: 12, fontWeight: 600,
            color: canAdd ? '#2d6a4f' : '#b0c4b8',
            cursor: canAdd ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (canAdd) e.currentTarget.style.background = '#f0faf5'; }}
          onMouseLeave={e => { if (canAdd) e.currentTarget.style.background = 'none'; }}
        >
          <Plus size={13} /> Add {rowLabel}
        </button>
        {atLimit && (
          <span style={{ fontSize: 11, color: '#9BB8A5', fontStyle: 'italic' }}>
            5-day limit reached
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Step 2 ──────────────────────────────────────────────────────────────
export default function DLLStep2() {
  const navigate     = useNavigate();
  const store        = useDLLStore();
  const { user, tokenBalance } = useAuth();
  const { addToast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [genError,   setGenError]   = useState('');

  const melcList    = store.melcList;
  const contentList = store.contentList;

  const melcFilled    = melcList.every(r => r.text.trim());
  const contentFilled = contentList.every(r => r.text.trim());

  const canGenerate =
    store.contentStandards.trim() &&
    store.performanceStandards.trim() &&
    melcFilled && contentFilled &&
    tokenBalance >= 3;

  async function handleGenerate() {
    if (!canGenerate || generating) return;
    setGenerating(true);
    setGenError('');
    try {
      await deductTokens(user.uid, 'dll', 3);

      const { objectives, procedure, resources } = await generateDLLProcedure({
        subject:              store.subject,
        gradeLevel:           store.gradeLevel,
        term:                 store.term,
        contentStandards:     store.contentStandards,
        performanceStandards: store.performanceStandards,
        melcList,
        contentList,
      });

      store.setObjectives(objectives);
      store.setProcedure(procedure);
      store.setResources(resources);

      // Derive flat fields for backward compat + Firestore save
      const combinedMelc = melcList.map(m => m.text.trim()).join('; ');
      store.setField('melc', combinedMelc);

      try {
        const id = await saveDLLPlan(user.uid, {
          subject:              store.subject,
          gradeLevel:           store.gradeLevel,
          term:                 store.term,
          section:              store.section,
          teachingDates:        store.teachingDates,
          contentStandards:     store.contentStandards,
          performanceStandards: store.performanceStandards,
          melc:                 combinedMelc,
          melcList,
          contentList,
          objectives,
          procedure,
          resources,
        });
        store.setSavedId(id);
      } catch (e) {
        console.warn('DLL auto-save failed:', e.message);
      }

      navigate('/dll-gen/output');
    } catch (err) {
      setGenError(err.message || 'Generation failed. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #ede9fe, #e0e7ff)', display: 'grid', placeItems: 'center' }}>
          <CalendarDays size={19} color="#4f46e5" />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Daily Lesson Log · Step 2 of 2
          </p>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
            Standards, MELC &amp; Daily Content
          </h1>
        </div>
      </div>

      {/* Standards card */}
      <div style={{
        background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)',
        padding: '22px 24px', marginBottom: 18,
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {[
          { key: 'contentStandards',     label: 'Content Standards *',     ph: 'The learner demonstrates understanding of…' },
          { key: 'performanceStandards', label: 'Performance Standards *', ph: 'The learner is able to…' },
        ].map(({ key, label, ph }) => (
          <div key={key}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1a3d2b', marginBottom: 6 }}>
              {label}
            </label>
            <textarea
              value={store[key]}
              onChange={e => store.setField(key, e.target.value)}
              placeholder={ph}
              rows={3}
              style={{ ...inputBase, resize: 'vertical' }}
              onFocus={e => (e.target.style.borderColor = '#2d6a4f')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(45,106,79,0.2)')}
            />
          </div>
        ))}
      </div>

      {/* MELC BOW section */}
      <BowSection
        label="Learning Competency / MELC *"
        sublabel="Add each MELC from your Budget of Work and assign how many days it will be taught. Total days cannot exceed 5."
        rowLabel="MELC"
        placeholder={idx => `Paste MELC ${idx + 1} (with LC code if available)…`}
        list={melcList}
        onChange={list => store.setMelcList(list)}
      />

      {/* Content BOW section */}
      <BowSection
        label="Content (Subject Matter) per Day *"
        sublabel="Add each content topic and assign how many days it covers. Total days cannot exceed 5."
        rowLabel="Content"
        placeholder={idx => `Topic ${idx + 1} — e.g. Indicators of Chemical Reactions…`}
        list={contentList}
        onChange={list => store.setContentList(list)}
      />

      {/* Token warning */}
      {tokenBalance < 3 && (
        <div style={{
          background: '#fff7ed', border: '1px solid #fed7aa',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          fontSize: 13, color: '#9a3412',
        }}>
          You need at least 3 tokens to generate. Current balance: {tokenBalance} tokens.
        </div>
      )}

      {/* Generation error */}
      {genError && (
        <div style={{
          background: '#fde8e8', border: '1px solid rgba(224,92,92,0.3)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          fontSize: 13, color: '#c0392b',
        }}>
          ⚠ {genError}
        </div>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => navigate('/dll-gen/step-1')}
          className="btn-outline"
          style={{ fontSize: 14, padding: '10px 20px' }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <button
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          className="btn-primary"
          style={{
            fontSize: 14, padding: '11px 26px',
            opacity: canGenerate && !generating ? 1 : 0.45,
            background: '#4f46e5',
          }}
        >
          {generating ? (
            <>
              <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={15} />
              Generate Daily Lesson Log (3 tokens)
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
