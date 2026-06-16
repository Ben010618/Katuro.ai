import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
  subscribeStudents, subscribeSubjectGrades, subscribeGradeWeights,
  saveStudentGrades, saveGradeWeights, computeFinalGrade,
} from '../../services/classroomDb';
import { ArrowLeft, Save, Plus, Minus, AlertTriangle, CheckCircle2 } from 'lucide-react';

const CELL = {
  padding: '7px 6px', border: '1px solid rgba(45,106,79,0.12)',
  textAlign: 'center', background: '#fff',
};
const SCORE_INPUT = {
  width: 52, textAlign: 'center', border: '1px solid rgba(45,106,79,0.2)',
  borderRadius: 7, padding: '5px 4px', fontSize: 13, fontFamily: '"DM Mono", monospace',
  background: '#f5faf7', outline: 'none', color: '#0d2218',
};

const DEFAULT_WEIGHTS = { writtenWorksWeight: 40, performanceTaskWeight: 40, quarterlyExamWeight: 20 };
const DEFAULT_COUNTS  = { wwCount: 3, ptCount: 2 };

export default function GradingTablePage() {
  const { sectionId, subject } = useParams();
  const decodedSubject = decodeURIComponent(subject);
  const navigate   = useNavigate();
  const { addToast } = useToast();

  const [students,  setStudents]  = useState([]);
  const [weights,   setWeights]   = useState({ ...DEFAULT_WEIGHTS, ...DEFAULT_COUNTS });
  const [localGrades, setLocalGrades] = useState({});
  const [dirty,     setDirty]     = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    const unsub = subscribeStudents(sectionId, setStudents);
    return unsub;
  }, [sectionId]);

  useEffect(() => {
    const unsub = subscribeGradeWeights(sectionId, decodedSubject, data => {
      setWeights(w => ({ ...DEFAULT_WEIGHTS, ...DEFAULT_COUNTS, ...data }));
    });
    return unsub;
  }, [sectionId, decodedSubject]);

  // Load grades ONCE (on first snapshot), then local state takes over
  useEffect(() => {
    const unsub = subscribeSubjectGrades(sectionId, decodedSubject, gradeMap => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        setLocalGrades(gradeMap);
        setLoading(false);
      }
    });
    const timer = setTimeout(() => { initializedRef.current = true; setLoading(false); }, 2000);
    return () => { unsub(); clearTimeout(timer); };
  }, [sectionId, decodedSubject]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getGrade(studentId) {
    return localGrades[studentId] || { writtenWorks: [], performanceTask: [], quarterlyExam: '' };
  }

  function setScore(studentId, field, idx, value) {
    setDirty(true);
    setLocalGrades(prev => {
      const g = { ...getGrade(studentId) };
      if (field === 'quarterlyExam') {
        g.quarterlyExam = value;
      } else {
        const arr = [...(g[field] || [])];
        arr[idx] = value === '' ? '' : Number(value);
        g[field] = arr;
      }
      return { ...prev, [studentId]: g };
    });
  }

  function computeDisplay(studentId) {
    const g = getGrade(studentId);
    return computeFinalGrade({ ...g, ...weights });
  }

  async function handleSaveAll() {
    if (!dirty) return;
    setSaving(true);
    try {
      const w = {
        writtenWorksWeight:    weights.writtenWorksWeight,
        performanceTaskWeight: weights.performanceTaskWeight,
        quarterlyExamWeight:   weights.quarterlyExamWeight,
        wwCount:               weights.wwCount,
        ptCount:               weights.ptCount,
      };
      await saveGradeWeights(sectionId, decodedSubject, w);
      await Promise.all(
        students.map(s => {
          const g = localGrades[s.id] || {};
          return saveStudentGrades(sectionId, decodedSubject, s.id, {
            writtenWorks:   (g.writtenWorks   || []).slice(0, weights.wwCount).map(v => Number(v) || 0),
            performanceTask:(g.performanceTask || []).slice(0, weights.ptCount).map(v => Number(v) || 0),
            quarterlyExam:  Number(g.quarterlyExam) || 0,
          }, w);
        })
      );
      setDirty(false);
      addToast('Grades saved!', 'success');
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function changeWeight(key, delta) {
    setDirty(true);
    setWeights(w => ({ ...w, [key]: Math.max(0, Math.min(100, (w[key] || 0) + delta)) }));
  }

  function changeCount(key, delta) {
    setDirty(true);
    setWeights(w => ({ ...w, [key]: Math.max(1, (w[key] || 1) + delta) }));
  }

  const weightSum = (weights.writtenWorksWeight || 0) + (weights.performanceTaskWeight || 0) + (weights.quarterlyExamWeight || 0);
  const validWeights = weightSum === 100;

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#4a6357', fontSize: 14 }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
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
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px' }}>Grading Table</p>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff' }}>{decodedSubject}</h2>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={saving || !dirty}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, background: dirty ? '#52b788' : 'rgba(255,255,255,0.15)', color: '#fff',
            border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 700,
            cursor: dirty ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : <><Save size={15} /> Save All Grades</>}
        </button>
      </div>

      {/* Weight controls */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)', padding: '18px 22px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0d2218' }}>Component Weights</h3>
          {validWeights
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2d6a4f', fontWeight: 600 }}><CheckCircle2 size={13} /> Total: 100%</span>
            : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#e05c5c', fontWeight: 600 }}><AlertTriangle size={13} /> Total: {weightSum}% — must equal 100%</span>
          }
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Written Works',     wKey: 'writtenWorksWeight',    cKey: 'wwCount' },
            { label: 'Performance Task',  wKey: 'performanceTaskWeight', cKey: 'ptCount' },
            { label: 'Quarterly Exam',    wKey: 'quarterlyExamWeight',   cKey: null      },
          ].map(({ label, wKey, cKey }) => (
            <div key={wKey} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => changeWeight(wKey, -5)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(45,106,79,0.2)', background: '#f5faf7', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#4a6357' }}><Minus size={12} /></button>
                <span style={{ width: 44, textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#0d2218', fontFamily: '"DM Mono", monospace' }}>{weights[wKey]}%</span>
                <button onClick={() => changeWeight(wKey, 5)} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(45,106,79,0.2)', background: '#f5faf7', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#4a6357' }}><Plus size={12} /></button>
              </div>
              {cKey && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>Items:</span>
                  <button onClick={() => changeCount(cKey, -1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(45,106,79,0.2)', background: '#f5faf7', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#4a6357' }}><Minus size={10} /></button>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#0d2218', minWidth: 18, textAlign: 'center' }}>{weights[cKey]}</span>
                  <button onClick={() => changeCount(cKey, 1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(45,106,79,0.2)', background: '#f5faf7', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#4a6357' }}><Plus size={10} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {!validWeights && (
        <div style={{ background: '#fef2f2', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#b91c1c', fontWeight: 500 }}>
          <AlertTriangle size={14} /> Weights must total exactly 100% before saving.
        </div>
      )}

      {/* Grading table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
            <thead>
              {/* Group headers */}
              <tr style={{ background: '#f5faf7' }}>
                <th colSpan={3} style={{ ...CELL, background: '#f5faf7' }} />
                <th
                  colSpan={weights.wwCount}
                  style={{ ...CELL, background: '#dbeafe', color: '#1e3a8a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center' }}
                >
                  Written Works ({weights.writtenWorksWeight}%)
                </th>
                <th
                  colSpan={weights.ptCount}
                  style={{ ...CELL, background: '#fef9c3', color: '#854d0e', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center' }}
                >
                  Performance Task ({weights.performanceTaskWeight}%)
                </th>
                <th style={{ ...CELL, background: '#d8f3dc', color: '#1a3d2b', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center' }}>
                  Quarterly Exam ({weights.quarterlyExamWeight}%)
                </th>
                <th style={{ ...CELL, background: '#0d2218', color: '#fff', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center', minWidth: 80 }}>
                  Final Grade
                </th>
              </tr>
              {/* Column headers */}
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ ...CELL, fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap', minWidth: 110, textAlign: 'left', padding: '8px 12px' }}>Surname</th>
                <th style={{ ...CELL, fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap', minWidth: 100, textAlign: 'left', padding: '8px 12px' }}>Given Name</th>
                <th style={{ ...CELL, fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', width: 40, textAlign: 'center' }}>M.I.</th>
                {Array.from({ length: weights.wwCount }, (_, i) => (
                  <th key={i} style={{ ...CELL, background: '#eff6ff', fontSize: 11, fontWeight: 700, color: '#1d4ed8', textAlign: 'center', width: 64 }}>WW {i + 1}</th>
                ))}
                {Array.from({ length: weights.ptCount }, (_, i) => (
                  <th key={i} style={{ ...CELL, background: '#fefce8', fontSize: 11, fontWeight: 700, color: '#a16207', textAlign: 'center', width: 64 }}>PT {i + 1}</th>
                ))}
                <th style={{ ...CELL, background: '#f0fdf4', fontSize: 11, fontWeight: 700, color: '#166534', textAlign: 'center', width: 70 }}>QE</th>
                <th style={{ ...CELL, background: '#f5faf7', fontSize: 11, fontWeight: 700, color: '#1a3d2b', textAlign: 'center' }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={3 + weights.wwCount + weights.ptCount + 2} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', fontSize: 13 }}>
                    No students enrolled in this section yet.
                  </td>
                </tr>
              ) : students.map(s => {
                const g = getGrade(s.id);
                const fg = computeDisplay(s.id);
                return (
                  <tr key={s.id}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fffe'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ ...CELL, fontWeight: 600, color: '#0d2218', textAlign: 'left', padding: '8px 12px' }}>{s.surname}</td>
                    <td style={{ ...CELL, color: '#0d2218', textAlign: 'left', padding: '8px 12px' }}>{s.givenName}</td>
                    <td style={{ ...CELL, color: '#4a6357', textAlign: 'center' }}>{s.middleInitial || '—'}</td>
                    {Array.from({ length: weights.wwCount }, (_, i) => (
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
                    {Array.from({ length: weights.ptCount }, (_, i) => (
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
                    <td style={{ ...CELL, background: '#f9fff9' }}>
                      <input
                        style={SCORE_INPUT}
                        type="number" min="0" max="100"
                        value={g.quarterlyExam ?? ''}
                        onChange={e => setScore(s.id, 'quarterlyExam', null, e.target.value)}
                        placeholder="—"
                      />
                    </td>
                    <td style={{ ...CELL, background: fg >= 75 ? '#d8f3dc' : '#fde8e8', fontWeight: 800, fontSize: 14, color: fg >= 75 ? '#1a3d2b' : '#b91c1c', fontFamily: '"DM Mono", monospace', textAlign: 'center' }}>
                      {fg || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {dirty && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 50 }}>
          <button
            onClick={handleSaveAll}
            disabled={saving || !validWeights}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: validWeights ? '#2d6a4f' : '#9ca3af',
              color: '#fff', border: 'none', borderRadius: 12,
              padding: '12px 24px', fontSize: 14, fontWeight: 700,
              cursor: validWeights ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              boxShadow: '0 8px 24px rgba(13,34,24,0.25)',
            }}
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Save All Grades'}
          </button>
        </div>
      )}
    </div>
  );
}
