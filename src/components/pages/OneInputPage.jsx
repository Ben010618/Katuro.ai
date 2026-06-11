import { useRef, useState, useEffect } from "react";
import {
  UploadCloud, FileText, Image, File, Trash2,
  ExternalLink, Loader2, Wand2, CheckCircle,
  ChevronDown, ChevronUp, Sparkles, BookOpen,
} from "lucide-react";
import { useUploads } from "../../hooks/useUploads";
import { useSessions } from "../../hooks/useSessions";
import { AI_ENABLED, extractFromFile } from "../../services/ai";
import { saveContext, getContextBySession } from "../../services/db";

const ACCEPTED = ".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg";

function fileIcon(type = "") {
  if (type.startsWith("image/")) return <Image size={18} className="text-blue-400" />;
  if (type === "application/pdf") return <FileText size={18} className="text-red-400" />;
  return <File size={18} className="text-[#5A7566]" />;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function isAISupported(mimeType = "") {
  return mimeType === "text/plain" || mimeType === "application/pdf" || mimeType.startsWith("image/");
}

// ─── Per-file extract card ────────────────────────────────────────────────────

function ExtractCard({ upload, user, sessions, globalSessionId, globalPrompt, onRemove }) {
  // Per-file session can override global
  const [sessionId, setSessionId] = useState(globalSessionId || "");
  const [extracting, setExtracting] = useState(false);
  const [context, setContext] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [summary, setSummary] = useState("");
  const [objectives, setObjectives] = useState("");
  const [keyTerms, setKeyTerms] = useState("");
  const [competencies, setCompetencies] = useState("");

  // Sync global session into local when parent changes
  useEffect(() => {
    if (globalSessionId && !sessionId) setSessionId(globalSessionId);
  }, [globalSessionId]);

  function fillFields(ctx) {
    setSubject(ctx.subject || "");
    setTopic(ctx.topic || "");
    setGradeLevel(ctx.gradeLevel || "");
    setSummary(ctx.summary || "");
    setObjectives((ctx.objectives || []).join("\n"));
    setKeyTerms((ctx.keyTerms || []).join(", "));
    setCompetencies((ctx.competencies || []).join("\n"));
  }

  async function handleSessionChange(sid) {
    setSessionId(sid);
    setSaved(false);
    if (!sid) { setContext(null); return; }
    const existing = await getContextBySession(user.uid, sid);
    if (existing) { fillFields(existing); setContext(existing); setExpanded(true); }
  }

  async function handleExtract() {
    if (!isAISupported(upload.type)) {
      setErr("File type not supported. Please use PDF, TXT, or an image.");
      return;
    }
    setExtracting(true);
    setErr("");
    try {
      const result = await extractFromFile(upload.downloadURL, upload.type, globalPrompt);
      fillFields(result);
      setContext(result);
      setExpanded(true);
      setSaved(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!sessionId) { setErr("Select a session first."); return; }
    setSaving(true);
    setErr("");
    try {
      await saveContext(user.uid, sessionId, {
        subject,
        topic,
        gradeLevel,
        summary,
        objectives: objectives.split("\n").map((s) => s.trim()).filter(Boolean),
        keyTerms: keyTerms.split(",").map((s) => s.trim()).filter(Boolean),
        competencies: competencies.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#DCEBDC] bg-white overflow-hidden">
      {/* File header row */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#F7FBF8]">
        {fileIcon(upload.type)}
        <div className="flex-1 min-w-0">
          <p className="truncate font-bold text-[#163828] text-sm">{upload.name}</p>
          <p className="text-xs text-[#5A7566]">{formatSize(upload.size)} · {formatDate(upload.createdAt)}</p>
        </div>
        <a
          href={upload.downloadURL}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl p-1.5 text-[#5A7566] hover:bg-[#DCEBDC]"
          title="Open file"
        >
          <ExternalLink size={15} />
        </a>
        <button
          onClick={onRemove}
          className="rounded-xl p-1.5 text-red-400 hover:bg-red-50"
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[#F0F7F1]">
        <select
          value={sessionId}
          onChange={(e) => handleSessionChange(e.target.value)}
          className="select flex-1"
          style={{ padding: "8px 36px 8px 12px", fontSize: 13 }}
        >
          <option value="">Link to session…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>

        <button
          onClick={handleExtract}
          disabled={!AI_ENABLED || extracting}
          title={!AI_ENABLED ? "Add VITE_GEMINI_API_KEY to .env" : ""}
          className="btn-primary shrink-0"
          style={{ padding: "8px 14px", fontSize: 13 }}
        >
          {extracting
            ? <><Loader2 size={13} className="animate-spin" /> Extracting…</>
            : <><Wand2 size={13} /> Extract with AI</>}
        </button>

        {context && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-xl p-2 text-[#5A7566] hover:bg-[#DCEBDC]"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {err && (
        <p className="mx-4 mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{err}</p>
      )}

      {/* Extracted context editor */}
      {context && expanded && (
        <div className="border-t border-[#F0F7F1] p-4 space-y-3 bg-[#FAFFFE]">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-600" />
            <p className="text-xs font-black text-[#163828]">Lesson context extracted — review and save</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Subject", subject, setSubject],
              ["Topic", topic, setTopic],
              ["Grade Level", gradeLevel, setGradeLevel],
            ].map(([label, val, set]) => (
              <div key={label}>
                <label className="mb-1 block text-xs font-bold text-[#5A7566]">{label}</label>
                <input value={val} onChange={(e) => set(e.target.value)} className="input" style={{ padding: "8px 12px", fontSize: 13 }} />
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#5A7566]">Summary</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2}
              className="input resize-none" style={{ fontSize: 13 }} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-[#5A7566]">Learning Objectives (one per line)</label>
              <textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={3}
                className="input resize-none text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#5A7566]">Competencies (one per line)</label>
              <textarea value={competencies} onChange={(e) => setCompetencies(e.target.value)} rows={3}
                className="input resize-none text-xs" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#5A7566]">Key Terms (comma-separated)</label>
            <input value={keyTerms} onChange={(e) => setKeyTerms(e.target.value)} className="input" style={{ fontSize: 13 }} />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={handleSave} disabled={saving || !sessionId} className="btn-primary">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {saving ? "Saving…" : "Confirm & Save to Session"}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-green-700">
                <CheckCircle size={13} /> Saved
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OneInputPage({ user }) {
  const { uploads, loading, addUpload, removeUpload } = useUploads(user.uid);
  const { sessions } = useSessions(user.uid);
  const inputRef = useRef(null);

  // Global state shared across all cards
  const [globalSessionId, setGlobalSessionId] = useState("");
  const [globalPrompt, setGlobalPrompt] = useState("");

  const [progress, setProgress] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(files) {
    if (!files?.length) return;
    setError("");
    setUploading(true);
    setProgress(0);
    try {
      await addUpload(files[0], setProgress);
    } catch (e) {
      setError("Upload failed — check Firebase Storage rules.");
      console.error(e);
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  function onInputChange(e) { handleFiles(e.target.files); e.target.value = ""; }
  function onDrop(e) { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }

  return (
    <div className="space-y-6">

      {/* ── Step 1: Session + AI Instructions ────────────────── */}
      <div className="card card-accent p-6">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black text-white"
            style={{ background: "linear-gradient(135deg, #163828 0%, #4CAF50 100%)" }}
          >1</div>
          <div>
            <h3 className="text-base font-black text-[#163828]">Select Session & AI Instructions</h3>
            <p className="text-xs text-[#5A7566]">Set once — applies to all files below</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Default session</label>
            <select
              value={globalSessionId}
              onChange={(e) => setGlobalSessionId(e.target.value)}
              className="select"
            >
              <option value="">Select a session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            {sessions.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600 font-bold">
                No sessions yet — create one in Dashboard first.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">
              AI instructions <span className="font-normal text-[#9BB8A5]">(optional)</span>
            </label>
            <div className="relative">
              <Sparkles size={13} className="absolute left-3 top-3 text-[#4CAF50]" />
              <textarea
                value={globalPrompt}
                onChange={(e) => setGlobalPrompt(e.target.value)}
                rows={3}
                placeholder={`e.g. "Focus on Grade 9 Science CAPS competencies"\n"Extract all formulas and definitions"\n"Emphasise critical thinking objectives"`}
                disabled={!AI_ENABLED}
                className="input resize-none pl-8 text-xs"
              />
            </div>
            {!AI_ENABLED && (
              <p className="mt-1 text-xs font-bold text-red-500">
                AI disabled — VITE_GEMINI_API_KEY not set in .env
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Step 2: Upload ────────────────────────────────────── */}
      <div className="card card-accent p-6">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black text-white"
            style={{ background: "linear-gradient(135deg, #163828 0%, #4CAF50 100%)" }}
          >2</div>
          <div>
            <h3 className="text-base font-black text-[#163828]">Upload Lesson Source</h3>
            <p className="text-xs text-[#5A7566]">PDF, Word, TXT, or image</p>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !uploading && inputRef.current.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 transition-colors ${
            dragOver
              ? "border-[#4CAF50] bg-[#D4EDDA]"
              : "border-[#DCEBDC] bg-[#F7FBF8] hover:border-[#4CAF50] hover:bg-[#F0F7F1]"
          } ${uploading ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={onInputChange}
            disabled={uploading}
          />
          {uploading ? (
            <>
              <Loader2 size={32} className="animate-spin text-[#4CAF50]" />
              <p className="font-bold text-[#163828]">Uploading… {progress}%</p>
              <div className="progress-track h-2 w-56">
                <div className="progress-fill h-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </>
          ) : (
            <>
              <div
                className="grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: "linear-gradient(135deg, #163828 0%, #4CAF50 100%)", boxShadow: "0 6px 20px rgba(76,175,80,0.35)" }}
              >
                <UploadCloud size={26} className="text-white" />
              </div>
              <div className="text-center">
                <p className="font-black text-[#163828]">Drop your lesson source here</p>
                <p className="mt-1 text-sm text-[#5A7566]">or click to browse — PDF, Word, TXT, image</p>
              </div>
            </>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{error}</p>
        )}
      </div>

      {/* ── Step 3: Extract + Review ──────────────────────────── */}
      <div className="card card-accent p-6">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black text-white"
            style={{ background: "linear-gradient(135deg, #163828 0%, #4CAF50 100%)" }}
          >3</div>
          <div>
            <h3 className="text-base font-black text-[#163828]">Extract & Confirm Lesson Context</h3>
            <p className="text-xs text-[#5A7566]">
              Click "Extract with AI" per file, review the result, then "Confirm & Save"
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-[#5A7566]">
            <Loader2 size={16} className="animate-spin" /> Loading files…
          </div>
        )}

        {!loading && uploads.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10">
            <BookOpen size={32} className="text-[#DCEBDC]" />
            <p className="text-sm text-[#5A7566]">No files uploaded yet — add one above.</p>
          </div>
        )}

        <div className="space-y-4">
          {uploads.map((u) => (
            <ExtractCard
              key={u.id}
              upload={u}
              user={user}
              sessions={sessions}
              globalSessionId={globalSessionId}
              globalPrompt={globalPrompt}
              onRemove={() => removeUpload(u.id, u.storagePath)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
