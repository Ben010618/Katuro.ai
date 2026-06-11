import { useState, useEffect, useRef } from "react";
import {
  Wand2, Save, CheckSquare, Trash2, Pencil, ChevronDown, ChevronUp,
  Loader2, ClipboardList, ArrowUp, ArrowDown, Copy, X, Sparkles, Eye,
  Lock, CheckCircle2, BookOpen, FileDown, Keyboard, Lightbulb,
  FileText, Calendar, RefreshCw, Brain, Target, Layers, AlertCircle,
  Printer, FileQuestion,
} from "lucide-react";
import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
} from "docx";
import { useQuiz } from "../../hooks/useQuiz";
import { useLessonPlans } from "../../hooks/useLessonPlans";
import { AI_ENABLED, generateQuizAI, suggestQuizTitle } from "../../services/ai";
import BubbleSheetPrint from "../BubbleSheetPrint";

const CHOICE_LABELS = { 4: ["A", "B", "C", "D"], 5: ["A", "B", "C", "D", "E"] };
const Q_COUNTS = [5, 10, 15, 20, 25, 30, 40, 50];

const DIFFICULTY_OPTIONS = [
  { key: "mixed",         label: "Mixed",         icon: Layers, tip: "Balanced recall, comprehension & application" },
  { key: "recall",        label: "Recall",        icon: Brain,  tip: "Definitions, facts, identification" },
  { key: "comprehension", label: "Comprehension", icon: BookOpen, tip: "Explaining, comparing, understanding" },
  { key: "application",  label: "Application",   icon: Target, tip: "Scenarios, problem-solving, critical thinking" },
];

const DIFFICULTY_PROMPT = {
  mixed:         "",
  recall:        "Focus entirely on recall and memory questions — definitions, identification, and factual items only.",
  comprehension: "Focus on comprehension questions — understanding, explaining concepts, making comparisons.",
  application:   "Focus on application and scenario-based questions — real-world problems, critical thinking, analysis.",
};

const AI_STEPS = [
  { pct: 12, label: "Reading lesson content…" },
  { pct: 28, label: "Identifying key concepts…" },
  { pct: 48, label: "Drafting questions…" },
  { pct: 68, label: "Crafting distractors…" },
  { pct: 84, label: "Checking answer key…" },
  { pct: 94, label: "Finalizing…" },
];

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function emptyQuestion() {
  return { text: "", choices: { A: "", B: "", C: "", D: "", E: "" }, competency: "" };
}

// ── Part header ───────────────────────────────────────────────────────────────

function PartHeader({ n, title, subtitle, locked, done }) {
  return (
    <div className="flex items-center gap-4 mb-5">
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black text-white ${
          done ? "bg-[#4CAF50]" : locked ? "bg-[#DCEBDC]" : ""
        }`}
        style={!done && !locked ? { background: "linear-gradient(135deg,#163828,#4CAF50)" } : {}}
      >
        {done ? <CheckCircle2 size={18} /> : locked ? <Lock size={14} className="text-[#9BB8A5]" /> : n}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={`text-base font-black ${locked ? "text-[#9BB8A5]" : "text-[#163828]"}`}>
            Part {n}: {title}
          </h3>
          {done && <span className="rounded-full bg-[#D4EDDA] px-2.5 py-0.5 text-[10px] font-black text-[#2E7D32]">Done</span>}
          {locked && <span className="rounded-full bg-[#F4FAF5] px-2.5 py-0.5 text-[10px] font-bold text-[#9BB8A5]">Locked</span>}
        </div>
        <p className={`text-xs ${locked ? "text-[#DCEBDC]" : "text-[#5A7566]"}`}>{subtitle}</p>
      </div>
    </div>
  );
}

// ── Lesson context badge ──────────────────────────────────────────────────────

function LessonContextBadge({ context, plan, loading }) {
  const [open, setOpen] = useState(false);
  if (loading) return (
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#F4FAF5] px-3 py-2 text-xs text-[#5A7566]">
      <Loader2 size={12} className="animate-spin" /> Loading lesson content…
    </div>
  );
  if (!context) return null;
  return (
    <div className="mt-3 rounded-xl border border-[#DCEBDC] bg-[#F4FAF5]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <BookOpen size={13} className="shrink-0 text-[#4CAF50]" />
        <span className="flex-1 text-xs font-black text-[#163828]">
          {context.topic ? `Lesson content — ${context.topic}` : `${context.subject} ${context.gradeLevel}`}
        </span>
        {plan && <span className="rounded-full bg-[#D4EDDA] px-2 py-0.5 text-[9px] font-bold text-[#2E7D32]">+ 4A's Plan</span>}
        {open ? <ChevronUp size={12} className="text-[#9BB8A5]" /> : <ChevronDown size={12} className="text-[#9BB8A5]" />}
      </button>
      {open && (
        <div className="border-t border-[#DCEBDC] px-3 pb-3 pt-2 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {[["Subject", context.subject], ["Grade", context.gradeLevel], ["Topic", context.topic]].map(([l, v]) => (
              <div key={l}>
                <p className="text-[9px] font-black uppercase tracking-wider text-[#9BB8A5]">{l}</p>
                <p className="text-xs font-bold text-[#163828]">{v || "—"}</p>
              </div>
            ))}
          </div>
          {context.objectives?.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-[#9BB8A5] mb-1">Objectives</p>
              <ul className="space-y-0.5">
                {context.objectives.slice(0, 3).map((o, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] text-[#5A7566]">
                    <span className="text-[#4CAF50] shrink-0">•</span>{o}
                  </li>
                ))}
                {context.objectives.length > 3 && (
                  <li className="text-[10px] text-[#9BB8A5]">+{context.objectives.length - 3} more</li>
                )}
              </ul>
            </div>
          )}
          {context.keyTerms?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {context.keyTerms.slice(0, 8).map((t) => (
                <span key={t} className="rounded-full bg-white border border-[#DCEBDC] px-2 py-0.5 text-[10px] text-[#5A7566]">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Export test paper as .docx ────────────────────────────────────────────────

async function buildTestDocx({ title, numQ, numChoices, questions, answerKey, lessonContext }) {
  const letters = CHOICE_LABELS[numChoices] || CHOICE_LABELS[4];
  const subjectLine = lessonContext
    ? [lessonContext.subject, lessonContext.topic].filter(Boolean).join(" — ")
    : "";

  const sp = (before = 0, after = 0) => ({ spacing: { before, after } });
  const run = (text, opts = {}) => new TextRun({ text, size: 22, ...opts });

  const children = [
    new Paragraph({
      children: [run(title || "Quiz", { bold: true, size: 36 })],
      alignment: AlignmentType.CENTER,
      ...sp(0, subjectLine ? 80 : 200),
    }),
    ...(subjectLine ? [new Paragraph({
      children: [run(subjectLine, { size: 22, color: "444444" })],
      alignment: AlignmentType.CENTER,
      ...sp(0, 200),
    })] : []),
    new Paragraph({
      children: [
        run("Name: ", { bold: true }),
        run("______________________________   "),
        run("Score: ", { bold: true }),
        run(`_____ / ${numQ}`),
      ],
      ...sp(0, 60),
    }),
    new Paragraph({
      children: [
        run("Section: ", { bold: true }),
        run("______________________________   "),
        run("Date: ", { bold: true }),
        run("________________"),
      ],
      ...sp(0, 200),
    }),
    new Paragraph({
      children: [run(
        "Directions: Read each item carefully. Choose the letter of the BEST answer and write it on the blank before each number.",
        { italics: true, size: 20 }
      )],
      ...sp(0, 240),
    }),
  ];

  questions.slice(0, numQ).forEach((q, i) => {
    children.push(new Paragraph({
      children: [
        run(`___ ${i + 1}.  `, { bold: true }),
        run(q.text || "________________________________________________"),
      ],
      ...sp(200, 80),
    }));
    letters.forEach((letter) => {
      children.push(new Paragraph({
        children: [
          run(`      ${letter}.  `, { bold: true, color: "333333" }),
          run(q.choices?.[letter] || "___________________________"),
        ],
        ...sp(0, 40),
      }));
    });
  });

  if (answerKey.some(Boolean)) {
    children.push(
      new Paragraph({ children: [run("")], pageBreakBefore: true }),
      new Paragraph({
        children: [run("ANSWER KEY  (TEACHER'S COPY — DO NOT DISTRIBUTE)", { bold: true, size: 24, color: "163828" })],
        alignment: AlignmentType.CENTER,
        ...sp(0, 240),
      }),
    );
    for (let i = 0; i < numQ; i += 10) {
      const slice = answerKey.slice(i, i + 10);
      children.push(new Paragraph({
        children: [run(
          slice.map((k, j) => `${String(i + j + 1).padStart(2, " ")}. ${k || " "}`).join("    "),
          { font: "Courier New", size: 20 }
        )],
        ...sp(0, 80),
      }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title || "Quiz"}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);
}


// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuizBuilderPage({ user, onNavigate }) {
  const { quizzes, addQuiz, editQuiz, removeQuiz } = useQuiz(user.uid, null);

  // Lesson plans from archive (Step 2) — live hook keeps list fresh after Lesson Gen saves
  const { lessonPlans, loading: plansLoading, refresh: refreshPlans } = useLessonPlans(user.uid);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPlan,   setSelectedPlan]   = useState(null);

  // lesson content derived from selected plan
  const [lessonContext,  setLessonContext]  = useState(null);
  const [lessonPlan,     setLessonPlan]     = useState(null);
  const [contextLoading, setContextLoading] = useState(false);

  // quiz form state
  const [editingId,    setEditingId]    = useState(null);
  const [title,        setTitle]        = useState("");
  const [numQ,         setNumQ]         = useState(20);
  const [numChoices,   setNumChoices]   = useState(4);
  const [answerKey,    setAnswerKey]    = useState(Array(20).fill(""));
  const [questions,    setQuestions]    = useState(() => Array(20).fill(null).map(emptyQuestion));
  const [showText,     setShowText]     = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [focusedQ,     setFocusedQ]     = useState(null);
  const rowRefs = useRef({});

  // AI + path state
  const [path,            setPath]            = useState(null); // "ai" | "manual"
  const [aiPrompt,        setAiPrompt]        = useState("");
  const [aiDifficulty,    setAiDifficulty]    = useState("mixed");
  const [aiLoading,       setAiLoading]       = useState(false);
  const [aiProgress,      setAiProgress]      = useState(0);
  const [aiStep,          setAiStep]          = useState("");
  const [aiError,         setAiError]         = useState("");
  const [aiPreview,       setAiPreview]       = useState(null);
  const [rerollingIdx,    setRerollingIdx]    = useState(null);
  const [editingPreviewIdx, setEditingPreviewIdx] = useState(null);
  const [titleSuggesting, setTitleSuggesting] = useState(false);
  const aiProgressRef = useRef(null);

  // save + export state
  const [saving,        setSaving]        = useState(false);
  const [exportingDoc,  setExportingDoc]  = useState(false);
  const [savedInfo,     setSavedInfo]     = useState(null);
  const [dlState,       setDlState]       = useState({}); // { [quizId]: "questionnaire" }
  const [printingQuiz,  setPrintingQuiz]  = useState(null);

  const choices      = CHOICE_LABELS[numChoices];
  const filledCount  = answerKey.filter(Boolean).length;
  const allFilled    = filledCount === numQ;
  const hasQuestions = questions.some((q) => q.text?.trim());

  // Lock states: need a lesson plan + title to unlock Part 2
  const part2Locked = !selectedPlanId || !title.trim();
  const part3Locked = part2Locked;

  // ── Derive lesson context from selected plan ─────────────────────────────

  useEffect(() => {
    if (!selectedPlanId) { setSelectedPlan(null); setLessonContext(null); setLessonPlan(null); return; }
    const plan = lessonPlans.find((p) => p.id === selectedPlanId);
    setSelectedPlan(plan || null);
    if (!plan) { setLessonContext(null); setLessonPlan(null); return; }

    setContextLoading(true);

    // Build context from fields stored alongside the plan document
    const ctx = {
      subject:      plan.subject      || "",
      gradeLevel:   plan.grade        || "",
      topic:        plan.topic        || "",
      objectives:   plan.objectives   || [],
      keyTerms:     plan.keyTerms     || [],
      competencies: plan.competencies || [],
      summary:      plan.summary      || "",
    };

    // Also parse 4As content for richer AI prompts
    let parsed = null;
    try { parsed = JSON.parse(plan.content || "{}"); } catch {}

    // Supplement with plan overview if stored context fields are empty
    if (parsed?.overview) {
      if (!ctx.topic)            ctx.topic      = parsed.overview.topic    || "";
      if (!ctx.objectives.length) ctx.objectives = parsed.overview.objectives || [];
    }

    setLessonContext(ctx.subject || ctx.topic ? ctx : null);
    setLessonPlan(parsed);
    setContextLoading(false);
  }, [selectedPlanId, lessonPlans]);

  // ── Sync array lengths ───────────────────────────────────────────────────

  useEffect(() => {
    setAnswerKey((prev) => {
      const n = [...prev];
      while (n.length < numQ) n.push("");
      return n.slice(0, numQ);
    });
    setQuestions((prev) => {
      const n = [...prev];
      while (n.length < numQ) n.push(emptyQuestion());
      return n.slice(0, numQ);
    });
  }, [numQ]);

  // ── Answer key helpers ───────────────────────────────────────────────────

  function setAnswer(i, letter) {
    setAnswerKey((prev) => { const n = [...prev]; n[i] = letter; return n; });
  }

  function setQField(i, field, val) {
    setQuestions((prev) => { const n = [...prev]; n[i] = { ...n[i], [field]: val }; return n; });
  }

  function setChoiceText(i, letter, val) {
    setQuestions((prev) => {
      const n = [...prev];
      n[i] = { ...n[i], choices: { ...n[i].choices, [letter]: val } };
      return n;
    });
  }

  function toggleRow(i) { setExpandedRows((p) => ({ ...p, [i]: !p[i] })); }

  function moveQuestion(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= numQ) return;
    setAnswerKey((prev) => { const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setQuestions((prev) => { const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setExpandedRows((prev) => {
      const next = { ...prev };
      const vi = !!prev[i], vj = !!prev[j];
      next[i] = vj; next[j] = vi;
      return next;
    });
    setTimeout(() => rowRefs.current[j]?.focus(), 0);
  }

  function deleteQuestion(i) {
    setAnswerKey((prev) => prev.filter((_, idx) => idx !== i));
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
    setExpandedRows((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < i) next[ki] = v;
        else if (ki > i) next[ki - 1] = v;
      });
      return next;
    });
    setNumQ((prev) => prev - 1);
  }

  function handleRowKeyDown(e, i) {
    const letter = e.key.toUpperCase();
    if (choices.includes(letter)) {
      e.preventDefault();
      setAnswer(i, letter);
      rowRefs.current[i + 1]?.focus();
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); rowRefs.current[i + 1]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); rowRefs.current[i - 1]?.focus(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && document.activeElement === rowRefs.current[i]) {
      e.preventDefault(); setAnswer(i, "");
    }
  }

  // ── AI handlers ──────────────────────────────────────────────────────────

  async function handleAISuggestTitle() {
    if (!lessonContext || titleSuggesting) return;
    setTitleSuggesting(true);
    try {
      const suggested = await suggestQuizTitle(lessonContext);
      if (suggested) setTitle(suggested);
    } catch (e) {
      alert("AI title suggestion failed: " + e.message);
    } finally {
      setTitleSuggesting(false);
    }
  }

  function startAiProgress() {
    let step = 0;
    setAiProgress(AI_STEPS[0].pct);
    setAiStep(AI_STEPS[0].label);
    aiProgressRef.current = setInterval(() => {
      step = Math.min(step + 1, AI_STEPS.length - 1);
      setAiProgress(AI_STEPS[step].pct);
      setAiStep(AI_STEPS[step].label);
    }, 1800);
  }

  function stopAiProgress() {
    clearInterval(aiProgressRef.current);
    aiProgressRef.current = null;
    setAiProgress(100);
    setAiStep("Done!");
    setTimeout(() => { setAiProgress(0); setAiStep(""); }, 600);
  }

  function mapQuizResult(result, count) {
    const qs  = result.questions || [];
    const key = qs.map((q) => q.answer || "");
    while (key.length < count) key.push("");
    const mapped = qs.slice(0, count).map((q) => ({
      text:       q.text || "",
      choices:    q.choices || { A: "", B: "", C: "", D: "", E: "" },
      competency: q.competency || "",
      difficulty: q.difficulty || "",
    }));
    while (mapped.length < count) mapped.push(emptyQuestion());
    return { questions: mapped, answerKey: key.slice(0, count) };
  }

  async function handleAIGenerate() {
    if (!lessonContext) {
      setAiError("No lesson content found — select a lesson plan in Part 1 first.");
      return;
    }
    setAiLoading(true);
    setAiError("");
    setAiPreview(null);
    setEditingPreviewIdx(null);
    startAiProgress();
    const combined = [DIFFICULTY_PROMPT[aiDifficulty], aiPrompt].filter(Boolean).join(" ");
    try {
      const result = await generateQuizAI(lessonContext, numQ, numChoices, combined, lessonPlan);
      setAiPreview(mapQuizResult(result, numQ));
    } catch (e) {
      setAiError("AI generation failed: " + e.message);
    } finally {
      stopAiProgress();
      setAiLoading(false);
    }
  }

  async function rerollQuestion(i) {
    setRerollingIdx(i);
    const combined = [DIFFICULTY_PROMPT[aiDifficulty], aiPrompt].filter(Boolean).join(" ");
    try {
      const result = await generateQuizAI(lessonContext, 1, numChoices,
        `Regenerate only question ${i + 1}. Make it different from common variations. ${combined}`,
        lessonPlan
      );
      const q = result.questions?.[0];
      if (!q) return;
      setAiPreview((prev) => {
        const qs = [...prev.questions];
        const ak = [...prev.answerKey];
        qs[i] = { text: q.text || "", choices: q.choices || {}, competency: q.competency || "", difficulty: q.difficulty || "" };
        ak[i] = q.answer || "";
        return { questions: qs, answerKey: ak };
      });
    } catch (e) {
      setAiError(`Re-roll #${i + 1} failed: ` + e.message);
    } finally {
      setRerollingIdx(null);
    }
  }

  function updatePreviewQuestion(i, field, val) {
    setAiPreview((prev) => {
      const qs = [...prev.questions];
      qs[i] = { ...qs[i], [field]: val };
      return { ...prev, questions: qs };
    });
  }

  function updatePreviewChoice(i, letter, val) {
    setAiPreview((prev) => {
      const qs = [...prev.questions];
      qs[i] = { ...qs[i], choices: { ...qs[i].choices, [letter]: val } };
      return { ...prev, questions: qs };
    });
  }

  function updatePreviewAnswer(i, letter) {
    setAiPreview((prev) => {
      const ak = [...prev.answerKey];
      ak[i] = letter;
      return { ...prev, answerKey: ak };
    });
  }

  function acceptAiPreview() {
    if (!aiPreview) return;
    setAnswerKey(aiPreview.answerKey);
    setQuestions(aiPreview.questions);
    setShowText(true);
    setAiPreview(null);
    setEditingPreviewIdx(null);
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave(status = "draft") {
    if (!title.trim()) { alert("Enter a quiz title."); return; }
    setSaving(true);
    const data = {
      lessonPlanId: selectedPlanId || "",
      title: title.trim(),
      numQuestions: numQ,
      numChoices,
      answerKey,
      questions: showText ? questions : [],
      status,
    };
    let savedId;
    if (editingId) {
      await editQuiz(editingId, data);
      savedId = editingId;
      setEditingId(null);
    } else {
      const ref = await addQuiz(data);
      savedId = ref?.id ?? null;
    }
    setSavedInfo({ id: savedId, title: data.title, status });
    setSaving(false);
  }

  async function handleDuplicate(q) {
    await addQuiz({
      lessonPlanId: q.lessonPlanId || "",
      title:        `${q.title} (copy)`,
      numQuestions: q.numQuestions,
      numChoices:   q.numChoices,
      answerKey:    q.answerKey || [],
      questions:    q.questions || [],
      status:       "draft",
    });
  }

  function resetForm() {
    setEditingId(null);
    setTitle(""); setNumQ(20); setNumChoices(4);
    setAnswerKey(Array(20).fill(""));
    setQuestions(Array(20).fill(null).map(emptyQuestion));
    setShowText(false); setExpandedRows({}); setAiPreview(null);
    setFocusedQ(null); setPath(null); setSavedInfo(null);
  }

  function loadForEdit(q) {
    setEditingId(q.id);
    setSelectedPlanId(q.lessonPlanId || "");
    setTitle(q.title || "");
    setNumQ(q.numQuestions || 20);
    setNumChoices(q.numChoices || 4);
    setAnswerKey(q.answerKey || Array(q.numQuestions || 20).fill(""));
    const qs = [...(q.questions || [])];
    while (qs.length < (q.numQuestions || 20)) qs.push(emptyQuestion());
    setQuestions(qs);
    setShowText(qs.some((x) => x.text));
    setExpandedRows({}); setAiPreview(null); setPath(q.questions?.some((x) => x.text) ? "ai" : "manual");
    setSavedInfo(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function quizLessonContext(q) {
    const plan = lessonPlans.find((p) => p.id === q.lessonPlanId);
    return plan ? { subject: plan.subject, topic: plan.topic, gradeLevel: plan.grade } : null;
  }

  async function handleDownloadQuestionnaire(q) {
    setDlState((s) => ({ ...s, [q.id]: "questionnaire" }));
    try {
      await buildTestDocx({ title: q.title, numQ: q.numQuestions, numChoices: q.numChoices, questions: q.questions || [], answerKey: [], lessonContext: quizLessonContext(q) });
    } catch (e) {
      alert("Download failed: " + e.message);
    } finally {
      setDlState((s) => ({ ...s, [q.id]: null }));
    }
  }

  async function handleExportDoc() {
    if (exportingDoc) return;
    setExportingDoc(true);
    try {
      await buildTestDocx({ title, numQ, numChoices, questions, answerKey, lessonContext });
    } catch (e) {
      alert("Export failed: " + e.message);
    } finally {
      setExportingDoc(false);
    }
  }

  // ── Two-column grid config ────────────────────────────────────────────────

  const half = Math.ceil(numQ / 2);
  const col1 = Array.from({ length: half }, (_, i) => i);
  const col2 = Array.from({ length: numQ - half }, (_, i) => half + i);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ══ PART 1 — Lesson Plan & Quiz Title ════════════════════════════ */}
      <div className="card card-accent p-6">
        <PartHeader
          n={1}
          title="Lesson Plan & Quiz Title"
          subtitle="Choose a lesson plan from Step 2 (Lesson Gen) to connect lesson content to this quiz"
          done={!!selectedPlanId && !!title.trim()}
          locked={false}
        />

        <div className="grid gap-4 sm:grid-cols-2">

          {/* Lesson Plan selector */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">
              Lesson Plan <span className="text-red-400">*</span>
              <span className="ml-1 font-normal text-[#9BB8A5]">(from Lesson Gen archive)</span>
            </label>
            {plansLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-[#DCEBDC] bg-[#F4FAF5] px-3 py-2.5 text-xs text-[#5A7566]">
                <Loader2 size={12} className="animate-spin" /> Loading plans…
              </div>
            ) : lessonPlans.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-700">
                No lesson plans yet — go to Step 2 (Lesson Gen) to generate one first.
              </div>
            ) : (
              <select
                value={selectedPlanId}
                onChange={(e) => { setSelectedPlanId(e.target.value); setSavedInfo(null); }}
                className="select"
              >
                <option value="">— Select a lesson plan —</option>
                {lessonPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lessonName || [p.subject, p.grade].filter(Boolean).join(" ") || "Untitled Plan"}
                    {p.weekLabel ? ` · ${p.weekLabel}` : ""}
                  </option>
                ))}
              </select>
            )}

            {/* Selected plan info pill */}
            {selectedPlan && (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#163828] px-3 py-2 text-white">
                <Calendar size={12} className="shrink-0 text-[#4CAF50]" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black truncate">{selectedPlan.lessonName || `${selectedPlan.subject} ${selectedPlan.grade}`}</p>
                  {selectedPlan.weekLabel && <p className="text-[10px] text-white/60">{selectedPlan.weekLabel}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Quiz title */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">
              Quiz Title <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); setSavedInfo(null); }}
                placeholder="e.g. Chapter 3 Assessment"
                className="input flex-1"
              />
              {lessonContext && (
                <button
                  onClick={handleAISuggestTitle}
                  disabled={titleSuggesting || !AI_ENABLED}
                  className="btn-outline shrink-0"
                  title="AI Suggest title"
                >
                  {titleSuggesting
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Lightbulb size={14} />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lesson context badge */}
        {selectedPlanId && (
          <LessonContextBadge
            context={lessonContext}
            plan={lessonPlan}
            loading={contextLoading}
          />
        )}

        {selectedPlanId && !title.trim() && (
          <p className="mt-3 text-xs text-amber-600 font-bold">Enter a quiz title to unlock Part 2.</p>
        )}
      </div>

      {/* ══ PART 2 — Quiz Setup ══════════════════════════════════════════ */}
      <div className={`card card-accent p-6 transition-opacity ${part2Locked ? "opacity-50 pointer-events-none" : ""}`}>
        <PartHeader
          n={2}
          title="Questions & Format"
          subtitle="Choose how many questions and which generation method"
          done={!part2Locked && !!path}
          locked={part2Locked}
        />

        {/* Q count */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-bold text-[#5A7566]">Number of questions</label>
          <div className="flex flex-wrap gap-2">
            {Q_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => setNumQ(n)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                  numQ === n ? "bg-[#163828] text-white" : "border border-[#DCEBDC] text-[#5A7566] hover:bg-[#F4FAF5]"
                }`}
              >
                {n}
              </button>
            ))}
            {!Q_COUNTS.includes(numQ) && (
              <span className="rounded-xl border border-[#DCEBDC] px-4 py-2 text-sm font-bold text-[#163828]">{numQ}</span>
            )}
          </div>
        </div>

        {/* Choices */}
        <div className="mb-5">
          <label className="mb-2 block text-xs font-bold text-[#5A7566]">Choices per question</label>
          <div className="flex gap-2">
            {[4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setNumChoices(n)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                  numChoices === n ? "bg-[#163828] text-white" : "border border-[#DCEBDC] text-[#5A7566] hover:bg-[#F4FAF5]"
                }`}
              >
                {n === 4 ? "A – D (4 choices)" : "A – E (5 choices)"}
              </button>
            ))}
          </div>
        </div>

        {/* Path choice */}
        <div>
          <label className="mb-2 block text-xs font-bold text-[#5A7566]">How will you create questions?</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPath("ai")}
              className={`flex flex-col gap-1.5 rounded-2xl border-2 p-4 text-left transition-all ${
                path === "ai"
                  ? "border-[#4CAF50] bg-[#F0FAF1]"
                  : "border-[#DCEBDC] hover:border-[#4CAF50] hover:bg-[#F7FBF8]"
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={16} className={path === "ai" ? "text-[#4CAF50]" : "text-[#9BB8A5]"} />
                <span className={`font-black text-sm ${path === "ai" ? "text-[#163828]" : "text-[#5A7566]"}`}>
                  AI Generate
                </span>
                {path === "ai" && <CheckCircle2 size={14} className="ml-auto text-[#4CAF50]" />}
              </div>
              <p className="text-[11px] text-[#9BB8A5] leading-snug">
                AI creates questions + answer key from the selected lesson plan content
              </p>
            </button>

            <button
              onClick={() => setPath("manual")}
              className={`flex flex-col gap-1.5 rounded-2xl border-2 p-4 text-left transition-all ${
                path === "manual"
                  ? "border-[#4CAF50] bg-[#F0FAF1]"
                  : "border-[#DCEBDC] hover:border-[#4CAF50] hover:bg-[#F7FBF8]"
              }`}
            >
              <div className="flex items-center gap-2">
                <Keyboard size={16} className={path === "manual" ? "text-[#4CAF50]" : "text-[#9BB8A5]"} />
                <span className={`font-black text-sm ${path === "manual" ? "text-[#163828]" : "text-[#5A7566]"}`}>
                  Manual Entry
                </span>
                {path === "manual" && <CheckCircle2 size={14} className="ml-auto text-[#4CAF50]" />}
              </div>
              <p className="text-[11px] text-[#9BB8A5] leading-snug">
                I'll type the answer key (A/B/C/D) myself and optionally add question text
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* ══ PART 3 — AI Generator ══════════════════════════════════════════ */}
      {path === "ai" && (
        <div className="card card-accent p-6">
          <PartHeader
            n={3}
            title="AI Quiz Generator"
            subtitle="AI will create questions and answer key from your lesson plan content"
            done={false}
            locked={false}
          />

          {!AI_ENABLED && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5">
              <AlertCircle size={14} className="shrink-0 text-red-500" />
              <p className="text-xs font-bold text-red-600">Add VITE_GEMINI_API_KEY to .env to enable AI generation.</p>
            </div>
          )}

          {/* Lesson context summary */}
          {lessonContext && (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-[#DCEBDC] bg-[#F4FAF5] px-4 py-2.5">
              <BookOpen size={14} className="shrink-0 text-[#4CAF50]" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-[#163828] truncate">
                  {lessonContext.topic || `${lessonContext.subject} ${lessonContext.gradeLevel}`}
                </p>
                <p className="text-[11px] text-[#5A7566]">
                  {[
                    lessonContext.subject,
                    lessonContext.gradeLevel,
                    (lessonContext.competencies||[]).length > 0 && `${lessonContext.competencies.length} competencies`,
                    (lessonContext.keyTerms||[]).length > 0 && `${lessonContext.keyTerms.length} key terms`,
                    lessonPlan && "4A's plan",
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              {lessonPlan && (
                <span className="shrink-0 rounded-full bg-[#D4EDDA] px-2 py-0.5 text-[9px] font-black text-[#163828]">4A's</span>
              )}
            </div>
          )}

          {/* Difficulty selector */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-black uppercase tracking-wider text-[#5A7566]">
              Question Difficulty
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DIFFICULTY_OPTIONS.map(({ key, label, icon: Icon, tip }) => (
                <button
                  key={key}
                  onClick={() => setAiDifficulty(key)}
                  disabled={aiLoading}
                  title={tip}
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left transition-all ${
                    aiDifficulty === key
                      ? "border-[#163828] bg-[#163828] text-white"
                      : "border-[#DCEBDC] text-[#5A7566] hover:border-[#4CAF50] hover:bg-[#F4FAF5]"
                  }`}
                >
                  <Icon size={13} className={aiDifficulty === key ? "text-[#4CAF50]" : "text-[#9BB8A5]"} />
                  <span className="text-xs font-black">{label}</span>
                  {aiDifficulty === key && <CheckCircle2 size={11} className="ml-auto text-[#4CAF50]" />}
                </button>
              ))}
            </div>
            {aiDifficulty !== "mixed" && (
              <p className="mt-1.5 text-[11px] text-[#5A7566]">
                {DIFFICULTY_OPTIONS.find((d) => d.key === aiDifficulty)?.tip}
              </p>
            )}
          </div>

          {/* Teacher instructions */}
          <div className="mb-5">
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-[#5A7566]">
              Teacher Instructions <span className="font-normal normal-case text-[#9BB8A5]">(optional)</span>
            </label>
            <input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. avoid computations, focus on vocabulary, include diagrams references…"
              disabled={!AI_ENABLED || !lessonContext || aiLoading}
              className="input w-full"
            />
          </div>

          {/* Error banner */}
          {aiError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
              <p className="flex-1 text-xs font-bold text-red-600">{aiError}</p>
              <button onClick={() => setAiError("")} className="text-red-400 hover:text-red-600"><X size={13} /></button>
            </div>
          )}

          {/* Progress bar */}
          {aiLoading && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-bold text-[#163828]">
                  <Loader2 size={12} className="animate-spin text-[#4CAF50]" /> {aiStep}
                </p>
                <span className="text-xs font-black text-[#4CAF50]">{aiProgress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#DCEBDC]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#163828] to-[#4CAF50] transition-all duration-700"
                  style={{ width: `${aiProgress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleAIGenerate}
            disabled={!AI_ENABLED || aiLoading || !lessonContext}
            className="btn-primary w-full py-3 text-base"
          >
            {aiLoading
              ? <><Loader2 size={16} className="animate-spin" /> Generating {numQ} Questions…</>
              : <><Wand2 size={17} /> Generate {numQ} Questions</>
            }
          </button>
        </div>
      )}

      {/* ══ AI Preview ════════════════════════════════════════════════════ */}
      {aiPreview && (
        <div className="card card-accent p-6">
          {/* Header */}
          <div className="mb-4 flex items-center gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#4CAF50]">
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-black text-[#163828]">
                {aiPreview.questions.filter((q) => q.text).length} Questions Generated
              </h3>
              <p className="text-xs text-[#5A7566]">Review, re-roll individual items, or edit inline — then accept</p>
            </div>
            <button onClick={() => { setAiPreview(null); setEditingPreviewIdx(null); }}
              className="rounded-xl p-1.5 text-[#5A7566] hover:bg-[#DCEBDC]">
              <X size={16} />
            </button>
          </div>

          {/* Re-roll error */}
          {aiError && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-500" />
              <p className="flex-1 text-xs font-bold text-red-600">{aiError}</p>
              <button onClick={() => setAiError("")} className="text-red-400"><X size={12} /></button>
            </div>
          )}

          {/* Question cards */}
          <div className="space-y-2.5">
            {aiPreview.questions.map((q, i) => {
              const isEditing = editingPreviewIdx === i;
              const isRerolling = rerollingIdx === i;
              const answer = aiPreview.answerKey[i];
              return (
                <div
                  key={i}
                  className={`rounded-2xl border transition-all ${
                    isEditing ? "border-[#4CAF50] bg-[#F0FAF1]" : "border-[#DCEBDC] bg-[#F7FBF8]"
                  }`}
                >
                  {/* Question header row */}
                  <div className="flex items-start gap-3 px-4 pt-3 pb-2">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#163828] text-[10px] font-black text-white">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <textarea
                          value={q.text}
                          onChange={(e) => updatePreviewQuestion(i, "text", e.target.value)}
                          rows={2}
                          className="input w-full resize-none text-sm font-bold"
                          autoFocus
                        />
                      ) : (
                        <p className="text-sm font-bold text-[#163828] leading-snug">
                          {q.text || <span className="italic text-[#9BB8A5]">No question text</span>}
                        </p>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditingPreviewIdx(isEditing ? null : i)}
                        className={`rounded-lg p-1.5 transition-colors ${isEditing ? "bg-[#4CAF50] text-white" : "text-[#9BB8A5] hover:bg-[#DCEBDC] hover:text-[#163828]"}`}
                        title={isEditing ? "Done editing" : "Edit question"}
                      >
                        {isEditing ? <CheckCircle2 size={13} /> : <Pencil size={13} />}
                      </button>
                      <button
                        onClick={() => rerollQuestion(i)}
                        disabled={isRerolling || rerollingIdx !== null}
                        className="rounded-lg p-1.5 text-[#9BB8A5] hover:bg-[#DCEBDC] hover:text-[#163828] disabled:opacity-40"
                        title="Re-roll this question"
                      >
                        {isRerolling
                          ? <Loader2 size={13} className="animate-spin text-[#4CAF50]" />
                          : <RefreshCw size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Choices */}
                  <div className="px-4 pb-3">
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {choices.map((letter) => (
                        <div
                          key={letter}
                          className={`flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors ${
                            answer === letter
                              ? "bg-[#163828] text-white"
                              : "bg-white border border-[#DCEBDC] text-[#5A7566]"
                          }`}
                        >
                          <button
                            onClick={() => updatePreviewAnswer(i, letter)}
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-black transition-colors ${
                              answer === letter ? "bg-[#4CAF50] text-white" : "bg-[#F4FAF5] text-[#5A7566] hover:bg-[#DCEBDC]"
                            }`}
                            title="Set as correct answer"
                          >
                            {letter}
                          </button>
                          {isEditing ? (
                            <input
                              value={q.choices?.[letter] || ""}
                              onChange={(e) => updatePreviewChoice(i, letter, e.target.value)}
                              placeholder={`Choice ${letter}…`}
                              className={`flex-1 bg-transparent text-xs font-bold outline-none ${answer === letter ? "placeholder:text-white/40" : ""}`}
                            />
                          ) : (
                            <span className={`flex-1 text-xs font-bold ${answer === letter ? "" : ""}`}>
                              {q.choices?.[letter] || <span className="italic opacity-40">—</span>}
                            </span>
                          )}
                          {answer === letter && (
                            <CheckCircle2 size={12} className="shrink-0 text-[#4CAF50]" />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Competency + answer label */}
                    {(q.competency || answer) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {answer && (
                          <span className="rounded-full bg-[#163828] px-2.5 py-0.5 text-[10px] font-black text-[#4CAF50]">
                            Answer: {answer}
                          </span>
                        )}
                        {q.competency && (
                          <span className="rounded-full bg-[#F4FAF5] border border-[#DCEBDC] px-2.5 py-0.5 text-[10px] text-[#5A7566] italic truncate max-w-[260px]">
                            {q.competency}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action bar */}
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={acceptAiPreview} className="btn-primary">
              <CheckSquare size={15} /> Accept All & Apply
            </button>
            <button onClick={handleAIGenerate} disabled={aiLoading} className="btn-outline">
              {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Regenerate All
            </button>
            <button onClick={() => { setAiPreview(null); setEditingPreviewIdx(null); }} className="btn-outline">
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ══ PART 3 (Manual) / Answer Key ══════════════════════════════════ */}
      {(path === "manual" || (path === "ai" && !aiPreview && answerKey.some(Boolean))) && (
        <div className={`card card-accent p-6 transition-opacity ${part3Locked ? "opacity-50 pointer-events-none" : ""}`}>
          <PartHeader
            n={3}
            title={path === "manual" ? "Answer Key Entry" : "Answer Key (AI Generated)"}
            subtitle={
              path === "manual"
                ? "Keyboard shortcut: ↑↓ navigate rows · A/B/C/D fill answer · Del clear"
                : "Review and edit AI-generated answers before saving"
            }
            done={allFilled}
            locked={part3Locked}
          />

          {path === "manual" && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-[#F4FAF5] px-3 py-2 text-[11px] text-[#5A7566]">
              <Keyboard size={12} className="shrink-0 text-[#4CAF50]" />
              Click a row · press <b className="text-[#163828]">A B C D</b> to set answer · press <b className="text-[#163828]">↑↓</b> to move · <b className="text-[#163828]">Del</b> to clear
            </div>
          )}

          <div className="mb-4 space-y-1">
            <div className="flex justify-between text-xs font-bold text-[#5A7566]">
              <span>{filledCount}/{numQ} answers set</span>
              {allFilled && <span className="text-[#4CAF50] flex items-center gap-1"><CheckCircle2 size={12} /> Complete</span>}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#DCEBDC]">
              <div
                className={`h-full rounded-full transition-all duration-300 ${allFilled ? "bg-[#4CAF50]" : "bg-gradient-to-r from-[#163828] to-[#4CAF50]"}`}
                style={{ width: `${(filledCount / numQ) * 100}%` }}
              />
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <span />
            <button
              onClick={() => setShowText((v) => !v)}
              className="btn-outline"
              style={{ padding: "6px 14px", fontSize: 12 }}
            >
              {showText ? <><ChevronUp size={12} /> Hide question text</> : <><FileText size={12} /> Add question text</>}
            </button>
          </div>

          <div className="grid gap-x-8" style={{ gridTemplateColumns: numQ > 10 ? "1fr 1fr" : "1fr" }}>
            {[col1, col2].map((col, ci) =>
              col.length > 0 ? (
                <div key={ci}>
                  {col.map((i) => (
                    <div
                      key={i}
                      ref={(el) => { rowRefs.current[i] = el; }}
                      tabIndex={0}
                      onFocus={() => setFocusedQ(i)}
                      onBlur={() => setFocusedQ((p) => (p === i ? null : p))}
                      onKeyDown={(e) => handleRowKeyDown(e, i)}
                      className={`group rounded-xl border transition-colors outline-none mb-1 ${
                        focusedQ === i
                          ? "border-[#4CAF50] bg-[#F0FAF1] shadow-sm"
                          : "border-transparent hover:border-[#DCEBDC] hover:bg-[#F7FBF8]"
                      }`}
                    >
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <span className="w-7 shrink-0 text-right text-xs font-black text-[#5A7566]">{i + 1}.</span>

                        <div className="flex gap-1">
                          {choices.map((letter) => (
                            <button
                              key={letter}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setAnswer(i, letter); rowRefs.current[i]?.focus(); }}
                              className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black transition-colors ${
                                answerKey[i] === letter
                                  ? "bg-[#163828] text-white"
                                  : "border border-[#DCEBDC] text-[#5A7566] hover:bg-[#D4EDDA]"
                              }`}
                            >
                              {letter}
                            </button>
                          ))}
                        </div>

                        <div className={`ml-auto flex items-center gap-0.5 ${focusedQ === i ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                          <button onMouseDown={(e) => e.preventDefault()} onClick={() => moveQuestion(i, -1)} disabled={i === 0} className="rounded-lg p-1 text-[#9BB8A5] hover:bg-[#DCEBDC] hover:text-[#163828] disabled:opacity-30" title="Move up"><ArrowUp size={11} /></button>
                          <button onMouseDown={(e) => e.preventDefault()} onClick={() => moveQuestion(i, 1)} disabled={i === numQ - 1} className="rounded-lg p-1 text-[#9BB8A5] hover:bg-[#DCEBDC] hover:text-[#163828] disabled:opacity-30" title="Move down"><ArrowDown size={11} /></button>
                          {showText && (
                            <button onMouseDown={(e) => e.preventDefault()} onClick={() => toggleRow(i)} className="rounded-lg p-1 text-[#9BB8A5] hover:bg-[#DCEBDC] hover:text-[#163828]" title={expandedRows[i] ? "Collapse" : "Edit question text"}>
                              {expandedRows[i] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>
                          )}
                          <button onMouseDown={(e) => e.preventDefault()} onClick={() => deleteQuestion(i)} className="rounded-lg p-1 text-red-300 hover:bg-red-50 hover:text-red-500" title="Delete question"><X size={11} /></button>
                        </div>
                      </div>

                      {showText && expandedRows[i] && (
                        <div className="mx-2 mb-3 ml-9 space-y-1.5 rounded-xl bg-white p-3 border border-[#DCEBDC]">
                          <textarea
                            value={questions[i]?.text || ""}
                            onChange={(e) => setQField(i, "text", e.target.value)}
                            placeholder={`Question ${i + 1} text…`}
                            rows={2}
                            className="input w-full resize-none text-xs font-bold"
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            {choices.map((letter) => (
                              <div key={letter} className="flex items-center gap-1.5">
                                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-black ${answerKey[i] === letter ? "bg-[#163828] text-white" : "bg-[#F4FAF5] text-[#5A7566]"}`}>{letter}</span>
                                <input value={questions[i]?.choices?.[letter] || ""} onChange={(e) => setChoiceText(i, letter, e.target.value)} placeholder={`Choice ${letter}…`} className="input flex-1 text-xs" />
                              </div>
                            ))}
                          </div>
                          <input value={questions[i]?.competency || ""} onChange={(e) => setQField(i, "competency", e.target.value)} placeholder="Competency / learning objective (optional)" className="input w-full text-xs italic" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3 items-center">
            <button onClick={() => handleSave("draft")} disabled={saving || !title.trim()} className="btn-outline">
              <Save size={15} /> {saving ? "Saving…" : "Save Draft"}
            </button>
            <button onClick={() => handleSave("final")} disabled={saving || !title.trim() || !allFilled} className="btn-primary">
              <CheckSquare size={15} /> {saving ? "Saving…" : "Finalize Quiz"}
            </button>
            {editingId && (
              <button onClick={resetForm} className="btn-outline">Cancel Edit</button>
            )}
            {!allFilled && title.trim() && path && (
              <p className="text-xs text-amber-600 font-bold">
                {numQ - filledCount} answer{numQ - filledCount !== 1 ? "s" : ""} empty — save draft or fill all to finalize.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ══ EXPORT ════════════════════════════════════════════════════════ */}
      {savedInfo && (
        <div className="card card-accent p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#4CAF50]">
              <CheckCircle2 size={20} className="text-white" />
            </div>
            <div>
              <p className="font-black text-[#163828]">
                "{savedInfo.title}" {savedInfo.status === "final" ? "finalized" : "saved as draft"}!
              </p>
              <p className="text-xs text-[#5A7566]">Ready to export and print</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {(hasQuestions || answerKey.some(Boolean)) && (
              <button
                onClick={handleExportDoc}
                disabled={exportingDoc}
                className="btn-primary"
              >
                {exportingDoc
                  ? <><Loader2 size={15} className="animate-spin" /> Generating…</>
                  : <><FileDown size={15} /> Export Test Questions (.docx)</>
                }
              </button>
            )}
            <button
              onClick={() => setPrintingQuiz({ numQuestions: numQ, numChoices, title })}
              className="btn-outline"
            >
              <Printer size={15} /> Print Bubble Sheet
            </button>
            <button onClick={resetForm} className="btn-outline">
              <ClipboardList size={15} /> Create Another Quiz
            </button>
          </div>
        </div>
      )}

      {/* ══ SAVED QUIZZES ═════════════════════════════════════════════════ */}
      <div className="card card-accent p-6">
        <h3 className="mb-4 text-lg font-black text-[#163828]">
          Saved Quizzes
          {quizzes.length > 0 && (
            <span className="ml-2 rounded-full bg-[#DCEBDC] px-2.5 py-0.5 text-sm font-bold text-[#5A7566]">
              {quizzes.length}
            </span>
          )}
        </h3>

        {quizzes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "linear-gradient(135deg,#DCEBDC,#F0F7F1)" }}>
              <ClipboardList size={26} className="text-[#5A7566]" />
            </div>
            <p className="text-sm text-[#5A7566]">No quizzes yet — create one above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {quizzes.map((q) => {
              const plan      = lessonPlans.find((p) => p.id === q.lessonPlanId);
              const keyFilled = (q.answerKey || []).filter(Boolean).length;
              const hasQText  = (q.questions || []).some((x) => x.text);
              const dlBusy    = dlState[q.id];
              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-[#DCEBDC] px-4 py-3 transition-colors hover:border-[#4CAF50] hover:bg-[#F7FBF8]"
                >
                  {/* Top row — info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                      style={{ background: "linear-gradient(135deg,#163828,#2E7D32)", boxShadow: "0 4px 10px rgba(22,56,40,0.25)" }}
                    >
                      <ClipboardList size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-[#163828]">{q.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${q.status === "final" ? "bg-[#D4EDDA] text-[#2E7D32]" : "bg-[#F4FAF5] text-[#5A7566]"}`}>
                          {q.status === "final" ? "Final" : "Draft"}
                        </span>
                      </div>
                      <p className="text-xs text-[#5A7566]">
                        {q.numQuestions}Q / {q.numChoices} choices
                        {plan ? ` · ${plan.lessonName || `${plan.subject} ${plan.grade}`}` : ""}
                        {q.createdAt ? ` · ${formatDate(q.createdAt)}` : ""}
                        {keyFilled === q.numQuestions && <span className="ml-1.5 font-black text-[#4CAF50]">· key ✓</span>}
                      </p>
                    </div>
                    {/* Edit / Duplicate / Delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => loadForEdit(q)} className="rounded-xl p-1.5 text-[#5A7566] hover:bg-[#DCEBDC]" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => handleDuplicate(q)} className="rounded-xl p-1.5 text-[#5A7566] hover:bg-[#DCEBDC]" title="Duplicate"><Copy size={15} /></button>
                      <button onClick={() => removeQuiz(q.id)} className="rounded-xl p-1.5 text-red-400 hover:bg-red-50" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </div>

                  {/* Bottom row — downloads */}
                  <div className="mt-2.5 flex flex-wrap gap-2 pl-[52px]">
                    <button
                      onClick={() => setPrintingQuiz(q)}
                      className="btn-outline flex items-center gap-1.5"
                      style={{ padding: "5px 14px", fontSize: 12 }}
                      title="Print bubble answer sheets (A4, multiple per page)"
                    >
                      <Printer size={12} />
                      Print Bubble Sheet
                    </button>
                    <button
                      onClick={() => handleDownloadQuestionnaire(q)}
                      disabled={!!dlBusy || !hasQText}
                      className="btn-outline flex items-center gap-1.5"
                      style={{ padding: "5px 14px", fontSize: 12 }}
                      title={!hasQText ? "No question text stored — edit the quiz to add questions" : "Download student questionnaire"}
                    >
                      {dlBusy === "questionnaire"
                        ? <Loader2 size={12} className="animate-spin" />
                        : <FileQuestion size={12} />}
                      Questionnaire
                    </button>
                    {!hasQText && (
                      <span className="self-center text-[10px] text-[#9BB8A5]">Add question text to enable Questionnaire</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ BUBBLE SHEET PRINT MODAL ══════════════════════════════════ */}
      {printingQuiz && (
        <BubbleSheetPrint
          quiz={printingQuiz}
          uid={user?.uid}
          onClose={() => setPrintingQuiz(null)}
        />
      )}
    </div>
  );
}
