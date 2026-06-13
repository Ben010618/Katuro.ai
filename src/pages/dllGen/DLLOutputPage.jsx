import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDLLStore } from '../../store/dllStore';
import { useAuth } from '../../hooks/useAuth';
import { downloadDLLDocx } from '../../services/dllDocx';
import { useToast } from '../../context/ToastContext';
import { FileDown, RotateCcw, Printer } from 'lucide-react';

const DAY_KEYS  = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const STEPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const STEP_LABELS = {
  A: 'Reviewing previous lesson or presenting the new lesson',
  B: 'Establishing a purpose for the lesson',
  C: 'Presenting examples/instances of the new lesson',
  D: 'Discussing new concepts and practicing new skills #1',
  E: 'Discussing new concepts and practicing new skills #2',
  F: 'Developing mastery (Leads to Formative Assessment 3)',
  G: 'Finding practical applications of concepts and skills in daily living',
  H: 'Making generalizations and abstractions about the lesson',
  I: 'Evaluating Learning',
  J: 'Additional activities for application or remediation',
};

const border = '1px solid #999';
const base = { border, padding: '4px 6px', fontSize: 11, fontFamily: 'Arial, sans-serif', verticalAlign: 'top' };
const hdr  = { ...base, background: '#d9e1f2', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle', fontSize: 11 };
const lbl  = { ...base, background: '#f2f2f2', fontWeight: 600, fontSize: 10, lineHeight: 1.4, verticalAlign: 'top' };
const sec  = { ...base, background: '#d9e1f2', fontWeight: 700, fontSize: 11 };

// Returns array of <td> elements with colspan based on BOW list
function bowCells(list) {
  const cells = [];
  let used = 0;
  (list || []).forEach((item, i) => {
    const span = Math.max(1, item.days || 1);
    cells.push(
      <td key={i} colSpan={span} style={{ ...base, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {item.text?.trim() || ''}
      </td>
    );
    used += span;
  });
  if (used < 5) {
    cells.push(<td key="pad" colSpan={5 - used} style={base}></td>);
  }
  return cells;
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

  const melcList    = (store.melcList    || []).filter(m => m.text?.trim());
  const contentList = (store.contentList || []).filter(c => c.text?.trim());
  const proc        = store.procedure || {};
  const objs        = store.objectives || {};

  const sigRows = [
    ['Prepared by:', profile?.name || null, profile?.designation || profile?.position || 'Teacher'],
    ['Checked by:', profile?.supervisorName || null, profile?.supervisorPosition || 'Master Teacher / Head Teacher'],
    ['Noted by:', null, 'School Principal'],
  ];

  return (
    <>
      {/* ── Action bar (hidden when printing) ─────────────────────────── */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Daily Lesson Log · Generated
          </p>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0d2218' }}>
            {store.subject} — {store.gradeLevel}
          </h1>
        </div>
        <button onClick={() => window.print()} className="btn-outline" style={{ fontSize: 13, padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Printer size={14} /> Print
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="btn-primary"
          style={{ fontSize: 13, padding: '9px 18px', opacity: downloading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <FileDown size={14} />
          {downloading ? 'Preparing…' : 'Download DOCX'}
        </button>
        <button onClick={() => navigate('/dll-gen/step-2')} className="btn-outline" style={{ fontSize: 13, padding: '9px 18px' }}>
          Edit Inputs
        </button>
        <button
          onClick={() => { store.reset(); navigate('/dll-gen/step-1'); }}
          className="btn-outline"
          style={{ fontSize: 13, padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RotateCcw size={13} /> New DLL
        </button>
      </div>

      {/* ── DLL Document (A4 paper) ────────────────────────────────────── */}
      <div className="dll-a4">
        <div style={{ overflowX: 'auto' }}>
          <table className="dll-table">
            <colgroup>
              {/* label col: 190px; 5 day cols: equal share of remainder */}
              <col style={{ width: 190 }} />
              <col /><col /><col /><col /><col />
            </colgroup>
            <tbody>

              {/* Title */}
              <tr>
                <td colSpan={6} style={{ ...hdr, fontSize: 14, padding: '8px 6px', border: '2px solid #000', letterSpacing: '0.06em' }}>
                  DAILY LESSON LOG
                </td>
              </tr>

              {/* School / teacher info */}
              <tr>
                <td colSpan={3} style={{ ...base, fontSize: 10.5 }}>
                  <strong>School: </strong>{profile?.school || '—'}&emsp;
                  <strong>Teacher: </strong>{profile?.name || '—'}
                </td>
                <td colSpan={2} style={{ ...base, fontSize: 10.5 }}>
                  <strong>Grade Level: </strong>{store.gradeLevel || '—'}&emsp;
                  <strong>Learning Area: </strong>{store.subject || '—'}
                </td>
                <td style={{ ...base, fontSize: 10 }}>
                  <div><strong>Teaching Dates: </strong>{store.teachingDates || '—'}</div>
                  <div><strong>Term: </strong>{store.term || '—'}</div>
                  {store.section && <div><strong>Section: </strong>{store.section}</div>}
                </td>
              </tr>

              {/* Day-column headers */}
              <tr>
                <td style={{ ...hdr, textAlign: 'left', fontSize: 10 }}>Objectives / Procedure</td>
                {DAY_NAMES.map(d => <td key={d} style={hdr}>{d}</td>)}
              </tr>

              {/* ── I. OBJECTIVES ──────────────────────────────────────── */}
              <tr><td colSpan={6} style={sec}>I. OBJECTIVES</td></tr>

              <tr>
                <td style={lbl}>A. Content Standards</td>
                <td colSpan={5} style={base}>{store.contentStandards || '—'}</td>
              </tr>

              <tr>
                <td style={lbl}>B. Performance Standards</td>
                <td colSpan={5} style={base}>{store.performanceStandards || '—'}</td>
              </tr>

              {/* C — MELC: merged by days allocation */}
              <tr>
                <td style={lbl}>
                  C. Learning Competency /<br />Learning Objectives
                  <div style={{ fontSize: 9, fontWeight: 400, color: '#666', marginTop: 1 }}>(LC Code)</div>
                </td>
                {bowCells(melcList)}
              </tr>

              {/* Per-day learning objectives (AI-generated) */}
              <tr>
                <td style={{ ...lbl, background: '#eef2ff' }}>
                  Learning Objectives
                  <div style={{ fontSize: 9, fontWeight: 400, color: '#555' }}>(per day)</div>
                </td>
                {DAY_KEYS.map(dk => (
                  <td key={dk} style={{ ...base, lineHeight: 1.5 }}>
                    {objs[dk] || <span style={{ color: '#bbb', fontStyle: 'italic' }}>—</span>}
                  </td>
                ))}
              </tr>

              {/* ── II. CONTENT ────────────────────────────────────────── */}
              <tr><td colSpan={6} style={sec}>II. CONTENT (Subject Matter)</td></tr>
              <tr>
                <td style={{ ...lbl, verticalAlign: 'middle' }}>
                  Content<br />
                  <span style={{ fontWeight: 400, fontSize: 9 }}>(Subject Matter)</span>
                </td>
                {bowCells(contentList)}
              </tr>

              {/* ── III. LEARNING RESOURCES ────────────────────────────── */}
              <tr><td colSpan={6} style={sec}>III. LEARNING RESOURCES</td></tr>
              {[
                'A. References',
                "1. Teacher's Guide pages",
                "2. Learner's Materials pages",
                '3. Textbook pages',
                '4. Additional Materials from LRMDS portal',
                'B. Other Learning Resources',
              ].map(label => (
                <tr key={label}>
                  <td style={{ ...lbl, fontSize: 10 }}>{label}</td>
                  <td colSpan={5} style={{ ...base, minHeight: 18 }}></td>
                </tr>
              ))}

              {/* ── IV. PROCEDURES ─────────────────────────────────────── */}
              <tr><td colSpan={6} style={sec}>IV. PROCEDURES</td></tr>
              <tr>
                <td style={{ ...hdr, textAlign: 'left', fontSize: 10 }}>Steps</td>
                {DAY_NAMES.map(d => <td key={d} style={{ ...hdr, fontSize: 10 }}>{d}</td>)}
              </tr>
              {STEPS.map(s => (
                <tr key={s}>
                  <td style={{ ...lbl, fontSize: 10, lineHeight: 1.35 }}>{s}. {STEP_LABELS[s]}</td>
                  {DAY_KEYS.map(dk => (
                    <td key={dk} style={{ ...base, fontSize: 10, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {proc[dk]?.[s] || ''}
                    </td>
                  ))}
                </tr>
              ))}

              {/* ── V. REMARKS ─────────────────────────────────────────── */}
              <tr><td colSpan={6} style={sec}>V. REMARKS</td></tr>
              <tr>
                <td style={lbl}>Remarks</td>
                <td colSpan={5} style={{ ...base, height: 36 }}></td>
              </tr>

              {/* ── VI. REFLECTION ─────────────────────────────────────── */}
              <tr><td colSpan={6} style={sec}>VI. REFLECTION</td></tr>
              {[
                'A. No. of learners who earned 80% in the evaluation',
                'B. No. of learners who require additional activities for remediation',
                'C. Did the remedial lessons work? No. of learners who have caught up with the lesson',
                'D. No. of learners who continue to require remediation',
                'E. Which of my teaching strategies worked well? Why did these work?',
                'F. What difficulties did I encounter which my principal or supervisor can help me solve?',
                'G. What innovation or localized materials did I use/discover which I wish to share with other teachers?',
              ].map(label => (
                <tr key={label}>
                  <td style={{ ...lbl, fontSize: 10, lineHeight: 1.35 }}>{label}</td>
                  <td colSpan={5} style={{ ...base, height: 28 }}></td>
                </tr>
              ))}

            </tbody>
          </table>
        </div>

        {/* Signature block */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontFamily: 'Arial, sans-serif' }}>
          <tbody>
            <tr>
              {sigRows.map(([title, name, role]) => (
                <td key={title} style={{ padding: '4px 10px', width: '33%', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 700, fontSize: 10 }}>{title}</div>
                  <div style={{ marginTop: 22, borderTop: '1px solid #000', paddingTop: 3 }}>
                    <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>
                      {name || '________________________________'}
                    </div>
                    <div style={{ fontSize: 10, color: '#555', fontStyle: 'italic' }}>{role}</div>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <style>{`
        .dll-a4 {
          background: #fff;
          padding: 16px 20px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.07);
        }
        .dll-table {
          width: 100%;
          min-width: 780px;
          border-collapse: collapse;
          font-family: Arial, sans-serif;
        }
        @media print {
          @page { size: A4 landscape; margin: 1.27cm 1.27cm; }
          body * { visibility: hidden; }
          .dll-a4, .dll-a4 * { visibility: visible; }
          .dll-a4 {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            padding: 0; border: none; border-radius: 0; box-shadow: none;
            overflow: visible;
          }
          .no-print { display: none !important; }
        }
      `}</style>
    </>
  );
}
