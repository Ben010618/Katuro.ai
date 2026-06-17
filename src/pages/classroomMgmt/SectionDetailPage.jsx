import { useState, useEffect } from 'react';
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
  Users, BookOpen, BarChart2, Shield, RefreshCw, FileText,
} from 'lucide-react';
import SchoolFormsPanel from './SchoolFormsPanel';

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

// ── Student form modal ────────────────────────────────────────────────────────

const BLANK_STUDENT = {
  // Basic
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
  const isEdit = !!initial?.id;

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

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
  { key: 'roster',   label: 'Student Roster',        Icon: Users       },
  { key: 'subjects', label: 'Subjects',              Icon: BookOpen    },
  { key: 'grading',  label: 'Consolidated Grading', Icon: BarChart2   },
  { key: 'forms',    label: 'School Forms',          Icon: FileText    },
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
  const [studentModal, setStudentModal] = useState(null); // null | {} (blank) | student doc

  // Subjects tab
  const [newSubject, setNewSubject] = useState('');
  const [addingSubj, setAddingSubj] = useState(false);

  // Grading sheet tab — grades keyed by subject name
  const [allGrades, setAllGrades] = useState({});
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

  // Reset grade map when term changes so stale data doesn't bleed over
  useEffect(() => {
    setAllGrades({});
  }, [activeGradeTerm]);

  // Subscribe to grades for ALL subjects when grading tab is active
  useEffect(() => {
    if (activeTab !== 'grading' || !section) return;
    const allSubjects = [...(section.subjects || []), ...(section.specialSubjects || [])];
    const unsubs = allSubjects.map(subj =>
      subscribeSubjectGrades(sectionId, subj, gradeMap =>
        setAllGrades(prev => ({ ...prev, [subj]: gradeMap })),
        activeGradeTerm,
      )
    );
    return () => unsubs.forEach(fn => fn());
  }, [activeTab, sectionId, section?.subjects?.length, section?.specialSubjects?.length, activeGradeTerm]);

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

  const allSubjects = [...(section.subjects || []), ...(section.specialSubjects || [])];

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
            <button onClick={() => setStudentModal({})} style={BTN_PRIMARY}>
              <Plus size={13} /> Add Student
            </button>
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
                    {['No.', 'Surname', 'Given Name', 'M.I.', 'Gender', 'LRN', 'Student No.', 'Actions'].map(h => (
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
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5faf7' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap', minWidth: 120 }}>Surname</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap', minWidth: 110 }}>Given Name</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px', width: 48 }}>M.I.</th>
                  {allSubjects.map(subj => (
                    <th
                      key={subj}
                      onClick={() => setInviteSubject(subj)}
                      title={`Click to manage teacher for ${subj}`}
                      style={{
                        padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#1a3d2b',
                        textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center',
                        whiteSpace: 'nowrap', cursor: 'pointer', minWidth: 90,
                        borderLeft: '1px solid rgba(45,106,79,0.1)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#d8f3dc'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                    >
                      {subj}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={3 + allSubjects.length} style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', fontSize: 13 }}>
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
                    {allSubjects.map(subj => {
                      const grade = allGrades[subj]?.[s.id]?.finalGrade;
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

      {/* ── Tab: School Forms ── */}
      {activeTab === 'forms' && (
        <SchoolFormsPanel
          section={{ ...section, id: sectionId }}
          students={students}
          user={user}
        />
      )}

      {/* Modals */}
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
