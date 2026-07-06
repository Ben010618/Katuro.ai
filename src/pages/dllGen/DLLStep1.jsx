import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDLLStore } from '../../store/dllStore';
import { useAuth } from '../../hooks/useAuth';
import { trackEvent } from '../../services/usageTracker';
import { ArrowRight, CalendarDays } from 'lucide-react';

const SUBJECTS = [
  'Science', 'Mathematics', 'English', 'Filipino',
  'Araling Panlipunan', 'MAPEH', 'GMRC', 'Makabansa',
  'Reading & Literacy', 'Language', 'TLE', 'EPP', 'ESP',
];
const GRADES = [
  'Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4',
  'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
  'Grade 11', 'Grade 12',
];
const TERMS = ['Term 1', 'Term 2', 'Term 3'];

const labelStyle = {
  display: 'block', marginBottom: 6,
  fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '1.2px',
};
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 8,
  border: '1.5px solid rgba(45,106,79,0.2)',
  fontSize: 14, color: 'var(--kt-text-primary)', background: 'var(--kt-card)',
  outline: 'none', fontFamily: 'inherit',
};

export default function DLLStep1() {
  const navigate = useNavigate();
  const store    = useDLLStore();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.uid) trackEvent(user.uid, 'dllgen_step_viewed', { step: 'step1' });
  }, [user?.uid]);

  const canNext = store.subject.trim() && store.gradeLevel.trim() && store.term.trim();

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* Heading */}
      <div style={{ marginBottom: 28 }}>
        <span style={{
          background: '#ede9fe', color: '#4f46e5',
          borderRadius: 20, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        }}>
          Daily Lesson Log
        </span>
        <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
          Set up your Daily Lesson Log
        </h2>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--kt-text-secondary)', lineHeight: 1.65, maxWidth: 520 }}>
          Enter your class details. This information will appear in the DLL header.
        </p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* LEFT — form */}
        <div style={{
          background: 'var(--kt-card)', border: '1px solid var(--kt-border)',
          borderRadius: 14, padding: 24,
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>

          {/* Subject */}
          <div>
            <label style={labelStyle}>
              Subject Area <span style={{ color: '#e05c5c' }}>*</span>
            </label>
            <select
              className="select"
              value={store.subject}
              onChange={e => store.setField('subject', e.target.value)}
            >
              <option value="">Select subject...</option>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Grade Level */}
          <div>
            <label style={labelStyle}>
              Grade Level <span style={{ color: '#e05c5c' }}>*</span>
            </label>
            <select
              className="select"
              value={store.gradeLevel}
              onChange={e => store.setField('gradeLevel', e.target.value)}
            >
              <option value="">Select grade level...</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Term */}
          <div>
            <label style={labelStyle}>
              Term <span style={{ color: '#e05c5c' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {TERMS.map(t => (
                <button
                  key={t}
                  onClick={() => store.setField('term', t)}
                  style={{
                    flex: 1, padding: '9px 4px', borderRadius: 10, border: '1.5px solid',
                    borderColor: store.term === t ? '#1a3d2b' : 'rgba(45,106,79,0.2)',
                    background:  store.term === t ? '#1a3d2b' : 'var(--kt-card)',
                    color:       store.term === t ? '#fff' : '#4a6357',
                    fontSize: 13, fontWeight: store.term === t ? 600 : 400,
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#4a6357', fontStyle: 'italic' }}>
              MATATAG follows a 3-term school calendar
            </p>
          </div>

          {/* Section */}
          <div>
            <label style={labelStyle}>Section</label>
            <input
              value={store.section}
              onChange={e => store.setField('section', e.target.value)}
              placeholder="e.g. Sampaguita, Section A"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = '#2d6a4f')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(45,106,79,0.2)')}
            />
          </div>

        </div>

        {/* RIGHT — teaching dates + summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Teaching dates card */}
          <div style={{
            background: 'var(--kt-card)', border: '1px solid var(--kt-border)',
            borderRadius: 14, padding: 24,
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
              Teaching Dates and Time
            </p>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--kt-text-secondary)', lineHeight: 1.6 }}>
              Write the week's date range and your class schedule. This will appear in the DLL header.
            </p>
            <label style={labelStyle}>Dates and Time</label>
            <input
              value={store.teachingDates}
              onChange={e => store.setField('teachingDates', e.target.value)}
              placeholder="e.g. June 9–13, 2025 · 7:30–8:30 AM"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = '#2d6a4f')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(45,106,79,0.2)')}
            />

            <div style={{
              marginTop: 14, background: 'var(--kt-surface)',
              border: '1px solid rgba(45,106,79,0.1)',
              borderRadius: 10, padding: '10px 14px',
            }}>
              <p style={{ margin: 0, fontSize: 11, color: '#4a6357', lineHeight: 1.6 }}>
                The DLL covers <strong>Monday – Friday</strong>. You will input specific content per day in the next step.
              </p>
            </div>
          </div>

          {/* Summary preview */}
          {(store.subject || store.gradeLevel || store.term) && (
            <div style={{
              background: '#d8f3dc', border: '1px solid rgba(45,106,79,0.2)',
              borderRadius: 12, padding: '14px 16px',
            }}>
              <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                Your DLL
              </p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--kt-text-primary)' }}>
                {[store.subject, store.gradeLevel, store.section].filter(Boolean).join(' · ') || '—'}
              </p>
              {store.term && (
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#4a6357' }}>
                  {store.term}{store.teachingDates ? ' · ' + store.teachingDates : ''}
                </p>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
        <button
          onClick={() => navigate('/lesson-gen')}
          className="btn-outline"
          style={{ fontSize: 14, padding: '10px 20px' }}
        >
          Back
        </button>
        <button
          onClick={() => navigate('/dll-gen/step-2')}
          disabled={!canNext}
          className="btn-primary"
          style={{ fontSize: 14, padding: '10px 24px', opacity: canNext ? 1 : 0.45 }}
        >
          Next — Standards & Content
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
