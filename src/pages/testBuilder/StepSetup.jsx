import { useTestBuilderStore } from '../../store/testBuilderStore';
import {
  GRADE_LEVELS, SUBJECTS, TERMS, TEST_TYPES, DAY_LIMIT, QUESTION_FORMATS,
  KEY_STAGE_LABELS, deriveKeyStage, deriveItemCeiling, makeEmptyCompetency,
} from '../../config/testBuilderConfig';
import { clampCompetencyDays, totalDays } from '../../utils/testBuilderCalc';
import { Trash2, Plus, LayoutGrid, FileQuestion } from 'lucide-react';

const labelStyle = {
  display: 'block', marginBottom: 6,
  fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '1.2px',
};

export default function StepSetup() {
  const store = useTestBuilderStore();
  const keyStage = deriveKeyStage(store.gradeLevel);
  const itemCeiling = keyStage ? deriveItemCeiling(keyStage, store.testType) : null;

  const days = store.competencies.map((c) => c.days);
  const used = totalDays(days);
  const budgetPct = Math.min(100, (used / DAY_LIMIT) * 100);
  const atLimit = used >= DAY_LIMIT;

  function updateCompetency(i, patch) {
    const next = store.competencies.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    store.setCompetencies(next);
  }

  function updateDays(i, rawValue) {
    const n = Math.max(1, Math.round(Number(rawValue) || 1));
    const clampedDays = clampCompetencyDays(days, i, n, DAY_LIMIT);
    updateCompetency(i, { days: clampedDays[i] });
  }

  function removeCompetency(i) {
    if (store.competencies.length <= 1) return;
    store.setCompetencies(store.competencies.filter((_, idx) => idx !== i));
  }

  function addCompetency() {
    const remaining = DAY_LIMIT - used;
    if (remaining <= 0) return;
    store.setCompetencies([
      ...store.competencies,
      { ...makeEmptyCompetency(), days: Math.min(5, remaining) },
    ]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 32 }}>

      {/* Heading */}
      <div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--kt-green-tint)', color: 'var(--kt-green-dark)',
          borderRadius: 20, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        }}>
          <LayoutGrid size={12} /> Test Builder · Setup
        </span>
        <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
          Set up your test
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.65, maxWidth: 560 }}>
          Grade level and test type determine your DepEd item ceiling automatically — no manual entry.
        </p>
      </div>

      {/* Grade / Subject / Test type */}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div>
          <label style={labelStyle}>Grade Level <span style={{ color: 'var(--kt-danger)' }}>*</span></label>
          <select className="select" value={store.gradeLevel} onChange={(e) => store.setField('gradeLevel', e.target.value)}>
            <option value="">Select grade level...</option>
            {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Subject <span style={{ color: 'var(--kt-danger)' }}>*</span></label>
          <select className="select" value={store.subject} onChange={(e) => store.setField('subject', e.target.value)}>
            <option value="">Select subject...</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Test Type <span style={{ color: 'var(--kt-danger)' }}>*</span></label>
          <select className="select" value={store.testType} onChange={(e) => store.setField('testType', e.target.value)}>
            {TEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Item Ceiling</label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 40, borderRadius: 10,
            background: 'var(--kt-green-tint)', padding: '0 14px',
          }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--kt-green-dark)', fontFamily: '"DM Mono", monospace' }}>
              {itemCeiling ?? '—'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--kt-green-dark)', fontWeight: 600 }}>
              {keyStage ? KEY_STAGE_LABELS[keyStage] : 'Select a grade level'}
            </span>
          </div>
        </div>
      </div>

      {/* Terms */}
      <div className="card">
        <label style={labelStyle}>Term(s) <span style={{ color: 'var(--kt-danger)' }}>*</span></label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {TERMS.map((t) => {
            const selected = store.terms.includes(t);
            return (
              <button
                key={t}
                onClick={() => store.setField('terms', selected ? store.terms.filter((x) => x !== t) : [...store.terms, t])}
                style={{
                  flex: 1, padding: '9px 4px', borderRadius: 10, border: '1.5px solid',
                  borderColor: selected ? 'var(--kt-green-dark)' : 'rgba(45,106,79,0.2)',
                  background: selected ? 'linear-gradient(135deg, #1a3d2b, #2d6a4f)' : 'var(--kt-card)',
                  color: selected ? '#fff' : 'var(--kt-text-secondary)',
                  fontSize: 13, fontWeight: selected ? 700 : 500,
                  cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Question Format(s) */}
      <div className="card">
        <label style={labelStyle}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FileQuestion size={12} /> Question Format(s) <span style={{ color: 'var(--kt-danger)' }}>*</span>
          </span>
        </label>
        <p style={{ margin: '2px 0 10px', fontSize: 12, color: 'var(--kt-text-secondary)' }}>
          Select the item types this test will use — the AI will draw from this mix when generating the test paper.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUESTION_FORMATS.map((fmt) => {
            const selected = store.questionFormats.includes(fmt);
            return (
              <button
                key={fmt}
                onClick={() => store.setField(
                  'questionFormats',
                  selected ? store.questionFormats.filter((x) => x !== fmt) : [...store.questionFormats, fmt]
                )}
                style={{
                  padding: '8px 14px', borderRadius: 20, border: '1.5px solid',
                  borderColor: selected ? 'var(--kt-green-dark)' : 'rgba(45,106,79,0.2)',
                  background: selected ? 'linear-gradient(135deg, #1a3d2b, #2d6a4f)' : 'var(--kt-card)',
                  color: selected ? '#fff' : 'var(--kt-text-secondary)',
                  fontSize: 13, fontWeight: selected ? 700 : 500,
                  cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                }}
              >
                {fmt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Competencies */}
      <div className="card card-accent">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Competencies / MELCs</label>
          <span style={{
            fontSize: 11, fontWeight: 700, fontFamily: '"DM Mono", monospace',
            color: atLimit ? 'var(--kt-accent-amber)' : 'var(--kt-text-secondary)',
          }}>
            {used} / {DAY_LIMIT} instructional days used
          </span>
        </div>

        <div className="progress-track" style={{ height: 6, marginBottom: 18 }}>
          <div
            className="progress-fill"
            style={{
              height: '100%', width: `${budgetPct}%`,
              background: atLimit ? 'var(--kt-accent-amber)' : 'linear-gradient(90deg, #2d6a4f, #52b788)',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {store.competencies.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="MELC code + description…"
                value={c.text}
                onChange={(e) => updateCompetency(i, { text: e.target.value })}
              />
              <input
                className="input"
                type="number"
                min={1}
                value={c.days}
                onChange={(e) => updateDays(i, e.target.value)}
                title="Instructional days"
                style={{ width: 76, textAlign: 'center', fontFamily: '"DM Mono", monospace' }}
              />
              <button
                onClick={() => removeCompetency(i)}
                disabled={store.competencies.length <= 1}
                aria-label={`Remove competency ${i + 1}`}
                style={{
                  width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center',
                  borderRadius: 9, border: 'none',
                  background: store.competencies.length <= 1 ? 'transparent' : '#fde8e8',
                  color: store.competencies.length <= 1 ? 'var(--kt-muted)' : 'var(--kt-danger)',
                  cursor: store.competencies.length <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addCompetency}
          disabled={used >= DAY_LIMIT}
          aria-label="Add competency"
          className="btn-outline"
          style={{ marginTop: 14, fontSize: 13, padding: '9px 16px', opacity: used >= DAY_LIMIT ? 0.5 : 1 }}
        >
          <Plus size={14} /> Add competency
        </button>

        {used >= DAY_LIMIT && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--kt-accent-amber)', fontWeight: 600 }}>
            Reached the 50-day instructional limit for this term. Reduce days on another competency before adding a new one.
          </p>
        )}
      </div>
    </div>
  );
}
