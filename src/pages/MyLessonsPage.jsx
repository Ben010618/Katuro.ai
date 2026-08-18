import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLessonPlans } from '../hooks/useLessonPlans';
import { updateLessonPlan, deleteLessonPlan, getIlawPlan, getDLLPlan, getCotPlan } from '../services/db';
import { useLessonGenStore } from '../store/lessonGenStore';
import { useDLLStore } from '../store/dllStore';
import { useCotStore } from '../store/cotStore';
import { useToast } from '../context/ToastContext';
import {
  Plus, Search, MoreVertical, BookOpen, CalendarDays, ShieldCheck,
  Pencil, Archive, Trash2, Eye, Loader2,
} from 'lucide-react';

// ── Type config ───────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  ilaw: {
    label: 'ILAW Plan',
    badgeBg: 'var(--kt-manila)', badgeColor: 'var(--kt-text-primary)',
    headerBg: 'var(--kt-card-2)', headerBorder: 'var(--kt-border)',
    accentColor: 'var(--kt-chalkboard)',
    Icon: BookOpen,
    iconBg: 'var(--kt-manila)',
    footer: (l) => `${l.sessions} session${l.sessions !== 1 ? 's' : ''}`,
  },
  dll: {
    label: 'Daily Lesson Log',
    badgeBg: 'var(--kt-card-2)', badgeColor: 'var(--kt-text-primary)',
    headerBg: 'var(--kt-card-2)', headerBorder: 'var(--kt-border)',
    accentColor: 'var(--kt-chalkboard)',
    Icon: CalendarDays,
    iconBg: 'var(--kt-card-2)',
    footer: () => 'Mon – Fri',
  },
  cot: {
    label: 'COT 4As Plan',
    badgeBg: 'var(--kt-manila)', badgeColor: 'var(--kt-text-primary)',
    headerBg: 'var(--kt-card-2)', headerBorder: 'var(--kt-border)',
    accentColor: 'var(--kt-chalkboard)',
    Icon: ShieldCheck,
    iconBg: 'var(--kt-manila)',
    footer: () => '4As · PIVOT 4A',
  },
};

// ── Term config ───────────────────────────────────────────────────────────────
const TERM_COLS = [
  { key: 'term1', label: '1st Term', short: '1ST' },
  { key: 'term2', label: '2nd Term', short: '2ND' },
  { key: 'term3', label: '3rd Term', short: '3RD' },
];

function toTermKey(quarterField) {
  const q = String(quarterField || '').toLowerCase();
  if (/\b1\b|first/.test(q))               return 'term1';
  if (/\b2\b|second/.test(q))              return 'term2';
  if (/\b3\b|third|\b4\b|fourth/.test(q))  return 'term3';
  return 'term1'; // fallback — unrecognised goes to Term 1
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  published: { bg: '#d8f3dc',               color: '#1a3d2b', label: 'Published' },
  draft:     { bg: 'rgba(232,163,32,0.12)', color: '#b47a10', label: 'Draft' },
  archived:  { bg: '#f0f0f0',               color: '#5a6a60', label: 'Archived' },
};

const FILTERS = ['All', 'Published', 'Draft', 'Archived'];

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  const type  = doc.type || 'ilaw';
  const isDLL = type === 'dll';
  const isCOT = type === 'cot';
  return {
    id:       doc.id,
    type,
    title:    doc.lessonName  || doc.title   || doc.topic || 'Untitled',
    subject:  doc.subject     || '—',
    grade:    doc.gradeLevel  || doc.grade   || '—',
    quarter:  doc.term        || doc.quarter || '—',
    week:     (!isDLL && !isCOT) ? (doc.weekNumber || doc.week || '—') : '—',
    dates:    isDLL
      ? (doc.teachingDates || '—')
      : isCOT
        ? (doc.teachingDate || '—')
        : doc.selectedDays ? formatDateRange(doc.selectedDays) : (doc.dates || '—'),
    status:   doc.status || 'published',
    sessions: isDLL ? 5 : (Array.isArray(doc.sessions) ? doc.sessions.length : (doc.sessions || 0)),
    createdAt: doc.createdAt,
  };
}

// ── LessonCard ────────────────────────────────────────────────────────────────
function LessonCard({ lesson, onAction, loadingId }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isLoading = loadingId === lesson.id;
  const st  = STATUS_CONFIG[lesson.status] || STATUS_CONFIG.draft;
  const cfg = TYPE_CONFIG[lesson.type] || TYPE_CONFIG.ilaw;

  return (
    <div
      style={{
        background: 'var(--kt-card)', borderRadius: 12,
        border: '1px solid rgba(45,106,79,0.11)', padding: '13px 14px',
        display: 'flex', flexDirection: 'column', gap: 8,
        position: 'relative', transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.3)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(13,34,24,0.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.11)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
          <span style={{ background: '#d8f3dc', borderRadius: 5, padding: '2px 7px', fontSize: 10, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
            {lesson.subject}
          </span>
          <span style={{ background: 'var(--kt-surface)', borderRadius: 5, padding: '2px 7px', fontSize: 10, fontWeight: 600, color: 'var(--kt-text-secondary)' }}>
            {lesson.grade}
          </span>
          {lesson.type === 'ilaw' && lesson.week !== '—' && (
            <span style={{ background: '#eff6ff', borderRadius: 5, padding: '2px 7px', fontSize: 10, fontWeight: 600, color: '#3b82f6' }}>
              Wk {lesson.week}
            </span>
          )}
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => !isLoading && setMenuOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: isLoading ? 'default' : 'pointer', padding: 4, color: 'var(--kt-text-secondary)', borderRadius: 6, display: 'flex', alignItems: 'center' }}
          >
            {isLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <MoreVertical size={14} />}
          </button>

          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setMenuOpen(false)} />
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 50, background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', padding: '5px', minWidth: 150 }}>
                {[
                  { icon: Eye,     label: 'View',    action: 'view',    color: 'var(--kt-text-secondary)' },
                  { icon: Pencil,  label: 'Edit',    action: 'edit',    color: 'var(--kt-text-secondary)' },
                  { icon: Archive, label: 'Archive', action: 'archive', color: '#e8a320' },
                  { icon: Trash2,  label: 'Delete',  action: 'delete',  color: '#e05c5c' },
                ].map(({ icon: Icon, label, action, color }) => (
                  <button
                    key={action}
                    onClick={() => { setMenuOpen(false); onAction(lesson.id, action); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, color, textAlign: 'left', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f5faf7'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Title + dates */}
      <div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--kt-text-primary)', lineHeight: 1.35 }}>{lesson.title}</p>
        <p style={{ margin: '3px 0 0', fontSize: 10, color: 'var(--kt-text-secondary)' }}>{lesson.dates}</p>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(45,106,79,0.08)', paddingTop: 7 }}>
        <span style={{ background: st.bg, borderRadius: 20, padding: '2px 8px', fontSize: 9, fontWeight: 700, color: st.color }}>{st.label}</span>
        <span style={{ fontSize: 10, color: 'var(--kt-text-secondary)' }}>{cfg.footer(lesson)}</span>
      </div>
    </div>
  );
}

// ── CategoryGroup — ILAW / DLL / COT section within a term column ─────────────
function CategoryGroup({ type, lessons, onAction, loadingId }) {
  if (!lessons.length) return null;
  const cfg = TYPE_CONFIG[type];
  const { Icon } = cfg;
  return (
    <div style={{ marginBottom: 10 }}>
      {/* Category sub-header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: cfg.headerBg, border: `1px solid ${cfg.headerBorder}`,
        borderRadius: 8, padding: '7px 11px', marginBottom: 7,
      }}>
        <Icon size={12} color={cfg.accentColor} />
        <span style={{ fontSize: 10, fontWeight: 800, color: cfg.accentColor, textTransform: 'uppercase', letterSpacing: '0.9px', flex: 1 }}>
          {cfg.label}
        </span>
        <span style={{ background: cfg.badgeBg, color: cfg.badgeColor, borderRadius: 20, padding: '1px 7px', fontSize: 9, fontWeight: 700 }}>
          {lessons.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {lessons.map(l => (
          <LessonCard key={l.id} lesson={l} onAction={onAction} loadingId={loadingId} />
        ))}
      </div>
    </div>
  );
}

// ── TermColumn ────────────────────────────────────────────────────────────────
function TermColumn({ term, groups, onAction, loadingId }) {
  const total = groups.ilaw.length + groups.dll.length + groups.cot.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Term header */}
      <div style={{
        background: 'var(--kt-chalkboard)',
        borderRadius: 'var(--kt-radius-md)', padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        border: '1px solid var(--kt-manila-border)',
        boxShadow: '0 2px 8px rgba(31,58,46,0.12)',
      }}>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 9.5, fontWeight: 700, color: 'var(--kt-manila)', textTransform: 'uppercase', letterSpacing: '1.2px', fontFamily: 'var(--kt-font-mono)' }}>
            MATATAG
          </p>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#FBF7EC', fontFamily: 'var(--kt-font-heading)' }}>
            {term.label}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--kt-manila)', lineHeight: 1, fontFamily: 'var(--kt-font-heading)' }}>{total}</p>
          <p style={{ margin: 0, fontSize: 9.5, color: 'rgba(251,247,236,0.7)', fontWeight: 600, fontFamily: 'var(--kt-font-mono)' }}>plan{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Categories */}
      {total === 0 ? (
        <div style={{
          background: 'var(--kt-card-2)', borderRadius: 'var(--kt-radius-md)',
          border: '1px dashed var(--kt-border)',
          padding: '28px 14px', textAlign: 'center',
        }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)' }}>No plans for {term.label}</p>
        </div>
      ) : (
        <div>
          <CategoryGroup type="ilaw" lessons={groups.ilaw} onAction={onAction} loadingId={loadingId} />
          <CategoryGroup type="dll"  lessons={groups.dll}  onAction={onAction} loadingId={loadingId} />
          <CategoryGroup type="cot"  lessons={groups.cot}  onAction={onAction} loadingId={loadingId} />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyLessonsPage() {
  const navigate     = useNavigate();
  const { addToast } = useToast();
  const { user }     = useAuth();

  const { lessonPlans, loading, error } = useLessonPlans(user?.uid);
  const store    = useLessonGenStore();
  const dllStore = useDLLStore();
  const cotStore = useCotStore();

  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState('All');
  const [viewingId, setViewingId] = useState(null);

  const lessons = useMemo(() => lessonPlans.map(normalizeLesson), [lessonPlans]);

  const visible = useMemo(() => lessons.filter(l => {
    const matchFilter = filter === 'All' || l.status === filter.toLowerCase();
    const matchSearch = !search ||
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.subject.toLowerCase().includes(search.toLowerCase()) ||
      l.grade.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  }), [lessons, filter, search]);

  // Group visible lessons by term then by type
  const termGrouped = useMemo(() => {
    const g = {};
    TERM_COLS.forEach(t => { g[t.key] = { ilaw: [], dll: [], cot: [] }; });
    visible.forEach(l => {
      const tk = toTermKey(l.quarter);
      const typeKey = l.type === 'dll' ? 'dll' : l.type === 'cot' ? 'cot' : 'ilaw';
      g[tk][typeKey].push(l);
    });
    return g;
  }, [visible]);

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
        } else if (lessonMeta?.type === 'cot') {
          const docData = await getCotPlan(user.uid, id);
          if (!docData) { addToast('COT lesson not found.', 'error'); return; }
          cotStore.loadPlan(docData);
          navigate('/cot-gen/output');
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
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>

      {/* Page heading */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: 'var(--kt-text-primary)' }}>My Lessons</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--kt-text-secondary)' }}>
            {loading ? 'Loading…' : `${lessons.length} plan${lessons.length !== 1 ? 's' : ''} · ${publishedCount} published`}
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/lesson-gen')}>
          <Plus size={15} /> New Lesson
        </button>
      </div>

      {/* Search + status filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--kt-text-secondary)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search by title, subject or grade…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input"
            style={{ paddingLeft: 34 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '100%', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '7px 14px', borderRadius: 9, border: '1.5px solid',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                borderColor: filter === f ? '#2d6a4f' : 'rgba(45,106,79,0.2)',
                background:  filter === f ? '#2d6a4f' : '#fff',
                color:       filter === f ? '#fff'    : '#4a6357',
                transition: 'all 0.15s',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 10, color: 'var(--kt-text-secondary)' }}>
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

      {/* Content */}
      {!loading && !error && (
        lessons.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'var(--kt-card)', borderRadius: 16, border: '2px dashed rgba(45,106,79,0.2)',
            padding: '60px 32px', gap: 12, textAlign: 'center',
          }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#d8f3dc', display: 'grid', placeItems: 'center' }}>
              <BookOpen size={26} color="#2d6a4f" />
            </div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--kt-text-primary)' }}>No lessons yet</p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)' }}>Create your first AI-powered lesson plan.</p>
            <button className="btn-primary" onClick={() => navigate('/lesson-gen')} style={{ marginTop: 8 }}>
              <Plus size={14} /> Create Lesson Plan
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'var(--kt-card)', borderRadius: 16, border: '2px dashed rgba(45,106,79,0.2)',
            padding: '48px 32px', gap: 8, textAlign: 'center',
          }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--kt-text-primary)' }}>No lessons found</p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)' }}>Try a different search or filter.</p>
          </div>
        ) : (
          /* ── 3-column term layout — responsive on tablet & mobile ── */
          <div className="my-lessons-board">
            {TERM_COLS.map(term => (
              <TermColumn
                key={term.key}
                term={term}
                groups={termGrouped[term.key]}
                onAction={handleAction}
                loadingId={viewingId}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
