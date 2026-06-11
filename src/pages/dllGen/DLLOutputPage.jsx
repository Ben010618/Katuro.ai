import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDLLStore } from '../../store/dllStore';
import { useAuth } from '../../hooks/useAuth';
import { downloadDLLDocx } from '../../services/dllDocx';
import { useToast } from '../../context/ToastContext';
import { FileDown, ChevronDown, ChevronRight, CalendarDays, RotateCcw } from 'lucide-react';

const DAY_KEYS  = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const STEPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const STEP_LABELS = {
  A: 'Reviewing previous lesson or presenting the new lesson',
  B: 'Establishing a purpose for the lesson',
  C: 'Presenting examples/instances of the new lesson',
  D: 'Discussing new concepts and practicing new skills #1',
  E: 'Discussing new concepts and practicing new skills #2',
  F: 'Developing mastery (Leads to Formative Assessment)',
  G: 'Finding practical applications of concepts and skills in daily living',
  H: 'Making generalizations and abstractions about the lesson',
  I: 'Evaluating Learning',
  J: 'Additional activities for application or remediation',
};

function DayAccordion({ dayKey, dayName, dayProc, content }) {
  const [open, setOpen] = useState(false);
  const hasContent = dayProc && STEPS.some(s => dayProc[s]);

  return (
    <div style={{ border: '1px solid rgba(45,106,79,0.12)', borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', background: open ? 'rgba(79,70,229,0.04)' : '#fff',
          border: 'none', padding: '13px 18px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0d2218' }}>{dayName}</span>
          {content && (
            <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>{content}</span>
          )}
          {!hasContent && (
            <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 20 }}>No class</span>
          )}
        </div>
        {open ? <ChevronDown size={15} color="#6b7280" /> : <ChevronRight size={15} color="#6b7280" />}
      </button>

      {open && hasContent && (
        <div style={{ borderTop: '1px solid rgba(45,106,79,0.08)', padding: '0' }}>
          {STEPS.map(step => (
            <div key={step} style={{
              display: 'grid', gridTemplateColumns: '260px 1fr',
              borderBottom: step !== 'J' ? '1px solid rgba(45,106,79,0.06)' : 'none',
            }}>
              <div style={{ padding: '10px 16px', background: '#fafafa', fontSize: 12, color: '#4a6357', fontWeight: 600, lineHeight: 1.5 }}>
                {step}. {STEP_LABELS[step]}
              </div>
              <div style={{ padding: '10px 16px', fontSize: 13, color: '#1a3d2b', lineHeight: 1.6 }}>
                {dayProc[step] || <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>—</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DLLOutputPage() {
  const navigate     = useNavigate();
  const store        = useDLLStore();
  const { profile }  = useAuth();
  const { addToast } = useToast();
  const [downloading, setDownloading] = useState(false);

  if (!store.procedure) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
        <p style={{ fontSize: 15, color: '#6b7280' }}>No DLL generated yet.</p>
        <button onClick={() => navigate('/dll-gen/step-1')} className="btn-primary" style={{ marginTop: 16 }}>
          Start a New DLL
        </button>
      </div>
    );
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadDLLDocx({ store, profile });
      addToast('Daily Lesson Log downloaded!', 'success');
    } catch (err) {
      addToast('Download failed: ' + err.message, 'error');
    } finally {
      setDownloading(false);
    }
  }

  function handleNewDLL() {
    store.reset();
    navigate('/dll-gen/step-1');
  }

  const days = store.dailyContent;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #ede9fe, #e0e7ff)', display: 'grid', placeItems: 'center' }}>
          <CalendarDays size={19} color="#4f46e5" />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Daily Lesson Log · Generated
          </p>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0d2218' }}>
            {store.subject} — {store.gradeLevel}
          </h1>
        </div>
      </div>

      {/* Meta card */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid rgba(45,106,79,0.12)',
        padding: '18px 22px', marginBottom: 20,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 24px',
      }}>
        {[
          ['Subject', store.subject],
          ['Grade Level', store.gradeLevel],
          ['Term', store.term],
          ['Section', store.section || '—'],
          ['Teaching Dates', store.teachingDates || '—'],
          ['Teacher', profile?.name || '—'],
        ].map(([label, val]) => (
          <div key={label}>
            <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#0d2218', fontWeight: 500 }}>{val}</p>
          </div>
        ))}
      </div>

      {/* MELC */}
      <div style={{
        background: 'rgba(79,70,229,0.04)', border: '1px solid rgba(79,70,229,0.12)',
        borderRadius: 10, padding: '14px 18px', marginBottom: 22,
      }}>
        <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>MELC</p>
        <p style={{ margin: 0, fontSize: 13, color: '#1a3d2b', lineHeight: 1.6 }}>{store.melc}</p>
      </div>

      {/* Procedure accordion */}
      <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0d2218' }}>Procedure (AI-Generated)</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {DAY_KEYS.map((dk, i) => (
          <DayAccordion
            key={dk}
            dayKey={dk}
            dayName={DAY_NAMES[i]}
            dayProc={store.procedure[dk]}
            content={days[['mon', 'tue', 'wed', 'thu', 'fri'][i]]}
          />
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="btn-primary"
          style={{ fontSize: 15, padding: '12px 26px', opacity: downloading ? 0.7 : 1 }}
        >
          {downloading ? (
            <>
              <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Preparing…
            </>
          ) : (
            <>
              <FileDown size={16} />
              Download DOCX
            </>
          )}
        </button>

        <button
          onClick={() => navigate('/dll-gen/step-2')}
          className="btn-outline"
          style={{ fontSize: 14, padding: '12px 22px' }}
        >
          Edit Inputs
        </button>

        <button
          onClick={handleNewDLL}
          className="btn-outline"
          style={{ fontSize: 14, padding: '12px 22px' }}
        >
          <RotateCcw size={14} />
          New DLL
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
