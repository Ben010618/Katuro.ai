import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDLLStore } from '../../store/dllStore';
import { useAuth } from '../../hooks/useAuth';
import { downloadDLLDocx } from '../../services/dllDocx';
import { useToast } from '../../context/ToastContext';
import { useCotStore } from '../../store/cotStore';
import { createSharedPlan } from '../../services/db';
import { FileDown, RotateCcw, Printer, X, Sparkles, BookOpenCheck, Loader2, Share2 } from 'lucide-react';
import AIOutputGuard from '../../components/AIOutputGuard';
import ShareModal from '../../components/ShareModal';

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

// Maps BOW list → array of 5 entries (one per day Mon–Fri)
function buildDayMap(list) {
  const map = [null, null, null, null, null];
  let slot = 0;
  for (const item of (list || [])) {
    for (let d = 0; d < (item.days || 1) && slot < 5; d++, slot++) {
      map[slot] = item.text?.trim() || null;
    }
  }
  return map;
}

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

function InfoRow({ label, value }) {
  return (
    <div>
      <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 13, color: '#0d2218', lineHeight: 1.5 }}>
        {value || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>}
      </p>
    </div>
  );
}

export default function DLLOutputPage() {
  const navigate     = useNavigate();
  const store        = useDLLStore();
  const cotStore     = useCotStore();
  const { profile, user } = useAuth();
  const { addToast } = useToast();

  const [downloading,  setDownloading]  = useState(false);
  const [sharing,      setSharing]      = useState(false);
  const [shareUrl,     setShareUrl]     = useState(null);
  const [selectedDay,  setSelectedDay]  = useState(null); // null or 0–4

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

  function handleGoToCOT() {
    if (selectedDay === null) return;

    const dayIdx       = selectedDay;
    const dayKey       = DAY_KEYS[dayIdx];
    const melcMapFn    = buildDayMap(store.melcList);
    const contentMapFn = buildDayMap(store.contentList);
    const dayMelc      = melcMapFn[dayIdx]    || store.melc || '';
    const dayContent   = contentMapFn[dayIdx] || '';
    const dayObj       = (store.objectives || {})[dayKey] ||
      (contentMapFn[dayIdx] ? `Identify and explain key concepts related to ${contentMapFn[dayIdx]}.` : '');

    // Build combined materials string from all DLL resources
    const r = store.resources || {};
    const matParts = [
      r.teacherGuidePages     ? `Teacher's Guide: ${r.teacherGuidePages}`         : null,
      r.learnersMaterialPages ? `Learner's Materials: ${r.learnersMaterialPages}` : null,
      r.textbookPages         ? `Textbook: ${r.textbookPages}`                    : null,
      r.lrmdsPortal           ? `LRMDS: ${r.lrmdsPortal}`                         : null,
      r.otherResources        ? r.otherResources                                  : null,
    ].filter(Boolean);
    const materials = matParts.join('; ') || '';

    // Reset first so no stale generatedPlan / status leaks from a previous COT session
    cotStore.reset();

    // Pre-fill the COT store — teacher continues from Step 2 (Indicators) → Step 3 (Generate)
    cotStore.setStep1({
      subject:              store.subject              || '',
      grade:                store.gradeLevel           || '',
      quarter:              store.term                 || '',
      topic:                dayContent,
      melc:                 dayMelc,
      objectives:           dayObj,
      teacherName:          profile?.name              || '',
      school:               profile?.school            || '',
      teachingDate:         '',
      materials,
      contentStandards:     store.contentStandards     || '',
      performanceStandards: store.performanceStandards || '',
    });

    navigate('/cot-gen/step-2');
  }

  // Pre-compute day data (used by modal preview)
  const melcMap    = buildDayMap(store.melcList);
  const contentMap = buildDayMap(store.contentList);

  const melcList    = (store.melcList    || []).filter(m => m.text?.trim());
  const contentList = (store.contentList || []).filter(c => c.text?.trim());
  const proc        = store.procedure  || {};
  const objs        = store.objectives || {};
  const res         = store.resources  || {};

  const sigRows = [
    ['Prepared by:', profile?.name || null, profile?.designation || profile?.position || 'Teacher'],
    ['Checked by:', profile?.supervisorName || null, profile?.supervisorPosition || 'Master Teacher / Head Teacher'],
    ['Noted by:', null, 'School Principal'],
  ];

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .dll-day-hdr {
          cursor: pointer;
          transition: background 0.15s, color 0.15s, box-shadow 0.15s;
          user-select: none;
        }
        .dll-day-hdr:hover {
          background: #00aaff !important;
          color: #fff !important;
          box-shadow: 0 0 14px rgba(0,170,255,0.55);
        }
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
          @page { size: A4 landscape; margin: 1cm 1.5cm; }
          .shell-sidebar, header, .no-print { display: none !important; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          main { padding: 0 !important; overflow: visible !important; }
          .dll-a4 {
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .dll-a4 > div { overflow: visible !important; }
          .dll-day-hdr { cursor: default !important; box-shadow: none !important; }
          .dll-day-hdr svg { display: none !important; }
          .dll-table {
            min-width: 0 !important;
            width: 100% !important;
            font-size: 9px !important;
            table-layout: fixed !important;
          }
          .dll-table td { font-size: 9px !important; padding: 3px 5px !important; }
          tr { page-break-inside: avoid; }
        }
      `}</style>

      <AIOutputGuard feature="dll" inputContext={{ subject: store.subject, gradeLevel: store.gradeLevel, melc: store.melc }} />

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
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="btn-primary"
          title="Save as Word document — required for DepEd submission"
          style={{ fontSize: 13, padding: '10px 20px', opacity: downloading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
        >
          <FileDown size={14} />
          {downloading ? 'Preparing…' : 'Download DOCX'}
        </button>
        <button onClick={() => window.print()} className="btn-outline" style={{ fontSize: 13, padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Printer size={14} /> Print
        </button>
        <button
          onClick={async () => {
            if (!store.objectives && !store.procedure) return;
            if (shareUrl) return;
            setSharing(true);
            try {
              const firstDay = DAY_KEYS[0];
              const preview = { monday_objectives: store.objectives?.[firstDay] || '' };
              const { shareId } = await createSharedPlan({
                planType: 'dll',
                ownerName: profile?.displayName || user?.displayName || '',
                school: profile?.school || '',
                subject: store.subject,
                gradeLevel: store.gradeLevel,
                term: store.term,
                melc: store.melc,
                preview,
              });
              const url = `${window.location.origin}/shared/${shareId}?ref=${user?.uid || ''}`;
              setShareUrl(url);
            } catch {
              addToast('Could not create share link. Try again.', 'error');
            } finally {
              setSharing(false);
            }
          }}
          disabled={sharing}
          className="btn-outline"
          style={{ fontSize: 13, padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 6, opacity: sharing ? 0.7 : 1 }}
        >
          {sharing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Share2 size={13} />}
          {sharing ? 'Creating…' : 'Share'}
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

      {/* ── Hint banner ───────────────────────────────────────────────── */}
      <div className="no-print" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.18)',
        borderRadius: 10, padding: '9px 14px', marginBottom: 14, fontSize: 12, color: '#6d28d9',
      }}>
        <Sparkles size={13} />
        <span><strong>Tip:</strong> Click any day column header (Monday–Friday) to generate a <strong>COT 4As Lesson Plan</strong> for that day — free, using your DLL data.</span>
      </div>

      {/* ── DLL Document (A4 paper) ────────────────────────────────────── */}
      <div className="dll-a4">
        <div style={{ overflowX: 'auto' }}>
          <table className="dll-table">
            <colgroup>
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

              {/* Day-column headers — CLICKABLE */}
              <tr>
                <td style={{ ...hdr, textAlign: 'left', fontSize: 10 }}>Objectives / Procedure</td>
                {DAY_NAMES.map((d, i) => (
                  <td
                    key={d}
                    className="dll-day-hdr"
                    style={{ ...hdr, position: 'relative' }}
                    onClick={() => { setSelectedDay(i); setGenError(''); }}
                    title={`Generate COT 4As Lesson Plan for ${d}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      {d}
                      <Sparkles size={9} style={{ opacity: 0.55, flexShrink: 0 }} />
                    </div>
                  </td>
                ))}
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

              <tr>
                <td style={lbl}>
                  C. Learning Competency /<br />Learning Objectives
                  <div style={{ fontSize: 9, fontWeight: 400, color: '#666', marginTop: 1 }}>(LC Code)</div>
                </td>
                {bowCells(melcList)}
              </tr>

              <tr>
                <td style={{ ...lbl, background: '#eef2ff' }}>
                  Learning Objectives
                  <div style={{ fontSize: 9, fontWeight: 400, color: '#555' }}>(per day)</div>
                </td>
                {DAY_KEYS.map((dk, i) => (
                  <td key={dk} style={{ ...base, lineHeight: 1.5 }}>
                    {objs[dk] || contentMap[i]
                      ? <span style={{ whiteSpace: 'pre-wrap' }}>{objs[dk] || `Identify and explain key concepts related to ${contentMap[i]}.`}</span>
                      : <span style={{ color: '#bbb', fontStyle: 'italic' }}>—</span>
                    }
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
                ['A. References',                                 null],
                ["1. Teacher's Guide pages",                      res.teacherGuidePages],
                ["2. Learner's Materials pages",                  res.learnersMaterialPages],
                ['3. Textbook pages',                             res.textbookPages],
                ['4. Additional Materials from LRMDS portal',     res.lrmdsPortal],
                ['B. Other Learning Resources',                   res.otherResources],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ ...lbl, fontSize: 10 }}>{label}</td>
                  <td colSpan={5} style={{ ...base, minHeight: 18 }}>{value || ''}</td>
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

      {/* ── COT 4As Modal ──────────────────────────────────────────────── */}
      {selectedDay !== null && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(13,34,24,0.6)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '72px 24px 24px',
          }}
          onClick={() => setSelectedDay(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 20, padding: '28px 28px 24px',
              width: '100%', maxWidth: 520, position: 'relative',
              boxShadow: '0 32px 80px rgba(0,0,0,0.25)',
              maxHeight: 'calc(100vh - 96px)', overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setSelectedDay(null)}
              style={{
                position: 'absolute', top: 14, right: 14,
                background: '#f3f4f6', border: 'none', cursor: 'pointer',
                borderRadius: 8, padding: 6, color: '#6b7280',
                display: 'flex', alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                display: 'grid', placeItems: 'center',
              }}>
                <BookOpenCheck size={21} color="#fff" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  COT 4As Lesson Plan
                </p>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0d2218' }}>
                  {DAY_NAMES[selectedDay]}
                </h2>
              </div>
            </div>

            {/* Day data preview */}
            <div style={{
              background: '#f9fafb', borderRadius: 12,
              border: '1px solid rgba(45,106,79,0.12)',
              padding: '14px 16px', marginBottom: 20,
              display: 'flex', flexDirection: 'column', gap: 11,
            }}>
              <InfoRow
                label="Subject / Grade"
                value={`${store.subject || '—'} — ${store.gradeLevel || '—'}`}
              />
              <InfoRow
                label="Content Topic"
                value={contentMap[selectedDay] || '—'}
              />
              <InfoRow
                label="MELC"
                value={melcMap[selectedDay] || store.melc || '—'}
              />
              <InfoRow
                label="Learning Objective"
                value={
                  (store.objectives || {})[DAY_KEYS[selectedDay]] ||
                  (contentMap[selectedDay]
                    ? `Identify and explain key concepts related to ${contentMap[selectedDay]}.`
                    : '')
                }
              />
            </div>

            {/* Continue to COT Indicators button */}
            <button
              onClick={handleGoToCOT}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                color: '#fff', border: 'none', borderRadius: 12,
                padding: '13px 20px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              <Sparkles size={16} />
              Continue to COT Indicators →
            </button>

            <p style={{ margin: '11px 0 0', fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
              Free · DLL data pre-filled · you choose indicators next → then generate
            </p>
          </div>
        </div>
      )}

      {shareUrl && (
        <ShareModal
          url={shareUrl}
          title={`${store.subject || 'DLL'} — ${store.gradeLevel || ''}`}
          subject={store.subject ? `kaTuro AI — ${store.subject} Daily Lesson Log` : 'kaTuro AI Daily Lesson Log'}
          onClose={() => setShareUrl(null)}
        />
      )}
    </>
  );
}
