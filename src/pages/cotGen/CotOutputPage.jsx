import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCotStore, ALL_INDICATORS } from '../../store/cotStore';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { getTeacherProfile, saveCotPlan } from '../../services/db';
import {
  FileDown, Sparkles, ChevronDown, ChevronUp, RotateCcw, BookOpenCheck, Loader2,
} from 'lucide-react';
import AIOutputGuard from '../../components/AIOutputGuard';
import { retryAsync } from '../../utils/retry';

const KRA_COLOR = {
  'KRA 1': { text: '#0369a1', bg: '#e0f2fe' },
  'KRA 2': { text: '#15803d', bg: '#dcfce7' },
  'KRA 3': { text: '#9333ea', bg: '#f3e8ff' },
  'KRA 4': { text: '#b45309', bg: '#fef3c7' },
  'KRA 5': { text: '#be123c', bg: '#ffe4e6' },
};

// ── Utility components ────────────────────────────────────────────────────────

function Section({ title, icon, color = '#7c3aed', children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      border: `1px solid ${color}22`, marginBottom: 16, overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: `${color}08`, border: 'none', cursor: 'pointer',
          borderBottom: open ? `1px solid ${color}18` : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0d2218' }}>{title}</span>
        </div>
        {open ? <ChevronUp size={16} color="#6b7280" /> : <ChevronDown size={16} color="#6b7280" />}
      </button>
      {open && <div style={{ padding: '16px 18px' }}>{children}</div>}
    </div>
  );
}

function Chip({ label, color = '#7c3aed', bg = '#f3e8ff' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: bg, color, borderRadius: 6, padding: '3px 10px',
      fontSize: 11, fontWeight: 700,
    }}>{label}</span>
  );
}

function ObjectiveCard({ domain, text, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{domain}</p>
      <p style={{ margin: 0, fontSize: 13, color: '#0d2218', lineHeight: 1.65 }}>{text}</p>
    </div>
  );
}

function PreTestItem({ item }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div style={{ background: '#fafafa', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
      <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{item.num}. {item.type}</p>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: '#0d2218', lineHeight: 1.6 }}>{item.stem}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
        {['A','B','C','D'].map(letter => (
          <span key={letter} style={{
            fontSize: 12, padding: '4px 8px', borderRadius: 6,
            background: reveal && item.answer === letter ? '#dcfce7' : '#f0f0f0',
            color: reveal && item.answer === letter ? '#15803d' : '#374151',
            fontWeight: reveal && item.answer === letter ? 700 : 400,
          }}>
            {letter}. {item[letter]}
          </span>
        ))}
      </div>
      <button
        onClick={() => setReveal(r => !r)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, color: '#7c3aed', fontWeight: 600, padding: 0,
        }}
      >
        {reveal ? 'Hide answer' : 'Show answer'}
      </button>
    </div>
  );
}

function RubricTable({ rows }) {
  if (!rows?.length) return null;
  const hasPoints = rows.some(r => r.points !== undefined);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 700, color: '#374151' }}>Criteria</th>
            <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 700, color: '#374151' }}>Description</th>
            {hasPoints && <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontWeight: 700, color: '#374151', width: 70 }}>Points</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, color: '#0d2218', verticalAlign: 'top' }}>{row.criterion}</td>
              <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', color: '#374151', lineHeight: 1.55, verticalAlign: 'top' }}>{row.description}</td>
              {hasPoints && <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', color: '#7c3aed', fontWeight: 700, textAlign: 'center', verticalAlign: 'top' }}>{row.points}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CotOutputPage() {
  const navigate     = useNavigate();
  const store        = useCotStore();
  const { user }     = useAuth();
  const { addToast } = useToast();

  const [exporting, setExporting] = useState(false);
  const [retryingSave, setRetryingSave] = useState(false);

  const plan = store.generatedPlan?.plan;

  if (!plan) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center' }}>
        <p style={{ fontSize: 15, color: '#4a6357' }}>No generated plan found.</p>
        <button className="btn-outline" style={{ marginTop: 16 }} onClick={() => navigate('/cot-gen/step-1')}>
          Start over
        </button>
      </div>
    );
  }

  const {
    objectives, contentStandards, performanceStandards, enablingCompetencies,
    introduction, activity, analysis, abstraction, application,
    reflection, homework, cotEvidenceMap,
  } = plan;

  const selectedIndicators = ALL_INDICATORS.filter(ind =>
    (store.selectedIndicators || []).includes(ind.id)
  );

  async function handleExportDocx() {
    setExporting(true);
    try {
      let teacherProfile = null;
      if (user?.uid) {
        try { teacherProfile = await getTeacherProfile(user.uid); } catch {}
      }
      const { downloadCotDocx } = await import('../../services/cotDocx');
      await downloadCotDocx({
        lessonMeta: {
          teacherName:        store.teacherName,
          school:             store.school,
          subject:            store.subject,
          grade:              store.grade,
          quarter:            store.quarter,
          topic:              store.topic,
          melc:               store.melc,
          materials:          store.materials,
          teachingDate:       store.teachingDate,
          selectedIndicators,
        },
        plan,
        teacherProfile,
      });
      addToast('PIVOT 4A lesson plan downloaded!', 'success');
    } catch (err) {
      addToast('Export failed: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  async function handleRetrySave() {
    if (!user?.uid) return;
    setRetryingSave(true);
    try {
      const docId = await retryAsync(() => saveCotPlan(user.uid, {
        teacherName:        store.teacherName,
        school:             store.school,
        subject:            store.subject,
        grade:              store.grade,
        quarter:            store.quarter,
        topic:              store.topic,
        melc:               store.melc,
        materials:          store.materials,
        teachingDate:       store.teachingDate,
        selectedIndicators: store.selectedIndicators,
        plan,
      }));
      store.setGeneratedPlan({ plan, planId: docId });
      store.setSaveStatus('saved');
      addToast('Saved to cloud!', 'success');
    } catch (err) {
      console.error('Retry save failed:', err);
      addToast('Still could not save. Check your connection and try again.', 'error');
    } finally {
      setRetryingSave(false);
    }
  }

  function handleGenerateQuiz() {
    navigate('/quiz-builder', {
      state: {
        lessonContext: {
          subject:    store.subject,
          grade:      store.grade,
          topic:      store.topic,
          competency: store.melc,
          objectives: [objectives?.cognitive, objectives?.affective, objectives?.psychomotor].filter(Boolean).join('\n'),
          content:    abstraction?.corePrinciple || '',
        },
      },
    });
  }

  const accentColor = '#7c3aed';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      <AIOutputGuard feature="cot" inputContext={{ subject: store.generatedPlan?.plan?.subject, grade: store.generatedPlan?.plan?.grade, melc: store.generatedPlan?.plan?.melc }} />

      {/* Top header */}
      <div style={{
        background: 'var(--kt-chalkboard)',
        borderRadius: 'var(--kt-radius-md)', padding: '24px 28px', marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        border: '1px solid var(--kt-manila-border)',
        boxShadow: '0 4px 16px rgba(31,58,46,0.15)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ background: 'var(--kt-manila)', color: 'var(--kt-text-primary)', border: '1px solid var(--kt-manila-border)', borderRadius: 'var(--kt-radius-sm)', padding: '3px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--kt-font-mono)' }}>
              PPST-aligned · COT-optimized · 4As Framework
            </span>
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#FBF7EC', lineHeight: 1.2, fontFamily: 'var(--kt-font-heading)' }}>
            {store.topic || 'Lesson Plan'}
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-manila)' }}>
            {store.subject} · {store.grade} · {store.quarter}
            {store.teacherName && ` · ${store.teacherName}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            onClick={handleExportDocx}
            disabled={exporting}
            title="Save as Word document — required for DepEd submission"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--kt-manila)', color: 'var(--kt-text-primary)',
              border: '1px solid var(--kt-manila-border)', borderRadius: 'var(--kt-radius-md)',
              padding: '10px 18px', fontSize: 13, fontWeight: 700,
              cursor: exporting ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(38,33,25,0.05)',
            }}
          >
            {exporting
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Exporting…</>
              : <><FileDown size={14} /> Download DOCX</>
            }
          </button>

          <button
            onClick={handleGenerateQuiz}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--kt-card-2)', color: 'var(--kt-text-primary)',
              border: '1px solid var(--kt-border)', borderRadius: 'var(--kt-radius-md)',
              padding: '10px 16px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Sparkles size={14} color="var(--kt-chalkboard)" /> Create Quiz
          </button>
          <button
            onClick={() => { store.reset(); navigate('/cot-gen'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--kt-card-2)', color: 'var(--kt-text-secondary)',
              border: '1px solid var(--kt-border)', borderRadius: 'var(--kt-radius-md)',
              padding: '10px 14px', cursor: 'pointer', fontSize: 13,
            }}
          >
            <RotateCcw size={14} /> New
          </button>
        </div>
      </div>

      {/* Not-saved-to-cloud banner -- stays up until the retry succeeds, unlike
          the toast shown at generation time which disappears in a few seconds.
          This is the plan's only safety net: it never made it to Firestore,
          so it won't show up in My Lessons until this succeeds. */}
      {store.saveStatus === 'failed' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.35)',
          borderRadius: 10, padding: '10px 16px', marginBottom: 24,
        }}>
          <span style={{ fontSize: 12.5, color: '#92400e', fontWeight: 500 }}>
            ⚠ Not saved to the cloud yet — this plan only exists on this device right now. Download it now to be safe, and retry saving when you can.
          </span>
          <button
            onClick={handleRetrySave}
            disabled={retryingSave}
            style={{
              background: '#d97706', color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            }}
          >
            {retryingSave
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Retrying…</>
              : 'Retry saving to cloud'}
          </button>
        </div>
      )}

      {/* COT indicator badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {selectedIndicators.map(ind => {
          const c = KRA_COLOR[ind.kra] || { text: accentColor, bg: '#f3e8ff' };
          return (
            <span key={ind.id} style={{
              background: c.bg, color: c.text,
              borderRadius: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 700,
            }}>
              {ind.code}
            </span>
          );
        })}
      </div>

      {/* I. OBJECTIVES */}
      <Section title="I. Objectives" icon="🎯" color={accentColor}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          <ObjectiveCard domain="Cognitive" text={objectives?.cognitive || '—'} color="#0369a1" bg="#e0f2fe" />
          <ObjectiveCard domain="Affective" text={objectives?.affective || '—'} color="#15803d" bg="#dcfce7" />
          <ObjectiveCard domain="Psychomotor" text={objectives?.psychomotor || '—'} color="#9333ea" bg="#f3e8ff" />
        </div>

        {contentStandards && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Content Standards</p>
            <p style={{ margin: 0, fontSize: 13, color: '#0d2218', lineHeight: 1.65 }}>{contentStandards}</p>
          </div>
        )}
        {performanceStandards && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Performance Standards</p>
            <p style={{ margin: 0, fontSize: 13, color: '#0d2218', lineHeight: 1.65 }}>{performanceStandards}</p>
          </div>
        )}
        {enablingCompetencies?.length > 0 && (
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Enabling Competencies</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(Array.isArray(enablingCompetencies) ? enablingCompetencies : [enablingCompetencies]).map((ec, i) => (
                <li key={i} style={{ fontSize: 13, color: '#0d2218', lineHeight: 1.65, marginBottom: 3 }}>{ec}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* INTRODUCTION */}
      <Section title="Introduction (15 min)" icon="🎤" color="#0284c7" defaultOpen={false}>
        {introduction?.moodSetting && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Mood Setting — {introduction.moodSetting.gameName}
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#0d2218', lineHeight: 1.65 }}>{introduction.moodSetting.instructions}</p>
            {introduction.moodSetting.callAndResponse && (
              <div style={{ background: '#e0f2fe', borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ margin: '0 0 3px', fontSize: 12, color: '#0369a1' }}>🎤 Teacher: <strong>{introduction.moodSetting.callAndResponse.teacher}</strong></p>
                <p style={{ margin: 0, fontSize: 12, color: '#0369a1' }}>👥 Students: <strong>{introduction.moodSetting.callAndResponse.students}</strong></p>
              </div>
            )}
          </div>
        )}

        {introduction?.pretest?.items?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pre-Test: {introduction.pretest.title}
            </p>
            {introduction.pretest.items.map(item => (
              <PreTestItem key={item.num} item={item} />
            ))}
          </div>
        )}

        {introduction?.reviewOfPastLesson && (
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Review of Past Lesson</p>
            <p style={{ margin: 0, fontSize: 13, color: '#0d2218', lineHeight: 1.65 }}>{introduction.reviewOfPastLesson}</p>
          </div>
        )}
      </Section>

      {/* ACTIVITY */}
      <Section title={`Activity — Engage (${activity?.duration || '10 min'})`} icon="🎮" color="#0d9488">
        {activity?.title && (
          <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#0d2218' }}>{activity.title}</p>
        )}
        {activity?.objective && (
          <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
            <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Objective</p>
            <p style={{ margin: 0, fontSize: 13, color: '#0d2218' }}>{activity.objective}</p>
          </div>
        )}

        {activity?.materials?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 5px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Materials</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {activity.materials.map((m, i) => (
                <span key={i} style={{ background: '#f0fdf4', color: '#0d9488', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>• {m}</span>
              ))}
            </div>
          </div>
        )}

        {activity?.instructions?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Instructions</p>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {activity.instructions.map((inst, i) => (
                <li key={i} style={{ fontSize: 13, color: '#0d2218', lineHeight: 1.65, marginBottom: 4 }}>{inst}</li>
              ))}
            </ol>
          </div>
        )}

        {activity?.scenarios?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Scenarios</p>
            {activity.scenarios.map((s, i) => (
              <div key={i} style={{ background: '#f8fafc', borderLeft: '3px solid #0d9488', borderRadius: '0 8px 8px 0', padding: '8px 12px', marginBottom: 6, fontSize: 13, color: '#0d2218', lineHeight: 1.6 }}>
                <strong>{i + 1}.</strong> {s}
              </div>
            ))}
          </div>
        )}

        {activity?.rubric?.length > 0 && (
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Scoring Rubric (100 pts)</p>
            <RubricTable rows={activity.rubric} />
          </div>
        )}
      </Section>

      {/* ANALYSIS */}
      <Section title={`Analysis — Explore (${analysis?.duration || '15 min'})`} icon="🔬" color="#7c3aed" defaultOpen={false}>
        {analysis?.title && (
          <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: '#0d2218' }}>{analysis.title}</p>
        )}
        {analysis?.objective && (
          <div style={{ background: '#f3e8ff', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
            <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Objective</p>
            <p style={{ margin: 0, fontSize: 13, color: '#0d2218' }}>{analysis.objective}</p>
          </div>
        )}
        {analysis?.materials?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 5px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Materials</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {analysis.materials.map((m, i) => (
                <span key={i} style={{ background: '#f3e8ff', color: '#7c3aed', borderRadius: 6, padding: '3px 10px', fontSize: 12 }}>• {m}</span>
              ))}
            </div>
          </div>
        )}
        {analysis?.instructions?.length > 0 && (
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {analysis.instructions.map((inst, i) => (
              <li key={i} style={{ fontSize: 13, color: '#0d2218', lineHeight: 1.65, marginBottom: 4 }}>{inst}</li>
            ))}
          </ol>
        )}
      </Section>

      {/* ABSTRACTION */}
      <Section title={`Abstraction — Explain (${abstraction?.duration || '10 min'})`} icon="💡" color="#b45309" defaultOpen={false}>
        {abstraction?.module && (
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#b45309' }}>{abstraction.module}</p>
        )}
        {abstraction?.historicalBackground && (
          <div style={{ background: '#fef3c7', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
            <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>Historical Background</p>
            <p style={{ margin: 0, fontSize: 13, color: '#0d2218', lineHeight: 1.65 }}>{abstraction.historicalBackground}</p>
          </div>
        )}
        {abstraction?.corePrinciple && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
            <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase' }}>Core Principle</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0d2218', lineHeight: 1.65 }}>{abstraction.corePrinciple}</p>
          </div>
        )}
        {abstraction?.keyTerms?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Key Terms</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {abstraction.keyTerms.map((kt, i) => (
                <div key={i} style={{ background: '#fafafa', borderRadius: 8, padding: '10px 12px' }}>
                  <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: '#0d2218' }}>{kt.term}</p>
                  <p style={{ margin: '0 0 2px', fontSize: 13, color: '#374151', lineHeight: 1.55 }}>{kt.definition}</p>
                  {kt.additionalInfo && <p style={{ margin: 0, fontSize: 12, color: '#6b7280', lineHeight: 1.55 }}>{kt.additionalInfo}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        {abstraction?.reference && (
          <p style={{ margin: 0, fontSize: 12, color: '#0369a1', fontStyle: 'italic' }}>📖 {abstraction.reference}</p>
        )}
      </Section>

      {/* APPLICATION */}
      <Section title={`Application — Extend (${application?.duration || '15 min'})`} icon="🌟" color="#15803d" defaultOpen={false}>
        <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#0d2218' }}>{application?.title}</p>

        {application?.guideQuestions?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Guide Questions</p>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {application.guideQuestions.map((q, i) => (
                <li key={i} style={{ fontSize: 13, color: '#0d2218', lineHeight: 1.65, marginBottom: 4 }}>{q}</li>
              ))}
            </ol>
          </div>
        )}

        {application?.options?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Creative Presentation Options</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {application.options.map((opt, i) => (
                <div key={i} style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 12px' }}>
                  <p style={{ margin: '0 0 3px', fontSize: 12, fontWeight: 700, color: '#15803d' }}>{opt.type}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#374151', lineHeight: 1.55 }}>{opt.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {application?.rubric?.length > 0 && (
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assessment Rubric (100 pts)</p>
            <RubricTable rows={application.rubric} />
          </div>
        )}
      </Section>

      {/* REFLECTION & HOMEWORK */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Section title="V. Reflection" icon="🔁" color="#0369a1" defaultOpen={false}>
          {reflection?.overview && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#0d2218', lineHeight: 1.65 }}>{reflection.overview}</p>
          )}
          {reflection?.categories?.map((cat, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#0369a1' }}>{cat.label}</p>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {(cat.examples || []).map((ex, j) => (
                  <li key={j} style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, marginBottom: 2 }}>{ex}</li>
                ))}
              </ul>
            </div>
          ))}
        </Section>

        <Section title="VI. Homework" icon="📝" color="#9333ea" defaultOpen={false}>
          <p style={{ margin: 0, fontSize: 13, color: '#0d2218', lineHeight: 1.75, whiteSpace: 'pre-line' }}>{homework}</p>
        </Section>
      </div>

      {/* COT INDICATOR EVIDENCE MAP — THE KEY FEATURE */}
      <div style={{
        background: 'linear-gradient(135deg, #1a0a3d 0%, #2e1065 100%)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <BookOpenCheck size={18} color="#c4b5fd" />
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>
            COT Indicator Evidence Map
          </h2>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'rgba(196,181,253,0.8)' }}>
          Generated alignment documentation for your IPCRF / PMES defense. Each row below shows which part of this lesson addresses a specific PPST indicator and why it qualifies.
        </p>

        <div style={{ overflowX: 'auto', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(196,181,253,0.15)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#c4b5fd', fontWeight: 700, minWidth: 120 }}>PPST Indicator</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#c4b5fd', fontWeight: 700, minWidth: 160 }}>MOVs (Evidence)</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#c4b5fd', fontWeight: 700 }}>Annotation</th>
              </tr>
            </thead>
            <tbody>
              {(cotEvidenceMap || []).map((item, i) => {
                const ind = ALL_INDICATORS.find(a => a.id === item.indicatorId);
                const c   = KRA_COLOR[ind?.kra] || { text: '#c4b5fd', bg: '#3b0764' };
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '12px', verticalAlign: 'top', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ background: c.bg, color: c.text, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, display: 'inline-block', marginBottom: 4 }}>
                        {item.indicatorCode}
                      </span>
                      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{item.description}</p>
                    </td>
                    <td style={{ padding: '12px', verticalAlign: 'top', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{item.mov}</p>
                    </td>
                    <td style={{ padding: '12px', verticalAlign: 'top', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.65 }}>{item.annotation}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom action row */}
      <div style={{
        display: 'flex', gap: 12, justifyContent: 'flex-end',
        padding: '16px 0', marginBottom: 8,
      }}>
        <button
          onClick={() => { store.reset(); navigate('/lesson-gen'); }}
          className="btn-outline"
          style={{ fontSize: 13, padding: '10px 18px' }}
        >
          <RotateCcw size={14} />
          Start New
        </button>
        <button
          onClick={handleGenerateQuiz}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(124,58,237,0.1)', color: '#7c3aed',
            border: '1px solid rgba(124,58,237,0.2)', borderRadius: 10,
            padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          <Sparkles size={14} />
          Generate Quiz
        </button>
        <button
          onClick={handleExportDocx}
          disabled={exporting}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#7c3aed', color: '#fff',
            border: 'none', borderRadius: 10,
            padding: '10px 20px', cursor: exporting ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600, opacity: exporting ? 0.7 : 1,
          }}
        >
          <FileDown size={14} />
          {exporting ? 'Exporting…' : 'Download PIVOT 4A Word'}
        </button>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
