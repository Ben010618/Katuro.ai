import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import {
  createSection, subscribeAdviserSections, GRADE_LEVELS,
} from '../../services/classroomDb';
import { Plus, School, ChevronRight, Users, BookOpen } from 'lucide-react';

const INPUT = {
  width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14,
  border: '1px solid rgba(45,106,79,0.2)', background: '#f5faf7',
  color: '#0d2218', fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
};
const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#4a6357',
  textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6,
};

function CreateClassModal({ onClose, onCreated }) {
  const { user }      = useAuth();
  const { addToast }  = useToast();
  const [form, setForm] = useState({ academicYear: '2025-2026', gradeLevel: 'Grade 7', sectionName: '' });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.sectionName.trim()) return;
    setSaving(true);
    try {
      const id = await createSection(user.uid, form);
      addToast('Class created!', 'success');
      onCreated(id);
    } catch (err) {
      addToast('Failed to create class: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }}>
        {/* Modal header */}
        <div style={{ background: 'linear-gradient(135deg, #1a3d2b, #2d6a4f)', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <School size={18} color="#d8f3dc" />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Create a Class</span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            Set up a new section for your class.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LABEL}>Academic Year</label>
            <input style={INPUT} value={form.academicYear} onChange={e => set('academicYear', e.target.value)} placeholder="e.g. 2025-2026" required />
          </div>
          <div>
            <label style={LABEL}>Grade Level</label>
            <select style={INPUT} value={form.gradeLevel} onChange={e => set('gradeLevel', e.target.value)}>
              {GRADE_LEVELS.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Section Name</label>
            <input style={INPUT} value={form.sectionName} onChange={e => set('sectionName', e.target.value)} placeholder="e.g. Mahogany" required />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: '#f5faf7', color: '#4a6357', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ flex: 1, background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating…' : 'Create Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClassroomManagementPage() {
  const { user }       = useAuth();
  const navigate       = useNavigate();
  const [sections, setSections]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeAdviserSections(user.uid, (docs) => {
      setSections(docs);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #0d2218 0%, #1a3d2b 50%, #2d6a4f 100%)',
        borderRadius: 16, padding: '28px 32px', marginBottom: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <School size={22} color="#52b788" />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>Classroom Management</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            Create and manage your class sections, rosters, and grading.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: '#52b788', color: '#0d2218', border: 'none',
            borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Plus size={15} /> Create a Class
        </button>
      </div>

      {/* Sections list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#4a6357', fontSize: 14 }}>Loading…</div>
      ) : sections.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)',
          padding: '56px 32px', textAlign: 'center',
        }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: '#d8f3dc', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <School size={28} color="#2d6a4f" />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600, color: '#0d2218' }}>No classes yet</h3>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: '#4a6357' }}>Click "Create a Class" to set up your first section.</p>
          <button
            onClick={() => setShowModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Plus size={14} /> Create a Class
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {sections.map(sec => (
            <div
              key={sec.id}
              onClick={() => navigate(`/classroom-management/section/${sec.id}`)}
              style={{
                background: '#fff', borderRadius: 14,
                border: '1px solid rgba(45,106,79,0.12)',
                padding: '20px 22px', cursor: 'pointer',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.35)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.12)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#d8f3dc', display: 'grid', placeItems: 'center' }}>
                  <School size={20} color="#2d6a4f" />
                </div>
                <ChevronRight size={16} color="#4a6357" />
              </div>

              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#0d2218' }}>
                {sec.gradeLevel} – {sec.sectionName}
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: '#4a6357' }}>SY {sec.academicYear}</p>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4a6357' }}>
                  <BookOpen size={12} color="#52b788" />
                  {(sec.subjects?.length || 0) + (sec.specialSubjects?.length || 0)} subjects
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4a6357' }}>
                  <Users size={12} color="#52b788" />
                  Adviser
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CreateClassModal
          onClose={() => setShowModal(false)}
          onCreated={id => { setShowModal(false); navigate(`/classroom-management/section/${id}`); }}
        />
      )}
    </div>
  );
}
