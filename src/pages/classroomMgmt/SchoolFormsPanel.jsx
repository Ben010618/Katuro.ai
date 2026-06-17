import { useState, useEffect } from 'react';
import {
  FileText, Settings, Save, ChevronDown, ChevronUp,
  CheckCircle2, Clock, X,
} from 'lucide-react';
import { subscribeSchoolProfile, saveSchoolProfile } from '../../services/schoolFormsDb';
import SF1Form  from './forms/SF1Form';
import SF5Form  from './forms/SF5Form';
import SFComingSoon from './forms/SFComingSoon';

// ── Styles ────────────────────────────────────────────────────────────────────

const INPUT = {
  width: '100%', padding: '8px 11px', borderRadius: 9, fontSize: 13,
  border: '1px solid rgba(45,106,79,0.2)', background: '#f5faf7',
  color: '#0d2218', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};
const LABEL = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#4a6357',
  textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4,
};

// ── Form catalogue ────────────────────────────────────────────────────────────

const FORMS = [
  {
    id: 1, key: 'sf1',
    title: 'School Register',
    desc: 'Master list of enrolled learners with personal, address, and parent info.',
    status: 'ready',
    source: 'Student Roster',
  },
  {
    id: 2, key: 'sf2',
    title: 'Daily Attendance Report',
    desc: 'Monthly attendance tracker per learner (Absent / Tardy per school day).',
    status: 'coming',
    source: 'Attendance Records',
  },
  {
    id: 3, key: 'sf3',
    title: 'Books Issued and Returned',
    desc: 'Textbook issuance and return tracking per subject per learner.',
    status: 'coming',
    source: 'Book Records (manual)',
  },
  {
    id: 4, key: 'sf4',
    title: "Monthly Learner's Movement",
    desc: 'School-level monthly attendance roll-up from SF2 summaries.',
    status: 'coming',
    source: 'SF2 Summaries',
  },
  {
    id: 5, key: 'sf5',
    title: 'Report on Promotion',
    desc: 'End-of-year promotion status and level of proficiency per learner.',
    status: 'ready',
    source: 'Consolidated Grades',
  },
  {
    id: 6, key: 'sf6',
    title: 'Summarized Promotion Report',
    desc: 'School-level aggregate of all SF5 forms across grade levels.',
    status: 'coming',
    source: 'All SF5 Forms',
  },
  {
    id: 7, key: 'sf7',
    title: 'Personnel Assignment List',
    desc: 'Teacher roster with qualifications, assignments, and daily schedule.',
    status: 'coming',
    source: 'Teacher Profiles',
  },
  {
    id: 8, key: 'sf8',
    title: 'Health & Nutrition Report',
    desc: 'Per-learner BMI tracking with WHO BMI-for-Age classification.',
    status: 'coming',
    source: 'Height / Weight Input',
  },
  {
    id: 9, key: 'sf9',
    title: 'Learner\'s Progress Report Card',
    desc: 'Quarterly report card with subjects, MAPEH, Core Values, and attendance.',
    status: 'coming',
    source: 'Quarterly Grades',
  },
  {
    id: 10, key: 'sf10',
    title: 'Permanent Academic Record',
    desc: 'Cumulative academic record across Grade 7–10 (replaces Form 137).',
    status: 'coming',
    source: 'Multi-Year SF9 Data',
  },
];

// ── School Profile Editor ─────────────────────────────────────────────────────

function SchoolProfileEditor({ uid, profile, onSaved }) {
  const [open,   setOpen]   = useState(!profile?.schoolName);
  const [form,   setForm]   = useState(profile || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(profile || {}); }, [profile]);

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSchoolProfile(uid, form);
      setOpen(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  const filled = !!(profile?.schoolName && profile?.schoolId);

  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.15)',
      overflow: 'hidden', marginBottom: 24,
    }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center',
          gap: 10, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          borderBottom: open ? '1px solid rgba(45,106,79,0.1)' : 'none',
        }}
      >
        <Settings size={15} color={filled ? '#2d6a4f' : '#d97706'} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0d2218' }}>School Profile</p>
          <p style={{ margin: 0, fontSize: 11, color: '#6b7280', marginTop: 1 }}>
            {filled
              ? `${profile.schoolName} · ${profile.region || ''} · ${profile.division || ''}`
              : 'Required for all forms — click to configure'}
          </p>
        </div>
        {filled
          ? <CheckCircle2 size={15} color="#16a34a" />
          : <span style={{ fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '2px 8px' }}>Required</span>
        }
        {open ? <ChevronUp size={15} color="#4a6357" /> : <ChevronDown size={15} color="#4a6357" />}
      </button>

      {open && (
        <form onSubmit={handleSave} style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>School Name</label>
            <input style={INPUT} value={form.schoolName || ''} onChange={e => set('schoolName', e.target.value)} placeholder="e.g. Borongan National High School" required />
          </div>
          <div>
            <label style={LABEL}>School ID</label>
            <input style={INPUT} value={form.schoolId || ''} onChange={e => set('schoolId', e.target.value)} placeholder="e.g. 303403" required />
          </div>
          <div>
            <label style={LABEL}>Region</label>
            <input style={INPUT} value={form.region || ''} onChange={e => set('region', e.target.value)} placeholder="e.g. Region VIII" />
          </div>
          <div>
            <label style={LABEL}>Division</label>
            <input style={INPUT} value={form.division || ''} onChange={e => set('division', e.target.value)} placeholder="e.g. Division of Eastern Samar" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={LABEL}>District</label>
            <input style={INPUT} value={form.district || ''} onChange={e => set('district', e.target.value)} placeholder="e.g. Borongan City" />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#2d6a4f', color: '#fff', border: 'none',
                borderRadius: 9, padding: '8px 18px', fontSize: 13,
                fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                opacity: saving ? 0.7 : 1,
              }}
            >
              <Save size={13} /> {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Form card ─────────────────────────────────────────────────────────────────

function FormCard({ form, onClick }) {
  const ready = form.status === 'ready';

  return (
    <button
      onClick={onClick}
      style={{
        background: '#fff', border: `1.5px solid ${ready ? 'rgba(45,106,79,0.25)' : 'rgba(0,0,0,0.08)'}`,
        borderRadius: 14, padding: '16px 16px 14px', textAlign: 'left',
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'box-shadow 0.15s, transform 0.12s, border-color 0.15s',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = ready
          ? '0 4px 18px rgba(45,106,79,0.18)'
          : '0 4px 12px rgba(0,0,0,0.1)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        if (ready) e.currentTarget.style.borderColor = 'rgba(45,106,79,0.5)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = '';
        e.currentTarget.style.borderColor = ready ? 'rgba(45,106,79,0.25)' : 'rgba(0,0,0,0.08)';
      }}
    >
      {/* Number + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: ready ? '#2d6a4f' : '#9ca3af',
          background: ready ? 'rgba(45,106,79,0.1)' : '#f3f4f6',
          borderRadius: 6, padding: '2px 8px',
        }}>
          SF{form.id}
        </span>
        {ready
          ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#16a34a' }}>
              <CheckCircle2 size={12} /> Ready
            </span>
          : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#9ca3af' }}>
              <Clock size={12} /> Coming Soon
            </span>
        }
      </div>

      {/* Title */}
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0d2218', lineHeight: 1.3 }}>
        {form.title}
      </p>

      {/* Description */}
      <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
        {form.desc}
      </p>

      {/* Source tag */}
      <div style={{
        marginTop: 2, fontSize: 10, fontWeight: 600,
        color: ready ? '#2d6a4f' : '#9ca3af',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <FileText size={10} />
        {form.source}
      </div>
    </button>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SchoolFormsPanel({ section, students, user }) {
  const [profile,     setProfile]     = useState({});
  const [openForm,    setOpenForm]    = useState(null); // null | number

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeSchoolProfile(user.uid, setProfile);
    return unsub;
  }, [user?.uid]);

  const allSubjects = [
    ...((section?.subjects) || []),
    ...((section?.specialSubjects) || []),
  ];

  function handleFormClick(formId) {
    setOpenForm(formId);
  }

  function closeForm() { setOpenForm(null); }

  return (
    <div>
      {/* School Profile */}
      <SchoolProfileEditor
        uid={user?.uid}
        profile={profile}
        onSaved={() => {}}
      />

      {/* Form grid */}
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#0d2218' }}>
          DepEd School Forms
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>
          Forms are auto-filled from your class data and downloadable as PDF or Excel in official DepEd formatting.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {FORMS.map(form => (
          <FormCard
            key={form.id}
            form={form}
            onClick={() => handleFormClick(form.id)}
          />
        ))}
      </div>

      {/* Render active form */}
      {openForm === 1 && (
        <SF1Form
          section={section}
          students={students}
          schoolProfile={profile}
          onClose={closeForm}
        />
      )}
      {openForm === 5 && (
        <SF5Form
          section={section}
          students={students}
          allSubjects={allSubjects}
          schoolProfile={profile}
          onClose={closeForm}
        />
      )}
      {[2, 3, 4, 6, 7, 8, 9, 10].includes(openForm) && (
        <SFComingSoon
          formNumber={openForm}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
