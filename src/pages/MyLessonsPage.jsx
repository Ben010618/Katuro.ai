import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLessonPlans } from '../hooks/useLessonPlans';
import { updateLessonPlan, deleteLessonPlan, getIlawPlan, getDLLPlan } from '../services/db';
import { useLessonGenStore } from '../store/lessonGenStore';
import { useDLLStore } from '../store/dllStore';
import { useToast } from '../context/ToastContext';
import {
  Plus, Search, MoreVertical, BookOpen,
  Pencil, Archive, Trash2, Eye, Loader2,
} from 'lucide-react';

const STATUS_CONFIG = {
  published: { bg: '#d8f3dc',              color: '#1a3d2b', label: 'Published' },
  draft:     { bg: 'rgba(232,163,32,0.12)', color: '#b47a10', label: 'Draft' },
  archived:  { bg: '#f0f0f0',              color: '#5a6a60', label: 'Archived' },
};

const FILTERS = ['All', 'Published', 'Draft', 'Archived'];

function formatDateRange(days) {
  if (!days?.length) return '—';
  const fmt = iso => {
    try { return new Date(iso + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch { return iso; }
  };
  const sorted = [...days].sort();
  const year   = sorted[0]?.split('-')[0] || '';
  if (sorted.length === 1) return `${fmt(sorted[0])}, ${year}`;
  return `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1])}, ${year}`;
}

function normalizeLesson(doc) {
  const isDLL = doc.type === 'dll';
  return {
    id:       doc.id,
    type:     doc.type || 'ilaw',
    title:    doc.lessonName  || doc.title   || 'Untitled',
    subject:  doc.subject     || '—',
    grade:    doc.gradeLevel  || doc.grade   || '—',
    quarter:  doc.term        || doc.quarter || '—',
    week:     isDLL ? '—' : (doc.weekNumber || doc.week || '—'),
    dates:    isDLL
      ? (doc.teachingDates || '—')
      : doc.selectedDays ? formatDateRange(doc.selectedDays) : (doc.dates || '—'),
    status:   doc.status      || 'published',
    tags:     doc.tags        || [],
    sessions: isDLL ? 5 : (Array.isArray(doc.sessions) ? doc.sessions.length : (doc.sessions || 0)),
    createdAt: doc.createdAt,
  };
}

const TAG_COLORS = ['#d8f3dc', '#dbeafe', 'rgba(232,163,32,0.15)', '#fce7f3', '#e0e7ff', 'rgba(232,163,32,0.1)'];
function tagColor(t) {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) & 0xffffff;
  return TAG_COLORS[h % TAG_COLORS.length];
}

function LessonCard({ lesson, onAction, loadingId }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isLoading = loadingId === lesson.id;
  const st = STATUS_CONFIG[lesson.status] || STATUS_CONFIG.draft;

  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      border: '1px solid rgba(45,106,79,0.12)', padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 12,
      position: 'relative', transition: 'border-color 0.2s, transform 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.3)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.12)'; e.currentTarget.style.transform = 'none'; }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, flex: 1 }}>
          <span style={{
            background: lesson.type === 'dll' ? '#ede9fe' : '#d8f3dc',
            borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700,
            color: lesson.type === 'dll' ? '#4f46e5' : '#0d2218',
          }}>
            {lesson.type === 'dll' ? 'DLL' : 'ILAW'}
          </span>
          <span style={{ background: '#d8f3dc', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: '#0d2218' }}>
            {lesson.subject} {lesson.grade}
          </span>
          {lesson.type !== 'dll' && (
            <span style={{ background: '#f5faf7', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 600, color: '#4a6357' }}>
              {lesson.quarter} · Wk {lesson.week}
            </span>
          )}
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => !isLoading && setMenuOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: isLoading ? 'default' : 'pointer', padding: 4, color: '#4a6357', borderRadius: 6, display: 'flex', alignItems: 'center' }}
          >
            {isLoading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <MoreVertical size={15} />}
          </button>

          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setMenuOpen(false)} />
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 50, background: '#fff', border: '1px solid rgba(45,106,79,0.12)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', padding: '6px', minWidth: 160 }}>
                {[
                  { icon: Eye,     label: 'View',    action: 'view',    color: '#4a6357' },
                  { icon: Pencil,  label: 'Edit',    action: 'edit',    color: '#4a6357' },
                  { icon: Archive, label: 'Archive', action: 'archive', color: '#e8a320' },
                  { icon: Trash2,  label: 'Delete',  action: 'delete',  color: '#e05c5c' },
                ].map(({ icon: Icon, label, action, color }) => (
                  <button
                    key={action}
                    onClick={() => { setMenuOpen(false); onAction(lesson.id, action); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', borderRadius: 7, fontSize: 13, fontWeight: 600, color, textAlign: 'left', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f5faf7'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Title */}
      <div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0d2218', lineHeight: 1.3 }}>{lesson.title}</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4a6357' }}>{lesson.dates}</p>
      </div>

      {/* Tags */}
      {lesson.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {lesson.tags.map(t => (
            <span key={t} style={{ background: tagColor(t), borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: '#0d2218' }}>{t}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(45,106,79,0.08)', paddingTop: 10 }}>
        <span style={{ background: st.bg, borderRadius: 20, padding: '3px 9px', fontSize: 10, fontWeight: 700, color: st.color }}>{st.label}</span>
        <span style={{ fontSize: 11, color: '#4a6357' }}>
          {lesson.type === 'dll'
            ? 'Mon – Fri'
            : `${lesson.sessions} session${lesson.sessions !== 1 ? 's' : ''}`}
        </span>
      </div>
    </div>
  );
}

export default function MyLessonsPage() {
  const navigate     = useNavigate();
  const { addToast } = useToast();
  const { user }     = useAuth();

  const { lessonPlans, loading, error } = useLessonPlans(user?.uid);
  const store    = useLessonGenStore();
  const dllStore = useDLLStore();

  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState('All');
  const [viewingId, setViewingId] = useState(null);

  const lessons = lessonPlans.map(normalizeLesson);

  const visible = lessons.filter(l => {
    const matchFilter = filter === 'All' || l.status === filter.toLowerCase();
    const matchSearch = !search ||
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.subject.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  async function handleAction(id, action) {
    if (action === 'view') {
      setViewingId(id);
      try {
        const lessonMeta = lessons.find(l => l.id === id);
        if (lessonMeta?.type === 'dll') {
          const docData = await getDLLPlan(user.uid, id);
          if (!docData) { addToast('DLL not found.', 'error'); return; }
          dllStore.loadPlan(docData);
          navigate('/dll-gen/output');
        } else {
          const docData = await getIlawPlan(user.uid, id);
          if (!docData) { addToast('Lesson plan not found.', 'error'); return; }
          store.loadPlan(docData);
          navigate(`/lesson-gen/output/${id}`);
        }
      } catch {
        addToast('Could not load lesson plan.', 'error');
      } finally {
        setViewingId(null);
      }
    } else if (action === 'edit') {
      addToast('Lesson editor coming soon.', 'info');
    } else if (action === 'archive') {
      try {
        await updateLessonPlan(user.uid, id, { status: 'archived' });
        addToast('Lesson archived.', 'success');
      } catch {
        addToast('Could not archive lesson.', 'error');
      }
    } else if (action === 'delete') {
      try {
        await deleteLessonPlan(user.uid, id);
        addToast('Lesson deleted.', 'warning');
      } catch {
        addToast('Could not delete lesson.', 'error');
      }
    }
  }

  const publishedCount = lessons.filter(l => l.status === 'published').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page heading */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#0d2218' }}>My Lessons</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#4a6357' }}>
            {loading ? 'Loading…' : `${lessons.length} plan${lessons.length !== 1 ? 's' : ''} saved · ${publishedCount} published`}
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/lesson-gen')}>
          <Plus size={15} /> New Lesson
        </button>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4a6357', pointerEvents: 'none' }} />
          <input type="text" placeholder="Search lessons…" value={search} onChange={e => setSearch(e.target.value)} className="input" style={{ paddingLeft: 34 }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '7px 14px', borderRadius: 9, border: '1.5px solid',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              borderColor: filter === f ? '#2d6a4f' : 'rgba(45,106,79,0.2)',
              background: filter === f ? '#2d6a4f' : '#fff',
              color: filter === f ? '#fff' : '#4a6357',
              transition: 'all 0.15s',
            }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 10, color: '#4a6357' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Loading your lesson plans…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ background: '#fde8e8', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 12, padding: '14px 18px', fontSize: 13, color: '#e05c5c', fontWeight: 600 }}>
          Could not load lessons: {error}
        </div>
      )}

      {/* Grid */}
      {!loading && !error && (
        visible.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {visible.map(l => <LessonCard key={l.id} lesson={l} onAction={handleAction} loadingId={viewingId} />)}
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: '#fff', borderRadius: 16, border: '2px dashed rgba(45,106,79,0.2)',
            padding: '60px 32px', gap: 12, textAlign: 'center',
          }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#d8f3dc', display: 'grid', placeItems: 'center' }}>
              <BookOpen size={26} color="#2d6a4f" />
            </div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#0d2218' }}>No lessons found</p>
            <p style={{ margin: 0, fontSize: 14, color: '#4a6357' }}>
              {search ? 'Try a different search term or filter.' : 'Create your first AI-powered lesson plan.'}
            </p>
            {!search && (
              <button className="btn-primary" onClick={() => navigate('/lesson-gen')} style={{ marginTop: 8 }}>
                <Plus size={14} /> Create Lesson Plan
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
