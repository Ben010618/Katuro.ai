import { useEffect, useState } from "react";
import { Save, AlertTriangle, TrendingUp, Loader2, BarChart2 } from "lucide-react";
import { useSessions } from "../../hooks/useSessions";
import { useClasses } from "../../hooks/useClasses";
import { useLearners } from "../../hooks/useLearners";
import { useSessionScores } from "../../hooks/useScores";
import { useQuiz } from "../../hooks/useQuiz";
import { computeAnalytics } from "../../services/analytics";

const BANDS = [
  { label: "0–49%",   min: 0,  max: 50,  color: "#ef4444" },
  { label: "50–59%",  min: 50, max: 60,  color: "#f97316" },
  { label: "60–69%",  min: 60, max: 70,  color: "#eab308" },
  { label: "70–79%",  min: 70, max: 80,  color: "#84cc16" },
  { label: "80–89%",  min: 80, max: 90,  color: "#22c55e" },
  { label: "90–100%", min: 90, max: 101, color: "#15803d" },
];

function pctColor(pct) {
  return pct < 50 ? "text-red-500" : pct < 70 ? "text-yellow-600" : "text-green-700";
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="card card-accent p-6">
      <p className="text-sm font-bold text-[#5A7566]">{label}</p>
      <p className={`mt-3 text-4xl font-black ${accent ?? "text-gradient"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-[#5A7566]">{sub}</p>}
    </div>
  );
}

function DistributionChart({ distribution, total }) {
  return (
    <div className="space-y-2">
      {distribution.map((band) => {
        const pct = total > 0 ? (band.count / total) * 100 : 0;
        return (
          <div key={band.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-right text-xs font-bold text-[#5A7566]">{band.label}</span>
            <div className="flex-1 overflow-hidden rounded-full bg-[#F4FAF5]" style={{ height: 16 }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: band.color, minWidth: band.count > 0 ? 6 : 0 }}
              />
            </div>
            <span className="w-6 shrink-0 text-xs font-bold text-[#163828]">{band.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function ItemAnalysis({ scores, quiz }) {
  if (!quiz?.answerKey?.length) return null;

  const scoredWithAnswers = scores.filter((s) => Array.isArray(s.answers) && s.answers.length > 0);
  if (scoredWithAnswers.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="mb-2 text-lg font-black text-[#163828]">Item Analysis</h3>
        <p className="text-sm text-[#5A7566]">
          Item analysis is available when scores include per-question answers (from the external
          scanner app). Manual score entry does not capture individual answers.
        </p>
      </div>
    );
  }

  const key = quiz.answerKey;
  const questions = quiz.questions || [];

  const items = key.map((correct, i) => {
    const total = scoredWithAnswers.length;
    const correctCount = scoredWithAnswers.filter(
      (s) => s.answers[i]?.toUpperCase() === correct?.toUpperCase()
    ).length;
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const competency = questions[i]?.competency || "";
    return { num: i + 1, correct, pct, correctCount, total, competency };
  });

  const sorted = [...items].sort((a, b) => a.pct - b.pct);

  const compMap = {};
  items.forEach((item) => {
    if (!item.competency) return;
    if (!compMap[item.competency]) compMap[item.competency] = { total: 0, sum: 0 };
    compMap[item.competency].total += 1;
    compMap[item.competency].sum += item.pct;
  });
  const competencies = Object.entries(compMap)
    .map(([name, v]) => ({ name, avg: Math.round(v.sum / v.total) }))
    .sort((a, b) => a.avg - b.avg);

  return (
    <div className="space-y-6">
      <div className="card card-accent p-6">
        <h3 className="mb-1 text-lg font-black text-[#163828]">Item Analysis</h3>
        <p className="mb-4 text-xs text-[#5A7566]">
          Questions sorted by % correct (lowest first). {scoredWithAnswers.length} learner records with answer data.
        </p>
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {sorted.map((item) => (
            <div key={item.num} className="flex items-center gap-3">
              <span className="w-7 shrink-0 text-right text-xs font-bold text-[#5A7566]">Q{item.num}</span>
              <div className="flex-1 overflow-hidden rounded-full bg-[#F4FAF5]" style={{ height: 14 }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${item.pct}%`,
                    background: item.pct < 50 ? "#ef4444" : item.pct < 70 ? "#eab308" : "#22c55e",
                    minWidth: item.correctCount > 0 ? 4 : 0,
                  }}
                />
              </div>
              <span className={`w-10 shrink-0 text-right text-xs font-black ${pctColor(item.pct)}`}>
                {item.pct}%
              </span>
              <span className="w-8 shrink-0 text-center rounded-lg bg-[#F4FAF5] px-1 text-xs font-bold text-[#163828]">
                {item.correct}
              </span>
              {item.competency && (
                <span className="max-w-[160px] truncate text-xs text-[#5A7566]">{item.competency}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {competencies.length > 0 && (
        <div className="card card-accent p-6">
          <h3 className="mb-4 text-lg font-black text-[#163828]">Competency Mastery</h3>
          <div className="space-y-2">
            {competencies.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="flex-1 text-sm font-bold text-[#163828]">{c.name}</span>
                <div className="w-40 overflow-hidden rounded-full bg-[#F4FAF5]" style={{ height: 14 }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${c.avg}%`,
                      background: c.avg < 50 ? "#ef4444" : c.avg < 70 ? "#eab308" : "#22c55e",
                    }}
                  />
                </div>
                <span className={`w-10 text-right text-sm font-black ${pctColor(c.avg)}`}>{c.avg}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sorted.filter((i) => i.pct < 50).length > 0 && (
        <div className="rounded-[28px] border border-red-100 bg-red-50 p-6">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-black text-red-700">
            <AlertTriangle size={18} />
            Least Mastered Items ({sorted.filter((i) => i.pct < 50).length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {sorted
              .filter((i) => i.pct < 50)
              .map((i) => (
                <span key={i.num} className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
                  Q{i.num} ({i.pct}%){i.competency ? ` — ${i.competency}` : ""}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreEntry({ user, sessionId, classId, onSaved }) {
  const { learners, loading: loadingLearners } = useLearners(user.uid, classId);
  const { scores, submitScores } = useSessionScores(user.uid, sessionId);
  const [numQ, setNumQ] = useState(20);
  const [inputs, setInputs] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!scores.length) return;
    const filled = {};
    scores.forEach((s) => { filled[s.learnerId] = String(s.rawScore ?? ""); });
    setInputs(filled);
    if (scores[0]?.numQuestions) setNumQ(scores[0].numQuestions);
  }, [scores]);

  function setInput(lid, val) {
    setInputs((p) => ({ ...p, [lid]: val.replace(/\D/g, "") }));
  }

  async function handleSave() {
    setSaving(true);
    const rows = learners
      .filter((l) => inputs[l.id] !== undefined && inputs[l.id] !== "")
      .map((l) => {
        const raw = Math.min(Number(inputs[l.id]), numQ);
        return {
          learnerId: l.id,
          learnerName: `${l.firstName} ${l.lastName}`,
          rawScore: raw,
          numQuestions: numQ,
          percentage: Math.round((raw / numQ) * 100),
        };
      });
    await submitScores(classId, rows);
    setSaving(false);
    onSaved?.();
  }

  if (loadingLearners) return <p className="text-sm text-[#5A7566]">Loading learners…</p>;
  if (!learners.length) return <p className="text-sm text-[#5A7566]">No learners in this class yet.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-bold text-[#5A7566]">Total questions:</label>
        <input
          type="number" min={1} max={100} value={numQ}
          onChange={(e) => setNumQ(Number(e.target.value) || 1)}
          className="input w-20"
        />
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_80px_60px] gap-2 px-1 text-xs font-bold text-[#5A7566]">
          <span>Learner</span><span className="text-center">Score / {numQ}</span><span className="text-center">%</span>
        </div>
        {learners.map((l) => {
          const raw = inputs[l.id] ?? "";
          const pct = raw !== "" ? Math.round((Math.min(Number(raw), numQ) / numQ) * 100) : null;
          return (
            <div key={l.id} className="grid grid-cols-[1fr_80px_60px] items-center gap-2 rounded-xl border border-[#DCEBDC] px-3 py-2">
              <span className="text-sm font-bold text-[#163828]">{l.firstName} {l.lastName}</span>
              <input
                type="number" min={0} max={numQ} value={raw}
                onChange={(e) => setInput(l.id, e.target.value)}
                placeholder="—"
                className="input text-center"
              />
              <span className={`text-center text-sm font-black ${pct !== null ? pctColor(pct) : ""}`}>
                {pct !== null ? `${pct}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <button onClick={handleSave} disabled={saving} className="btn-primary">
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {saving ? "Saving…" : "Save Scores"}
      </button>
    </div>
  );
}

export default function AnalyticsPage({ user }) {
  const { sessions } = useSessions(user.uid);
  const { classes } = useClasses(user.uid);
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [tab, setTab] = useState("analytics");

  const { scores, loading: loadingScores } = useSessionScores(user.uid, sessionId);
  const { quizzes } = useQuiz(user.uid, sessionId || undefined);

  const classScores = classId ? scores.filter((s) => s.classId === classId) : scores;
  const stats = computeAnalytics(classScores);

  const selectedClass = classes.find((c) => c.id === classId);
  const classLabel = selectedClass
    ? `Grade ${selectedClass.grade} — ${selectedClass.name}`
    : "All classes";

  const linkedQuiz =
    quizzes.find((q) => q.status === "final") || quizzes[0] || null;

  const tabs = ["analytics", "items", "entry"].filter((t) => {
    if (t === "entry") return sessionId && classId;
    if (t === "items") return sessionId && linkedQuiz;
    return true;
  });

  return (
    <div className="space-y-8">

      {/* Filters */}
      <div className="card card-accent p-6">
        <h3 className="mb-4 text-lg font-black text-[#163828]">Select Session & Class</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Session</label>
            <select
              value={sessionId}
              onChange={(e) => { setSessionId(e.target.value); setClassId(""); setTab("analytics"); }}
              className="select"
            >
              <option value="">Select a session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Class</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="select"
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Grade {c.grade} — {c.name} ({c.subject})
                </option>
              ))}
            </select>
          </div>
        </div>

        {sessionId && (
          <div className="mt-4 flex gap-2">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-xl px-4 py-1.5 text-sm font-bold transition-colors ${
                  tab === t ? "bg-[#163828] text-white" : "border border-[#DCEBDC] text-[#5A7566] hover:bg-[#F4FAF5]"
                }`}
              >
                {t === "entry" ? "Enter Scores" : t === "items" ? "Item Analysis" : "Analytics"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Score Entry */}
      {tab === "entry" && sessionId && classId && (
        <div className="card card-accent p-6">
          <h3 className="mb-4 text-lg font-black text-[#163828]">Enter Scores — {classLabel}</h3>
          <ScoreEntry user={user} sessionId={sessionId} classId={classId} onSaved={() => setTab("analytics")} />
        </div>
      )}

      {/* Item Analysis */}
      {tab === "items" && sessionId && linkedQuiz && (
        <ItemAnalysis scores={classScores} quiz={linkedQuiz} />
      )}

      {/* Analytics View */}
      {tab === "analytics" && sessionId && (
        <>
          {loadingScores && <p className="text-sm text-[#5A7566]">Loading scores…</p>}

          {!loadingScores && !stats && (
            <div className="card flex flex-col items-center gap-3 py-16">
              <div
                className="grid h-16 w-16 place-items-center rounded-2xl"
                style={{ background: "linear-gradient(135deg, #DCEBDC 0%, #F0F7F1 100%)" }}
              >
                <BarChart2 size={28} className="text-[#5A7566]" />
              </div>
              <p className="font-bold text-[#5A7566]">No scores recorded for this session yet.</p>
              {classId && (
                <button onClick={() => setTab("entry")} className="btn-primary">
                  Enter Scores
                </button>
              )}
            </div>
          )}

          {!loadingScores && stats && (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Class Average" value={`${Math.round(stats.avg)}%`} sub={`${stats.total} learners scored`} />
                <StatCard label="Pass Rate" value={`${Math.round(stats.passRate)}%`} sub="≥ 50%" accent="text-green-700" />
                <StatCard label="Needs Help" value={stats.needsHelp} sub="scored below 50%" accent={stats.needsHelp > 0 ? "text-red-500" : "text-gradient"} />
                <StatCard label="Top Score" value={`${stats.top}%`} sub={`Lowest: ${stats.low}%`} accent="text-green-700" />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="card card-accent p-6">
                  <h3 className="mb-4 text-lg font-black text-[#163828]">Score Distribution</h3>
                  <DistributionChart
                    distribution={BANDS.map((band) => ({
                      ...band,
                      count: classScores.filter((s) => s.percentage >= band.min && s.percentage < band.max).length,
                    }))}
                    total={stats.total}
                  />
                </div>

                <div className="card card-accent p-6">
                  <h3 className="mb-4 text-lg font-black text-[#163828]">Learner Breakdown</h3>
                  <div className="space-y-2 overflow-auto" style={{ maxHeight: 340 }}>
                    {stats.sorted.map((s, i) => (
                      <div key={s.id ?? i} className="flex items-center justify-between rounded-xl border border-[#DCEBDC] px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black text-white"
                            style={{ background: "linear-gradient(135deg, #163828 0%, #2E7D32 100%)" }}
                          >
                            {i + 1}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-[#163828]">{s.learnerName}</p>
                            <p className="text-xs text-[#5A7566]">{s.rawScore} / {s.numQuestions}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-black ${pctColor(s.percentage)}`}>{s.percentage}%</span>
                          {s.percentage < 50 && <AlertTriangle size={14} className="text-red-400" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {stats.needsHelp > 0 && (
                <div className="rounded-[28px] border border-red-100 bg-red-50 p-6">
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-black text-red-700">
                    <AlertTriangle size={18} /> Needs Remediation ({stats.needsHelp})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {stats.sorted
                      .filter((s) => s.percentage < 50)
                      .map((s, i) => (
                        <span key={s.id ?? i} className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
                          {s.learnerName} — {s.percentage}%
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Empty state */}
      {!sessionId && (
        <div className="card flex flex-col items-center gap-3 py-16">
          <div
            className="grid h-16 w-16 place-items-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, #DCEBDC 0%, #F0F7F1 100%)" }}
          >
            <TrendingUp size={28} className="text-[#5A7566]" />
          </div>
          <p className="font-bold text-[#5A7566]">Select a session above to view analytics.</p>
        </div>
      )}
    </div>
  );
}
