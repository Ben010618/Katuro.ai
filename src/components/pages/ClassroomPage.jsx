import { useState, useRef, useEffect } from "react";
import { Pencil, Trash2, Users, ChevronRight, Loader2, GraduationCap, CheckCircle2 } from "lucide-react";
import { useClasses } from "../../hooks/useClasses";
import LearnersPage from "./LearnersPage";

const GRADES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

function QuickAddClass({ onSave, saving, nextCode }) {
  const [name,        setName]        = useState("");
  const [subject,     setSubject]     = useState("");
  const [grade,       setGrade]       = useState("");
  const [sectionCode, setSectionCode] = useState(nextCode ?? "");
  const codeRef = useRef(null);

  useEffect(() => { setSectionCode(nextCode ?? ""); }, [nextCode]);

  const canSubmit = name.trim() && subject.trim() && grade && sectionCode.trim();

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    onSave(name.trim(), subject.trim(), grade, sectionCode.trim().toUpperCase());
    setName("");
    setSubject("");
    setGrade("");
    // sectionCode is reset by parent updating nextCode via key
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card card-accent p-4"
    >
      <p className="mb-3 text-xs font-black uppercase tracking-wider text-[#163828]">
        Add Class Section
      </p>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1 w-20">
          <label className="text-[10px] font-bold text-[#5A7566]">Code <span className="font-normal text-[#9BB8A5]">scanner</span></label>
          <input
            ref={codeRef}
            value={sectionCode}
            onChange={(e) => setSectionCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="001"
            className="input text-center font-black tracking-widest"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
          <label className="text-[10px] font-bold text-[#5A7566]">Section Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mahogany"
            className="input"
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
          <label className="text-[10px] font-bold text-[#5A7566]">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Mathematics"
            className="input"
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          />
        </div>
        <div className="flex flex-col gap-1 w-32">
          <label className="text-[10px] font-bold text-[#5A7566]">Grade Level</label>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className="select">
            <option value="">Grade…</option>
            {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </select>
        </div>
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="btn-primary h-[42px] self-end"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {saving ? "Saving…" : "Add Section"}
        </button>
      </div>
      <p className="mt-2 text-[10px] text-[#9BB8A5]">Tab between fields · Enter or click Add Section to save</p>
    </form>
  );
}

function ClassEditForm({ initial, onSave, onCancel, saving }) {
  const [name,        setName]        = useState(initial.name        ?? "");
  const [subject,     setSubject]     = useState(initial.subject     ?? "");
  const [grade,       setGrade]       = useState(initial.grade       ?? "");
  const [sectionCode, setSectionCode] = useState(initial.sectionCode ?? "");

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !subject.trim() || !grade || !sectionCode.trim()) return;
    onSave(name.trim(), subject.trim(), grade, sectionCode.trim().toUpperCase());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end rounded-2xl bg-[#F4FAF5] p-4">
      <div className="flex flex-col gap-1 w-20">
        <label className="text-[10px] font-bold text-[#5A7566]">Code</label>
        <input autoFocus value={sectionCode} onChange={(e) => setSectionCode(e.target.value.toUpperCase().slice(0, 6))} className="input text-center font-black tracking-widest" />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
        <label className="text-[10px] font-bold text-[#5A7566]">Section Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
        <label className="text-[10px] font-bold text-[#5A7566]">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" />
      </div>
      <div className="flex flex-col gap-1 w-32">
        <label className="text-[10px] font-bold text-[#5A7566]">Grade</label>
        <select value={grade} onChange={(e) => setGrade(e.target.value)} className="select">
          <option value="">Grade…</option>
          {GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
        </select>
      </div>
      <div className="flex gap-2 self-end">
        <button type="submit" disabled={saving || !name.trim() || !subject.trim() || !grade || !sectionCode.trim()} className="btn-primary h-[42px]">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? "Saving…" : "Update"}
        </button>
        <button type="button" onClick={onCancel} className="btn-outline h-[42px]">Cancel</button>
      </div>
    </form>
  );
}

export default function ClassroomPage({ user, onOpenClass, selectedClass }) {
  const { classes, loading, addClass, editClass, removeClass } = useClasses(user.uid);
  const [editingId,  setEditingId]  = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [flashId,    setFlashId]    = useState(null);

  if (selectedClass) {
    return <LearnersPage user={user} classDoc={selectedClass} onBack={() => onOpenClass(null)} />;
  }

  const nextCode = String(classes.length + 1).padStart(3, "0");

  async function handleAdd(name, subject, grade, sectionCode) {
    setSaving(true);
    await addClass(name, subject, grade, sectionCode);
    setSaving(false);
    setFlashId(sectionCode);
    setTimeout(() => setFlashId(null), 2500);
  }

  async function handleEdit(cid, name, subject, grade, sectionCode) {
    setSaving(true);
    await editClass(cid, name, subject, grade, sectionCode);
    setEditingId(null);
    setSaving(false);
  }

  return (
    <div className="space-y-5">

      {/* Quick-add form — always visible */}
      <QuickAddClass onSave={handleAdd} saving={saving} nextCode={nextCode} />

      {/* Flash success banner */}
      {flashId && (
        <div className="flex items-center gap-2 rounded-2xl bg-[#D4EDDA] px-4 py-2.5 text-sm font-bold text-[#163828]">
          <CheckCircle2 size={16} className="text-[#2E7D32]" />
          Section <span className="font-black">#{flashId}</span> added! Fill in the next section below.
        </div>
      )}

      {/* Sections list */}
      <div className="card card-accent p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-[#163828]">Class Sections</h3>
            <p className="text-xs text-[#5A7566]">
              {loading ? "Loading…" : `${classes.length} section${classes.length !== 1 ? "s" : ""} · click a row to manage learners`}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {loading && <p className="py-4 text-sm text-[#5A7566]">Loading…</p>}

          {!loading && classes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10">
              <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "linear-gradient(135deg,#DCEBDC,#F0F7F1)" }}>
                <GraduationCap size={26} className="text-[#5A7566]" />
              </div>
              <p className="text-sm text-[#5A7566]">No sections yet — add the first one above.</p>
            </div>
          )}

          {classes.map((c) =>
            editingId === c.id ? (
              <ClassEditForm
                key={c.id}
                initial={c}
                onSave={(n, s, g, sc) => handleEdit(c.id, n, s, g, sc)}
                onCancel={() => setEditingId(null)}
                saving={saving}
              />
            ) : (
              <div
                key={c.id}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 transition-all ${
                  flashId === (c.sectionCode || c.sectionNumber)
                    ? "border-[#4CAF50] bg-[#F0FAF1] shadow-md"
                    : "border-[#DCEBDC] hover:border-[#4CAF50] hover:bg-[#F7FBF8]"
                }`}
              >
                <button onClick={() => onOpenClass?.(c)} className="flex flex-1 items-center gap-3 text-left">
                  <div
                    className="grid h-11 w-14 shrink-0 place-items-center rounded-xl"
                    style={{ background: "linear-gradient(135deg,#163828,#2E7D32)", boxShadow: "0 4px 10px rgba(22,56,40,0.25)" }}
                  >
                    <span className="text-xs font-black tracking-widest text-white">
                      {c.sectionCode || c.sectionNumber}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-[#163828]">Grade {c.grade} — {c.name}</p>
                      <span className="rounded-full bg-[#D4EDDA] px-2 py-0.5 text-[10px] font-bold text-[#163828]">
                        {c.subject}
                      </span>
                    </div>
                    <p className="text-xs text-[#9BB8A5]">Scanner code: <span className="font-black text-[#5A7566]">#{c.sectionCode || c.sectionNumber}</span></p>
                  </div>
                  <span className="mr-2 rounded-full bg-[#D4EDDA] px-3 py-0.5 text-xs font-bold text-[#163828]">
                    Grade {c.grade}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-[#5A7566]" />
                </button>

                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => { setEditingId(c.id); }}
                    className="rounded-xl p-1.5 text-[#5A7566] hover:bg-[#DCEBDC]"
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => removeClass(c.id)}
                    className="rounded-xl p-1.5 text-red-400 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
