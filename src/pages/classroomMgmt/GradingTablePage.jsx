import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import {
  subscribeGradeSheet, saveGradeSheet, submitGradeSheet, computeFinalGrade,
  subscribeStudents, subscribeSectionComments,
} from '../../services/classroomDb';
import { thumbUrl } from '../../services/cloudinaryUpload';
import StudentCardModal from '../../components/StudentCardModal';
import { ArrowLeft, Save, Plus, Minus, AlertTriangle, CheckCircle2, Send, RefreshCw, Download, Bell, Upload } from 'lucide-react';

const CELL = {
  padding: '7px 6px', border: '1px solid rgba(45,106,79,0.12)',
  textAlign: 'center', background: 'var(--kt-card)',
};
const SCORE_INPUT = {
  width: 52, textAlign: 'center', border: '1px solid rgba(45,106,79,0.2)',
  borderRadius: 7, padding: '5px 4px', fontSize: 13, fontFamily: '"DM Mono", monospace',
  background: 'var(--kt-input-bg)', outline: 'none', color: 'var(--kt-text-primary)',
};

const DEFAULT_WEIGHTS = {
  writtenWorksWeight: 40, performanceTaskWeight: 40, summativeTestWeight: 20,
  wwCount: 3, ptCount: 2,
  wwMax: [100, 100, 100],
  ptMax: [100, 100],
  stMax: [100, 100],
};
const TERMS = [
  { key: 'term1', label: 'Term 1' },
  { key: 'term2', label: 'Term 2' },
  { key: 'term3', label: 'Term 3' },
];

export default function GradingTablePage() {
  const { sectionId, subject } = useParams();
  const decodedSubject = decodeURIComponent(subject);
  const navigate       = useNavigate();
  const { user }       = useAuth();
  const { addToast }   = useToast();

  const [activeTerm,      setActiveTerm]      = useState('term1');
  const [sheet,           setSheet]           = useState(null);
  const [localWeights,    setLocalWeights]    = useState({ ...DEFAULT_WEIGHTS });
  const [localGrades,     setLocalGrades]     = useState({});
  const [dirty,           setDirty]           = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [liveStudents,    setLiveStudents]    = useState([]);
  const [unreadCounts,    setUnreadCounts]    = useState({});
  const [openStudentCard, setOpenStudentCard] = useState(null);
  const initializedRef = useRef(false);

  // Reset local state when switching terms
  useEffect(() => {
    initializedRef.current = false;
    setSheet(null);
    setLocalWeights({ ...DEFAULT_WEIGHTS });
    setLocalGrades({});
    setDirty(false);
    setLoading(true);
  }, [activeTerm]);

  // Subscribe to the teacher's own gradesheet doc for this term
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeGradeSheet(user.uid, sectionId, decodedSubject, activeTerm, s => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        // Merge saved weights with defaults — old sheets lack wwMax/ptMax
        const saved = s?.weights || {};
        const wwCount = saved.wwCount || DEFAULT_WEIGHTS.wwCount;
        const ptCount = saved.ptCount || DEFAULT_WEIGHTS.ptCount;
        setLocalWeights({
          ...DEFAULT_WEIGHTS,
          ...saved,
          summativeTestWeight: saved.summativeTestWeight ?? saved.quarterlyExamWeight ?? DEFAULT_WEIGHTS.summativeTestWeight,
          wwMax: saved.wwMax?.length === wwCount
            ? saved.wwMax
            : Array.from({ length: wwCount }, (_, i) => saved.wwMax?.[i] ?? 100),
          ptMax: saved.ptMax?.length === ptCount
            ? saved.ptMax
            : Array.from({ length: ptCount }, (_, i) => saved.ptMax?.[i] ?? 100),
          stMax: saved.stMax?.length === 2
            ? saved.stMax
            : [saved.stMax?.[0] ?? saved.qeMax ?? 100, saved.stMax?.[1] ?? 100],
        });
        setLocalGrades(s?.grades  || {});
        setDirty(false);
      } else {
        // Subsequent snapshots: only update status/meta so local edits aren't wiped
        setSheet(prev => prev ? { ...prev, status: s?.status, submittedAt: s?.submittedAt } : s);
        setLoading(false);
        return;
      }
      setSheet(s);
      setLoading(false);
    });
    const timer = setTimeout(() => { initializedRef.current = true; setLoading(false); }, 3000);
    return () => { unsub(); clearTimeout(timer); };
  }, [user?.uid, sectionId, decodedSubject, activeTerm]);

  // Subscribe to live student data (photos) and section comments (unread counts)
  useEffect(() => {
    const unsubStudents = subscribeStudents(sectionId, setLiveStudents);
    const unsubComments = subscribeSectionComments(sectionId, comments => {
      const counts = {};
      comments.forEach(c => {
        if (user?.uid && !(c.readBy || []).includes(user.uid)) {
          counts[c.studentId] = (counts[c.studentId] || 0) + 1;
        }
      });
      setUnreadCounts(counts);
    });
    return () => { unsubStudents(); unsubComments(); };
  }, [sectionId, user?.uid]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const students  = sheet?.students || [];
  const photoMap  = Object.fromEntries(liveStudents.map(s => [s.id, s]));
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  function getGrade(studentId) {
    return localGrades[studentId] || { writtenWorks: [], performanceTask: [], summativeTests: ['', ''] };
  }

  function setScore(studentId, field, idx, value) {
    setDirty(true);
    setLocalGrades(prev => {
      const g = { ...(prev[studentId] || { writtenWorks: [], performanceTask: [], summativeTests: ['', ''] }) };
      const arr = [...(g[field] || [])];
      arr[idx] = value === '' ? '' : Number(value);
      g[field] = arr;
      return { ...prev, [studentId]: g };
    });
  }

  function computeDisplay(studentId) {
    const g = getGrade(studentId);
    return computeFinalGrade({
      ...g, ...localWeights,
      wwMax: (localWeights.wwMax || []).slice(0, localWeights.wwCount),
      ptMax: (localWeights.ptMax || []).slice(0, localWeights.ptCount),
      stMax: localWeights.stMax || [100, 100],
    });
  }

  function handleDownload() {
    const termLabel = TERMS.find(t => t.key === activeTerm)?.label || activeTerm;
    const { wwCount, ptCount, writtenWorksWeight, performanceTaskWeight, summativeTestWeight, wwMax, ptMax, stMax } = localWeights;

    const colHeaders = [
      'Surname', 'Given Name', 'M.I.',
      ...Array.from({ length: wwCount }, (_, i) => `WW ${i + 1}`),
      ...Array.from({ length: ptCount }, (_, i) => `PT ${i + 1}`),
      'ST 1', 'ST 2', 'Final Grade',
    ];
    const maxRow = [
      'HIGHEST SCORE', '', '',
      ...(wwMax || []).slice(0, wwCount),
      ...(ptMax || []).slice(0, ptCount),
      (stMax || [])[0] ?? 100, (stMax || [])[1] ?? 100, '',
    ];
    const studentRows = students.map(s => {
      const g  = localGrades[s.id] || {};
      const fg = computeDisplay(s.id);
      return [
        s.surname, s.givenName, s.middleInitial || '',
        ...Array.from({ length: wwCount }, (_, i) => (g.writtenWorks || [])[i] ?? ''),
        ...Array.from({ length: ptCount }, (_, i) => (g.performanceTask || [])[i] ?? ''),
        (g.summativeTests || [])[0] ?? '',
        (g.summativeTests || [])[1] ?? '',
        fg > 0 ? fg : '',
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([
      [`${sheet.gradeLevel} – ${sheet.sectionName} | ${decodedSubject} | ${termLabel}`],
      [`Component Weights: WW=${writtenWorksWeight}%  PT=${performanceTaskWeight}%  ST=${summativeTestWeight}%`],
      [`Highest Possible Scores: WW=[${(wwMax || []).slice(0, wwCount).join(', ')}]  PT=[${(ptMax || []).slice(0, ptCount).join(', ')}]  ST=[${(stMax || [100, 100]).join(', ')}]`],
      [],
      colHeaders,
      maxRow,
      ...studentRows,
    ]);

    ws['!cols'] = [
      { wch: 18 }, { wch: 16 }, { wch: 5 },
      ...Array.from({ length: wwCount + ptCount + 3 }, () => ({ wch: 10 })),
    ];

    const wb = XLSX.utils.book_new();
    const sheetName = `${decodedSubject.substring(0, 18)} ${termLabel}`.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sheet.sectionName}_${decodedSubject}_${termLabel}.xlsx`);
  }

  async function handleSave() {
    if (!dirty || !user?.uid) return;
    setSaving(true);
    try {
      // Compute and store final grades before saving
      const updatedGrades = {};
      students.forEach(s => {
        const g = localGrades[s.id] || {};
        const ww = (g.writtenWorks    || []).slice(0, localWeights.wwCount).map(v => Number(v) || 0);
        const pt = (g.performanceTask || []).slice(0, localWeights.ptCount).map(v => Number(v) || 0);
        const st = (g.summativeTests  || []).slice(0, 2).map(v => Number(v) || 0);
        updatedGrades[s.id] = {
          writtenWorks: ww, performanceTask: pt, summativeTests: st,
          finalGrade: computeFinalGrade({ writtenWorks: ww, performanceTask: pt, summativeTests: st, ...localWeights }),
        };
      });
      setLocalGrades(updatedGrades);
      await saveGradeSheet(user.uid, sectionId, decodedSubject, activeTerm, {
        weights: localWeights,
        grades:  updatedGrades,
      });
      setDirty(false);
      addToast('Draft saved!', 'success');
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!user?.uid) return;
    setShowConfirm(false);
    setSubmitting(true);
    try {
      // Save latest draft first, then submit
      const updatedGrades = {};
      students.forEach(s => {
        const g = localGrades[s.id] || {};
        const ww = (g.writtenWorks    || []).slice(0, localWeights.wwCount).map(v => Number(v) || 0);
        const pt = (g.performanceTask || []).slice(0, localWeights.ptCount).map(v => Number(v) || 0);
        const st = (g.summativeTests  || []).slice(0, 2).map(v => Number(v) || 0);
        updatedGrades[s.id] = {
          writtenWorks: ww, performanceTask: pt, summativeTests: st,
          finalGrade: computeFinalGrade({ writtenWorks: ww, performanceTask: pt, summativeTests: st, ...localWeights }),
        };
      });
      await saveGradeSheet(user.uid, sectionId, decodedSubject, activeTerm, {
        weights: localWeights, grades: updatedGrades,
      });
      await submitGradeSheet(user.uid, sectionId, decodedSubject, activeTerm);
      setLocalGrades(updatedGrades);
      setDirty(false);
      addToast(`${TERMS.find(t => t.key === activeTerm)?.label} grades submitted to adviser!`, 'success');
    } catch (err) {
      addToast('Submit failed: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function changeWeight(key, delta) {
    setDirty(true);
    setLocalWeights(w => ({ ...w, [key]: Math.max(0, Math.min(100, (w[key] || 0) + delta)) }));
  }

  function changeCount(key, delta) {
    setDirty(true);
    setLocalWeights(w => {
      const newCount = Math.max(1, (w[key] || 1) + delta);
      const updated = { ...w, [key]: newCount };
      if (key === 'wwCount') {
        updated.wwMax = Array.from({ length: newCount }, (_, i) => w.wwMax?.[i] ?? 100);
      } else if (key === 'ptCount') {
        updated.ptMax = Array.from({ length: newCount }, (_, i) => w.ptMax?.[i] ?? 100);
      }
      return updated;
    });
  }

  function setMaxScore(field, idx, value) {
    setDirty(true);
    setLocalWeights(w => {
      const arr = [...(w[field] || [])];
      arr[idx] = Math.max(1, Number(value) || 100);
      return { ...w, [field]: arr };
    });
  }

  const weightSum    = (localWeights.writtenWorksWeight || 0) + (localWeights.performanceTaskWeight || 0) + (localWeights.summativeTestWeight || 0);
  const validWeights = weightSum === 100;
  const isSubmitted  = sheet?.status === 'submitted';

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#4a6357', fontSize: 14 }}>Loading grade sheet…</div>;
  }

  if (!sheet) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: '#e05c5c', fontSize: 14 }}>Grade sheet not found. Make sure you accepted the invitation first.</p>
        <button onClick={() => navigate('/classes-i-teach')} style={{ marginTop: 16, background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Back to Classes I Teach
        </button>
      </div>
    );
  }

  return (
    <>
      <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}>
        {/* Back */}
        <button
          onClick={() => navigate('/classes-i-teach')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#4a6357', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}
        >
          <ArrowLeft size={14} /> Classes I Teach
        </button>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0d2218, #1a3d2b, #2d6a4f)', borderRadius: 16, padding: '22px 28px', marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {sheet.gradeLevel} – {sheet.sectionName}
            </p>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff' }}>{decodedSubject}</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Unread comments bell */}
            {totalUnread > 0 && (
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <Bell size={18} color="#fbbf24" />
                <span style={{ position: 'absolute', top: -6, right: -8, background: '#e07b39', color: '#fff', borderRadius: 99, fontSize: 9, fontWeight: 800, padding: '1px 4px', lineHeight: '14px' }}>
                  {totalUnread}
                </span>
              </div>
            )}
            {/* Upload Grading Sheet — Coming Soon */}
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button
                disabled
                title="Upload your Grading Sheet — Coming Soon"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.38)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 600,
                  cursor: 'not-allowed', fontFamily: 'inherit',
                }}
              >
                <Upload size={14} /> Upload Sheet
              </button>
              <span style={{ position: 'absolute', top: -8, right: -6, background: '#f59e0b', color: '#0d2218', borderRadius: 99, fontSize: 8, fontWeight: 800, padding: '2px 6px', lineHeight: '13px', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                SOON
              </span>
            </div>
            <button
              onClick={handleDownload}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: 'rgba(255,255,255,0.1)', color: '#d8f3dc',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Download size={14} /> Excel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || submitting || !dirty}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: dirty ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
                color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 600,
                cursor: dirty ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: (saving || !dirty) ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : <><Save size={14} /> Save Draft</>}
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={submitting || saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: '#52b788', color: '#0d2218',
                border: 'none', borderRadius: 10, padding: '9px 20px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Submitting…' : isSubmitted ? <><RefreshCw size={14} /> Re-submit Grade</> : <><Send size={14} /> Submit Grade</>}
            </button>
          </div>
        </div>

        {/* Submitted banner */}
        {isSubmitted && (
          <div style={{ background: '#d8f3dc', border: '1px solid rgba(45,106,79,0.25)', borderRadius: 12, padding: '12px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={18} color="#2d6a4f" />
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1a3d2b' }}>
                {TERMS.find(t => t.key === activeTerm)?.label} grades submitted to adviser
              </p>
              {sheet.submittedAt?.toDate && (
                <p style={{ margin: 0, fontSize: 11, color: '#2d6a4f' }}>
                  Last submitted: {sheet.submittedAt.toDate().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <p style={{ margin: '0 0 0 auto', fontSize: 11, color: '#4a6357', fontStyle: 'italic' }}>You can still edit and re-submit to update the adviser's sheet.</p>
          </div>
        )}

        {/* Weight controls */}
        <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', padding: '18px 22px', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Component Weights</h3>
            {validWeights
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2d6a4f', fontWeight: 600 }}><CheckCircle2 size={13} /> Total: 100%</span>
              : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#e05c5c', fontWeight: 600 }}><AlertTriangle size={13} /> Total: {weightSum}% — must equal 100%</span>
            }
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Written Works',    wKey: 'writtenWorksWeight',    cKey: 'wwCount' },
              { label: 'Performance Task', wKey: 'performanceTaskWeight', cKey: 'ptCount' },
              { label: 'Summative Tests',   wKey: 'summativeTestWeight',   cKey: null      },
            ].map(({ label, wKey, cKey }) => (
              <div key={wKey} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => changeWeight(wKey, -5)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(45,106,79,0.2)', background: 'var(--kt-surface)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#4a6357' }}><Minus size={12} /></button>
                  <span style={{ width: 44, textAlign: 'center', fontWeight: 700, fontSize: 14, color: 'var(--kt-text-primary)', fontFamily: '"DM Mono", monospace' }}>{localWeights[wKey]}%</span>
                  <button onClick={() => changeWeight(wKey, 5)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(45,106,79,0.2)', background: 'var(--kt-surface)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#4a6357' }}><Plus size={12} /></button>
                </div>
                {cKey && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Items:</span>
                    <button onClick={() => changeCount(cKey, -1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(45,106,79,0.2)', background: 'var(--kt-surface)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#4a6357' }}><Minus size={10} /></button>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--kt-text-primary)', minWidth: 18, textAlign: 'center' }}>{localWeights[cKey]}</span>
                    <button onClick={() => changeCount(cKey, 1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(45,106,79,0.2)', background: 'var(--kt-surface)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#4a6357' }}><Plus size={10} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {!validWeights && (
          <div style={{ background: '#fef2f2', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#b91c1c', fontWeight: 500 }}>
            <AlertTriangle size={14} /> Weights must total exactly 100% before submitting.
          </div>
        )}

        {/* Grade table */}
        <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--kt-surface)' }}>
                  <th colSpan={3} style={{ ...CELL, background: 'var(--kt-surface)' }} />
                  <th colSpan={localWeights.wwCount} style={{ ...CELL, background: '#dbeafe', color: '#1e3a8a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center' }}>
                    Written Works ({localWeights.writtenWorksWeight}%)
                  </th>
                  <th colSpan={localWeights.ptCount} style={{ ...CELL, background: '#fef9c3', color: '#854d0e', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center' }}>
                    Performance Task ({localWeights.performanceTaskWeight}%)
                  </th>
                  <th colSpan={2} style={{ ...CELL, background: '#d8f3dc', color: '#1a3d2b', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center' }}>
                    Summative Tests ({localWeights.summativeTestWeight}%)
                  </th>
                  <th style={{ ...CELL, background: '#0d2218', color: '#fff', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center', minWidth: 80 }}>
                    Final Grade
                  </th>
                </tr>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ ...CELL, fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap', minWidth: 110, textAlign: 'left', padding: '8px 12px' }}>Surname</th>
                  <th style={{ ...CELL, fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap', minWidth: 100, textAlign: 'left', padding: '8px 12px' }}>Given Name</th>
                  <th style={{ ...CELL, fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', width: 40, textAlign: 'center' }}>M.I.</th>
                  {Array.from({ length: localWeights.wwCount }, (_, i) => (
                    <th key={i} style={{ ...CELL, background: '#eff6ff', fontSize: 11, fontWeight: 700, color: '#1d4ed8', textAlign: 'center', width: 64 }}>WW {i + 1}</th>
                  ))}
                  {Array.from({ length: localWeights.ptCount }, (_, i) => (
                    <th key={i} style={{ ...CELL, background: '#fefce8', fontSize: 11, fontWeight: 700, color: '#a16207', textAlign: 'center', width: 64 }}>PT {i + 1}</th>
                  ))}
                  <th style={{ ...CELL, background: '#f0fdf4', fontSize: 11, fontWeight: 700, color: '#166534', textAlign: 'center', width: 70 }}>ST 1</th>
                  <th style={{ ...CELL, background: '#f0fdf4', fontSize: 11, fontWeight: 700, color: '#166534', textAlign: 'center', width: 70 }}>ST 2</th>
                  <th style={{ ...CELL, background: 'var(--kt-surface)', fontSize: 11, fontWeight: 700, color: '#1a3d2b', textAlign: 'center' }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {/* Highest possible score row — used for PS calculation */}
                <tr style={{ background: '#fffde7' }}>
                  <td colSpan={3} style={{ ...CELL, background: '#fffde7', fontSize: 10, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.6px', padding: '5px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    Highest Score
                  </td>
                  {Array.from({ length: localWeights.wwCount }, (_, i) => (
                    <td key={i} style={{ ...CELL, background: '#fefce8' }}>
                      <input
                        style={{ ...SCORE_INPUT, background: '#fefce8', borderColor: 'rgba(161,98,7,0.3)' }}
                        type="number" min="1"
                        value={(localWeights.wwMax || [])[i] ?? 100}
                        onChange={e => setMaxScore('wwMax', i, e.target.value)}
                      />
                    </td>
                  ))}
                  {Array.from({ length: localWeights.ptCount }, (_, i) => (
                    <td key={i} style={{ ...CELL, background: '#fef9e7' }}>
                      <input
                        style={{ ...SCORE_INPUT, background: '#fef9e7', borderColor: 'rgba(161,98,7,0.3)' }}
                        type="number" min="1"
                        value={(localWeights.ptMax || [])[i] ?? 100}
                        onChange={e => setMaxScore('ptMax', i, e.target.value)}
                      />
                    </td>
                  ))}
                  {[0, 1].map(i => (
                    <td key={i} style={{ ...CELL, background: '#f0fdf4' }}>
                      <input
                        style={{ ...SCORE_INPUT, background: '#f0fdf4', borderColor: 'rgba(22,101,52,0.3)' }}
                        type="number" min="1"
                        value={(localWeights.stMax || [100, 100])[i] ?? 100}
                        onChange={e => setMaxScore('stMax', i, e.target.value)}
                      />
                    </td>
                  ))}
                  <td style={{ ...CELL, background: 'var(--kt-surface)' }} />
                </tr>

                {students.length === 0 ? (
                  <tr>
                    <td colSpan={3 + localWeights.wwCount + localWeights.ptCount + 3} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', fontSize: 13 }}>
                      No students in roster. Ask the adviser to regenerate the invitation link.
                    </td>
                  </tr>
                ) : students.map(s => {
                  const g      = getGrade(s.id);
                  const fg     = computeDisplay(s.id);
                  const live   = photoMap[s.id];
                  const unread = unreadCounts[s.id] || 0;
                  const studentForCard = live ? { ...s, ...live } : s;
                  return (
                    <tr key={s.id}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fffe'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <td style={{ ...CELL, fontWeight: 600, color: 'var(--kt-text-primary)', textAlign: 'left', padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {live?.photoUrl ? (
                            <img src={thumbUrl(live.photoUrl, 56)} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(45,106,79,0.2)' }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e5f0ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#2d6a4f', flexShrink: 0 }}>
                              {(s.givenName?.[0] || '') + (s.surname?.[0] || '')}
                            </div>
                          )}
                          <button
                            onClick={() => setOpenStudentCard(studentForCard)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, color: 'var(--kt-text-primary)', fontSize: 13, fontFamily: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(45,106,79,0.3)' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#2d6a4f'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--kt-text-primary)'; }}
                          >
                            {s.surname}
                          </button>
                          {unread > 0 && (
                            <span style={{ background: '#e07b39', color: '#fff', borderRadius: 99, fontSize: 9, fontWeight: 800, padding: '1px 5px', lineHeight: '14px' }}>
                              {unread}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...CELL, color: 'var(--kt-text-primary)', textAlign: 'left', padding: '8px 12px' }}>
                        <button
                          onClick={() => setOpenStudentCard(studentForCard)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--kt-text-primary)', fontSize: 13, fontFamily: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(45,106,79,0.3)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#2d6a4f'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--kt-text-primary)'; }}
                        >
                          {s.givenName}
                        </button>
                      </td>
                      <td style={{ ...CELL, color: '#4a6357', textAlign: 'center' }}>{s.middleInitial || '—'}</td>
                      {Array.from({ length: localWeights.wwCount }, (_, i) => (
                        <td key={i} style={{ ...CELL, background: '#fafcff' }}>
                          <input
                            style={SCORE_INPUT}
                            type="number" min="0" max="100"
                            value={(g.writtenWorks || [])[i] ?? ''}
                            onChange={e => setScore(s.id, 'writtenWorks', i, e.target.value)}
                            placeholder="—"
                          />
                        </td>
                      ))}
                      {Array.from({ length: localWeights.ptCount }, (_, i) => (
                        <td key={i} style={{ ...CELL, background: '#fffef5' }}>
                          <input
                            style={SCORE_INPUT}
                            type="number" min="0" max="100"
                            value={(g.performanceTask || [])[i] ?? ''}
                            onChange={e => setScore(s.id, 'performanceTask', i, e.target.value)}
                            placeholder="—"
                          />
                        </td>
                      ))}
                      {[0, 1].map(i => (
                        <td key={i} style={{ ...CELL, background: '#f9fff9' }}>
                          <input
                            style={SCORE_INPUT}
                            type="number" min="0" max="100"
                            value={(g.summativeTests || [])[i] ?? ''}
                            onChange={e => setScore(s.id, 'summativeTests', i, e.target.value)}
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td style={{ ...CELL, background: fg >= 75 ? '#d8f3dc' : fg > 0 ? '#fde8e8' : '#f9fafb', fontWeight: 800, fontSize: 14, color: fg >= 75 ? '#1a3d2b' : fg > 0 ? '#b91c1c' : '#9ca3af', fontFamily: '"DM Mono", monospace', textAlign: 'center' }}>
                        {fg > 0 ? fg : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Submit confirmation overlay */}
      {showConfirm && (
        <div onClick={() => setShowConfirm(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--kt-card)', borderRadius: 18, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg, #1a3d2b, #2d6a4f)', padding: '20px 24px' }}>
              <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px' }}>Submit Grades</p>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>
                Send {TERMS.find(t => t.key === activeTerm)?.label} grades to adviser?
              </h3>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, color: '#4a6357', lineHeight: 1.6 }}>
                Final grades will be sent to the class adviser's consolidated grading sheet for <strong>{decodedSubject}</strong>.
              </p>
              <p style={{ margin: '0 0 20px', fontSize: 12, color: '#6b7280' }}>
                You can re-submit later if you need to make corrections.
              </p>
              {!validWeights && (
                <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#b91c1c' }}>
                  <AlertTriangle size={13} /> Fix component weights (must total 100%) before submitting.
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowConfirm(false)} style={{ flex: 1, background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!validWeights}
                  style={{ flex: 1, background: validWeights ? '#2d6a4f' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700, cursor: validWeights ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                >
                  <Send size={14} /> Confirm Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Save Draft */}
      {dirty && (
        <div style={{ position: 'fixed', bottom: 56, right: 24, zIndex: 50 }}>
          <button
            onClick={handleSave}
            disabled={saving || !validWeights}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: validWeights ? '#2d6a4f' : '#9ca3af', color: '#fff',
              border: 'none', borderRadius: 12, padding: '12px 24px',
              fontSize: 14, fontWeight: 700,
              cursor: validWeights ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              boxShadow: '0 8px 24px rgba(13,34,24,0.25)',
            }}
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Save Draft'}
          </button>
        </div>
      )}

      {/* Excel-style term tabs */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        background: '#e5e7eb', borderTop: '1px solid #d1d5db',
        display: 'flex', alignItems: 'flex-end', padding: '0 0 0 16px', height: 44,
      }}>
        {TERMS.map(t => {
          const isActive = activeTerm === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTerm(t.key)}
              style={{
                padding: '0 22px',
                height: isActive ? 40 : 34,
                alignSelf: 'flex-end',
                background: isActive ? '#fff' : '#d1d5db',
                color: isActive ? '#1a3d2b' : '#6b7280',
                border: '1px solid #c4c4c4',
                borderBottom: isActive ? '1px solid #fff' : '1px solid #c4c4c4',
                borderRadius: '6px 6px 0 0',
                fontWeight: isActive ? 700 : 500,
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                marginRight: 2,
                transition: 'background 0.12s, color 0.12s, height 0.1s',
                boxShadow: isActive ? '0 -2px 6px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {openStudentCard && (
        <StudentCardModal
          student={openStudentCard}
          sectionId={sectionId}
          currentUser={user}
          authorName={user.displayName || 'Subject Teacher'}
          authorRole="subject_teacher"
          subject={decodedSubject}
          onClose={() => setOpenStudentCard(null)}
        />
      )}
    </>
  );
}
