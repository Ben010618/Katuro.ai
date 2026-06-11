import { useRef, useState, useEffect, useMemo } from "react";
import {
  UploadCloud, FileText, Image as ImageIcon, File, Loader2, Wand2,
  CheckCircle2, ChevronDown, Zap, Lightbulb, Target, FileDown, Lock,
  X, RefreshCw, Calendar, ChevronLeft, ChevronRight,
  ClipboardCheck, History, Archive, Brain, Plus, Trash2,
  Search,
} from "lucide-react";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TableRow, TableCell, Table,
  WidthType, ShadingType,
} from "docx";
import { OR_ENABLED, extractContextFromFile, generate4AsLesson } from "../../services/lessonGenAI";
import { saveLessonPlan, updateLessonPlan } from "../../services/db";
import { useLessonPlans } from "../../hooks/useLessonPlans";
import competencies from "../../data/competencies.json";

// ── Constants ──────────────────────────────────────────────────────────────────

const SUBJECTS = [
  "Science", "Mathematics", "Filipino", "English",
  "Araling Panlipunan", "MAPEH", "GMRC", "Makabansa",
  "Reading & Literacy", "Language", "TLE",
];
const GRADE_LEVELS = ["Kinder", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const QUARTERS = ["Q1", "Q2", "Q3"];
const WEEK_NUMBERS = ["1","2","3","4","5","6","7","8","9","10"];

const BLOOM_CFG = {
  Remember:   { bg: "#E0F7F6", text: "#0D9488", border: "#5EEAD4" },
  Understand: { bg: "#EEF2FF", text: "#4338CA", border: "#A5B4FC" },
  Apply:      { bg: "#F5F3FF", text: "#7C3AED", border: "#C4B5FD" },
  Analyze:    { bg: "#FFFBEB", text: "#B45309", border: "#FCD34D" },
  Evaluate:   { bg: "#FFF1F0", text: "#DC2626", border: "#FCA5A5" },
  Create:     { bg: "#ECFDF5", text: "#065F46", border: "#6EE7B7" },
};
const BLOOM_LEVELS = Object.keys(BLOOM_CFG);

const MATATAG_PARTS = [
  { key: "apk", label: "Activating Prior Knowledge", short: "APK", defaultMin: 10, color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A" },
  { key: "ep",  label: "Establishing Purpose",       short: "EP",  defaultMin: 5,  color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE" },
  { key: "du",  label: "Developing Understanding",   short: "DU",  defaultMin: 25, color: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE" },
  { key: "mg",  label: "Making Generalizations",     short: "MG",  defaultMin: 10, color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0" },
  { key: "as",  label: "Assessment",                 short: "AS",  defaultMin: 10, color: "#06B6D4", bg: "#ECFEFF", border: "#A5F3FC" },
];
const DEFAULT_PROCEDURE = Object.fromEntries(
  MATATAG_PARTS.map(p => [p.key, { description: "", timeMin: p.defaultMin }])
);

const FILE_TYPES = {
  "application/pdf": true,
  "application/msword": true,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
};
const ACCEPTED = ".pdf,.doc,.docx,.png,.jpg,.jpeg";

// ── Gemini AI for objectives ───────────────────────────────────────────────────

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

async function callGeminiObjectives(subject, grade, quarter, competency, contentStd, perfStd) {
  if (!GEMINI_KEY) throw new Error("VITE_GEMINI_API_KEY not set in .env");
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `You are a Philippine DepEd MATATAG K-10 curriculum specialist.

Learning Competency: "${competency}"
Subject: ${subject} | Grade: ${grade} | Quarter: ${quarter}
Content Standard: ${contentStd || "(not provided)"}
Performance Standard: ${perfStd || "(not provided)"}

Unpack this into 3-5 specific, measurable learning objectives using action verbs from Bloom's Taxonomy.
Each objective must start with: "Students will be able to [verb] [specific measurable outcome]"

Return ONLY valid JSON (no markdown fences):
{"objectives":[{"text":"Students will be able to ...","bloom":"Understand"}]}

Allowed bloom values: Remember, Understand, Apply, Analyze, Evaluate, Create`,
        }],
      }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.objectives) ? parsed.objectives : [];
  } catch {
    throw new Error("AI returned an unexpected format — please retry.");
  }
}

// ── File helpers ───────────────────────────────────────────────────────────────

function FileIcon({ type = "", name = "" }) {
  if (type.startsWith("image/")) return <ImageIcon size={18} className="text-indigo-400" />;
  if (FILE_TYPES[type] || name.endsWith(".docx") || name.endsWith(".doc"))
    return <FileText size={18} className="text-blue-400" />;
  return <File size={18} className="text-[#8AA898]" />;
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWeekLabel(start, end) {
  const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

function formatSelectedDaysLabel(days) {
  if (!days || !days.length) return "";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  let contiguous = true;
  for (let i = 1; i < sorted.length; i++) {
    const expected = new Date(sorted[i - 1]);
    do { expected.setDate(expected.getDate() + 1); } while (expected.getDay() === 0 || expected.getDay() === 6);
    if (expected.toDateString() !== sorted[i].toDateString()) { contiguous = false; break; }
  }
  const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (contiguous) {
    return `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1])}, ${sorted[sorted.length - 1].getFullYear()}`;
  }
  return sorted.map(fmt).join(", ");
}

function formatShortDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── WeekPicker — multi-day free pick ──────────────────────────────────────────
// value: Date[]  onChange: (Date[]) => void

function WeekPicker({ value, onChange }) {
  const today = new Date();
  const initY = value?.length ? value[0].getFullYear() : today.getFullYear();
  const initM = value?.length ? value[0].getMonth()    : today.getMonth();
  const [vy, setVy] = useState(initY);
  const [vm, setVm] = useState(initM);

  const MONTH_NAMES = ["January","February","March","April","May","June",
                       "July","August","September","October","November","December"];
  const DAY_HEADERS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  function prevMonth() { if (vm === 0) { setVm(11); setVy(y => y - 1); } else setVm(m => m - 1); }
  function nextMonth() { if (vm === 11) { setVm(0); setVy(y => y + 1); } else setVm(m => m + 1); }
  function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function getFirstDow(y, m) { const raw = new Date(y, m, 1).getDay(); return raw === 0 ? 6 : raw - 1; }
  function isWeekend(day) { const dow = new Date(vy, vm, day).getDay(); return dow === 0 || dow === 6; }

  function isSelected(day) {
    const d = new Date(vy, vm, day);
    return (value || []).some(s => s.toDateString() === d.toDateString());
  }

  function handleDayClick(day) {
    if (isWeekend(day)) return;
    const d = new Date(vy, vm, day);
    const dateStr = d.toDateString();
    const current = value || [];
    if (current.some(s => s.toDateString() === dateStr)) {
      onChange(current.filter(s => s.toDateString() !== dateStr));
    } else {
      onChange([...current, d].sort((a, b) => a - b));
    }
  }

  const totalDays = getDaysInMonth(vy, vm);
  const firstDow  = getFirstDow(vy, vm);
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center gap-1">
        <button onClick={prevMonth} className="rounded-lg p-1 text-[#4A6B5A] hover:bg-[#D8E8E1]"><ChevronLeft size={14} /></button>
        <span className="flex-1 text-center text-xs font-black text-[#1A2E24]">{MONTH_NAMES[vm]} {vy}</span>
        <button onClick={nextMonth} className="rounded-lg p-1 text-[#4A6B5A] hover:bg-[#D8E8E1]"><ChevronRight size={14} /></button>
      </div>
      <div className="mb-0.5 grid grid-cols-7 gap-0.5">
        {DAY_HEADERS.map((h, hi) => (
          <div key={h} className={`py-0.5 text-center text-[9px] font-black uppercase tracking-wider ${hi >= 5 ? "text-[#D8E8E1]" : "text-[#8AA898]"}`}>{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) =>
          day === null ? <div key={i} /> :
          isWeekend(day) ? (
            <div key={i} className="h-7 w-full rounded-lg text-[11px] font-bold text-[#D8E8E1] flex items-center justify-center cursor-not-allowed">{day}</div>
          ) : (
            <button
              key={i}
              onClick={() => handleDayClick(day)}
              className={`h-7 w-full rounded-lg text-[11px] font-bold transition-all ${
                isSelected(day)
                  ? "bg-[#2D6A4F] text-white shadow-sm"
                  : "text-[#4A6B5A] hover:bg-[#F0F7F4]"
              }`}
            >{day}</button>
          )
        )}
      </div>
      {value && value.length > 0 ? (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#2D6A4F] px-3 py-2 text-white">
          <Calendar size={12} className="shrink-0 text-[#95D5B2]" />
          <span className="text-xs font-black">{formatSelectedDaysLabel(value)}</span>
          <button onClick={() => onChange([])} className="ml-auto rounded-md p-0.5 hover:bg-white/20"><X size={11} /></button>
        </div>
      ) : (
        <p className="mt-2 text-center text-[10px] text-[#8AA898]">Tap individual weekdays to select them</p>
      )}
    </div>
  );
}

// ── ProgressBar ────────────────────────────────────────────────────────────────

function ProgressBar({ pct, label, done }) {
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className={`text-xs font-bold ${done ? "text-[#2D6A4F]" : "text-[#1A2E24]"}`}>
          {done
            ? <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-[#40916C]" /> {label}</span>
            : <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin text-[#40916C]" /> {label}</span>
          }
        </p>
        <span className={`text-xs font-black ${done ? "text-[#40916C]" : "text-[#1A2E24]"}`}>{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#D8E8E1]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${done ? "bg-[#40916C]" : "bg-gradient-to-r from-[#2D6A4F] to-[#95D5B2]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── BloomBadge ─────────────────────────────────────────────────────────────────

function BloomBadge({ level }) {
  const cfg = BLOOM_CFG[level] ?? { bg: "#F3F4F6", text: "#6B7280", border: "#D1D5DB" };
  return (
    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold border" style={{ backgroundColor: cfg.bg, color: cfg.text, borderColor: cfg.border }}>
      {level}
    </span>
  );
}

// ── TimeBudgetBar ──────────────────────────────────────────────────────────────

function TimeBudgetBar({ procedure }) {
  const total = MATATAG_PARTS.reduce((s, p) => s + (Number(procedure[p.key]?.timeMin) || p.defaultMin), 0);
  return (
    <div className="mb-4 rounded-2xl border border-[#D8E8E1] bg-[#F8FAF9] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-black text-[#1A2E24] uppercase tracking-wider">Time Budget</span>
        <span className={`text-xs font-black ${total > 65 ? "text-red-500" : total < 50 ? "text-amber-600" : "text-[#2D6A4F]"}`}>
          {total} / 60 min
        </span>
      </div>
      <div className="flex h-5 w-full overflow-hidden rounded-full gap-px">
        {MATATAG_PARTS.map(p => {
          const mins = Number(procedure[p.key]?.timeMin) || p.defaultMin;
          const pct = Math.max(2, (mins / Math.max(total, 60)) * 100);
          return (
            <div key={p.key} className="relative flex items-center justify-center transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: p.color }}>
              {pct > 10 && <span className="text-white text-[8px] font-black select-none">{p.short}</span>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {MATATAG_PARTS.map(p => (
          <div key={p.key} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-[9px] text-[#4A6B5A] font-bold">{p.short} – {Number(procedure[p.key]?.timeMin) || p.defaultMin}m</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── StepPanel (accordion item) ─────────────────────────────────────────────────

function StepPanel({ number, title, subtitle, done, locked, active, optional, onToggle, children }) {
  return (
    <div className={`card overflow-hidden transition-all duration-200 ${locked ? "opacity-55 pointer-events-none" : ""}`}>
      <button
        type="button"
        onClick={locked ? undefined : onToggle}
        className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors
          ${active ? "border-l-4 border-[#2D6A4F] bg-[#F0F7F4]" : "border-l-4 border-transparent hover:bg-[#F8FAF9]"}
          ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div
          className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-black text-white"
          style={{
            background: done ? "#2D6A4F" : locked ? "#C8D9D2" : active ? "linear-gradient(135deg,#2D6A4F,#40916C)" : "#8AA898",
          }}
        >
          {done ? <CheckCircle2 size={18} /> : locked ? <Lock size={14} className="text-white/70" /> : <span>{number}</span>}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-black text-sm ${locked ? "text-[#8AA898]" : "text-[#1A2E24]"}`}>
              Step {number}: {title}
            </span>
            {done && !active && (
              <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[10px] font-black text-[#166534]">✓ Done</span>
            )}
            {optional && !done && !locked && !active && (
              <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[10px] font-bold text-amber-700">Optional</span>
            )}
          </div>
          <p className={`text-xs mt-0.5 ${locked ? "text-[#C8D9D2]" : "text-[#4A6B5A]"}`}>
            {locked ? "Complete the previous step to unlock" : subtitle}
          </p>
        </div>

        {!locked && (
          <ChevronDown size={16} className={`shrink-0 text-[#8AA898] transition-transform duration-200 ${active ? "rotate-180" : ""}`} />
        )}
      </button>

      {active && !locked && (
        <div className="px-5 pb-6 pt-4 border-t border-[#D8E8E1]">
          {children}
        </div>
      )}
    </div>
  );
}

// ── DayCard ────────────────────────────────────────────────────────────────────

const DAY_CONFIGS = [
  { icon: Zap,           gradient: "linear-gradient(135deg,#E65100,#FFB300)",  cardBg: "bg-amber-50",  border: "border-amber-200",  headerBg: "bg-amber-100",  text: "text-amber-900",  badge: "bg-amber-200 text-amber-900"   },
  { icon: Search,        gradient: "linear-gradient(135deg,#0D47A1,#42A5F5)",  cardBg: "bg-blue-50",   border: "border-blue-200",   headerBg: "bg-blue-100",   text: "text-blue-900",   badge: "bg-blue-200 text-blue-900"    },
  { icon: Lightbulb,     gradient: "linear-gradient(135deg,#4A148C,#AB47BC)",  cardBg: "bg-purple-50", border: "border-purple-200", headerBg: "bg-purple-100", text: "text-purple-900", badge: "bg-purple-200 text-purple-900" },
  { icon: Target,        gradient: "linear-gradient(135deg,#1B5E20,#66BB6A)",  cardBg: "bg-green-50",  border: "border-green-200",  headerBg: "bg-green-100",  text: "text-green-900",  badge: "bg-green-200 text-green-900"   },
  { icon: ClipboardCheck,gradient: "linear-gradient(135deg,#006064,#26C6DA)",  cardBg: "bg-cyan-50",   border: "border-cyan-200",   headerBg: "bg-cyan-100",   text: "text-cyan-900",   badge: "bg-cyan-200 text-cyan-900"     },
];

function DayCard({ dayIndex, data }) {
  const [open, setOpen] = useState(true);
  const cfg = DAY_CONFIGS[dayIndex] ?? DAY_CONFIGS[0];
  const Icon = cfg.icon;
  if (!data) return null;

  const listBlock = (items, label) =>
    items?.length ? (
      <div className="mt-2.5">
        <p className="text-[10px] font-black uppercase tracking-wider opacity-50 mb-1">{label}</p>
        <ul className="space-y-1">
          {items.map((x, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed">
              <span className="mt-0.5 shrink-0 opacity-40">•</span>
              <span>{typeof x === "object" ? <><b>{x.term}</b>: {x.definition}</> : x}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const inlineBlock = (label, val) =>
    val ? <p className="mt-2 text-xs"><span className="font-black">{label}: </span>{val}</p> : null;

  return (
    <div className={`rounded-2xl border overflow-hidden ${cfg.cardBg} ${cfg.border}`}>
      <button className={`w-full flex items-center gap-3 px-5 py-3 ${cfg.headerBg}`} onClick={() => setOpen(v => !v)}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: cfg.gradient, boxShadow: "0 3px 10px rgba(0,0,0,0.2)" }}>
          <Icon size={16} />
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-black ${cfg.text}`}>Day {data.day} — {data.phase}</span>
            {data.duration && <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.badge}`}>{data.duration}</span>}
            {data.dateLabel && <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cfg.badge}`}>{data.dateLabel}</span>}
          </div>
        </div>
        <ChevronDown size={14} className={`opacity-40 ${cfg.text} transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`px-5 py-4 ${cfg.text}`}>
          {data.description && <p className="text-sm leading-relaxed">{data.description}</p>}
          {listBlock(data.steps,            "Steps")}
          {listBlock(data.guidingQuestions, "Guiding Questions")}
          {listBlock(data.keyPoints,        "Key Points")}
          {listBlock(data.definitions,      "Definitions")}
          {listBlock(data.tasks,            "Tasks")}
          {listBlock(data.reviewActivities, "Review Activities")}
          {inlineBlock("Teacher Tip", data.teacherTip)}
          {inlineBlock("Discussion",  data.discussion)}
          {inlineBlock("Assessment",  data.assessment)}
          {inlineBlock("Homework",    data.homework)}
        </div>
      )}
    </div>
  );
}

// ── exportDocx ─────────────────────────────────────────────────────────────────

async function exportDocx(plan, weekDates, meta = {}) {
  const ov   = plan?.overview || {};
  const days = plan?.days     || [];

  const sp      = (b = 0, a = 0) => ({ spacing: { before: b, after: a } });
  const run     = (text, opts = {}) => new TextRun({ text: String(text || ""), size: 22, ...opts });
  const heading = (text, level = HeadingLevel.HEADING_2, color = "2D6A4F") =>
    new Paragraph({ children: [run(text, { bold: true, size: 26, color })], heading: level, ...sp(280, 100) });
  const bullet  = (text) =>
    new Paragraph({
      children: [run(typeof text === "object" ? `[${text.bloom || ""}] ${text.text || ""}` : text)],
      bullet: { level: 0 }, ...sp(0, 60),
    });

  const DAY_COLORS = ["E65100","0D47A1","4A148C","1B5E20","006064"];

  const subject  = meta.subject  || ov.subject  || "—";
  const grade    = meta.grade    || ov.grade     || "—";
  const quarter  = meta.quarter  || "";
  const weekNum  = meta.weekNum  || "";

  const ovRows = [
    ["Subject", subject,                    "Grade",   grade],
    ["Quarter", quarter ? `${quarter}${weekNum ? `, Week ${weekNum}` : ""}` : "—",
     "Week",    ov.weekLabel || weekDates?.label || "—"],
  ];

  const tableRows = ovRows.map(row =>
    new TableRow({
      children: [0,1,2,3].map(i =>
        new TableCell({
          children: [new Paragraph({ children: [run(row[i], { bold: i % 2 === 0, size: 20 })] })],
          shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: "D8E8E1" } : {},
          width: { size: i % 2 === 0 ? 20 : 30, type: WidthType.PERCENTAGE },
        })
      ),
    })
  );

  const children = [
    new Paragraph({
      children: [run("Weekly Lesson Plan (MATATAG Curriculum)", { bold: true, size: 38, color: "2D6A4F" })],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      ...sp(0, 120),
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "40916C" } },
    }),
    new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
  ];

  // Learning Competency
  if (meta.competency) {
    children.push(heading("Learning Competency"));
    children.push(new Paragraph({ children: [run(meta.competency)], ...sp(0, 80) }));
    if (meta.competencyCode) {
      children.push(new Paragraph({ children: [run(`Code: ${meta.competencyCode}`, { italics: true, color: "666666", size: 20 })], ...sp(0, 80) }));
    }
  }

  // Objectives
  if (meta.objectives?.length) {
    children.push(heading("Learning Objectives"));
    meta.objectives.forEach(o => children.push(bullet(o)));
  }

  if (ov.objectives?.length && !meta.objectives?.length) {
    children.push(heading("Learning Objectives"));
    ov.objectives.forEach(o => children.push(bullet(o)));
  }

  if (ov.materials?.length) {
    children.push(heading("Materials"));
    ov.materials.forEach(m => children.push(bullet(m)));
  }

  if (meta.materials?.length) {
    children.push(heading("Materials & References"));
    [...(meta.materials || []), ...(meta.references || [])].forEach(m => children.push(bullet(m)));
  }

  // Teaching procedure (MATATAG)
  if (meta.procedure) {
    children.push(heading("Teaching Procedure (MATATAG)"));
    MATATAG_PARTS.forEach(p => {
      const part = meta.procedure[p.key];
      if (part?.description) {
        children.push(new Paragraph({
          children: [run(`${p.label} (${part.timeMin || p.defaultMin} min)`, { bold: true, size: 22, color: "2D6A4F" })],
          ...sp(160, 60),
        }));
        children.push(new Paragraph({ children: [run(part.description)], ...sp(0, 80) }));
      }
    });
  }

  // Assessment
  if (meta.formativeAssessment) {
    children.push(heading("Assessment"));
    children.push(new Paragraph({ children: [run(`Formative Assessment: ${meta.formativeAssessment}`)], ...sp(0, 60) }));
    if (meta.evaluationTool) {
      children.push(new Paragraph({ children: [run(`Evaluation Tool: ${meta.evaluationTool}`)], ...sp(0, 60) }));
    }
  }

  // AI-generated 5-day lesson days
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const col = DAY_COLORS[i] ?? "2D6A4F";
    if (!d) continue;
    children.push(
      new Paragraph({
        children: [
          run(`Day ${d.day} — ${d.phase}`, { bold: true, size: 30, color: col }),
          ...(d.dateLabel ? [run(`  |  ${d.dateLabel}`, { size: 22, color: "666666" })] : []),
          ...(d.duration ? [run(`  (${d.duration})`, { size: 20, color: "999999" })] : []),
        ],
        heading: HeadingLevel.HEADING_2,
        ...sp(320, 100),
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: col } },
      })
    );
    if (d.description) children.push(new Paragraph({ children: [run(d.description)], ...sp(0, 80) }));
    const sections = [
      ["Steps", d.steps], ["Guiding Questions", d.guidingQuestions],
      ["Key Points", d.keyPoints], ["Definitions", d.definitions],
      ["Tasks", d.tasks], ["Review Activities", d.reviewActivities],
    ];
    for (const [label, items] of sections) {
      if (items?.length) {
        children.push(new Paragraph({ children: [run(label, { bold: true, size: 22, color: col })], ...sp(160, 60) }));
        items.forEach(x => children.push(bullet(x)));
      }
    }
    const inlines = [["Teacher Tip", d.teacherTip], ["Discussion", d.discussion], ["Assessment", d.assessment], ["Homework", d.homework]];
    for (const [label, val] of inlines) {
      if (val) children.push(new Paragraph({ children: [run(`${label}: `, { bold: true, size: 22 }), run(val)], ...sp(80, 40) }));
    }
  }

  if (meta.teacherNotes) {
    children.push(heading("Teacher Notes"));
    children.push(new Paragraph({ children: [run(meta.teacherNotes)], ...sp(0, 80) }));
  }

  children.push(
    new Paragraph({ text: "", ...sp(400, 0) }),
    new Paragraph({ children: [run("Prepared by: ___________________________", { size: 20 })], ...sp(0, 120) }),
    new Paragraph({ children: [run("Checked by: ___________________________    Approved by: ___________________________", { size: 20 })] }),
  );

  const doc  = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `Lesson Plan – ${ov.weekLabel || weekDates?.label || meta.subject || "Weekly"}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function LessonGenPage({ user }) {
  const fileRef         = useRef(null);
  const savedPlanIdRef  = useRef(null);
  const draftRestoredRef = useRef(false);

  // ── Accordion
  const [activeStep, setActiveStep] = useState(1);

  // ── Step 1: Session Setup
  const [subject,      setSubject]      = useState("");
  const [grade,        setGrade]        = useState("");
  const [quarter,      setQuarter]      = useState("Q1");
  const [weekNum,      setWeekNum]      = useState("");
  const [selectedDays, setSelectedDays] = useState([]);

  // ── Step 2: Unpack Competency
  const [competencyCode, setCompetencyCode] = useState("");
  const [competency,     setCompetency]     = useState("");
  const [contentStd,     setContentStd]     = useState("");
  const [perfStd,        setPerfStd]        = useState("");
  const [objectives,     setObjectives]     = useState([]);
  const [contentFocus,   setContentFocus]   = useState("");
  const [integration,    setIntegration]    = useState("");
  const [aiRunning,      setAiRunning]      = useState(false);
  const [aiError,        setAiError]        = useState("");

const filteredCompetencies = useMemo(() => {
  const gradeKey = grade === 'Kinder' ? 'Kinder' : `Grade ${grade}`;
  const termKey = `Term ${quarter === 'Q1' ? 1 : quarter === 'Q2' ? 2 : 3}`;
  const compArray = competencies[subject]?.[gradeKey]?.[termKey] || [];
  return compArray.map(comp => ({
    value: comp.text,
    label: `Week ${comp.week}: ${comp.text}`
  }));
}, [subject, grade, quarter]);

  // ── Step 3: Learning Resources
  const [file,           setFile]           = useState(null);
  const [dragOver,       setDragOver]       = useState(false);
  const [fileError,      setFileError]      = useState("");
  const [extractRunning, setExtractRunning] = useState(false);
  const [extractPct,     setExtractPct]     = useState(0);
  const [extractDone,    setExtractDone]    = useState(false);
  const [extractedCtx,   setExtractedCtx]   = useState(null);
  const [extractError,   setExtractError]   = useState("");
  const [references,     setReferences]     = useState([]);
  const [materials,      setMaterials]      = useState([]);
  const [newRef,         setNewRef]         = useState("");
  const [newMat,         setNewMat]         = useState("");

  // ── Step 4: Teaching Procedure
  const [procedure, setProcedure] = useState({ ...DEFAULT_PROCEDURE });

  // ── Step 5: Assessment & Reflection
  const [formativeAssessment, setFormativeAssessment] = useState("");
  const [evaluationTool,      setEvaluationTool]      = useState("");
  const [teacherNotes,        setTeacherNotes]         = useState("");

  // ── Generation
  const [generating, setGenerating] = useState(false);
  const [genPct,     setGenPct]     = useState(0);
  const [genLabel,   setGenLabel]   = useState("");
  const [genDone,    setGenDone]    = useState(false);
  const [lessonPlan, setLessonPlan] = useState(null);
  const [genError,   setGenError]   = useState("");
  const [savedPlanId, setSavedPlanId] = useState(null);

  // ── Export
  const [exporting,     setExporting]     = useState(false);
  const [exportingHist, setExportingHist] = useState(null);

  // ── Auto-save
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved,  setLastSaved]  = useState(null);

  // ── Archive (live)
  const { lessonPlans: history, loading: historyLoading } = useLessonPlans(user.uid);

  // ── Computed step completion
  const s1Done = !!subject && !!grade && selectedDays.length > 0;

  // Derived compat object for places that expect { start, end, label }
  const weekDatesCompat = selectedDays.length > 0
    ? { start: selectedDays[0], end: selectedDays[selectedDays.length - 1], label: formatSelectedDaysLabel(selectedDays) }
    : null;
  const s2Done = competency.trim().length >= 5;
  const s3Done = s2Done; // optional — always unlocked once step 2 done
  const s4Done = MATATAG_PARTS.filter(p => procedure[p.key]?.description?.trim()).length >= 3;
  const s5Done = formativeAssessment.trim().length >= 3;

  const canGenerate = s1Done && s2Done;

  // ── Draft restore (on first load from archive)
  useEffect(() => {
    if (draftRestoredRef.current || historyLoading || !history.length) return;
    draftRestoredRef.current = true;
    const draft = history.find(p => p.isDraft === true);
    if (!draft) return;
    if (draft.subject)       setSubject(draft.subject);
    if (draft.grade)         setGrade(draft.grade);
    if (draft.quarter)       setQuarter(draft.quarter);
    if (draft.weekNumber)    setWeekNum(String(draft.weekNumber));
    if (Array.isArray(draft.selectedDays) && draft.selectedDays.length > 0) {
      const dates = draft.selectedDays.map(d => new Date(d + "T00:00")).filter(d => !isNaN(d));
      if (dates.length) setSelectedDays(dates);
    } else if (draft.weekStartDate && draft.weekEndDate) {
      // Backward compat: old drafts stored a Mon–Fri range; rebuild as individual days
      const start = new Date(draft.weekStartDate + "T00:00");
      const end   = new Date(draft.weekEndDate   + "T00:00");
      if (!isNaN(start) && !isNaN(end)) {
        const days = [];
        const d = new Date(start);
        while (d <= end) {
          if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d));
          d.setDate(d.getDate() + 1);
        }
        if (days.length) setSelectedDays(days);
      }
    }
    if (draft.competencyCode)     setCompetencyCode(draft.competencyCode);
    if (draft.competency)         setCompetency(draft.competency);
    if (draft.contentStandard)    setContentStd(draft.contentStandard);
    if (draft.performanceStandard) setPerfStd(draft.performanceStandard);
    if (Array.isArray(draft.objectives) && draft.objectives.length) setObjectives(draft.objectives);
    if (draft.contentFocus)       setContentFocus(draft.contentFocus);
    if (draft.integration)        setIntegration(draft.integration);
    if (Array.isArray(draft.references)) setReferences(draft.references);
    if (Array.isArray(draft.materials))  setMaterials(draft.materials);
    if (draft.procedure && typeof draft.procedure === "object")
      setProcedure({ ...DEFAULT_PROCEDURE, ...draft.procedure });
    if (draft.formativeAssessment) setFormativeAssessment(draft.formativeAssessment);
    if (draft.evaluationTool)      setEvaluationTool(draft.evaluationTool);
    if (draft.teacherNotes)        setTeacherNotes(draft.teacherNotes);
    setSavedPlanId(draft.id);
    savedPlanIdRef.current = draft.id;
    setLastSaved(Date.now());
  }, [history, historyLoading]);

  // ── Auto-save (debounced 800 ms)
  useEffect(() => {
    if (!s1Done) return;
    const timer = setTimeout(async () => {
      const _wLabel = formatSelectedDaysLabel(selectedDays);
      const meta = {
        subject, grade, quarter, weekNumber: weekNum || null,
        weekLabel: _wLabel,
        selectedDays: selectedDays.map(d => d.toISOString().slice(0, 10)),
        lessonName: `${subject} ${grade}${weekNum ? ` W${weekNum}` : ""}${_wLabel ? ` – ${_wLabel}` : ""}`,
        topic: contentFocus || competency.slice(0, 80),
        competencyCode, competency, contentStandard: contentStd, performanceStandard: perfStd,
        objectives, contentFocus, integration,
        references, materials, procedure,
        formativeAssessment, evaluationTool, teacherNotes,
        isDraft: !genDone,
      };
      try {
        setAutoSaving(true);
        if (savedPlanIdRef.current) {
          await updateLessonPlan(user.uid, savedPlanIdRef.current, meta);
        } else {
          const id = await saveLessonPlan(user.uid, null, "", meta);
          setSavedPlanId(id);
          savedPlanIdRef.current = id;
        }
        setLastSaved(Date.now());
      } catch {
        // silent — auto-save is best-effort
      } finally {
        setAutoSaving(false);
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, grade, quarter, weekNum, selectedDays, competencyCode, competency, contentStd, perfStd,
      objectives, contentFocus, integration, references, materials, procedure,
      formativeAssessment, evaluationTool, teacherNotes]);

  // ── Step 1 helpers
  function resetGeneration() {
    setGenPct(0); setGenLabel(""); setGenDone(false); setLessonPlan(null); setGenError("");
  }

  // ── Step 2: Gemini AI objectives
  async function runAiObjectives() {
    if (!competency.trim() || aiRunning) return;
    setAiRunning(true); setAiError(""); setObjectives([]);
    try {
      const result = await callGeminiObjectives(subject, grade, quarter, competency, contentStd, perfStd);
      if (!result.length) throw new Error("No objectives returned — check your competency text and retry.");
      setObjectives(result);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiRunning(false);
    }
  }

  function updateObjective(i, field, val) {
    setObjectives(prev => prev.map((o, j) => j === i ? { ...o, [field]: val } : o));
  }
  function removeObjective(i) {
    setObjectives(prev => prev.filter((_, j) => j !== i));
  }
  function addObjective() {
    setObjectives(prev => [...prev, { text: "", bloom: "Understand" }]);
  }

  // ── Step 3: File handling
  function validateFile(f) {
    const allowed = ["application/pdf","application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (f.type.startsWith("image/")) return true;
    if (allowed.includes(f.type)) return true;
    if (f.name.endsWith(".doc") || f.name.endsWith(".docx")) return true;
    return false;
  }

  function pickFile(f) {
    if (!f) return;
    if (!validateFile(f)) { setFileError("Unsupported type. Use PDF, Word, PNG, or JPG."); return; }
    setFileError(""); setFile(f);
    setExtractPct(0); setExtractDone(false); setExtractedCtx(null); setExtractError("");
    resetGeneration();
  }

  async function runExtract() {
    if (!file || extractRunning) return;
    setExtractRunning(true); setExtractDone(false); setExtractedCtx(null); setExtractError(""); setExtractPct(0);
    try {
      const raw = await extractContextFromFile(file, (pct, label) => { setExtractPct(pct); });
      setExtractedCtx({ ...raw, subject, gradeLevel: grade });
      setExtractDone(true);
    } catch (e) {
      setExtractError(e.message);
    } finally {
      setExtractRunning(false);
    }
  }

  // ── Step 4: Procedure update
  function updateProcedure(key, field, val) {
    setProcedure(prev => ({ ...prev, [key]: { ...prev[key], [field]: field === "timeMin" ? Number(val) || 0 : val } }));
  }

  // ── Generation
  async function runGenerate() {
    if (!canGenerate || generating) return;
    setGenerating(true); setGenDone(false); setLessonPlan(null); setGenError(""); setGenPct(0);
    const genContext = extractedCtx
      ? { ...extractedCtx, subject, gradeLevel: grade }
      : {
          subject,
          gradeLevel: grade,
          topic:          contentFocus || competency.slice(0, 120),
          objectives:     objectives.map(o => o.text),
          keyTerms:       materials.slice(0, 10),
          competencies:   competency ? [competency] : [],
          summary:        [
            quarter && `${quarter} lesson`,
            contentFocus && `Topic: ${contentFocus}`,
            integration && `Integration: ${integration}`,
          ].filter(Boolean).join(". "),
        };
    try {
      const plan = await generate4AsLesson(genContext, weekDatesCompat, (pct, label) => {
        setGenPct(pct); setGenLabel(label);
      });
      setLessonPlan(plan);
      setGenDone(true);

      const _wLabel = weekDatesCompat?.label ?? "";
      const saveMeta = {
        subject, grade, quarter, weekNumber: weekNum || null,
        weekLabel: _wLabel,
        selectedDays: selectedDays.map(d => d.toISOString().slice(0, 10)),
        lessonName: `${subject} ${grade}${weekNum ? ` W${weekNum}` : ""}${_wLabel ? ` – ${_wLabel}` : ""}`,
        topic: genContext.topic,
        objectives: objectives.map(o => o.text),
        competencies: genContext.competencies,
        isDraft: false,
      };
      if (savedPlanIdRef.current) {
        await updateLessonPlan(user.uid, savedPlanIdRef.current, { content: JSON.stringify(plan), ...saveMeta });
      } else {
        const id = await saveLessonPlan(user.uid, null, JSON.stringify(plan), saveMeta);
        setSavedPlanId(id); savedPlanIdRef.current = id;
      }
      setLastSaved(Date.now());
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── Export
  async function runExport() {
    if (!lessonPlan || exporting) return;
    setExporting(true);
    try {
      await exportDocx(lessonPlan, weekDatesCompat, {
        subject, grade, quarter, weekNum,
        competency, competencyCode, contentStd, performanceStd,
        objectives, contentFocus, integration,
        materials, references, procedure,
        formativeAssessment, evaluationTool, teacherNotes,
      });
    } catch (e) {
      alert("Export failed: " + e.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleHistoryExport(entry) {
    if (!entry.content) { alert("No plan content stored."); return; }
    setExportingHist(entry.id);
    try {
      await exportDocx(JSON.parse(entry.content), { label: entry.weekLabel }, {
        subject: entry.subject, grade: entry.grade,
      });
    } catch (e) {
      alert("Export failed: " + e.message);
    } finally {
      setExportingHist(null);
    }
  }

  function toggleStep(n) {
    setActiveStep(prev => prev === n ? 0 : n);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-[#1A2E24]">Lesson Plan Generator</h2>
          <p className="text-sm text-[#4A6B5A]">MATATAG Curriculum · 5-Step Workflow</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {autoSaving && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#D8E8E1] px-3 py-1 text-xs font-bold text-[#2D6A4F]">
              <Loader2 size={11} className="animate-spin" /> Saving…
            </span>
          )}
          {!autoSaving && lastSaved && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-bold text-[#166534]">
              <CheckCircle2 size={11} /> Saved
            </span>
          )}
          {!OR_ENABLED && (
             <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
               AI disabled — add VITE_MISTRAL_API_KEY
             </span>
          )}
        </div>
      </div>

      {/* ── STEP 1: Session Setup ─────────────────────────────────────────────── */}
      <StepPanel
        number={1}
        title="Session Setup"
        subtitle="Subject, grade level, quarter, and teaching week"
        done={s1Done}
        locked={false}
        active={activeStep === 1}
        onToggle={() => toggleStep(1)}
      >
        <div className="grid gap-5 sm:grid-cols-2 mt-2">
          {/* Left column */}
          <div className="space-y-4">
            {/* Subject */}
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-[#4A6B5A]">
                Subject Area <span className="text-red-400">*</span>
              </label>
              <select
                value={subject}
                onChange={e => { setSubject(e.target.value); resetGeneration(); }}
                className="select"
              >
                <option value="">Select subject…</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Grade */}
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-[#4A6B5A]">
                Grade Level <span className="text-red-400">*</span>
              </label>
              <select
                value={grade}
                onChange={e => { setGrade(e.target.value); resetGeneration(); }}
                className="select"
              >
                <option value="">Select grade…</option>
                {GRADE_LEVELS.map(g => (
                  <option key={g} value={g}>{g === "Kinder" ? "Kindergarten" : `Grade ${g}`}</option>
                ))}
              </select>
            </div>

            {/* Quarter — radio pills (Q1/Q2/Q3) */}
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-[#4A6B5A]">Quarter</label>
              <div className="flex gap-2">
                {QUARTERS.map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuarter(q)}
                    className={`flex-1 rounded-xl border py-2 text-sm font-black transition-all
                      ${quarter === q
                        ? "bg-[#2D6A4F] text-white border-transparent"
                        : "bg-white text-[#4A6B5A] border-[#D8E8E1] hover:bg-[#F0F7F4]"
                      }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Week # */}
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-[#4A6B5A]">Week #</label>
              <select value={weekNum} onChange={e => setWeekNum(e.target.value)} className="select">
                <option value="">—</option>
                {WEEK_NUMBERS.map(w => <option key={w} value={w}>Week {w}</option>)}
              </select>
              <p className="mt-1 text-xs text-[#8AA898]">Week number within the quarter (1–10)</p>
            </div>

            {/* Lesson Label — always visible, live update */}
            <div className="rounded-xl border border-[#D8E8E1] bg-[#F8FAF9] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#8AA898] mb-1">Lesson Label</p>
              <p className="text-sm font-black text-[#1A2E24]">
                {subject || "—"} {grade || "—"}{quarter ? ` · ${quarter}` : ""}{weekNum ? ` · Week ${weekNum}` : ""}
              </p>
              <p className="text-xs mt-0.5">
                {selectedDays.length > 0
                  ? <span className="text-[#4A6B5A]">{formatSelectedDaysLabel(selectedDays)}</span>
                  : <span className="text-[#8AA898]">Select teaching days above</span>
                }
              </p>
            </div>
          </div>

          {/* Right column: WeekPicker (multi-day free pick) */}
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-[#4A6B5A]">
              Teaching Days <span className="text-red-400">*</span>
            </label>
            <div className="rounded-2xl border border-[#D8E8E1] bg-[#F8FAF9] p-4">
              <WeekPicker
                value={selectedDays}
                onChange={days => { setSelectedDays(days); resetGeneration(); }}
              />
            </div>
          </div>
        </div>

        <div className="mt-5">
          <button
            onClick={() => s1Done && toggleStep(2)}
            disabled={!s1Done}
            title={selectedDays.length === 0 ? "Select at least 1 teaching day" : ""}
            className={`btn-primary ${!s1Done ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Continue to Step 2 →
          </button>
          {subject && grade && selectedDays.length === 0 && (
            <p className="mt-2 text-xs text-amber-600">Select at least 1 teaching day to continue.</p>
          )}
        </div>
      </StepPanel>

      {/* ── STEP 2: Unpack Competency ──────────────────────────────────────────── */}
      <StepPanel
        number={2}
        title="Unpack Competency"
        subtitle="Learning competency from the CG + AI-generated objectives"
        done={s2Done}
        locked={!s1Done}
        active={activeStep === 2}
        onToggle={() => toggleStep(2)}
      >
        <div className="space-y-5 mt-2">
          {/* CG Reference card */}
          <div className="rounded-2xl border border-[#D8E8E1] bg-[#F8FAF9] p-4 space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-[#8AA898]">Curriculum Guide (CG) Reference</p>

            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <div>
                <label className="mb-1 block text-xs font-bold text-[#4A6B5A]">Competency Code</label>
                <input
                  value={competencyCode}
                  onChange={e => setCompetencyCode(e.target.value)}
                  placeholder="e.g. S10MT-Ia-1"
                  className="input text-xs"
                />
              </div>
              <div>
                 <label className="mb-1 block text-xs font-bold text-[#4A6B5A]">
                   Learning Competency <span className="text-red-400">*</span>
                 </label>
                  <select
                    value={competency}
                    onChange={e => setCompetency(e.target.value)}
                    className="input resize-none text-sm"
                  >
                    <option value="">Select a competency...</option>
                    {filteredCompetencies.length === 0 ? (
                      <option value="" disabled>No competencies found for the selected subject, grade, and term.</option>
                    ) : (
                      filteredCompetencies.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))
                  </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-[#4A6B5A]">Content Standard</label>
                <textarea
                  value={contentStd}
                  onChange={e => setContentStd(e.target.value)}
                  placeholder="The learner demonstrates understanding of…"
                  rows={2}
                  className="input resize-none text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[#4A6B5A]">Performance Standard</label>
                <textarea
                  value={perfStd}
                  onChange={e => setPerfStd(e.target.value)}
                  placeholder="The learner is able to…"
                  rows={2}
                  className="input resize-none text-xs"
                />
              </div>
            </div>
          </div>

          {/* Content & Integration */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-[#4A6B5A]">Content Focus / Topic</label>
              <input
                value={contentFocus}
                onChange={e => setContentFocus(e.target.value)}
                placeholder="e.g. Laws of Motion, Mitosis, Sugnay…"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#4A6B5A]">Subject Integration (optional)</label>
              <input
                value={integration}
                onChange={e => setIntegration(e.target.value)}
                placeholder="e.g. GMRC – cooperation, Math – graphing"
                className="input"
              />
            </div>
          </div>

          {/* Objectives section */}
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#4A6B5A]">Learning Objectives</p>
                <p className="text-[10px] text-[#8AA898]">Bloom's-aligned, SMART objectives</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={runAiObjectives}
                  disabled={!competency.trim() || aiRunning || !GEMINI_KEY}
                  className="btn-primary"
                  style={{ fontSize: 12, padding: "7px 14px" }}
                >
                  {aiRunning
                    ? <><Loader2 size={13} className="animate-spin" /> Generating…</>
                    : <><Brain size={13} /> Unpack with AI</>
                  }
                </button>
                <button
                  type="button"
                  onClick={addObjective}
                  className="btn-outline"
                  style={{ fontSize: 12, padding: "7px 12px" }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>

            {aiError && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-xs text-red-600 flex-1">{aiError}</p>
                <button onClick={() => setAiError("")} className="text-red-400 hover:text-red-600"><X size={13} /></button>
              </div>
            )}

            {objectives.length === 0 && !aiRunning && (
              <div className="rounded-2xl border-2 border-dashed border-[#D8E8E1] flex items-center justify-center py-8 text-center">
                <div>
                  <Brain size={28} className="mx-auto mb-2 text-[#D8E8E1]" />
                  <p className="text-sm text-[#8AA898]">No objectives yet</p>
                  <p className="text-xs text-[#C8D9D2] mt-1">Enter a competency above, then click "Unpack with AI"</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {objectives.map((obj, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-[#D8E8E1] bg-white p-3">
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={obj.text}
                      onChange={e => updateObjective(i, "text", e.target.value)}
                      placeholder="Students will be able to…"
                      className="input text-sm"
                    />
                    <select
                      value={obj.bloom || "Understand"}
                      onChange={e => updateObjective(i, "bloom", e.target.value)}
                      className="select"
                      style={{ fontSize: 11, padding: "5px 30px 5px 10px" }}
                    >
                      {BLOOM_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 pt-0.5">
                    <BloomBadge level={obj.bloom || "Understand"} />
                    <button
                      type="button"
                      onClick={() => removeObjective(i)}
                      className="rounded-lg p-1 text-[#8AA898] hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {s2Done && (
          <button onClick={() => toggleStep(3)} className="btn-primary mt-5">
            Continue to Step 3 →
          </button>
        )}
      </StepPanel>

      {/* ── STEP 3: Learning Resources ─────────────────────────────────────────── */}
      <StepPanel
        number={3}
        title="Learning Resources"
        subtitle="Upload lesson source + add references and materials"
        done={s3Done}
        locked={!s2Done}
        active={activeStep === 3}
        optional
        onToggle={() => toggleStep(3)}
      >
        <div className="space-y-5 mt-2">
          {/* File upload zone */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-[#4A6B5A]">Lesson Source File <span className="text-[#8AA898] font-normal normal-case">(optional — AI reads it for context)</span></p>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
              onClick={() => !extractRunning && fileRef.current?.click()}
              className={`relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 transition-all ${
                dragOver ? "border-[#40916C] bg-[#D8E8E1] scale-[1.01]" :
                file ? "border-[#40916C] bg-[#F0F7F4]" :
                "border-[#D8E8E1] bg-[#F8FAF9] hover:border-[#40916C] hover:bg-[#F0F7F4]"
              } ${extractRunning ? "cursor-wait" : ""}`}
            >
              <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }} disabled={extractRunning} />
              {file ? (
                <div className="flex items-center gap-3 w-full">
                  <FileIcon type={file.type} name={file.name} />
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-[#1A2E24] truncate text-sm">{file.name}</p>
                    <p className="text-xs text-[#4A6B5A]">{formatSize(file.size)}</p>
                  </div>
                  {!extractRunning && (
                    <button
                      onClick={e => { e.stopPropagation(); setFile(null); setFileError(""); setExtractDone(false); setExtractedCtx(null); }}
                      className="rounded-xl p-1 text-[#8AA898] hover:bg-[#D8E8E1] hover:text-red-400"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="h-12 w-12 grid place-items-center rounded-2xl" style={{ background: "linear-gradient(135deg,#2D6A4F,#40916C)" }}>
                    <UploadCloud size={22} className="text-white" />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-[#1A2E24] text-sm">Drop lesson source here</p>
                    <p className="mt-1 text-xs text-[#4A6B5A]">PDF, Word, PNG, JPG — optional</p>
                  </div>
                </>
              )}
            </div>

            {fileError && <p className="mt-2 text-xs font-bold text-red-600">{fileError}</p>}

            {file && !extractDone && !extractRunning && (
              <button onClick={runExtract} disabled={!OR_ENABLED} className="btn-primary mt-3">
                <Wand2 size={14} /> Read with AI
              </button>
            )}

            {(extractRunning || (extractPct > 0 && extractPct <= 100)) && (
              <ProgressBar pct={extractPct} label={extractDone ? "Extraction complete!" : "Reading file…"} done={extractDone} />
            )}
            {extractError && (
              <div className="mt-2 flex gap-2 rounded-xl bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600 flex-1">{extractError}</p>
                <button onClick={runExtract} className="text-xs font-black text-red-600 underline">Retry</button>
              </div>
            )}
            {extractedCtx && extractDone && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] px-3 py-2">
                <CheckCircle2 size={14} className="text-[#059669]" />
                <span className="text-xs font-bold text-[#065F46]">File read — context will enrich the generated plan</span>
                <button onClick={runExtract} className="ml-auto flex items-center gap-1 text-[10px] font-bold text-[#4A6B5A] hover:text-[#2D6A4F]">
                  <RefreshCw size={10} /> Re-read
                </button>
              </div>
            )}
          </div>

          {/* References */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-[#4A6B5A]">References</p>
            <div className="flex gap-2">
              <input
                value={newRef}
                onChange={e => setNewRef(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newRef.trim()) { setReferences(p => [...p, newRef.trim()]); setNewRef(""); }
                }}
                placeholder="Add a reference (press Enter)"
                className="input flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => { if (newRef.trim()) { setReferences(p => [...p, newRef.trim()]); setNewRef(""); } }}
                className="btn-outline"
                style={{ padding: "10px 14px" }}
              >
                <Plus size={14} />
              </button>
            </div>
            {references.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {references.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-full border border-[#D8E8E1] bg-white px-3 py-1 text-xs font-medium text-[#1A2E24]">
                    <span className="max-w-[200px] truncate">{r}</span>
                    <button onClick={() => setReferences(p => p.filter((_, j) => j !== i))} className="text-[#8AA898] hover:text-red-500"><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Materials */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-[#4A6B5A]">Materials / Tools</p>
            <div className="flex gap-2">
              <input
                value={newMat}
                onChange={e => setNewMat(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newMat.trim()) { setMaterials(p => [...p, newMat.trim()]); setNewMat(""); }
                }}
                placeholder="Add a material (press Enter)"
                className="input flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => { if (newMat.trim()) { setMaterials(p => [...p, newMat.trim()]); setNewMat(""); } }}
                className="btn-outline"
                style={{ padding: "10px 14px" }}
              >
                <Plus size={14} />
              </button>
            </div>
            {materials.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {materials.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-full bg-[#D8E8E1] px-3 py-1 text-xs font-bold text-[#1A2E24]">
                    {m}
                    <button onClick={() => setMaterials(p => p.filter((_, j) => j !== i))} className="text-[#4A6B5A] hover:text-red-500"><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button onClick={() => toggleStep(4)} className="btn-primary mt-5">
          Continue to Step 4 →
        </button>
      </StepPanel>

      {/* ── STEP 4: Teaching Procedure ─────────────────────────────────────────── */}
      <StepPanel
        number={4}
        title="Teaching Procedure"
        subtitle="MATATAG 5-part daily flow · 60-minute session"
        done={s4Done}
        locked={!s3Done}
        active={activeStep === 4}
        onToggle={() => toggleStep(4)}
      >
        <div className="mt-2">
          <TimeBudgetBar procedure={procedure} />

          <div className="space-y-3">
            {MATATAG_PARTS.map(part => (
              <div key={part.key} className="rounded-2xl border overflow-hidden" style={{ borderColor: part.border, backgroundColor: part.bg }}>
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${part.border}` }}>
                  <div className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-white text-[10px] font-black" style={{ backgroundColor: part.color }}>
                    {part.short}
                  </div>
                  <span className="flex-1 text-sm font-black text-[#1A2E24]">{part.label}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={59}
                      value={procedure[part.key]?.timeMin ?? part.defaultMin}
                      onChange={e => updateProcedure(part.key, "timeMin", e.target.value)}
                      className="w-14 rounded-lg border px-2 py-1 text-xs font-black text-center"
                      style={{ borderColor: part.border, backgroundColor: "white" }}
                    />
                    <span className="text-xs text-[#4A6B5A] font-medium">min</span>
                  </div>
                </div>
                <div className="p-4">
                  <textarea
                    value={procedure[part.key]?.description ?? ""}
                    onChange={e => updateProcedure(part.key, "description", e.target.value)}
                    placeholder={
                      part.key === "apk" ? "Describe the warm-up, review activity, or prior knowledge elicitation…" :
                      part.key === "ep"  ? "State the lesson objective and purpose clearly for the students…" :
                      part.key === "du"  ? "Describe the main teaching-learning activities, demonstrations, guided practice…" :
                      part.key === "mg"  ? "How will students generalize or summarize their learnings? Discussion, concept map…" :
                                           "Describe the formative assessment activity for this session…"
                    }
                    rows={3}
                    className="w-full resize-none rounded-xl border bg-white px-3 py-2.5 text-sm text-[#1A2E24] outline-none transition-all focus:ring-2"
                    style={{ borderColor: part.border }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {s4Done && (
          <button onClick={() => toggleStep(5)} className="btn-primary mt-5">
            Continue to Step 5 →
          </button>
        )}
      </StepPanel>

      {/* ── STEP 5: Assessment & Reflection ───────────────────────────────────── */}
      <StepPanel
        number={5}
        title="Assessment & Reflection"
        subtitle="Formative assessment plan and post-lesson teacher notes"
        done={s5Done}
        locked={!s4Done}
        active={activeStep === 5}
        onToggle={() => toggleStep(5)}
      >
        <div className="space-y-4 mt-2">
          {/* Assessment card */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-amber-700">Formative Assessment</p>

            <div>
              <label className="mb-1 block text-xs font-bold text-amber-800">
                Assessment Strategy <span className="text-red-400">*</span>
              </label>
              <textarea
                value={formativeAssessment}
                onChange={e => setFormativeAssessment(e.target.value)}
                placeholder="e.g. Exit tickets at the end of the lesson asking students to explain the key concept in their own words…"
                rows={3}
                className="w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-[#1A2E24] outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-amber-800">Evaluation Tool</label>
              <input
                value={evaluationTool}
                onChange={e => setEvaluationTool(e.target.value)}
                placeholder="e.g. Rubric, checklist, observation sheet, written quiz…"
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-[#1A2E24] outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          </div>

          {/* Reflection card */}
          <div className="rounded-2xl border border-[#D8E8E1] bg-[#F8FAF9] p-4">
            <p className="text-xs font-black uppercase tracking-wider text-[#4A6B5A] mb-3">Teacher Notes & Reflection</p>
            <textarea
              value={teacherNotes}
              onChange={e => setTeacherNotes(e.target.value)}
              placeholder="Notes for yourself: things to watch for, differentiation strategies, possible student misconceptions, post-lesson reflections…"
              rows={4}
              className="input resize-none w-full text-sm"
            />
          </div>
        </div>

        {s5Done && canGenerate && (
          <button onClick={() => toggleStep(0)} className="btn-primary mt-5">
            ✓ All steps done — generate below ↓
          </button>
        )}
      </StepPanel>

      {/* ── GENERATE CTA ──────────────────────────────────────────────────────── */}
      {canGenerate && (
        <div className="card card-accent p-6">
          {!generating && !genDone && (
            <>
              <div className="flex items-center gap-4 mb-4">
                <div className="h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2D6A4F,#40916C)" }}>
                  <Wand2 size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="font-black text-[#1A2E24] text-base">Generate Full Lesson Plan</h3>
                  <p className="text-sm text-[#4A6B5A]">AI builds a complete 5-day MATATAG-aligned plan</p>
                </div>
              </div>
              <button
                onClick={runGenerate}
                disabled={!OR_ENABLED}
                className="btn-primary w-full py-3.5 text-base justify-center"
                style={{ background: "linear-gradient(135deg,#2D6A4F,#40916C)" }}
              >
                <Wand2 size={18} /> Generate 5-Day Lesson Plan
              </button>
               {!OR_ENABLED && (
                 <p className="mt-2 text-xs text-red-500 text-center">Add VITE_MISTRAL_API_KEY to .env to enable AI generation.</p>
               )}
            </>
          )}

          {generating && (
            <ProgressBar pct={genPct} label={genLabel || "Building lesson plan…"} done={false} />
          )}

          {genError && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mt-2">
              <p className="text-sm text-red-600 flex-1">{genError}</p>
              <button onClick={runGenerate} className="text-xs font-black text-red-600 underline shrink-0">Retry</button>
            </div>
          )}

          {genDone && !generating && (
            <div className="flex items-center gap-3 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] px-4 py-3">
              <CheckCircle2 size={18} className="text-[#059669] shrink-0" />
              <p className="font-bold text-[#065F46] flex-1 text-sm">Lesson plan generated and saved!</p>
              <button onClick={runGenerate} disabled={!OR_ENABLED} className="btn-outline" style={{ fontSize: 12, padding: "6px 12px" }}>
                <RefreshCw size={12} /> Regenerate
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── OUTPUT PANEL ──────────────────────────────────────────────────────── */}
      {lessonPlan && (
        <div className="card card-accent p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2D6A4F,#40916C)" }}>
                <FileDown size={16} className="text-white" />
              </div>
              <div>
                <h3 className="font-black text-[#1A2E24] text-base">Generated Lesson Plan</h3>
                {lessonPlan.overview && (
                  <p className="text-xs text-[#4A6B5A]">
                    {lessonPlan.overview.subject} · {lessonPlan.overview.grade} · {lessonPlan.overview.weekLabel}
                  </p>
                )}
              </div>
            </div>
            <button onClick={runExport} disabled={exporting} className="btn-primary" style={{ fontSize: 13 }}>
              {exporting ? <><Loader2 size={14} className="animate-spin" /> Exporting…</> : <><FileDown size={14} /> Export .docx</>}
            </button>
          </div>

          {/* Overview pill */}
          {lessonPlan.overview && (
            <div className="mb-4 grid gap-3 sm:grid-cols-2 rounded-2xl bg-[#F8FAF9] border border-[#D8E8E1] p-4">
              {[
                ["Subject", lessonPlan.overview.subject],
                ["Grade",   lessonPlan.overview.grade],
                ["Topic",   lessonPlan.overview.topic],
                ["Week",    lessonPlan.overview.weekLabel],
              ].map(([label, val]) => val ? (
                <div key={label}>
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#8AA898]">{label}</p>
                  <p className="mt-0.5 text-sm font-bold text-[#1A2E24]">{val}</p>
                </div>
              ) : null)}
            </div>
          )}

          {/* Day cards */}
          <div className="space-y-3">
            {(lessonPlan.days || []).map((dayData, i) => (
              <DayCard key={i} dayIndex={i} data={dayData} />
            ))}
          </div>
        </div>
      )}

      {/* ── ARCHIVE ───────────────────────────────────────────────────────────── */}
      <div className="card card-accent p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2D6A4F,#40916C)" }}>
            <History size={16} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-[#1A2E24] text-base">Lesson Plan Archive</h3>
            <p className="text-xs text-[#4A6B5A]">All generated and saved lesson plans</p>
          </div>
          {history.length > 0 && (
            <span className="rounded-full bg-[#D8E8E1] px-2.5 py-0.5 text-xs font-bold text-[#4A6B5A]">
              {history.filter(p => !p.isDraft).length} plan{history.filter(p => !p.isDraft).length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {historyLoading && (
          <p className="flex items-center gap-2 py-4 text-sm text-[#4A6B5A]">
            <Loader2 size={14} className="animate-spin" /> Loading archive…
          </p>
        )}

        {!historyLoading && history.filter(p => !p.isDraft).length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10">
            <Archive size={28} className="text-[#D8E8E1]" />
            <p className="text-sm text-[#8AA898]">No lesson plans yet — generate one above.</p>
          </div>
        )}

        {!historyLoading && history.filter(p => !p.isDraft).length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {history.filter(p => !p.isDraft).map(entry => {
              const archName = entry.lessonName
                ?? (entry.subject && entry.grade
                  ? `${entry.subject} ${entry.grade}${entry.weekLabel ? ` – ${entry.weekLabel}` : ""}`
                  : `Lesson Plan`);
              return (
                <div key={entry.id} className="rounded-2xl border border-[#D8E8E1] bg-white p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2D6A4F,#40916C)" }}>
                      <FileText size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-[#1A2E24] text-sm truncate">{archName}</p>
                      {entry.topic && <p className="text-xs text-[#4A6B5A] truncate mt-0.5">{entry.topic}</p>}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-[10px] text-[#8AA898]">{formatShortDate(entry.createdAt)}</p>
                        {entry.quarter && (
                          <span className="rounded-full bg-[#D8E8E1] px-2 py-0.5 text-[9px] font-bold text-[#4A6B5A]">{entry.quarter}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {entry.content ? (
                    <button
                      onClick={() => handleHistoryExport(entry)}
                      disabled={exportingHist === entry.id}
                      className="btn-outline w-full"
                      style={{ fontSize: 12, padding: "7px 14px" }}
                    >
                      {exportingHist === entry.id
                        ? <><Loader2 size={12} className="animate-spin" /> Exporting…</>
                        : <><FileDown size={12} /> Export .docx</>
                      }
                    </button>
                  ) : (
                    <p className="text-center text-[10px] text-[#C8D9D2]">No exportable content</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
