import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLessonPlans } from '../hooks/useLessonPlans';
import { updateTeacherProfile, listActionResearch, deleteActionResearch } from '../services/db';
import { useToast } from '../context/ToastContext';
import img1 from '../assets/1.png';
import img2 from '../assets/2.png';
import img3 from '../assets/3.png';
import img4 from '../assets/4.png';

const SLIDE_IMGS = [img1, img2, img3, img4];
import {
  Sparkles, BookOpen, ClipboardList,
  ArrowRight, Plus, Save, CheckCircle, User,
  FlaskConical, Trash2, School, GraduationCap,
} from 'lucide-react';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const STATUS_COLORS = {
  published: { bg: '#d8f3dc', color: '#1a3d2b', label: 'Published' },
  draft:     { bg: 'rgba(232,163,32,0.12)', color: '#b47a10', label: 'Draft' },
  archived:  { bg: '#f0f0f0', color: '#5a6a60', label: 'Archived' },
};

const SUBJECT_COLORS = ['#d8f3dc', '#dbeafe', 'rgba(232,163,32,0.15)', '#fce7f3', '#e0e7ff'];
function subjectColor(s) {
  let hash = 0;
  for (const c of s) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffff;
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

function formatDateRange(days) {
  if (!days?.length) return '—';
  const fmt = iso => {
    try { return new Date(iso + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch { return iso; }
  };
  const sorted = [...days].sort();
  const year   = sorted[0]?.split('-')[0] || '';
  return `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1])}, ${year}`;
}

function normalizeLesson(doc) {
  return {
    id:       doc.id,
    title:    doc.lessonName  || doc.title   || 'Untitled',
    subject:  doc.subject     || '—',
    grade:    doc.gradeLevel  || doc.grade   || '—',
    quarter:  doc.term        || doc.quarter || '—',
    week:     doc.weekNumber  || doc.week    || '—',
    dates:    doc.selectedDays ? formatDateRange(doc.selectedDays) : (doc.dates || '—'),
    status:   doc.status      || 'published',
    sessions: Array.isArray(doc.sessions) ? doc.sessions.length : (doc.sessions || 0),
  };
}

/* ── Action Research helpers ─────────────────────────────────────────────── */

const THEME_META = {
  'teaching-learning': { label: 'Teaching & Learning', color: '#2d6a4f', bg: '#d8f3dc' },
  'child-protection':  { label: 'Child Protection',    color: '#be185d', bg: '#fce7f3' },
  'hrd':               { label: 'HRD',                 color: '#1d4ed8', bg: '#dbeafe' },
  'governance':        { label: 'Governance',           color: '#92400e', bg: '#fef3c7' },
};

function researchCompletion(doc) {
  if (doc.findings?.conclusions?.length) return 100;
  if (doc.dataCollection) return 83;
  if (doc.actionPlan)     return 67;
  if (doc.literatureReview) return 50;
  if (doc.selectedQuestions?.length) return 33;
  if (doc.selectedTitle)  return 17;
  return 5;
}

function researchPhaseLabel(doc) {
  if (doc.findings?.conclusions?.length) return 'Complete ✓';
  if (doc.dataCollection)   return 'Phase 5 of 6';
  if (doc.actionPlan)       return 'Phase 4 of 6';
  if (doc.literatureReview) return 'Phase 3 of 6';
  if (doc.selectedQuestions?.length) return 'Phase 2 of 6';
  if (doc.selectedTitle)    return 'Phase 2 of 6';
  return 'Phase 1 of 6';
}

function researchContinueUrl(doc) {
  const id = doc.id;
  if (!doc.selectedTitle)             return `/action-research/phase-1/${id}`;
  if (!doc.selectedQuestions?.length) return `/action-research/phase-2/${id}`;
  if (!doc.literatureReview)          return `/action-research/phase-3/${id}`;
  if (!doc.actionPlan)                return `/action-research/phase-4/${id}`;
  if (!doc.dataCollection)            return `/action-research/phase-5/${id}`;
  return `/action-research/phase-6/${id}`;
}

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7)  return `${d}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const INPUT_STYLE = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 9,
  border: '1px solid rgba(45,106,79,0.2)',
  fontSize: 13,
  fontFamily: 'inherit',
  background: '#f9fafb',
  boxSizing: 'border-box',
  outline: 'none',
  color: '#0d2218',
  transition: 'border-color 0.15s',
};

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const { user, profile }  = useAuth();
  const { addToast }       = useToast();
  const navigate           = useNavigate();
  const { lessonPlans, loading } = useLessonPlans(user?.uid);

  const [slideIdx, setSlideIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlideIdx(i => (i + 1) % 4), 10000);
    return () => clearInterval(id);
  }, []);

  // ── Teacher profile form ───────────────────────────────────────────────────
  const [form, setForm]               = useState({ name: '', designation: '', school: '' });
  const [profileInit, setProfileInit] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);

  useEffect(() => {
    if (profile && !profileInit) {
      const name        = profile.name        || '';
      const designation = profile.designation || '';
      const school      = profile.school      || '';
      setForm({ name, designation, school });
      setProfileInit(true);
      if (name)        localStorage.setItem('teacherName',        name);
      if (designation) localStorage.setItem('teacherDesignation', designation);
      if (school) {
        localStorage.setItem('teacherSchool',  school);
        localStorage.setItem('pptSchoolName',  school);
      }
    }
  }, [profile, profileInit]);

  async function handleSaveProfile() {
    if (!user?.uid) return;
    setSavingProfile(true);
    try {
      const payload = {
        name:        form.name.trim(),
        designation: form.designation.trim(),
        school:      form.school.trim(),
      };
      await updateTeacherProfile(user.uid, payload);
      localStorage.setItem('teacherName',        payload.name);
      localStorage.setItem('teacherDesignation', payload.designation);
      localStorage.setItem('teacherSchool',      payload.school);
      localStorage.setItem('pptSchoolName',      payload.school);
      addToast('Profile saved!', 'success');
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch {
      addToast('Failed to save profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Action Research ────────────────────────────────────────────────────────
  const [researches, setResearches]         = useState([]);
  const [researchLoading, setResearchLoading] = useState(true);
  const [deletingId, setDeletingId]         = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    listActionResearch(user.uid)
      .then(setResearches)
      .catch(() => {})
      .finally(() => setResearchLoading(false));
  }, [user?.uid]);

  async function handleDeleteResearch(e, id) {
    e.stopPropagation();
    if (!window.confirm('Delete this research project? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteActionResearch(user.uid, id);
      setResearches(prev => prev.filter(r => r.id !== id));
      addToast('Research project deleted.', 'success');
    } catch {
      addToast('Failed to delete.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  // ── Derived lesson data ────────────────────────────────────────────────────
  const displayName    = user?.displayName || user?.email?.split('@')[0] || 'Teacher';
  const activeLessons  = lessonPlans.filter(l => l.status !== 'archived');
  const publishedCount = lessonPlans.filter(l => l.status === 'published').length;
  const totalLessons   = lessonPlans.length;
  const recentLessons  = activeLessons.slice(0, 3).map(normalizeLesson);

  const QUICK_ACTIONS = [
    { label: 'New Lesson Plan',   sub: 'AI-powered MATATAG planning',  Icon: Sparkles,     to: '/lesson-gen',   color: '#2d6a4f' },
    { label: 'Browse My Lessons', sub: loading ? 'Loading…' : `${totalLessons} plan${totalLessons !== 1 ? 's' : ''} saved`, Icon: BookOpen, to: '/my-lessons', color: '#1565c0' },
    { label: 'Build a Quiz',      sub: 'From any lesson plan',          Icon: ClipboardList, to: '/quiz-builder', color: '#7c3aed' },
    { label: 'Action Research',   sub: 'AI-guided DepEd research',      Icon: FlaskConical,  to: '/action-research/phase-1', color: '#0369a1' },
  ];

  const visibleResearches = researches.slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Welcome banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0d2218 0%, #1a3d2b 50%, #2d6a4f 100%)',
        borderRadius: 16, padding: '28px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        overflow: 'hidden', position: 'relative',
      }}>
        {SLIDE_IMGS.map((src, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${src})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: i === slideIdx ? 0.09 : 0,
            transition: 'opacity 1.8s ease-in-out',
            borderRadius: 16,
            pointerEvents: 'none',
          }} />
        ))}

        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>{greeting()},</p>
          <h1 style={{ margin: '4px 0 6px', fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>
            {form.name || displayName}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
            {form.designation
              ? `${form.designation}${form.school ? ` · ${form.school}` : ''}`
              : totalLessons > 0
                ? `${publishedCount} published lesson${publishedCount !== 1 ? 's' : ''} · ${totalLessons} total`
                : 'Welcome — create your first AI-powered lesson plan'}
          </p>
        </div>
        <button
          onClick={() => navigate('/lesson-gen')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, position: 'relative',
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 10, padding: '10px 18px', color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
        >
          <Sparkles size={15} /> New Lesson
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <div style={{
          background: '#fff', borderRadius: 14, padding: '18px 20px',
          border: '1px solid rgba(45,106,79,0.12)', transition: 'all 0.18s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
          onMouseEnter={e => Object.assign(e.currentTarget.style, { borderColor: '#2d6a4f', transform: 'translateY(-2px)', boxShadow: '0 6px 20px rgba(45,106,79,0.12)' })}
          onMouseLeave={e => Object.assign(e.currentTarget.style, { borderColor: 'rgba(45,106,79,0.12)', transform: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' })}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#d8f3dc', display: 'grid', placeItems: 'center', marginBottom: 12 }}>
            <BookOpen size={18} color="#2d6a4f" />
          </div>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#2d6a4f', lineHeight: 1 }}>{loading ? '—' : totalLessons}</p>
          <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1.2px' }}>Lesson Plans</p>
        </div>

        {!researchLoading && (
          <div style={{
            background: '#fff', borderRadius: 14, padding: '18px 20px',
            border: '1px solid rgba(3,105,161,0.15)', transition: 'all 0.18s', cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}
            onClick={() => navigate('/action-research/phase-1')}
            onMouseEnter={e => Object.assign(e.currentTarget.style, { borderColor: '#0369a1', transform: 'translateY(-2px)', boxShadow: '0 6px 20px rgba(3,105,161,0.12)' })}
            onMouseLeave={e => Object.assign(e.currentTarget.style, { borderColor: 'rgba(3,105,161,0.15)', transform: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' })}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#e0f2fe', display: 'grid', placeItems: 'center', marginBottom: 12 }}>
              <FlaskConical size={18} color="#0369a1" />
            </div>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#0369a1', lineHeight: 1 }}>{researches.length}</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1.2px' }}>Research Projects</p>
          </div>
        )}
      </div>

      {/* ── Classroom spotlight ──────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 16, overflow: 'hidden',
        background: 'linear-gradient(135deg, #082212 0%, #0d2e1a 50%, #143d25 100%)',
        border: '1px solid rgba(74,222,128,0.14)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        padding: '22px 24px',
        position: 'relative',
      }}>
        {/* subtle glow orb */}
        <div style={{ position: 'absolute', top: -40, right: -20, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(74,222,128,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 800, color: 'rgba(74,222,128,0.6)', textTransform: 'uppercase', letterSpacing: '1.6px' }}>New Feature</p>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>Grading &amp; Classroom</h2>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { to: '/classroom-management', label: 'Classroom Management', sub: 'Manage sections, students & invitations', Icon: School },
            { to: '/classes-i-teach',      label: 'Classes I Teach',       sub: 'Enter grades and submit to adviser',      Icon: GraduationCap },
          ].map(({ to, label, sub, Icon }) => (
            <button key={to} onClick={() => navigate(to)} style={{
              display: 'flex', alignItems: 'center', gap: 13,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,222,128,0.2)',
              borderRadius: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
            }}
              onMouseEnter={e => Object.assign(e.currentTarget.style, { background: 'rgba(74,222,128,0.14)', borderColor: 'rgba(74,222,128,0.5)', transform: 'translateY(-2px)' })}
              onMouseLeave={e => Object.assign(e.currentTarget.style, { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(74,222,128,0.2)', transform: 'none' })}
            >
              <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.25)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon size={20} color="#4ade80" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#d8f3dc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(187,247,208,0.55)', lineHeight: 1.4 }}>{sub}</p>
              </div>
              <ArrowRight size={14} color="rgba(74,222,128,0.4)" style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 600, color: '#0d2218' }}>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {QUICK_ACTIONS.map(({ label, sub, Icon, to, color }) => (
            <button key={to} onClick={() => navigate(to)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#fff', border: '1px solid rgba(45,106,79,0.12)',
              borderRadius: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.18s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
              onMouseEnter={e => Object.assign(e.currentTarget.style, { borderColor: color, transform: 'translateY(-2px)', boxShadow: `0 6px 20px ${color}22` })}
              onMouseLeave={e => Object.assign(e.currentTarget.style, { borderColor: 'rgba(45,106,79,0.12)', transform: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' })}
            >
              <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: `${color}14`, border: `1px solid ${color}28`, display: 'grid', placeItems: 'center' }}>
                <Icon size={19} color={color} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0d2218' }}>{label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#4a6357', fontWeight: 400 }}>{sub}</p>
              </div>
              <ArrowRight size={14} color="rgba(45,106,79,0.3)" />
            </button>
          ))}
        </div>
      </div>

      {/* Teacher Profile */}
      <div style={{
        background: '#fff', borderRadius: 14, padding: '24px',
        border: '1px solid rgba(45,106,79,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#d8f3dc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <User size={18} color="#2d6a4f" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0d2218' }}>Teacher Profile</h2>
            <p style={{ margin: 0, fontSize: 11, color: '#4a6357' }}>Included in lesson plans, quizzes, and game sheets</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Full Name
            </label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Juan Dela Cruz"
              style={INPUT_STYLE}
              onFocus={e => e.target.style.borderColor = '#2d6a4f'}
              onBlur={e => e.target.style.borderColor = 'rgba(45,106,79,0.2)'}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Designation / Position
            </label>
            <input
              value={form.designation}
              onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
              placeholder="Teacher II"
              style={INPUT_STYLE}
              onFocus={e => e.target.style.borderColor = '#2d6a4f'}
              onBlur={e => e.target.style.borderColor = 'rgba(45,106,79,0.2)'}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              School
            </label>
            <input
              value={form.school}
              onChange={e => setForm(f => ({ ...f, school: e.target.value }))}
              placeholder="Dayap National High School"
              style={INPUT_STYLE}
              onFocus={e => e.target.style.borderColor = '#2d6a4f'}
              onBlur={e => e.target.style.borderColor = 'rgba(45,106,79,0.2)'}
            />
          </div>
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={savingProfile}
          style={{
            marginTop: 18,
            display: 'flex', alignItems: 'center', gap: 7,
            background: profileSaved ? '#d8f3dc' : '#2d6a4f',
            color: profileSaved ? '#1a3d2b' : '#fff',
            border: 'none', borderRadius: 10, padding: '9px 20px',
            fontSize: 13, fontWeight: 600,
            cursor: savingProfile ? 'default' : 'pointer',
            transition: 'all 0.2s', opacity: savingProfile ? 0.7 : 1,
          }}
        >
          {profileSaved ? <CheckCircle size={14} /> : <Save size={14} />}
          {savingProfile ? 'Saving…' : profileSaved ? 'Saved!' : 'Save Profile'}
        </button>
      </div>

      {/* Recent lesson plans */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#0d2218' }}>Recent Lesson Plans</h2>
          <button onClick={() => navigate('/my-lessons')} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: '#2d6a4f',
          }}>
            View All <ArrowRight size={13} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {recentLessons.map(lesson => {
            const st = STATUS_COLORS[lesson.status] || STATUS_COLORS.draft;
            return (
              <div key={lesson.id} style={{
                background: '#fff', borderRadius: 14,
                border: '1px solid rgba(45,106,79,0.12)',
                padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.3)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.12)'; e.currentTarget.style.transform = 'none'; }}
                onClick={() => navigate('/my-lessons')}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ background: subjectColor(lesson.subject), borderRadius: 7, padding: '3px 9px', fontSize: 10, fontWeight: 700, color: '#0d2218', flexShrink: 0 }}>
                    {lesson.subject} {lesson.grade}
                  </div>
                  <div style={{ background: st.bg, borderRadius: 20, padding: '3px 9px', fontSize: 10, fontWeight: 700, color: st.color, flexShrink: 0 }}>
                    {st.label}
                  </div>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0d2218', lineHeight: 1.3 }}>{lesson.title}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#4a6357' }}>
                    {lesson.quarter} · Week {lesson.week} · {lesson.dates}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: '#4a6357', fontWeight: 500 }}>
                    {lesson.sessions} session{lesson.sessions !== 1 ? 's' : ''}
                  </span>
                  <button onClick={e => { e.stopPropagation(); navigate('/my-lessons'); }} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: '#d8f3dc', border: 'none', borderRadius: 8,
                    padding: '5px 10px', fontSize: 11, fontWeight: 600, color: '#2d6a4f', cursor: 'pointer',
                  }}>
                    View <ArrowRight size={11} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* New lesson CTA card */}
          <button onClick={() => navigate('/lesson-gen')} style={{
            background: '#f5faf7', border: '2px dashed rgba(45,106,79,0.25)',
            borderRadius: 14, padding: '18px 20px', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, minHeight: 140, transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#40916c'; e.currentTarget.style.background = '#edf7f0'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.25)'; e.currentTarget.style.background = '#f5faf7'; }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#2d6a4f', display: 'grid', placeItems: 'center' }}>
              <Plus size={20} color="#fff" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#2d6a4f' }}>Create New Lesson</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#4a6357' }}>AI-powered planning</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── My Action Research ───────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#0d2218' }}>My Action Research</h2>
            {researches.length > 0 && (
              <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px' }}>
                {researches.length}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/action-research/phase-1')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#0369a1', border: 'none', borderRadius: 8,
              padding: '7px 14px', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Plus size={13} /> New Research
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>

          {researchLoading ? (
            [0, 1].map(i => (
              <div key={i} style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.1)', padding: '18px 20px', height: 180, opacity: 0.5 }}>
                <div style={{ background: '#f0f0f0', height: 14, borderRadius: 6, width: '60%', marginBottom: 10 }} />
                <div style={{ background: '#f0f0f0', height: 10, borderRadius: 6, width: '90%', marginBottom: 6 }} />
                <div style={{ background: '#f0f0f0', height: 10, borderRadius: 6, width: '70%' }} />
              </div>
            ))
          ) : (
            visibleResearches.map(r => {
              const pct      = researchCompletion(r);
              const theme    = THEME_META[r.beraTheme] || THEME_META['teaching-learning'];
              const phase    = researchPhaseLabel(r);
              const url      = researchContinueUrl(r);
              const title    = r.selectedTitle || (r.problemText ? r.problemText.substring(0, 70) + (r.problemText.length > 70 ? '…' : '') : 'Draft Research');
              const updAt    = r.updatedAt?.toDate?.();
              const isComplete = pct === 100;
              const barColor = isComplete
                ? '#2d6a4f'
                : pct >= 67 ? '#7c3aed'
                : pct >= 34 ? '#0369a1'
                : '#f59e0b';

              return (
                <div
                  key={r.id}
                  onClick={() => navigate(url)}
                  style={{
                    background: '#fff', borderRadius: 14,
                    border: `1px solid ${isComplete ? 'rgba(45,106,79,0.25)' : 'rgba(45,106,79,0.12)'}`,
                    padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10,
                    cursor: 'pointer', transition: 'all 0.15s', position: 'relative',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.3)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isComplete ? 'rgba(45,106,79,0.25)' : 'rgba(45,106,79,0.12)'; e.currentTarget.style.transform = 'none'; }}
                >
                  {/* Header: theme badge + phase + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{
                      background: theme.bg, color: theme.color,
                      fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '3px 9px', flexShrink: 0,
                    }}>
                      {theme.label}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap' }}>{phase}</span>
                      <button
                        onClick={e => handleDeleteResearch(e, r.id)}
                        disabled={deletingId === r.id}
                        title="Delete research"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db',
                          padding: '2px 4px', borderRadius: 5, lineHeight: 0,
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = '#d1d5db'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 600, color: '#0d2218', lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {title}
                  </p>

                  {/* Subject / grade */}
                  {(r.subjectArea || r.gradeLevel) && (
                    <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>
                      {[r.subjectArea, r.gradeLevel].filter(Boolean).join(' · ')}
                    </p>
                  )}

                  {/* Progress bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>Completion</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>{pct}%</span>
                    </div>
                    <div style={{ height: 5, background: '#f3f4f6', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: barColor,
                        borderRadius: 10, transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>
                      {updAt ? `Updated ${timeAgo(updAt)}` : 'Draft'}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); navigate(url); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: isComplete ? '#d8f3dc' : '#e0f2fe',
                        color: isComplete ? '#2d6a4f' : '#0369a1',
                        border: 'none', borderRadius: 8,
                        padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {isComplete ? 'View' : 'Continue'} <ArrowRight size={11} />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* New Research CTA card */}
          <button
            onClick={() => navigate('/action-research/phase-1')}
            style={{
              background: '#f0f9ff', border: '2px dashed rgba(3,105,161,0.25)',
              borderRadius: 14, padding: '18px 20px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, minHeight: 160, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#0369a1'; e.currentTarget.style.background = '#e0f2fe'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(3,105,161,0.25)'; e.currentTarget.style.background = '#f0f9ff'; }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#0369a1', display: 'grid', placeItems: 'center' }}>
              <Plus size={20} color="#fff" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0369a1' }}>Start New Research</p>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: '#4a6357' }}>AI-guided DepEd action research</p>
            </div>
          </button>
        </div>

        {researches.length > 4 && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#6b7280', textAlign: 'right' }}>
            Showing 4 of {researches.length} projects
          </p>
        )}
      </div>
    </div>
  );
}
