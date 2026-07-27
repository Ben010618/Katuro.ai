import { useState, useEffect } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Info, Sparkles } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { createCase } from '../services/caseService';
import { suggestIntakeNarrative } from '../services/protectGemini';
import { makeEmptyIntakeForm } from '../types';

const card = { background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', padding: '20px 22px' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 };
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  border: '1.5px solid rgba(45,106,79,0.2)', borderRadius: 8, fontSize: 14,
  background: 'var(--kt-input-bg)', color: 'var(--kt-text-primary)', outline: 'none', fontFamily: 'inherit',
};
const btnPrimary = { background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 };
const btnSecondary = { background: 'var(--kt-surface)', color: '#1a3d2b', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 };

const MODALITIES = ['physical', 'verbal', 'social', 'online', 'sexual', 'weapon', 'other'];
const EVIDENCE_TYPES = ['screenshots', 'medical_cert', 'written_statement', 'cctv', 'other'];
const STEPS = ['Incident basics', 'Parties', 'Modality', 'Narrative & evidence', 'Review'];

function CodeNameHint() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 10, fontSize: 11, color: 'var(--kt-text-secondary)' }}>
      <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} color="#d97706" />
      <span>Use a code name or initials — e.g. "Learner A" — never a full name. Real identities are never stored in case notes.</span>
    </div>
  );
}

function Toggle({ checked, onChange, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--kt-text-primary)', cursor: 'pointer', padding: '6px 0' }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ width: 16, height: 16, accentColor: '#2d6a4f' }} />
      {children}
    </label>
  );
}

export default function IntakeWizard({ chatHistory, onCreated }) {
  const { user, profile } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(makeEmptyIntakeForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState(false); // has a suggestion attempt already run this session
  const [suggestionFailed, setSuggestionFailed] = useState(false);

  // Draft the Narrative + Immediate Actions fields from the prior chat
  // conversation once the user reaches this step — only if there's actually
  // a conversation to draw from, only once, and never overwriting text the
  // user already typed themselves. All setState calls live inside the async
  // IIFE (not directly in the effect body) so this doesn't run into the
  // "no synchronous setState in an effect" issue.
  useEffect(() => {
    const alreadyHasContent = form.incident_narrative.trim() || form.immediate_actions_taken.trim();
    if (step !== 3 || suggested || !chatHistory?.length || alreadyHasContent) return;

    (async () => {
      setSuggesting(true);
      try {
        const result = await suggestIntakeNarrative(chatHistory);
        if (result) {
          setForm((prev) => ({
            ...prev,
            incident_narrative: prev.incident_narrative.trim() || result.narrative,
            immediate_actions_taken: prev.immediate_actions_taken.trim() || result.immediate_actions,
          }));
        } else {
          setSuggestionFailed(true);
        }
      } catch {
        setSuggestionFailed(true);
      } finally {
        setSuggesting(false);
        setSuggested(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function set(path, value) {
    setForm((prev) => {
      const next = structuredClone(prev);
      const keys = path.split('.');
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  }

  function toggleArrayValue(field, value) {
    setForm((prev) => {
      const has = prev[field].includes(value);
      return { ...prev, [field]: has ? prev[field].filter((v) => v !== value) : [...prev[field], value] };
    });
  }

  function stepIsValid() {
    if (step === 0) return !!(form.date_of_incident && form.location.trim());
    if (step === 1) return !!(form.complainant.code_name.trim() && form.respondent.code_name.trim());
    if (step === 3) return !!form.incident_narrative.trim();
    return true;
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      const finalForm = {
        ...form,
        date_reported: form.date_reported || new Date().toISOString().slice(0, 10),
        received_by: { name: profile?.displayName || user?.email || '', position: form.received_by.position || 'LFO' },
      };
      const caseId = await createCase(finalForm, user?.uid);
      onCreated?.(caseId);
    } catch (e) {
      setError(e.message || 'Could not save this case. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...card }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontWeight: 700,
            color: i === step ? '#2d6a4f' : i < step ? 'var(--kt-text-secondary)' : 'var(--kt-text-secondary)',
            opacity: i <= step ? 1 : 0.5,
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center',
              background: i <= step ? '#2d6a4f' : 'var(--kt-surface)', color: i <= step ? '#fff' : 'var(--kt-text-secondary)',
              fontSize: 10, border: i <= step ? 'none' : '1px solid var(--kt-border)',
            }}>{i < step ? <CheckCircle2 size={12} /> : i + 1}</span>
            {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Date of Incident</label>
              <input type="date" style={inputStyle} value={form.date_of_incident} onChange={(e) => set('date_of_incident', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Time</label>
              <input type="time" style={inputStyle} value={form.time} onChange={(e) => set('time', e.target.value)} />
            </div>
          </div>
          <label style={labelStyle}>Location</label>
          <input style={{ ...inputStyle, marginBottom: 14 }} placeholder="e.g. Grade 8 hallway, canteen" value={form.location} onChange={(e) => set('location', e.target.value)} />
          <label style={labelStyle}>Reporter Role</label>
          <select style={inputStyle} value={form.reporter_role} onChange={(e) => set('reporter_role', e.target.value)}>
            {['learner', 'parent', 'teacher', 'anonymous', 'other'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </>
      )}

      {step === 1 && (
        <>
          <CodeNameHint />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Complainant</h4>
              <label style={labelStyle}>Code Name</label>
              <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="e.g. Learner A" value={form.complainant.code_name} onChange={(e) => set('complainant.code_name', e.target.value)} />
              <label style={labelStyle}>Grade / Section</label>
              <input style={{ ...inputStyle, marginBottom: 10 }} value={form.complainant.grade_section} onChange={(e) => set('complainant.grade_section', e.target.value)} />
              <label style={labelStyle}>Role</label>
              <select style={inputStyle} value={form.complainant.role} onChange={(e) => set('complainant.role', e.target.value)}>
                <option value="learner">learner</option>
                <option value="personnel">personnel</option>
              </select>
            </div>
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Respondent</h4>
              <label style={labelStyle}>Code Name</label>
              <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="e.g. Learner B" value={form.respondent.code_name} onChange={(e) => set('respondent.code_name', e.target.value)} />
              <label style={labelStyle}>Grade / Section or Position</label>
              <input style={{ ...inputStyle, marginBottom: 10 }} value={form.respondent.grade_section_or_position} onChange={(e) => set('respondent.grade_section_or_position', e.target.value)} />
              <label style={labelStyle}>Role</label>
              <input style={inputStyle} placeholder="e.g. learner, teacher" value={form.respondent.role} onChange={(e) => set('respondent.role', e.target.value)} />
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <label style={labelStyle}>Modality (select all that apply)</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {MODALITIES.map((m) => (
              <Toggle key={m} checked={form.modality.includes(m)} onChange={() => toggleArrayValue('modality', m)}>{m}</Toggle>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <Toggle checked={form.repeated_or_pattern} onChange={(e) => set('repeated_or_pattern', e.target.checked)}>
              This appears to be repeated or part of a pattern
            </Toggle>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          {suggesting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11, color: '#2d6a4f' }}>
              <Loader2 size={12} style={{ animation: 'kt-spin 0.8s linear infinite' }} />
              Drafting a suggestion from your conversation…
            </div>
          )}
          {suggested && !suggesting && !suggestionFailed && chatHistory?.length > 0 && (form.incident_narrative || form.immediate_actions_taken) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11, color: '#2d6a4f' }}>
              <Sparkles size={12} />
              Drafted from your conversation — please review and edit before submitting.
            </div>
          )}

          <label style={labelStyle}>Incident Narrative</label>
          <textarea rows={6} style={{ ...inputStyle, marginBottom: 14, resize: 'vertical' }} placeholder="What happened, in coded/de-identified terms…" value={form.incident_narrative} onChange={(e) => set('incident_narrative', e.target.value)} />

          <label style={labelStyle}>Evidence Available</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 14 }}>
            {EVIDENCE_TYPES.map((ev) => (
              <Toggle key={ev} checked={form.evidence.includes(ev)} onChange={() => toggleArrayValue('evidence', ev)}>{ev.replace('_', ' ')}</Toggle>
            ))}
          </div>

          <label style={labelStyle}>Immediate Actions Taken</label>
          <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={form.immediate_actions_taken} onChange={(e) => set('immediate_actions_taken', e.target.value)} />
        </>
      )}

      {step === 4 && (
        <div style={{ fontSize: 13, color: 'var(--kt-text-primary)', lineHeight: 1.7 }}>
          <p><strong>Date/Location:</strong> {form.date_of_incident || '—'} {form.time} · {form.location || '—'}</p>
          <p><strong>Complainant:</strong> {form.complainant.code_name || '—'} ({form.complainant.grade_section})</p>
          <p><strong>Respondent:</strong> {form.respondent.code_name || '—'} ({form.respondent.grade_section_or_position})</p>
          <p><strong>Modality:</strong> {form.modality.join(', ') || '—'}</p>
          <p><strong>Narrative:</strong> {form.incident_narrative || '—'}</p>
          <p><strong>Evidence:</strong> {form.evidence.join(', ') || 'none listed'}</p>
          <p style={{ fontSize: 11, color: 'var(--kt-text-secondary)' }}>
            The case will be created in <strong>REPORTED</strong> state. Classification (Part D) is not automated yet — a CPC member sets it manually once the legal corpus is loaded.
          </p>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 14, display: 'flex', gap: 7, background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 8, padding: '8px 12px' }}>
          <AlertCircle size={14} color="#e05c5c" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: '#c0392b' }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
        <button style={{ ...btnSecondary, opacity: step === 0 ? 0.5 : 1 }} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft size={14} /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button style={{ ...btnPrimary, opacity: stepIsValid() ? 1 : 0.5 }} disabled={!stepIsValid()} onClick={() => setStep((s) => s + 1)}>
            Next <ArrowRight size={14} />
          </button>
        ) : (
          <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={handleSubmit}>
            {saving ? <Loader2 size={14} style={{ animation: 'kt-spin 0.8s linear infinite' }} /> : <CheckCircle2 size={14} />}
            {saving ? 'Saving…' : 'Create Case'}
          </button>
        )}
      </div>
    </div>
  );
}
