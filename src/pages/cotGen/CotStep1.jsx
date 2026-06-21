import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCotStore } from '../../store/cotStore';
import { useAuth } from '../../hooks/useAuth';

const GRADES = [
  'Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
  'Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12',
];
const QUARTERS = ['First Quarter','Second Quarter','Third Quarter','Fourth Quarter'];

function Field({ label, required, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#4a4060', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}{required && <span style={{ color: '#7c3aed', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

export default function CotStep1() {
  const navigate = useNavigate();
  const store    = useCotStore();
  const { user } = useAuth();

  // Pre-fill teacher name & school from auth profile if empty
  useEffect(() => {
    if (!store.teacherName && user?.displayName) {
      store.setStep1({ teacherName: user.displayName });
    }
  }, [user]);

  function set(field) {
    return e => store.setStep1({ [field]: e.target.value });
  }

  const inp = {
    className: 'input',
    style: { fontFamily: 'inherit', fontSize: 14 },
  };

  const selectStyle = {
    ...inp,
    style: { ...inp.style, cursor: 'pointer' },
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <span style={{
          background: 'rgba(124,58,237,0.1)', color: '#7c3aed',
          borderRadius: 20, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        }}>
          Step 1 — Lesson Information
        </span>
        <h2 style={{ margin: '10px 0 4px', fontSize: 22, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
          Tell kaTuro about your lesson
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
          Fill in the details below. Objectives are optional — the AI will generate them using Bloom's Taxonomy if left blank.
        </p>
      </div>

      {/* Two-column form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Row: Teacher + School */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Teacher Name" required>
            <input
              {...inp}
              value={store.teacherName}
              onChange={set('teacherName')}
              placeholder="e.g. Ben Mark Joy A. Cuvinar"
            />
          </Field>
          <Field label="School Name" required>
            <input
              {...inp}
              value={store.school}
              onChange={set('school')}
              placeholder="e.g. Dayap National High School"
            />
          </Field>
        </div>

        {/* Row: Subject + Grade */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Subject / Learning Area" required>
            <input
              {...inp}
              value={store.subject}
              onChange={set('subject')}
              placeholder="e.g. Science 10, Math 7, English 8"
            />
          </Field>
          <Field label="Grade Level" required>
            <select {...selectStyle} value={store.grade} onChange={set('grade')}>
              <option value="">Select grade level</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
        </div>

        {/* Row: Quarter + Teaching Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Quarter" required>
            <select {...selectStyle} value={store.quarter} onChange={set('quarter')}>
              <option value="">Select quarter</option>
              {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </Field>
          <Field label="Teaching Date & Time">
            <input
              {...inp}
              value={store.teachingDate}
              onChange={set('teachingDate')}
              placeholder="e.g. Oct 23, 2025 · 8:00–9:00 AM"
            />
          </Field>
        </div>

        {/* Topic */}
        <Field label="Lesson Topic / Content" required hint="Be specific — this becomes the lesson title in your document.">
          <input
            {...inp}
            value={store.topic}
            onChange={set('topic')}
            placeholder="e.g. Charles' Law — Volume and Temperature Relationship of Gases"
          />
        </Field>

        {/* MELC */}
        <Field
          label="MELC Competency"
          required
          hint="Paste the full MELC code and description from the DepEd curriculum guide."
        >
          <textarea
            {...inp}
            rows={3}
            value={store.melc}
            onChange={set('melc')}
            placeholder="e.g. Investigate the relationship between the volume and temperature at constant pressure of a gas (S10LT-IIIg-40)"
            style={{ ...inp.style, resize: 'vertical', lineHeight: 1.65 }}
          />
        </Field>

        {/* Materials */}
        <Field label="Available Materials" hint="List materials the class has access to. Separate with commas.">
          <input
            {...inp}
            value={store.materials}
            onChange={set('materials')}
            placeholder="e.g. balloons, hot water, ice water, plastic bottles, textbook, computer tablets"
          />
        </Field>

        {/* Objectives (optional) */}
        <Field
          label="Learning Objectives (Optional)"
          hint="Leave blank and the AI will generate cognitive, affective, and psychomotor objectives automatically using Bloom's Taxonomy."
        >
          <textarea
            {...inp}
            rows={4}
            value={store.objectives}
            onChange={set('objectives')}
            placeholder="Optional: paste your draft objectives here, or leave blank for AI-generated objectives."
            style={{ ...inp.style, resize: 'vertical', lineHeight: 1.65 }}
          />
        </Field>

        {/* Optional blank AI note */}
        {!store.objectives && (
          <div style={{
            background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.15)',
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>✨</span>
            <p style={{ margin: 0, fontSize: 13, color: '#5b21b6', lineHeight: 1.65 }}>
              <strong>AI will generate objectives</strong> — The AI will write three objectives (cognitive, affective, psychomotor) aligned to Bloom's Taxonomy, targeting the Application level or higher.
            </p>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
