import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Pencil, Trash2, Loader2, UserCircle2, Users, Save,
  ClipboardList, CheckCircle2, UserPlus,
} from "lucide-react";
import { useLearners } from "../../hooks/useLearners";
import { updateClass } from "../../services/db";

const GENDERS   = ["Male", "Female"];
const COL_TYPES = ["Quiz", "ST", "QT"];

const GENDER_CONFIG = {
  Male:   { label: "Male",   accent: "bg-blue-50 border-blue-100",    badge: "bg-blue-100 text-blue-700",    icon: "linear-gradient(135deg,#1565C0,#42A5F5)" },
  Female: { label: "Female", accent: "bg-pink-50 border-pink-100",    badge: "bg-pink-100 text-pink-700",    icon: "linear-gradient(135deg,#880E4F,#F48FB1)" },
  Other:  { label: "Other",  accent: "bg-[#F4FAF5] border-[#DCEBDC]", badge: "bg-[#D4EDDA] text-[#163828]", icon: "linear-gradient(135deg,#163828,#4CAF50)" },
};

function sortAlpha(a, b) {
  const la = a.lastName?.toLowerCase() ?? "";
  const lb = b.lastName?.toLowerCase() ?? "";
  if (la !== lb) return la.localeCompare(lb);
  return (a.firstName?.toLowerCase() ?? "").localeCompare(b.firstName?.toLowerCase() ?? "");
}

function computeColumnLabels(columns) {
  const counts = {};
  return columns.map((col) => {
    const t = col.type;
    counts[t] = (counts[t] || 0) + 1;
    const prefix = t === "Quiz" ? "Q" : t;
    return `${prefix}${counts[t]}`;
  });
}

/* ─── Quick-Add Strip ─────────────────────────────────────────────────── */
function QuickAddLearner({ onSave, saving, nextStudentNumber, sessionCount }) {
  const [studentNumber, setStudentNumber] = useState(nextStudentNumber ?? "");
  const [firstName,     setFirstName]     = useState("");
  const [lastName,      setLastName]      = useState("");
  const [gender,        setGender]        = useState("");
  const firstRef = useRef(null);

  // When parent increments key, nextStudentNumber changes — sync it
  useEffect(() => { setStudentNumber(nextStudentNumber ?? ""); }, [nextStudentNumber]);

  const canSubmit = firstName.trim() && lastName.trim() && gender && studentNumber.trim();

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    onSave(firstName.trim(), lastName.trim(), gender, studentNumber.trim());
    setFirstName("");
    setLastName("");
    // gender kept — teachers often enter one gender group at a time
    setTimeout(() => firstRef.current?.focus(), 50);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && canSubmit) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="card card-accent p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus size={15} className="text-[#2E7D32]" />
          <p className="text-xs font-black uppercase tracking-wider text-[#163828]">Quick Add Learner</p>
        </div>
        {sessionCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-[#D4EDDA] px-3 py-1">
            <CheckCircle2 size={12} className="text-[#2E7D32]" />
            <span className="text-xs font-black text-[#163828]">{sessionCount} added this session</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        {/* Student Number */}
        <div className="flex flex-col gap-1 w-24">
          <label className="text-[10px] font-bold text-[#5A7566]">
            No. <span className="font-normal text-[#9BB8A5]">scanner</span>
          </label>
          <input
            value={studentNumber}
            onChange={(e) => setStudentNumber(e.target.value.slice(0, 8))}
            onKeyDown={handleKeyDown}
            placeholder="00001"
            className="input text-center font-black tracking-widest"
          />
        </div>

        {/* First Name */}
        <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
          <label className="text-[10px] font-bold text-[#5A7566]">First Name</label>
          <input
            ref={firstRef}
            autoFocus
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Juan"
            className="input"
          />
        </div>

        {/* Last Name */}
        <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
          <label className="text-[10px] font-bold text-[#5A7566]">Last Name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Dela Cruz"
            className="input"
          />
        </div>

        {/* Gender */}
        <div className="flex flex-col gap-1 w-28">
          <label className="text-[10px] font-bold text-[#5A7566]">Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) { e.preventDefault(); handleSubmit(e); } }}
            className="select"
          >
            <option value="">—</option>
            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="btn-primary h-[42px] self-end"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          {saving ? "Saving…" : "Add"}
        </button>
      </form>

      <p className="mt-2 text-[10px] text-[#9BB8A5]">
        Tab between fields · Enter or click Add · gender is kept between entries for speed
      </p>
    </div>
  );
}

/* ─── Inline edit form ────────────────────────────────────────────────── */
function LearnerEditForm({ initial, onSave, onCancel, saving }) {
  const [studentNumber, setStudentNumber] = useState(initial.studentNumber ?? "");
  const [firstName,     setFirstName]     = useState(initial.firstName     ?? "");
  const [lastName,      setLastName]      = useState(initial.lastName      ?? "");
  const [gender,        setGender]        = useState(initial.gender        ?? "");

  function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !gender || !studentNumber.trim()) return;
    onSave(firstName.trim(), lastName.trim(), gender, studentNumber.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-2xl bg-[#F4FAF5] p-3">
      <div className="flex flex-col gap-1 w-24">
        <label className="text-[10px] font-bold text-[#5A7566]">No.</label>
        <input autoFocus value={studentNumber} onChange={(e) => setStudentNumber(e.target.value.slice(0, 8))} className="input text-center font-black tracking-widest" />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-[110px]">
        <label className="text-[10px] font-bold text-[#5A7566]">First Name</label>
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input" />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-[110px]">
        <label className="text-[10px] font-bold text-[#5A7566]">Last Name</label>
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="input" />
      </div>
      <div className="flex flex-col gap-1 w-28">
        <label className="text-[10px] font-bold text-[#5A7566]">Gender</label>
        <select value={gender} onChange={(e) => setGender(e.target.value)} className="select">
          <option value="">—</option>
          {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div className="flex gap-2 self-end">
        <button type="submit" disabled={saving || !firstName.trim() || !lastName.trim() || !gender || !studentNumber.trim()} className="btn-primary h-[42px]">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? "Saving…" : "Update"}
        </button>
        <button type="button" onClick={onCancel} className="btn-outline h-[42px]">Cancel</button>
      </div>
    </form>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────── */
export default function LearnersPage({ user, classDoc, onBack }) {
  const { learners, loading, addLearner, editLearner, removeLearner, saveAllScores } =
    useLearners(user.uid, classDoc.id);

  const [activeTab,     setActiveTab]     = useState("roster");
  const [editingId,     setEditingId]     = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [sessionCount,  setSessionCount]  = useState(0);
  const [nextNum,       setNextNum]       = useState("00001");

  const [scoreColumns,  setScoreColumns]  = useState(
    classDoc.scoreColumns ?? Array.from({ length: 12 }, (_, i) => ({ index: i, type: "Quiz" }))
  );
  const [draftScores,   setDraftScores]   = useState({});
  const [savingScores,  setSavingScores]  = useState(false);

  // Keep nextNum in sync with learner count
  useEffect(() => {
    setNextNum(String(learners.length + 1).padStart(5, "0"));
  }, [learners.length]);

  useEffect(() => {
    const patch = {};
    learners.forEach((l) => { patch[l.id] = l.scores ?? Array(12).fill(null); });
    setDraftScores(patch);
  }, [learners]);

  async function handleQuickAdd(firstName, lastName, gender, studentNumber) {
    setSaving(true);
    await addLearner(firstName, lastName, gender, studentNumber);
    setSessionCount((c) => c + 1);
    setSaving(false);
  }

  async function handleEdit(lid, firstName, lastName, gender, studentNumber) {
    setSaving(true);
    await editLearner(lid, firstName, lastName, gender, studentNumber);
    setEditingId(null);
    setSaving(false);
  }

  const handleScoreChange = useCallback((lid, colIdx, val) => {
    setDraftScores((prev) => {
      const row = [...(prev[lid] ?? Array(12).fill(null))];
      row[colIdx] = val === "" ? null : Number(val);
      return { ...prev, [lid]: row };
    });
  }, []);

  function handleColumnTypeChange(colIdx, type) {
    setScoreColumns((prev) => prev.map((c, i) => (i === colIdx ? { ...c, type } : c)));
  }

  async function handleSaveScores() {
    setSavingScores(true);
    try {
      await saveAllScores(draftScores);
      await updateClass(user.uid, classDoc.id, { scoreColumns });
    } finally {
      setSavingScores(false);
    }
  }

  const groups = GENDERS.reduce((acc, g) => {
    const group = learners.filter((l) => l.gender === g).sort(sortAlpha);
    if (group.length > 0) acc.push({ gender: g, members: group });
    return acc;
  }, []);
  const ungrouped = learners.filter((l) => !GENDERS.includes(l.gender)).sort(sortAlpha);
  if (ungrouped.length > 0) groups.push({ gender: "Other", members: ungrouped });

  const totalMale   = learners.filter((l) => l.gender === "Male").length;
  const totalFemale = learners.filter((l) => l.gender === "Female").length;
  const sortedByNumber = [...learners].sort((a, b) => (a.studentNumber ?? "99999").localeCompare(b.studentNumber ?? "99999"));
  const columnLabels   = computeColumnLabels(scoreColumns);

  const sectionBadge = classDoc.sectionCode || classDoc.sectionNumber;

  return (
    <div className="space-y-5">

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-bold text-[#5A7566] hover:bg-[#DCEBDC]">
          <ArrowLeft size={15} /> Classes
        </button>
        <span className="text-[#DCEBDC]">/</span>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-black text-[#163828]">Grade {classDoc.grade} — {classDoc.name}</p>
            {sectionBadge && (
              <span className="rounded-full bg-[#163828] px-2 py-0.5 text-[10px] font-black tracking-widest text-white">
                #{sectionBadge}
              </span>
            )}
          </div>
          <p className="text-xs text-[#5A7566]">{classDoc.subject}</p>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="card p-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-[#5A7566]" />
          <span className="text-sm font-black text-[#163828]">{learners.length} total</span>
        </div>
        <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold text-blue-700">{totalMale} Male</span>
        <span className="rounded-full bg-pink-100 px-3 py-0.5 text-xs font-bold text-pink-700">{totalFemale} Female</span>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 rounded-2xl bg-[#DCEBDC] p-1">
        {[
          { key: "roster", label: "Roster", icon: Users },
          { key: "scores", label: "Scores", icon: ClipboardList },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition-colors ${
              activeTab === key ? "bg-white text-[#163828] shadow-sm" : "text-[#5A7566] hover:text-[#163828]"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ══ ROSTER TAB ══ */}
      {activeTab === "roster" && (
        <>
          {/* Always-visible quick-add strip */}
          <QuickAddLearner
            onSave={handleQuickAdd}
            saving={saving}
            nextStudentNumber={nextNum}
            sessionCount={sessionCount}
          />

          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-[#5A7566]">
              <Loader2 size={16} className="animate-spin" /> Loading learners…
            </div>
          )}

          {!loading && learners.length === 0 && (
            <div className="card flex flex-col items-center gap-3 py-14">
              <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "linear-gradient(135deg,#DCEBDC,#F0F7F1)" }}>
                <UserCircle2 size={26} className="text-[#5A7566]" />
              </div>
              <p className="font-bold text-[#5A7566]">No learners yet — type the first name above and press Add.</p>
            </div>
          )}

          {groups.map(({ gender, members }) => {
            const cfg = GENDER_CONFIG[gender] ?? GENDER_CONFIG.Other;
            return (
              <div key={gender} className="card card-accent overflow-hidden">
                {/* Group header */}
                <div className={`flex items-center justify-between px-6 py-3 border-b ${cfg.accent}`}>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-0.5 text-xs font-black ${cfg.badge}`}>{cfg.label}</span>
                    <span className="text-xs font-bold text-[#5A7566]">{members.length} learner{members.length !== 1 ? "s" : ""}</span>
                  </div>
                  <p className="text-xs italic text-[#9BB8A5]">sorted A → Z</p>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[36px_80px_1fr_90px_44px] gap-2 border-b border-[#F0F7F1] px-5 py-2 text-[10px] font-black uppercase tracking-wider text-[#9BB8A5]">
                  <span>#</span>
                  <span>Student No.</span>
                  <span>Name</span>
                  <span>Gender</span>
                  <span className="text-right">Edit</span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-[#F4FAF5]">
                  {members.map((l, i) =>
                    editingId === l.id ? (
                      <div key={l.id} className="px-5 py-3">
                        <LearnerEditForm
                          initial={l}
                          onSave={(fn, ln, g, sn) => handleEdit(l.id, fn, ln, g, sn)}
                          onCancel={() => setEditingId(null)}
                          saving={saving}
                        />
                      </div>
                    ) : (
                      <div key={l.id} className="grid grid-cols-[36px_80px_1fr_90px_44px] items-center gap-2 px-5 py-3 transition-colors hover:bg-[#F7FBF8]">
                        <span className="grid h-7 w-7 place-items-center rounded-lg text-xs font-black text-white" style={{ background: cfg.icon }}>
                          {i + 1}
                        </span>
                        <span className="rounded-lg bg-[#163828] px-2 py-1 text-center text-[10px] font-black tracking-widest text-white">
                          {l.studentNumber ?? "—"}
                        </span>
                        <div>
                          <p className="font-bold leading-tight text-[#163828]">{l.lastName}, {l.firstName}</p>
                          <p className="text-[10px] text-[#9BB8A5]">Grade {classDoc.grade} · {classDoc.name}</p>
                        </div>
                        <span className={`justify-self-start rounded-full px-2 py-0.5 text-xs font-bold ${cfg.badge}`}>{l.gender}</span>
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => setEditingId(l.id)}
                            className="rounded-lg p-1.5 text-[#5A7566] hover:bg-[#DCEBDC]"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => removeLearner(l.id)}
                            className="rounded-lg p-1.5 text-red-400 hover:bg-red-50"
                            title="Remove"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ══ SCORES TAB ══ */}
      {activeTab === "scores" && (
        <div className="card card-accent overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#DCEBDC] px-6 py-4">
            <div>
              <p className="font-black text-[#163828]">Score Sheet</p>
              <p className="text-xs text-[#5A7566]">Set column types then enter scores. Save when done.</p>
            </div>
            <button onClick={handleSaveScores} disabled={savingScores || learners.length === 0} className="btn-primary">
              {savingScores ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {savingScores ? "Saving…" : "Save Changes"}
            </button>
          </div>

          {loading && (
            <div className="flex items-center gap-2 p-6 text-sm text-[#5A7566]">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          )}

          {!loading && learners.length === 0 && (
            <p className="px-6 py-8 text-sm text-[#5A7566]">Add learners in the Roster tab first.</p>
          )}

          {!loading && learners.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-max w-full border-collapse">
                <thead>
                  <tr className="bg-[#F4FAF5]">
                    <th className="sticky left-0 z-10 bg-[#F4FAF5] px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-[#9BB8A5] min-w-[40px]">#</th>
                    <th className="sticky left-12 z-10 bg-[#F4FAF5] px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-[#9BB8A5] min-w-[180px]">Name</th>
                    {scoreColumns.map((col, i) => (
                      <th key={i} className="min-w-[80px] px-2 py-2">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-black text-[#163828]">{columnLabels[i]}</span>
                          <select
                            value={col.type}
                            onChange={(e) => handleColumnTypeChange(i, e.target.value)}
                            className="cursor-pointer rounded-lg border border-[#DCEBDC] bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#163828] focus:border-[#4CAF50] focus:outline-none"
                          >
                            {COL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4FAF5]">
                  {sortedByNumber.map((l, rowIdx) => (
                    <tr key={l.id} className="transition-colors hover:bg-[#F7FBF8]">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2 text-xs font-black text-[#9BB8A5] hover:bg-[#F7FBF8]">{rowIdx + 1}</td>
                      <td className="sticky left-12 z-10 min-w-[180px] bg-white px-4 py-2 hover:bg-[#F7FBF8]">
                        <p className="whitespace-nowrap text-sm font-bold text-[#163828]">{l.lastName}, {l.firstName}</p>
                        <p className="text-[10px] text-[#9BB8A5]">{l.studentNumber ?? "—"}</p>
                      </td>
                      {scoreColumns.map((_, i) => (
                        <td key={i} className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={draftScores[l.id]?.[i] ?? ""}
                            onChange={(e) => handleScoreChange(l.id, i, e.target.value)}
                            className="w-16 rounded-lg border border-[#DCEBDC] bg-[#F7FBF8] px-2 py-1 text-center text-sm font-bold text-[#163828] transition-colors focus:border-[#4CAF50] focus:bg-white focus:outline-none"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
