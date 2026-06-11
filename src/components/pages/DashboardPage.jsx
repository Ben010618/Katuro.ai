import { useState } from "react";
import { PlusCircle, StopCircle, Trash2, Loader2, Zap, BookOpen, TrendingUp, AlertCircle } from "lucide-react";
import { useSessions } from "../../hooks/useSessions";
import { useAllScores } from "../../hooks/useScores";
import { computeAnalytics } from "../../services/analytics";

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

const CARDS = [
  {
    label: "Active Sessions",
    key: "active",
    icon: Zap,
    style: { background: "linear-gradient(135deg, #163828 0%, #2E7D32 100%)", boxShadow: "0 4px 14px rgba(22,56,40,0.4)" },
  },
  {
    label: "Total Sessions",
    key: "total",
    icon: BookOpen,
    style: { background: "linear-gradient(135deg, #1565C0 0%, #42A5F5 100%)", boxShadow: "0 4px 14px rgba(21,101,192,0.4)" },
  },
  {
    label: "Class Average",
    key: "avg",
    icon: TrendingUp,
    style: { background: "linear-gradient(135deg, #2E7D32 0%, #66BB6A 100%)", boxShadow: "0 4px 14px rgba(46,125,50,0.4)" },
  },
  {
    label: "Needs Help",
    key: "help",
    icon: AlertCircle,
    style: { background: "linear-gradient(135deg, #B71C1C 0%, #EF5350 100%)", boxShadow: "0 4px 14px rgba(183,28,28,0.4)" },
  },
];

const WORKFLOW_STEPS = [
  { label: "Setup Classroom", page: "Classroom"    },
  { label: "Lesson Gen",      page: "Lesson Gen"   },
  { label: "Generate Quiz",   page: "Quiz Builder"  },
  { label: "Print Sheets",    page: "Bubble Sheets" },
  { label: "View Analytics",  page: "Analytics"     },
];

export default function DashboardPage({ user, onNavigate }) {
  const { sessions, activeSessions, loading, addSession, endSession, removeSession } = useSessions(user.uid);
  const { scores } = useAllScores(user.uid);
  const stats = computeAnalytics(scores);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [saving, setSaving] = useState(false);

  function getValue(key) {
    if (loading) return "—";
    if (key === "active") return activeSessions.length;
    if (key === "total") return sessions.length;
    if (key === "avg") return stats ? `${Math.round(stats.avg)}%` : "—";
    if (key === "help") return stats ? stats.needsHelp : "—";
    return "—";
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await addSession(title.trim(), topic.trim());
    setTitle("");
    setTopic("");
    setShowForm(false);
    setSaving(false);
  }

  return (
    <div>

      {/* ── Stat cards ───────────────────────────────────────── */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {CARDS.map(({ label, key, icon: Icon, style }) => {
          const val = getValue(key);
          const isHelp = key === "help";
          return (
            <div key={label} className="card card-accent p-6">
              <div className="flex items-start justify-between">
                <p className="text-sm font-bold text-[#5A7566]">{label}</p>
                <div
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
                  style={style}
                >
                  <Icon size={18} className="text-white" />
                </div>
              </div>
              <p
                className={`mt-4 text-4xl font-black ${
                  isHelp && val > 0 ? "text-red-500" : "text-gradient"
                }`}
              >
                {val}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Sessions panel ───────────────────────────────────── */}
      <div className="mt-8 card card-accent p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-[#163828]">Sessions</h3>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary"
          >
            <PlusCircle size={16} />
            New Session
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-3 rounded-2xl bg-[#F4FAF5] p-4">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Session title (e.g. Math Quiz — Grade 7)"
              className="input"
            />
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic (optional)"
              className="input"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || !title.trim()}
                className="btn-primary"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? "Saving…" : "Start Session"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn-outline"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 space-y-3">
          {loading && <p className="text-sm text-[#5A7566]">Loading sessions…</p>}
          {!loading && sessions.length === 0 && (
            <p className="text-sm text-[#5A7566]">No sessions yet. Start one above.</p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-2xl border border-[#DCEBDC] px-4 py-3 transition-colors hover:border-[#4CAF50] hover:bg-[#F7FBF8]"
            >
              <div>
                <p className="font-bold text-[#163828]">{s.title}</p>
                {s.topic && <p className="text-xs text-[#5A7566]">{s.topic}</p>}
                <p className="mt-0.5 text-xs text-[#5A7566]">{formatDate(s.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    s.status === "active"
                      ? "bg-[#D4EDDA] text-[#163828]"
                      : "bg-[#F0F0F0] text-[#5A7566]"
                  }`}
                >
                  {s.status === "active" ? "Active" : "Completed"}
                </span>
                {s.status === "active" && (
                  <button
                    onClick={() => endSession(s.id)}
                    title="End session"
                    className="rounded-xl p-1.5 text-[#5A7566] hover:bg-[#DCEBDC]"
                  >
                    <StopCircle size={16} />
                  </button>
                )}
                <button
                  onClick={() => removeSession(s.id)}
                  title="Delete session"
                  className="rounded-xl p-1.5 text-red-400 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div
        className="mt-8 rounded-[28px] p-8 text-white"
        style={{
          background: "linear-gradient(135deg, #0D2518 0%, #163828 40%, #2E7D32 100%)",
          boxShadow: "0 16px 48px rgba(13,37,24,0.4)",
        }}
      >
        <p className="text-sm font-bold text-white/60 uppercase tracking-widest">Smart Teaching Workflow</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-black">
          Turn one lesson source into test sheets, scans, and analytics.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/60">
          Start a session above, then follow the workflow — click any step to jump straight in.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {WORKFLOW_STEPS.map(({ label, page }, i) => (
            <div key={label} className="flex items-center gap-2">
              <button
                onClick={() => onNavigate?.(page)}
                className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold text-white transition-all hover:bg-white/20 active:scale-95"
                style={{ background: "rgba(255,255,255,0.1)" }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black"
                  style={{ background: "rgba(255,255,255,0.25)" }}
                >
                  {i + 1}
                </span>
                {label}
              </button>
              {i < WORKFLOW_STEPS.length - 1 && <span className="text-white/30">→</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
