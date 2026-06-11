import { useRef, useState } from "react";
import {
  Printer, Trash2, FileCheck, Users, ScanLine,
  ChevronRight, Info, CheckCircle2, Loader2, AlertCircle,
} from "lucide-react";
import BubbleSheet from "../BubbleSheet";
import { useSessions } from "../../hooks/useSessions";
import { useClasses } from "../../hooks/useClasses";
import { useLearners } from "../../hooks/useLearners";
import { useSheets } from "../../hooks/useSheets";
import { useQuiz } from "../../hooks/useQuiz";

const Q_OPTIONS = [10, 15, 20, 25, 30, 40, 50];

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

// ── Print trigger ─────────────────────────────────────────────────────────────

function triggerPrint() {
  const existing = document.getElementById("__kt_sheets_print__");
  if (existing) existing.remove();
  const style = document.createElement("style");
  style.id = "__kt_sheets_print__";
  style.innerHTML = `
    @media print {
      body > * { display: none !important; }
      #kt-print-sheets { display: block !important; }
      #kt-print-sheets * { visibility: visible !important; }
      #kt-print-sheets {
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        margin: 0 !important;
        width: 210mm !important;
      }
      .kt-sheet-page { page-break-after: always; }
      .kt-sheet-page:last-child { page-break-after: auto; }
    }
  `;
  document.head.appendChild(style);
  window.print();
  document.head.removeChild(style);
}

// ── Print tip banner ──────────────────────────────────────────────────────────

function PrintTip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-[#DCEBDC] bg-[#F4FAF5]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Info size={14} className="shrink-0 text-[#4CAF50]" />
        <span className="flex-1 text-xs font-bold text-[#163828]">Print settings for best scan results</span>
        <ChevronRight size={13} className={`text-[#9BB8A5] transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-[#DCEBDC] px-4 pb-4 pt-3">
          <ul className="space-y-1.5 text-xs text-[#5A7566]">
            <li className="flex gap-2"><span className="text-[#4CAF50] shrink-0">•</span> Set paper size to <b>A4</b></li>
            <li className="flex gap-2"><span className="text-[#4CAF50] shrink-0">•</span> Margins: <b>None</b> or <b>Minimum</b></li>
            <li className="flex gap-2"><span className="text-[#4CAF50] shrink-0">•</span> Scale: <b>100% (Actual size)</b> — do not "fit to page"</li>
            <li className="flex gap-2"><span className="text-[#4CAF50] shrink-0">•</span> Print in <b>black &amp; white</b> for sharper bubbles</li>
            <li className="flex gap-2"><span className="text-[#4CAF50] shrink-0">•</span> Uncheck <b>Headers and Footers</b> in browser print dialog</li>
            <li className="flex gap-2"><span className="text-[#4CAF50] shrink-0">•</span> Students should use a <b>dark pencil or ballpoint pen</b> to fill bubbles completely</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Learner sheet thumbnail grid ──────────────────────────────────────────────

function LearnerGrid({ learners, sheetId, sessionTitle, classLabel, sectionCode,
                       effectiveNumQ, effectiveNumChoices, teacherUid, quizId, classId, sessionId }) {
  const SHOW = Math.min(learners.length, 6);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold text-[#5A7566]">
          Previewing <span className="font-black text-[#163828]">{learners.length}</span> personalised sheet{learners.length !== 1 ? "s" : ""}
        </p>
        {learners.length > SHOW && (
          <span className="rounded-full bg-[#DCEBDC] px-2.5 py-0.5 text-[10px] font-bold text-[#5A7566]">
            +{learners.length - SHOW} more will print
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {learners.slice(0, SHOW).map((learner) => (
          <div key={learner.id} className="rounded-xl border border-[#DCEBDC] bg-white overflow-hidden">
            <div className="overflow-hidden" style={{ height: 140 }}>
              <div style={{ transform: "scale(0.26)", transformOrigin: "top left", width: "385%", pointerEvents: "none" }}>
                <BubbleSheet
                  sheetId={sheetId}
                  sessionTitle={sessionTitle}
                  classLabel={classLabel}
                  sectionCode={sectionCode}
                  numQuestions={effectiveNumQ}
                  numChoices={effectiveNumChoices}
                  learner={learner}
                  teacherUid={teacherUid}
                  quizId={quizId}
                  classId={classId}
                  sessionId={sessionId}
                />
              </div>
            </div>
            <div className="border-t border-[#DCEBDC] px-2 py-1.5">
              <p className="truncate text-[10px] font-black text-[#163828]">
                {learner.firstName} {learner.lastName}
              </p>
              <p className="text-[9px] text-[#9BB8A5]">#{learner.studentNumber}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScannerPage({ user }) {
  const { sessions }                       = useSessions(user.uid);
  const { classes }                        = useClasses(user.uid);
  const { sheets, addSheet, removeSheet }  = useSheets(user.uid);

  const [sessionId,    setSessionId]    = useState("");
  const [classId,      setClassId]      = useState("");
  const [quizId,       setQuizId]       = useState("");
  const [numQuestions, setNumQuestions] = useState(20);
  const [numChoices,   setNumChoices]   = useState(4);
  const [sheetId,      setSheetId]      = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [showPreview,  setShowPreview]  = useState(false);
  const [perLearner,   setPerLearner]   = useState(true);
  const [flashId,      setFlashId]      = useState(null);

  const singleRef = useRef(null);

  const { quizzes }  = useQuiz(user.uid, sessionId || undefined);
  const { learners } = useLearners(user.uid, classId);

  const selectedSession = sessions.find((s) => s.id === sessionId);
  const selectedClass   = classes.find((c) => c.id === classId);
  const selectedQuiz    = quizzes.find((q) => q.id === quizId);

  const sessionTitle = selectedSession?.title ?? "";
  const classLabel   = selectedClass
    ? `Grade ${selectedClass.grade} — ${selectedClass.name} (${selectedClass.subject})`
    : "";

  const effectiveNumQ       = selectedQuiz?.numQuestions ?? numQuestions;
  const effectiveNumChoices = selectedQuiz?.numChoices   ?? numChoices;

  const canGenerate        = !!(sessionId && classId);
  const isPerLearnerMode   = perLearner && classId && learners.length > 0;
  const showPerLearnerView = showPreview && sheetId && isPerLearnerMode;
  const showSingleView     = showPreview && sheetId && !isPerLearnerMode;

  async function handleGenerate() {
    if (!canGenerate || saving) return;
    setSaving(true);
    const id = await addSheet({
      sessionId,
      sessionTitle,
      classId,
      classLabel,
      quizId:      quizId || "",
      numQuestions: effectiveNumQ,
      numChoices:   effectiveNumChoices,
      perLearner,
    });
    setSheetId(id);
    setShowPreview(true);
    setFlashId(id);
    setTimeout(() => setFlashId(null), 2500);
    setSaving(false);
  }

  function loadFromHistory(s) {
    setSheetId(s.sheetId);
    setSessionId(s.sessionId ?? "");
    setClassId(s.classId ?? "");
    setQuizId(s.quizId ?? "");
    setNumQuestions(s.numQuestions);
    setNumChoices(s.numChoices);
    setPerLearner(s.perLearner ?? true);
    setShowPreview(true);
  }

  return (
    <div className="space-y-6">

      {/* ── Config ─────────────────────────────────────────────────────── */}
      <div className="card card-accent p-6">
        <h3 className="text-lg font-black text-[#163828]">Generate Bubble Sheets</h3>
        <p className="mt-0.5 text-xs text-[#5A7566]">Configure and generate printable answer sheets for your class</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">

          {/* Session */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Session <span className="text-red-400">*</span></label>
            <select
              value={sessionId}
              onChange={(e) => { setSessionId(e.target.value); setQuizId(""); setShowPreview(false); }}
              className="select"
            >
              <option value="">Select a session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>

          {/* Class */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Class Section <span className="text-red-400">*</span></label>
            <select
              value={classId}
              onChange={(e) => { setClassId(e.target.value); setShowPreview(false); }}
              className="select"
            >
              <option value="">Select a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.sectionCode ? `#${c.sectionCode} — ` : ""}Grade {c.grade} — {c.name} ({c.subject})
                </option>
              ))}
            </select>
          </div>

          {/* Quiz */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">
              Quiz / Answer Key <span className="font-normal text-[#9BB8A5]">(optional)</span>
            </label>
            <select
              value={quizId}
              onChange={(e) => setQuizId(e.target.value)}
              className="select"
            >
              <option value="">— No quiz linked —</option>
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} ({q.numQuestions}Q)
                </option>
              ))}
            </select>
          </div>

          {/* Sheet mode */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Sheet mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setPerLearner(true)}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                  perLearner
                    ? "bg-[#163828] text-white"
                    : "border border-[#DCEBDC] text-[#5A7566] hover:bg-[#F4FAF5]"
                }`}
              >
                <Users size={13} /> Per Learner
              </button>
              <button
                onClick={() => setPerLearner(false)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                  !perLearner
                    ? "bg-[#163828] text-white"
                    : "border border-[#DCEBDC] text-[#5A7566] hover:bg-[#F4FAF5]"
                }`}
              >
                Generic
              </button>
            </div>
            {perLearner && classId && learners.length === 0 && (
              <p className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600">
                <AlertCircle size={11} /> No learners in this class — add learners first or switch to Generic
              </p>
            )}
            {perLearner && classId && learners.length > 0 && (
              <p className="mt-1.5 text-[10px] text-[#5A7566]">
                Will generate <b className="text-[#163828]">{learners.length}</b> personalised sheets
              </p>
            )}
          </div>

          {/* Q count + choices (when no quiz linked) */}
          {!selectedQuiz && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Questions</label>
                <div className="flex flex-wrap gap-2">
                  {Q_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setNumQuestions(n)}
                      className={`rounded-xl px-3 py-1.5 text-sm font-bold transition-colors ${
                        numQuestions === n
                          ? "bg-[#163828] text-white"
                          : "border border-[#DCEBDC] text-[#5A7566] hover:bg-[#F4FAF5]"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Choices per question</label>
                <div className="flex gap-2">
                  {[4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setNumChoices(n)}
                      className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                        numChoices === n
                          ? "bg-[#163828] text-white"
                          : "border border-[#DCEBDC] text-[#5A7566] hover:bg-[#F4FAF5]"
                      }`}
                    >
                      {n === 4 ? "A – D (4)" : "A – E (5)"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Quiz info when linked */}
          {selectedQuiz && (
            <div className="sm:col-span-2 rounded-2xl bg-[#F4FAF5] px-4 py-3 border border-[#DCEBDC]">
              <p className="text-xs font-black text-[#163828]">{selectedQuiz.title}</p>
              <p className="text-xs text-[#5A7566]">
                {selectedQuiz.numQuestions}Q / {selectedQuiz.numChoices} choices ·{" "}
                {selectedQuiz.status === "final"
                  ? <span className="text-[#4CAF50] font-bold">Final quiz · answer key locked in</span>
                  : <span className="text-amber-600 font-bold">Draft quiz</span>
                }
              </p>
            </div>
          )}
        </div>

        {/* Action row */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || saving}
            className="btn-primary"
          >
            {saving
              ? <><Loader2 size={15} className="animate-spin" /> Generating…</>
              : <><FileCheck size={15} />
                {isPerLearnerMode ? `Generate ${learners.length} Sheets` : "Generate Sheet"}</>
            }
          </button>
          {showPreview && (
            <button onClick={triggerPrint} className="btn-outline">
              <Printer size={15} /> Print All
            </button>
          )}
        </div>

        {/* Print tip */}
        {showPreview && (
          <div className="mt-4">
            <PrintTip />
          </div>
        )}
      </div>

      {/* ── Per-learner preview grid ────────────────────────────────────── */}
      {showPerLearnerView && (
        <div className={`card card-accent p-6 transition-all ${flashId ? "ring-2 ring-[#4CAF50]" : ""}`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-[#163828]">Sheets Ready</h3>
              <p className="text-xs text-[#5A7566]">
                {selectedClass?.sectionCode ? `Section #${selectedClass.sectionCode} · ` : ""}
                {learners.length} learner sheet{learners.length !== 1 ? "s" : ""} · {effectiveNumQ}Q
              </p>
            </div>
            <button onClick={triggerPrint} className="btn-primary">
              <Printer size={15} /> Print All
            </button>
          </div>

          <LearnerGrid
            learners={learners}
            sheetId={sheetId}
            sessionTitle={sessionTitle}
            classLabel={classLabel}
            sectionCode={selectedClass?.sectionCode}
            effectiveNumQ={effectiveNumQ}
            effectiveNumChoices={effectiveNumChoices}
            teacherUid={user.uid}
            quizId={quizId}
            classId={classId}
            sessionId={sessionId}
          />

          {flashId && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#D4EDDA] px-3 py-2 text-xs font-bold text-[#163828]">
              <CheckCircle2 size={14} className="text-[#4CAF50]" />
              Sheets generated and saved. Click Print All when ready.
            </div>
          )}
        </div>
      )}

      {/* ── Generic single sheet preview ───────────────────────────────── */}
      {showSingleView && (
        <div className="card card-accent p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-[#163828]">Sheet Preview</h3>
              <p className="text-xs text-[#5A7566]">Generic sheet · {effectiveNumQ}Q · {effectiveNumChoices} choices</p>
            </div>
            <button onClick={triggerPrint} className="btn-primary">
              <Printer size={15} /> Print Sheet
            </button>
          </div>
          <div className="overflow-auto rounded-xl border border-[#DCEBDC] bg-gray-50">
            <BubbleSheet
              ref={singleRef}
              sheetId={sheetId}
              sessionTitle={sessionTitle}
              classLabel={classLabel}
              sectionCode={selectedClass?.sectionCode}
              numQuestions={effectiveNumQ}
              numChoices={effectiveNumChoices}
              sessionId={sessionId}
            />
          </div>
        </div>
      )}

      {/* ── Hidden full-resolution print area ──────────────────────────── */}
      {/* NOTE: display:none is intentional; triggerPrint() overrides it via @media print */}
      <div id="kt-print-sheets" style={{ display: "none" }}>
        {showPerLearnerView
          ? learners.map((learner) => (
              <div key={learner.id} className="kt-sheet-page">
                <BubbleSheet
                  sheetId={sheetId}
                  sessionTitle={sessionTitle}
                  classLabel={classLabel}
                  sectionCode={selectedClass?.sectionCode}
                  numQuestions={effectiveNumQ}
                  numChoices={effectiveNumChoices}
                  learner={learner}
                  teacherUid={user.uid}
                  quizId={quizId}
                  classId={classId}
                  sessionId={sessionId}
                />
              </div>
            ))
          : showSingleView && (
              <BubbleSheet
                sheetId={sheetId}
                sessionTitle={sessionTitle}
                classLabel={classLabel}
                sectionCode={selectedClass?.sectionCode}
                numQuestions={effectiveNumQ}
                numChoices={effectiveNumChoices}
                sessionId={sessionId}
              />
            )}
      </div>

      {/* ── Sheet history ───────────────────────────────────────────────── */}
      <div className="card card-accent p-6">
        <div className="mb-4 flex items-center gap-2">
          <ScanLine size={16} className="text-[#5A7566]" />
          <h3 className="text-base font-black text-[#163828]">Generated Sheets</h3>
          {sheets.length > 0 && (
            <span className="rounded-full bg-[#DCEBDC] px-2.5 py-0.5 text-[10px] font-bold text-[#5A7566]">
              {sheets.length}
            </span>
          )}
        </div>
        <div className="space-y-2">
          {sheets.length === 0 && (
            <p className="py-4 text-center text-sm text-[#9BB8A5]">No sheets generated yet.</p>
          )}
          {sheets.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-2xl border border-[#DCEBDC] px-4 py-3 transition-colors hover:border-[#4CAF50] hover:bg-[#F7FBF8]"
            >
              <button
                onClick={() => loadFromHistory(s)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                  style={{ background: "linear-gradient(135deg,#163828,#4CAF50)" }}
                >
                  <Printer size={14} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-[#163828]">{s.sessionTitle || "Untitled session"}</p>
                  <p className="text-xs text-[#5A7566]">
                    {s.classLabel || "No class"} · {s.numQuestions}Q / {s.numChoices} choices
                    {s.quizId ? " · Quiz linked" : ""}
                    {s.perLearner ? " · Per-learner" : " · Generic"}
                    {" · "}{formatDate(s.createdAt)}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#9BB8A5]">ID: {s.sheetId}</p>
                </div>
              </button>
              <button
                onClick={() => removeSheet(s.id)}
                className="ml-3 rounded-xl p-1.5 text-red-400 hover:bg-red-50"
                title="Delete record"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
