import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { uploadToCloudinary, thumbUrl } from '../../services/cloudinaryUpload';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import {
  subscribeSection, subscribeStudents, subscribeSubjectGrades,
  subscribeSubjectInvitation, addStudent, updateStudent, removeStudent,
  addSpecialSubject, removeSpecialSubject, createInvitation,
} from '../../services/classroomDb';
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Link, Copy, Check,
  Users, BookOpen, BarChart2, Shield, RefreshCw, FileText, ClipboardList,
  Upload, Download, AlertCircle, CheckCircle2, Camera,
} from 'lucide-react';
import SchoolFormsPanel      from './SchoolFormsPanel';
import TempReportCardPanel   from './TempReportCardPanel';

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT = {
  width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 14,
  border: '1px solid rgba(45,106,79,0.2)', background: '#f5faf7',
  color: '#0d2218', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};
const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#4a6357',
  textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 5,
};
const BTN_PRIMARY = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2d6a4f', color: '#fff',
  border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
};
const BTN_GHOST = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#4a6357',
  border: '1px solid rgba(45,106,79,0.2)', borderRadius: 9, padding: '6px 12px',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};

// ── Consolidated Grading helpers ──────────────────────────────────────────────

const DEPED_ORDER = [
  'Filipino', 'English', 'Mathematics', 'Science',
  'Araling Panlipunan', 'Edukasyon sa Pagpapakatao (EsP)',
  'Technology and Livelihood Education (TLE)', 'MAPEH',
];

const SUBJ_ABBR = {
  'Filipino':                                  'FIL',
  'English':                                   'ENG',
  'Mathematics':                               'MATH',
  'Science':                                   'SCI',
  'Araling Panlipunan':                        'AP',
  'Edukasyon sa Pagpapakatao (EsP)':           'EsP',
  'Technology and Livelihood Education (TLE)': 'TLE',
  'MAPEH':                                     'MAPEH',
};

function gradingSubjects(subjects, specialSubjects) {
  const sorted = DEPED_ORDER.filter(s => (subjects || []).includes(s));
  return [...sorted, ...(specialSubjects || [])];
}

async function exportGradingExcel(section, students, subjects, allGrades) {
  const wb   = XLSX.utils.book_new();
  const abbrs = subjects.map(s => SUBJ_ABBR[s] || s);
  const termLabels = { term1: 'Term 1', term2: 'Term 2', term3: 'Term 3' };

  ['term1', 'term2', 'term3'].forEach(term => {
    const header = ['No.', 'Surname', 'Given Name', 'M.I.', ...abbrs, 'GEN. AVG.'];
    const rows = students.map((s, i) => {
      const grades = subjects.map(subj => allGrades[term]?.[subj]?.[s.id]?.finalGrade ?? '');
      const nums = grades.filter(g => g !== '');
      const ga   = nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : '';
      return [i + 1, s.surname, s.givenName, s.middleInitial || '', ...grades, ga];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [
      { wch: 4 }, { wch: 20 }, { wch: 16 }, { wch: 5 },
      ...subjects.map(() => ({ wch: 7 })),
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, termLabels[term]);
  });

  const name = section.sectionName || 'Section';
  const sy   = section.academicYear ? `_SY${section.academicYear}` : '';
  XLSX.writeFile(wb, `Grades_${name}${sy}.xlsx`);
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  function parseLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    out.push(cur.trim());
    return out;
  }

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
}

const CSV_MAP = {
  'lrn': 'lrn', 'student number': 'studentNumber', 'student no': 'studentNumber',
  'student no.': 'studentNumber',
  'surname': 'surname', 'last name': 'surname', 'lastname': 'surname',
  'given name': 'givenName', 'first name': 'givenName', 'firstname': 'givenName',
  'middle initial': 'middleInitial', 'mi': 'middleInitial', 'm.i.': 'middleInitial',
  'gender': 'gender', 'sex': 'gender',
  'birthdate': 'birthdate', 'birth date': 'birthdate', 'date of birth': 'birthdate',
  'mother tongue': 'motherTongue', 'mothertongue': 'motherTongue',
  'religion': 'religion',
  'ip/ethnic group': 'ipGroup', 'ip group': 'ipGroup', 'ethnic group': 'ipGroup',
  'house/street/purok': 'houseStreet', 'address': 'houseStreet',
  'barangay': 'barangay',
  'municipality': 'municipality', 'municipality/city': 'municipality', 'city': 'municipality',
  'province': 'province',
  "father's name": 'fatherName', 'father name': 'fatherName',
  "mother's maiden name": 'motherMaidenName', 'mother maiden name': 'motherMaidenName',
  "mother name": 'motherMaidenName',
  'guardian name': 'guardianName',
  'relationship': 'guardianRelationship', 'guardian relationship': 'guardianRelationship',
  'contact number': 'contactNumber', 'contact': 'contactNumber', 'phone': 'contactNumber',
};

function mapCsvRow(raw) {
  const s = { ...BLANK_STUDENT };
  Object.entries(raw).forEach(([h, v]) => {
    const field = CSV_MAP[h.toLowerCase()];
    if (field) s[field] = v;
  });
  const g = s.gender.toLowerCase();
  s.gender = g === 'm' || g === 'male' ? 'Male' : g === 'f' || g === 'female' ? 'Female' : s.gender;
  return s;
}

function validateCsvRow(s) {
  const errs = [];
  if (!s.lrn)      errs.push('LRN required');
  if (!s.surname)  errs.push('Surname required');
  if (!s.givenName) errs.push('Given Name required');
  if (!['Male', 'Female'].includes(s.gender)) errs.push('Gender must be Male or Female');
  return errs;
}

const CSV_TEMPLATE_HEADER =
  'LRN,Student Number,Surname,Given Name,Middle Initial,Gender,Birthdate,' +
  'Mother Tongue,Religion,IP/Ethnic Group,House/Street/Purok,Barangay,' +
  'Municipality,Province,Father\'s Name,Mother\'s Maiden Name,' +
  'Guardian Name,Relationship,Contact Number';
const CSV_TEMPLATE_SAMPLE =
  '123456789012,2024-001,Dela Cruz,Juan,R.,Male,2009-05-15,' +
  'Filipino,Roman Catholic,,123 Rizal St.,Poblacion,' +
  'Borongan City,Eastern Samar,Dela Cruz Jose R.,Santos Maria C.,' +
  ',,09171234567';

// ── CSV Upload Modal ──────────────────────────────────────────────────────────

function CsvUploadModal({ sectionId, onClose }) {
  const { addToast } = useToast();
  const [step,     setStep]     = useState('pick');   // 'pick' | 'preview' | 'saving'
  const [rows,     setRows]     = useState([]);
  const [rowErrs,  setRowErrs]  = useState({});       // index → [string]
  const [dragOver, setDragOver] = useState(false);
  const [done,     setDone]     = useState(0);
  const fileRef = useRef(null);

  function downloadTemplate() {
    const csv = CSV_TEMPLATE_HEADER + '\n' + CSV_TEMPLATE_SAMPLE;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'kaTuro_Student_Template.csv' }).click();
    URL.revokeObjectURL(url);
  }

  function processFile(file) {
    if (!file || !file.name.match(/\.(csv|txt)$/i)) {
      addToast('Please upload a .csv file.', 'error'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const parsed = parseCSV(e.target.result).map(mapCsvRow);
      const errs = {};
      parsed.forEach((s, i) => {
        const e = validateCsvRow(s);
        if (e.length) errs[i] = e;
      });
      setRows(parsed);
      setRowErrs(errs);
      setStep('preview');
    };
    reader.readAsText(file);
  }

  async function handleUpload() {
    const valid = rows.filter((_, i) => !rowErrs[i]);
    setStep('saving');
    setDone(0);
    try {
      for (const s of valid) {
        await addStudent(sectionId, s);
        setDone(d => d + 1);
      }
      addToast(`${valid.length} student${valid.length !== 1 ? 's' : ''} imported!`, 'success');
      onClose();
    } catch (err) {
      addToast('Import failed: ' + err.message, 'error');
      setStep('preview');
    }
  }

  const validCount   = rows.filter((_, i) => !rowErrs[i]).length;
  const invalidCount = rows.length - validCount;

  return (
    <div
      onClick={step !== 'saving' ? onClose : undefined}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: step === 'preview' ? 780 : 500, maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1a3d2b, #2d6a4f)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Upload size={16} color="#d8f3dc" />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Import Students from CSV</span>
          </div>
          {step !== 'saving' && (
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* ── STEP: pick ── */}
        {step === 'pick' && (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Template download */}
            <div style={{ background: '#f0fdf4', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0d2218' }}>Step 1 — Download the template</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#4a6357' }}>Fill it in Excel or Google Sheets, then upload below.</p>
              </div>
              <button
                onClick={downloadTemplate}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3d2b', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
              >
                <Download size={13} /> Get Template
              </button>
            </div>

            {/* Drop zone */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0d2218' }}>Step 2 — Upload your filled CSV</p>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files?.[0]); }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#2d6a4f' : 'rgba(45,106,79,0.3)'}`,
                  borderRadius: 14, padding: '36px 24px', textAlign: 'center',
                  cursor: 'pointer', background: dragOver ? '#f0fdf4' : '#fafafa',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <Upload size={30} color={dragOver ? '#2d6a4f' : '#9ca3af'} style={{ marginBottom: 10 }} />
                <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#374151' }}>
                  {dragOver ? 'Drop it here!' : 'Drag & drop your CSV here'}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>or <span style={{ color: '#2d6a4f', fontWeight: 700 }}>click to browse</span></p>
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => processFile(e.target.files?.[0])} />
              </div>
            </div>

            {/* Required columns note */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#92400e' }}>
                <strong>Required columns:</strong> LRN, Surname, Given Name, Gender (Male/Female).
                All other columns are optional but populate SF1 automatically.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP: preview ── */}
        {step === 'preview' && (
          <>
            {/* Summary bar */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(45,106,79,0.1)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, background: '#f9fafb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <CheckCircle2 size={15} color="#16a34a" />
                <span style={{ fontWeight: 700, color: '#16a34a' }}>{validCount}</span>
                <span style={{ color: '#4a6357' }}>ready to import</span>
              </div>
              {invalidCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <AlertCircle size={15} color="#dc2626" />
                  <span style={{ fontWeight: 700, color: '#dc2626' }}>{invalidCount}</span>
                  <span style={{ color: '#4a6357' }}>rows with errors (will be skipped)</span>
                </div>
              )}
              <button
                onClick={() => setStep('pick')}
                style={{ marginLeft: 'auto', ...BTN_GHOST, fontSize: 12, padding: '5px 12px' }}
              >
                ← Change file
              </button>
            </div>

            {/* Preview table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f5faf7', zIndex: 1 }}>
                  <tr>
                    {['#', 'Surname', 'Given Name', 'M.I.', 'Gender', 'LRN', 'Student No.', 'Status'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.7px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(45,106,79,0.1)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => {
                    const errs = rowErrs[i];
                    return (
                      <tr key={i} style={{ background: errs ? 'rgba(220,38,38,0.04)' : '', borderTop: '1px solid rgba(45,106,79,0.06)' }}>
                        <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{i + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0d2218' }}>{s.surname || <span style={{ color: '#dc2626' }}>—</span>}</td>
                        <td style={{ padding: '8px 12px', color: '#0d2218' }}>{s.givenName || <span style={{ color: '#dc2626' }}>—</span>}</td>
                        <td style={{ padding: '8px 12px', color: '#4a6357' }}>{s.middleInitial || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {['Male', 'Female'].includes(s.gender)
                            ? <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 8px', background: s.gender === 'Male' ? 'rgba(59,130,246,0.1)' : 'rgba(236,72,153,0.1)', color: s.gender === 'Male' ? '#1d4ed8' : '#be185d' }}>{s.gender}</span>
                            : <span style={{ color: '#dc2626', fontSize: 11 }}>{s.gender || 'missing'}</span>
                          }
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: '"DM Mono", monospace', color: '#4a6357' }}>{s.lrn || <span style={{ color: '#dc2626' }}>—</span>}</td>
                        <td style={{ padding: '8px 12px', color: '#4a6357' }}>{s.studentNumber || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {errs
                            ? <span title={errs.join(', ')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#dc2626', fontWeight: 600 }}><AlertCircle size={12} /> {errs[0]}</span>
                            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#16a34a', fontWeight: 600 }}><CheckCircle2 size={12} /> OK</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(45,106,79,0.1)', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={onClose} style={{ ...BTN_GHOST, flex: 1, justifyContent: 'center', padding: 10 }}>Cancel</button>
              <button
                onClick={handleUpload}
                disabled={validCount === 0}
                style={{ ...BTN_PRIMARY, flex: 2, justifyContent: 'center', padding: 10, opacity: validCount === 0 ? 0.5 : 1 }}
              >
                <Upload size={13} /> Import {validCount} Student{validCount !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {/* ── STEP: saving ── */}
        {step === 'saving' && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#d8f3dc', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <Upload size={24} color="#2d6a4f" />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#0d2218' }}>Importing students…</p>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#4a6357' }}>{done} of {validCount} uploaded</p>
            <div style={{ background: '#e5e7eb', borderRadius: 99, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${validCount ? Math.round((done / validCount) * 100) : 0}%`, height: '100%', background: '#2d6a4f', borderRadius: 99, transition: 'width 0.2s' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Student form modal ────────────────────────────────────────────────────────

const BLANK_STUDENT = {
  // Basic
  photoUrl: '',
  lrn: '', studentNumber: '', surname: '', givenName: '', middleInitial: '', gender: 'Male',
  // SF1 Personal
  birthdate: '', motherTongue: '', ipGroup: '', religion: '',
  // SF1 Address
  houseStreet: '', barangay: '', municipality: '', province: '',
  // SF1 Parents
  fatherName: '', motherMaidenName: '',
  // SF1 Guardian
  guardianName: '', guardianRelationship: '', contactNumber: '',
};

function StudentModal({ sectionId, initial, onClose }) {
  const { addToast } = useToast();
  const [form,      setForm]      = useState({ ...BLANK_STUDENT, ...initial });
  const [tab,       setTab]       = useState('basic'); // 'basic' | 'sf1'
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoRef = useRef(null);
  const isEdit = !!initial?.id;

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      set('photoUrl', url);
    } catch (err) {
      addToast('Photo upload failed: ' + err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { ...form };
      delete data.id;
      if (isEdit) {
        await updateStudent(sectionId, initial.id, data);
        addToast('Student updated.', 'success');
      } else {
        await addStudent(sectionId, data);
        addToast('Student added.', 'success');
      }
      onClose();
    } catch (err) {
      addToast('Error: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const TAB_BTN = (key) => ({
    flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    borderRadius: 8, fontSize: 12, fontWeight: tab === key ? 700 : 500,
    background: tab === key ? '#1a3d2b' : 'transparent',
    color: tab === key ? '#fff' : '#4a6357',
    transition: 'background 0.12s, color 0.12s',
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1a3d2b, #2d6a4f)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{isEdit ? 'Edit Student' : 'Add Student'}</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <X size={14} />
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ padding: '10px 20px 0', background: '#f9fafb', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4, background: '#e5e7eb', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setTab('basic')} style={TAB_BTN('basic')}>Basic Info</button>
            <button onClick={() => setTab('sf1')} style={TAB_BTN('sf1')}>SF1 Details</button>
          </div>
          {tab === 'sf1' && (
            <p style={{ margin: '6px 0 0', fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
              These fields auto-fill SF1 (School Register). All optional.
            </p>
          )}
        </div>

        {/* Scrollable form body */}
        <form id="student-form" onSubmit={handleSave} style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

            {tab === 'basic' && (<>
              {/* Photo upload */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div
                  onClick={() => !uploading && photoRef.current?.click()}
                  style={{
                    width: 96, height: 96, borderRadius: 14, overflow: 'hidden',
                    border: '2.5px dashed rgba(45,106,79,0.35)', background: '#f5faf7',
                    cursor: uploading ? 'wait' : 'pointer', position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => { if (!uploading) e.currentTarget.style.borderColor = '#2d6a4f'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.35)'; }}
                >
                  {form.photoUrl ? (
                    <img src={thumbUrl(form.photoUrl, 192)} alt="student" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <Camera size={22} color="#9ca3af" />
                      <p style={{ margin: '4px 0 0', fontSize: 10, color: '#9ca3af' }}>Add Photo</p>
                    </div>
                  )}
                  {uploading && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>Uploading…</span>
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{form.photoUrl ? 'Click to change photo' : 'Optional — click to upload'}</span>
                <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>LRN (Learner Reference Number)</label>
                <input style={INPUT} type="number" value={form.lrn} onChange={e => set('lrn', e.target.value)} placeholder="123456789012" required />
              </div>
              <div>
                <label style={LABEL}>Student Number</label>
                <input style={INPUT} value={form.studentNumber} onChange={e => set('studentNumber', e.target.value)} placeholder="2024-001" required />
              </div>
              <div>
                <label style={LABEL}>Gender</label>
                <select style={INPUT} value={form.gender} onChange={e => set('gender', e.target.value)}>
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
              <div>
                <label style={LABEL}>Surname</label>
                <input style={INPUT} value={form.surname} onChange={e => set('surname', e.target.value)} placeholder="Dela Cruz" required />
              </div>
              <div>
                <label style={LABEL}>Given Name</label>
                <input style={INPUT} value={form.givenName} onChange={e => set('givenName', e.target.value)} placeholder="Juan" required />
              </div>
              <div>
                <label style={LABEL}>Middle Initial</label>
                <input style={INPUT} maxLength={2} value={form.middleInitial} onChange={e => set('middleInitial', e.target.value)} placeholder="R." />
              </div>
            </>)}

            {tab === 'sf1' && (<>
              {/* Personal */}
              <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 800, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1px', paddingBottom: 4, borderBottom: '1px solid rgba(45,106,79,0.1)' }}>
                Personal Information
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Birthdate</label>
                <input style={INPUT} type="date" value={form.birthdate} onChange={e => set('birthdate', e.target.value)} />
              </div>
              <div>
                <label style={LABEL}>Mother Tongue</label>
                <input style={INPUT} value={form.motherTongue} onChange={e => set('motherTongue', e.target.value)} placeholder="e.g. Waray" />
              </div>
              <div>
                <label style={LABEL}>Religion</label>
                <input style={INPUT} value={form.religion} onChange={e => set('religion', e.target.value)} placeholder="e.g. Roman Catholic" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>IP / Ethnic Group <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(leave blank if not applicable)</span></label>
                <input style={INPUT} value={form.ipGroup} onChange={e => set('ipGroup', e.target.value)} placeholder="e.g. Waray-Waray" />
              </div>

              {/* Address */}
              <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 800, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1px', paddingBottom: 4, borderBottom: '1px solid rgba(45,106,79,0.1)', marginTop: 6 }}>
                Address
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>House #, Street, Sitio / Purok</label>
                <input style={INPUT} value={form.houseStreet} onChange={e => set('houseStreet', e.target.value)} placeholder="e.g. 123 Rizal St., Purok 3" />
              </div>
              <div>
                <label style={LABEL}>Barangay</label>
                <input style={INPUT} value={form.barangay} onChange={e => set('barangay', e.target.value)} placeholder="e.g. Brgy. San Roque" />
              </div>
              <div>
                <label style={LABEL}>Municipality / City</label>
                <input style={INPUT} value={form.municipality} onChange={e => set('municipality', e.target.value)} placeholder="e.g. Borongan City" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Province</label>
                <input style={INPUT} value={form.province} onChange={e => set('province', e.target.value)} placeholder="e.g. Eastern Samar" />
              </div>

              {/* Parents */}
              <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 800, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1px', paddingBottom: 4, borderBottom: '1px solid rgba(45,106,79,0.1)', marginTop: 6 }}>
                Parents
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Father's Name <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(Last, First, Middle)</span></label>
                <input style={INPUT} value={form.fatherName} onChange={e => set('fatherName', e.target.value)} placeholder="e.g. Dela Cruz, Jose, R." />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Mother's Maiden Name <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(Last, First, Middle)</span></label>
                <input style={INPUT} value={form.motherMaidenName} onChange={e => set('motherMaidenName', e.target.value)} placeholder="e.g. Santos, Maria, C." />
              </div>

              {/* Guardian */}
              <div style={{ gridColumn: '1 / -1', fontSize: 10, fontWeight: 800, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1px', paddingBottom: 4, borderBottom: '1px solid rgba(45,106,79,0.1)', marginTop: 6 }}>
                Guardian <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10, letterSpacing: 0 }}>(if not parent)</span>
              </div>
              <div>
                <label style={LABEL}>Guardian Name</label>
                <input style={INPUT} value={form.guardianName} onChange={e => set('guardianName', e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label style={LABEL}>Relationship</label>
                <input style={INPUT} value={form.guardianRelationship} onChange={e => set('guardianRelationship', e.target.value)} placeholder="e.g. Aunt" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Contact Number</label>
                <input style={INPUT} value={form.contactNumber} onChange={e => set('contactNumber', e.target.value)} placeholder="e.g. 09XXXXXXXXX" />
              </div>
            </>)}
          </div>
        </form>

        {/* Footer buttons */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(45,106,79,0.08)', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ ...BTN_GHOST, flex: 1, justifyContent: 'center', padding: '10px' }}>Cancel</button>
          <button form="student-form" type="submit" disabled={saving} style={{ ...BTN_PRIMARY, flex: 1, justifyContent: 'center', padding: '10px', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : (isEdit ? 'Update' : 'Add Student')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({ sectionId, section, subject, onClose }) {
  const { user }     = useAuth();
  const { addToast } = useToast();
  const [invite, setInvite]     = useState(null);
  const [generating, setGen]    = useState(false);
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    const unsub = subscribeSubjectInvitation(sectionId, subject, setInvite);
    return unsub;
  }, [sectionId, subject]);

  async function handleGenerate() {
    setGen(true);
    try {
      await createInvitation(user.uid, {
        sectionId,
        sectionName: section.sectionName,
        gradeLevel: section.gradeLevel,
        subject,
      });
    } catch (err) {
      addToast('Error: ' + err.message, 'error');
    } finally {
      setGen(false);
    }
  }

  async function handleCopy() {
    if (!invite?.inviteLink) return;
    await navigator.clipboard.writeText(invite.inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isAccepted = invite?.status === 'accepted';

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 460, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1a3d2b, #2d6a4f)', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px' }}>Subject Invitation</p>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>{subject}</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: 22 }}>
          {/* Status */}
          <div style={{
            background: isAccepted ? '#d8f3dc' : '#f3f4f6',
            borderRadius: 10, padding: '12px 16px', marginBottom: 18,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {isAccepted ? (
              <>
                <Check size={16} color="#2d6a4f" />
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#2d6a4f' }}>Accepted</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#1a3d2b' }}>{invite.teacherName}</p>
                </div>
              </>
            ) : (
              <>
                <Users size={16} color="#6b7280" />
                <p style={{ margin: 0, fontSize: 13, color: '#4a6357' }}>
                  {invite ? 'Pending — no teacher has accepted yet.' : 'No teacher assigned yet.'}
                </p>
              </>
            )}
          </div>

          {/* Link display */}
          {invite && (
            <div style={{ marginBottom: 16 }}>
              <label style={LABEL}>Invitation Link</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, background: '#f5faf7', border: '1px solid rgba(45,106,79,0.15)', borderRadius: 9, padding: '9px 12px', fontSize: 12, color: '#4a6357', fontFamily: '"DM Mono", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {invite.inviteLink}
                </div>
                <button onClick={handleCopy} style={{ ...BTN_GHOST, padding: '9px 12px', gap: 5 }}>
                  {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {isAccepted ? (
              <button
                disabled
                style={{
                  flex: 1, background: '#f3f4f6', color: '#9ca3af',
                  border: '1.5px dashed #d1d5db', borderRadius: 10, padding: '11px',
                  fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  fontFamily: 'inherit',
                }}
              >
                <Check size={14} /> Link Disabled — Teacher Assigned
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{ ...BTN_PRIMARY, flex: 1, justifyContent: 'center', padding: '10px', opacity: generating ? 0.7 : 1 }}
              >
                {generating ? 'Generating…' : invite
                  ? <><RefreshCw size={13} /> Regenerate Link</>
                  : <><Link size={13} /> Generate Invitation Link</>
                }
              </button>
            )}
          </div>
          {invite && !isAccepted && (
            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
              Generating a new link will invalidate the previous one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'roster',   label: 'Student Roster',        Icon: Users          },
  { key: 'subjects', label: 'Subjects',              Icon: BookOpen       },
  { key: 'grading',  label: 'Consolidated Grading', Icon: BarChart2      },
  { key: 'tempcard', label: 'Report Card',           Icon: ClipboardList  },
  { key: 'forms',    label: 'School Forms',          Icon: FileText       },
];

export default function SectionDetailPage() {
  const { sectionId }  = useParams();
  const { user }       = useAuth();
  const { addToast }   = useToast();
  const navigate       = useNavigate();

  const [section,  setSection]  = useState(null);
  const [students, setStudents] = useState([]);
  const [activeTab, setActiveTab] = useState('roster');
  const [loadingSec, setLoadingSec] = useState(true);

  // Student modal
  const [studentModal,  setStudentModal]  = useState(null); // null | {} (blank) | student doc
  const [csvModal,      setCsvModal]      = useState(false);

  // Subjects tab
  const [newSubject, setNewSubject] = useState('');
  const [addingSubj, setAddingSubj] = useState(false);

  // Grading sheet tab — grades keyed by term → subject → studentId
  const [allGrades, setAllGrades] = useState({ term1: {}, term2: {}, term3: {} });
  const [activeGradeTerm, setActiveGradeTerm] = useState('term1');

  // Invite modal
  const [inviteSubject, setInviteSubject] = useState(null);

  useEffect(() => {
    const unsub = subscribeSection(sectionId, d => { setSection(d); setLoadingSec(false); });
    return unsub;
  }, [sectionId]);

  useEffect(() => {
    const unsub = subscribeStudents(sectionId, setStudents);
    return unsub;
  }, [sectionId]);

  // Subscribe to grades for all subjects × all 3 terms when grading tab is active
  useEffect(() => {
    if (activeTab !== 'grading' || !section) return;
    const subjects = gradingSubjects(section.subjects, section.specialSubjects);
    const unsubs = [];
    ['term1', 'term2', 'term3'].forEach(term => {
      subjects.forEach(subj =>
        unsubs.push(
          subscribeSubjectGrades(sectionId, subj, gradeMap =>
            setAllGrades(prev => ({
              ...prev,
              [term]: { ...prev[term], [subj]: gradeMap },
            })),
            term,
          )
        )
      );
    });
    return () => unsubs.forEach(fn => fn());
  }, [activeTab, sectionId, section?.subjects?.length, section?.specialSubjects?.length]);

  async function handleAddSpecialSubject() {
    const name = newSubject.trim();
    if (!name || !section) return;
    if ([...(section.subjects || []), ...(section.specialSubjects || [])].includes(name)) {
      addToast('Subject already exists.', 'warning'); return;
    }
    setAddingSubj(true);
    try {
      await addSpecialSubject(sectionId, name, section.specialSubjects || []);
      setNewSubject('');
    } catch (err) {
      addToast('Error: ' + err.message, 'error');
    } finally {
      setAddingSubj(false);
    }
  }

  async function handleRemoveSpecialSubject(subj) {
    try {
      await removeSpecialSubject(sectionId, subj, section.specialSubjects || []);
    } catch (err) {
      addToast('Error: ' + err.message, 'error');
    }
  }

  async function handleRemoveStudent(id) {
    if (!confirm('Remove this student from the roster?')) return;
    try {
      await removeStudent(sectionId, id);
      addToast('Student removed.', 'success');
    } catch (err) {
      addToast('Error: ' + err.message, 'error');
    }
  }

  if (loadingSec) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#4a6357', fontSize: 14 }}>Loading…</div>;
  }
  if (!section) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#e05c5c', fontSize: 14 }}>Section not found.</div>;
  }

  const allSubjects  = [...(section.subjects || []), ...(section.specialSubjects || [])];
  const gradingSubjs = gradingSubjects(section.subjects, section.specialSubjects);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Back + header */}
      <button onClick={() => navigate('/classroom-management')} style={{ ...BTN_GHOST, marginBottom: 16 }}>
        <ArrowLeft size={14} /> Classroom Management
      </button>

      <div style={{
        background: 'linear-gradient(135deg, #0d2218, #1a3d2b, #2d6a4f)',
        borderRadius: 16, padding: '24px 28px', marginBottom: 24,
      }}>
        <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          SY {section.academicYear}
        </p>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: '#fff' }}>
          {section.gradeLevel} – {section.sectionName}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
          {students.length} student{students.length !== 1 ? 's' : ''} · {allSubjects.length} subjects
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 22, background: '#fff', borderRadius: 12, padding: 4, border: '1px solid rgba(45,106,79,0.12)', width: 'fit-content' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: activeTab === key ? 700 : 500,
              fontFamily: 'inherit',
              background: activeTab === key ? '#d8f3dc' : 'transparent',
              color: activeTab === key ? '#1a3d2b' : '#4a6357',
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Student Roster ── */}
      {activeTab === 'roster' && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(45,106,79,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0d2218' }}>
              Student Roster <span style={{ fontSize: 12, fontWeight: 500, color: '#4a6357', marginLeft: 6 }}>({students.length})</span>
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setCsvModal(true)}
                style={{ ...BTN_GHOST, gap: 6 }}
              >
                <Upload size={13} /> Upload CSV
              </button>
              <button onClick={() => setStudentModal({})} style={BTN_PRIMARY}>
                <Plus size={13} /> Add Student
              </button>
            </div>
          </div>
          {students.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: '#4a6357', fontSize: 14 }}>
              No students enrolled yet. Click "Add Student" to begin.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5faf7' }}>
                    {['', 'No.', 'Surname', 'Given Name', 'M.I.', 'Gender', 'LRN', 'Student No.', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} style={{ borderTop: '1px solid rgba(45,106,79,0.07)' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fffe'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '6px 10px 6px 14px' }}>
                        {s.photoUrl ? (
                          <img
                            src={thumbUrl(s.photoUrl, 72)}
                            alt=""
                            style={{ width: 36, height: 36, borderRadius: 7, objectFit: 'cover', display: 'block', border: '1.5px solid rgba(45,106,79,0.2)' }}
                          />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 7, background: '#e5f0ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#2d6a4f' }}>
                            {(s.givenName?.[0] || '') + (s.surname?.[0] || '')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#6b7280' }}>{i + 1}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0d2218' }}>{s.surname}</td>
                      <td style={{ padding: '10px 14px', color: '#0d2218' }}>{s.givenName}</td>
                      <td style={{ padding: '10px 14px', color: '#4a6357' }}>{s.middleInitial || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px', background: s.gender === 'Male' ? 'rgba(59,130,246,0.1)' : 'rgba(236,72,153,0.1)', color: s.gender === 'Male' ? '#1d4ed8' : '#be185d' }}>
                          {s.gender}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#4a6357' }}>{s.lrn}</td>
                      <td style={{ padding: '10px 14px', color: '#4a6357' }}>{s.studentNumber}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setStudentModal(s)} style={{ background: '#f5faf7', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', color: '#4a6357', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <Pencil size={12} /> Edit
                          </button>
                          <button onClick={() => handleRemoveStudent(s.id)} style={{ background: '#fde8e8', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', color: '#e05c5c', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <Trash2 size={12} /> Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Subjects ── */}
      {activeTab === 'subjects' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Default subjects */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(45,106,79,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={15} color="#2d6a4f" />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0d2218' }}>Default DepEd Subjects</h3>
              <span style={{ fontSize: 11, color: '#4a6357', fontStyle: 'italic' }}>— cannot be removed</span>
            </div>
            <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(section.subjects || []).map(subj => (
                <span key={subj} style={{ background: '#d8f3dc', color: '#1a3d2b', borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 600 }}>
                  {subj}
                </span>
              ))}
            </div>
          </div>

          {/* Special subjects */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(45,106,79,0.08)' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0d2218' }}>Special Subjects</h3>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  style={{ ...INPUT, flex: 1 }}
                  placeholder="Add a subject (e.g. Research, Journalism)"
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddSpecialSubject())}
                />
                <button onClick={handleAddSpecialSubject} disabled={!newSubject.trim() || addingSubj} style={{ ...BTN_PRIMARY, opacity: !newSubject.trim() || addingSubj ? 0.6 : 1 }}>
                  <Plus size={14} /> Add
                </button>
              </div>
              {(section.specialSubjects || []).length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>No special subjects added yet.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(section.specialSubjects || []).map(subj => (
                    <span key={subj} style={{ background: 'rgba(232,163,32,0.12)', color: '#92400e', borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {subj}
                      <button onClick={() => handleRemoveSpecialSubject(subj)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#92400e', display: 'flex', alignItems: 'center' }}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Consolidated Grading ── */}
      {activeTab === 'grading' && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(45,106,79,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0d2218' }}>Consolidated Grading Sheet</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4a6357' }}>Click a subject column header to manage the assigned teacher.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Term pill switcher */}
              <div style={{ display: 'flex', gap: 3, background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
                {[
                  { key: 'term1', label: 'Term 1' },
                  { key: 'term2', label: 'Term 2' },
                  { key: 'term3', label: 'Term 3' },
                ].map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveGradeTerm(t.key)}
                    style={{
                      padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: activeGradeTerm === t.key ? 700 : 500,
                      fontFamily: 'inherit',
                      background: activeGradeTerm === t.key ? '#1a3d2b' : 'transparent',
                      color: activeGradeTerm === t.key ? '#fff' : '#6b7280',
                      transition: 'background 0.12s, color 0.12s',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => exportGradingExcel(section, students, gradingSubjs, allGrades)}
                disabled={students.length === 0}
                style={{ ...BTN_PRIMARY, opacity: students.length === 0 ? 0.5 : 1 }}
              >
                <Download size={13} /> Download Excel
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5faf7' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap', minWidth: 120 }}>Surname</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap', minWidth: 110 }}>Given Name</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', width: 48 }}>M.I.</th>
                  {gradingSubjs.map(subj => (
                    <th
                      key={subj}
                      onClick={() => setInviteSubject(subj)}
                      title={`Click to manage teacher for ${subj}`}
                      style={{
                        padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#1a3d2b',
                        textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center',
                        whiteSpace: 'nowrap', cursor: 'pointer', minWidth: 66,
                        borderLeft: '1px solid rgba(45,106,79,0.1)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#d8f3dc'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                    >
                      {SUBJ_ABBR[subj] || subj}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={3 + gradingSubjs.length} style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', fontSize: 13 }}>
                      No students enrolled yet.
                    </td>
                  </tr>
                ) : students.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid rgba(45,106,79,0.07)' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fffe'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: '#0d2218' }}>{s.surname}</td>
                    <td style={{ padding: '9px 14px', color: '#0d2218' }}>{s.givenName}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center', color: '#4a6357' }}>{s.middleInitial || '—'}</td>
                    {gradingSubjs.map(subj => {
                      const grade = allGrades[activeGradeTerm]?.[subj]?.[s.id]?.finalGrade;
                      return (
                        <td key={subj} style={{ padding: '9px 12px', textAlign: 'center', borderLeft: '1px solid rgba(45,106,79,0.07)', fontFamily: '"DM Mono", monospace', fontSize: 12, fontWeight: grade ? 700 : 400, color: grade ? '#1a3d2b' : '#9ca3af' }}>
                          {grade !== undefined ? grade : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Excel-style sheet tabs at bottom of grading card */}
          <div style={{
            background: '#e5e7eb', borderTop: '1px solid #d1d5db',
            display: 'flex', alignItems: 'flex-end', padding: '0 0 0 12px', height: 40,
          }}>
            {[
              { key: 'term1', label: 'Term 1' },
              { key: 'term2', label: 'Term 2' },
              { key: 'term3', label: 'Term 3' },
            ].map(t => {
              const isActive = activeGradeTerm === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveGradeTerm(t.key)}
                  style={{
                    padding: '0 18px',
                    height: isActive ? 36 : 30,
                    alignSelf: 'flex-end',
                    background: isActive ? '#fff' : '#d1d5db',
                    color: isActive ? '#1a3d2b' : '#6b7280',
                    border: '1px solid #c4c4c4',
                    borderBottom: isActive ? '1px solid #fff' : '1px solid #c4c4c4',
                    borderRadius: '5px 5px 0 0',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    marginRight: 2,
                    transition: 'background 0.1s, color 0.1s, height 0.1s',
                    boxShadow: isActive ? '0 -2px 5px rgba(0,0,0,0.05)' : 'none',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tab: Temporary Report Card ── */}
      {activeTab === 'tempcard' && (
        <TempReportCardPanel
          section={{ ...section, id: sectionId }}
          students={students}
          user={user}
        />
      )}

      {/* ── Tab: School Forms ── */}
      {activeTab === 'forms' && (
        <SchoolFormsPanel
          section={{ ...section, id: sectionId }}
          students={students}
          user={user}
        />
      )}

      {/* Modals */}
      {csvModal && (
        <CsvUploadModal
          sectionId={sectionId}
          onClose={() => setCsvModal(false)}
        />
      )}
      {studentModal !== null && (
        <StudentModal
          sectionId={sectionId}
          initial={studentModal}
          onClose={() => setStudentModal(null)}
        />
      )}
      {inviteSubject && (
        <InviteModal
          sectionId={sectionId}
          section={section}
          subject={inviteSubject}
          onClose={() => setInviteSubject(null)}
        />
      )}
    </div>
  );
}
