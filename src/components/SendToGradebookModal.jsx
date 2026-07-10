import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  subscribeAssignments, subscribeStudents, subscribeGradeWeights, subscribeGradeSheet,
  saveGradeSheet, TERMS,
} from '../services/classroomDb';
import { updateScan } from '../services/scansDb';
import { useToast } from '../context/ToastContext';
import { trackEvent } from '../services/usageTracker';
import { X, Loader2, AlertTriangle, Send } from 'lucide-react';

const FIELD_OPTIONS = [
  { field: 'writtenWorks',    label: 'Written Work',    countKey: 'wwCount', maxKey: 'wwMax' },
  { field: 'performanceTask', label: 'Performance Task', countKey: 'ptCount', maxKey: 'ptMax' },
  { field: 'summativeTests',  label: 'Summative Test',   countKey: null,      maxKey: 'stMax', fixedCount: 2 },
];

function normalize(str) {
  return (str || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export default function SendToGradebookModal({ uid, quiz, scans, onClose, onRecorded }) {
  const { addToast } = useToast();

  const [assignments,  setAssignments]  = useState([]);
  const [assignmentKey, setAssignmentKey] = useState('');
  const [term,          setTerm]          = useState('term1');
  const [students,      setStudents]      = useState([]);
  const [weights,       setWeights]       = useState(null);
  const [gradeSheet,    setGradeSheet]    = useState(null);
  const [field,         setField]         = useState('writtenWorks');
  const [slotIndex,     setSlotIndex]     = useState(0);
  const [overrides,     setOverrides]     = useState({}); // scanId -> studentId, user-picked only
  const [saving,        setSaving]        = useState(false);

  const assignment = useMemo(
    () => assignments.find(a => `${a.sectionId}::${a.subject}` === assignmentKey),
    [assignments, assignmentKey]
  );

  useEffect(() => {
    const unsub = subscribeAssignments(uid, setAssignments);
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!assignment) return;
    const unsubStudents = subscribeStudents(assignment.sectionId, setStudents);
    const unsubWeights  = subscribeGradeWeights(assignment.sectionId, assignment.subject, setWeights, term);
    const unsubSheet    = subscribeGradeSheet(uid, assignment.sectionId, assignment.subject, term, setGradeSheet);
    return () => { unsubStudents(); unsubWeights(); unsubSheet(); };
  }, [uid, assignment, term]);

  // Auto-match scans to roster students by normalized Student No — a pure
  // derivation from students+scans, so it's memoized rather than pushed into
  // state; `overrides` layers the user's manual picks on top.
  const autoMatch = useMemo(() => {
    const map = {};
    scans.forEach(scan => {
      const target = normalize(scan.studentName);
      if (!target) return;
      const match = students.find(s => normalize(s.studentNumber) === target);
      if (match) map[scan.id] = match.id;
    });
    return map;
  }, [students, scans]);

  const mapping = { ...autoMatch, ...overrides };

  const fieldOpt   = FIELD_OPTIONS.find(f => f.field === field);
  const slotCount  = fieldOpt.fixedCount ?? (weights?.[fieldOpt.countKey] || 0);
  const slotMax    = weights?.[fieldOpt.maxKey]?.[slotIndex];
  const quizTotal  = quiz.answerKey.length;
  const maxMismatch = slotMax != null && Number(slotMax) !== quizTotal;

  const mappedCount = scans.filter(s => mapping[s.id]).length;

  async function handleSubmit() {
    if (!assignment) { addToast('Choose a section/subject first.', 'warning'); return; }
    if (mappedCount === 0) { addToast('Match at least one student to a scan first.', 'warning'); return; }

    setSaving(true);
    try {
      const updatedGrades = {};
      scans.forEach(scan => {
        const studentId = mapping[scan.id];
        if (!studentId) return;
        const existing = gradeSheet?.grades?.[studentId] || { writtenWorks: [], performanceTask: [], summativeTests: ['', ''] };
        const arr = [...(existing[field] || [])];
        arr[slotIndex] = scan.score;
        updatedGrades[studentId] = { ...existing, [field]: arr };
      });

      await saveGradeSheet(uid, assignment.sectionId, assignment.subject, term, {
        weights: weights || {},
        grades: updatedGrades,
      });

      await Promise.all(scans.filter(s => mapping[s.id]).map(scan =>
        updateScan(uid, quiz.id, scan.id, {
          gradebookRef: {
            sectionId: assignment.sectionId, subject: assignment.subject, term,
            field, slotIndex, studentId: mapping[scan.id],
          },
        })
      ));

      trackEvent(uid, 'scan_scores_recorded', { quizId: quiz.id, count: mappedCount });
      addToast(`${mappedCount} score${mappedCount !== 1 ? 's' : ''} recorded in the gradebook.`, 'success');
      onRecorded?.();
      onClose();
    } catch (err) {
      addToast('Failed to record scores: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--kt-card)', borderRadius: 16, width: 620, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Send Scores to Gradebook</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>{quiz.title} · {mappedCount}/{scans.length} matched</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)' }}><X size={18} /></button>
        </div>

        {/* Section / Subject */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase' }}>Section &amp; Subject</label>
            <select className="select" value={assignmentKey} onChange={e => setAssignmentKey(e.target.value)}>
              <option value="">Select…</option>
              {assignments.map(a => (
                <option key={`${a.sectionId}::${a.subject}`} value={`${a.sectionId}::${a.subject}`}>
                  {a.sectionName} — {a.subject}
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 130 }}>
            <label style={{ display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase' }}>Term</label>
            <select className="select" value={term} onChange={e => setTerm(e.target.value)}>
              {TERMS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {assignment && (
          <>
            {/* Category / slot */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase' }}>Record as</label>
                <select className="select" value={field} onChange={e => { setField(e.target.value); setSlotIndex(0); }}>
                  {FIELD_OPTIONS.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                </select>
              </div>
              <div style={{ width: 130 }}>
                <label style={{ display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase' }}>Slot #</label>
                <select className="select" value={slotIndex} onChange={e => setSlotIndex(Number(e.target.value))}>
                  {Array.from({ length: Math.max(slotCount, 1) }, (_, i) => (
                    <option key={i} value={i}>{fieldOpt.label} #{i + 1}</option>
                  ))}
                </select>
              </div>
            </div>

            {maxMismatch && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fef3c7', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 10, padding: '8px 12px', marginBottom: 14 }}>
                <AlertTriangle size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12, color: '#92400e' }}>
                  This slot's max score is currently {slotMax ?? '—'}, but the quiz has {quizTotal} items. Adjust the max in the Grading Table if this slot should reflect this quiz.
                </p>
              </div>
            )}

            {/* Student matching */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {scans.map(scan => (
                <div key={scan.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--kt-surface)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--kt-text-primary)' }}>{scan.studentName || '(no ID read)'}</p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>Score: {scan.score}/{scan.total}</p>
                  </div>
                  <select
                    className="select"
                    style={{ maxWidth: 220 }}
                    value={mapping[scan.id] || ''}
                    onChange={e => setOverrides(prev => ({ ...prev, [scan.id]: e.target.value }))}
                  >
                    <option value="">— skip —</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.surname}, {s.givenName} (#{s.studentNumber})</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        <button className="btn-primary" onClick={handleSubmit} disabled={saving || !assignment} style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
          Record {mappedCount || ''} Score{mappedCount !== 1 ? 's' : ''}
        </button>
      </div>
    </div>,
    document.body
  );
}
