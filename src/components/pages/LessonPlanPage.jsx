import { useState, useEffect } from "react";
import { Wand2, Save, Printer, Loader2, BookOpen } from "lucide-react";
import { useSessions } from "../../hooks/useSessions";
import { AI_ENABLED, generateLessonPlan } from "../../services/ai";
import { getContextBySession, getLessonPlanBySession, saveLessonPlan } from "../../services/db";

export default function LessonPlanPage({ user }) {
  const { sessions } = useSessions(user.uid);
  const [sessionId, setSessionId] = useState("");
  const [context, setContext] = useState(null);
  const [content, setContent] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);

  useEffect(() => {
    if (!sessionId) { setContext(null); setContent(""); return; }
    setLoadingPlan(true);
    Promise.all([
      getContextBySession(user.uid, sessionId),
      getLessonPlanBySession(user.uid, sessionId),
    ])
      .then(([ctx, plan]) => {
        setContext(ctx || null);
        setContent(plan?.content || "");
      })
      .finally(() => setLoadingPlan(false));
  }, [sessionId, user.uid]);

  async function handleGenerate() {
    if (!context) {
      alert("No lesson context found for this session.\nGo to One Input → upload your lesson → Extract with AI first.");
      return;
    }
    setAiLoading(true);
    try {
      const plan = await generateLessonPlan(context, aiPrompt);
      setContent(plan);
      setSaved(false);
    } catch (e) {
      alert("AI generation failed: " + e.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSave() {
    if (!sessionId || !content.trim()) return;
    setSaving(true);
    try {
      await saveLessonPlan(user.uid, sessionId, content);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    const style = document.createElement("style");
    style.id = "__kt_lp_print__";
    style.innerHTML = `
      @media print {
        body > * { display: none !important; }
        #lp-print-area { display: block !important; font-family: Arial, sans-serif; padding: 20mm; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  }

  const selectedSession = sessions.find((s) => s.id === sessionId);

  return (
    <div className="space-y-8">

      {/* Session selector */}
      <div className="card card-accent p-6">
        <h3 className="text-lg font-black text-[#163828]">Lesson Plan Generator</h3>
        <div className="mt-4 max-w-sm">
          <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Session</label>
          <select
            value={sessionId}
            onChange={(e) => { setSessionId(e.target.value); setSaved(false); }}
            className="select"
          >
            <option value="">Select a session…</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>

        {sessionId && (
          <>
            {context ? (
              <div className="mt-4 rounded-2xl bg-[#F4FAF5] p-4">
                <p className="text-xs font-bold text-[#163828]">Lesson Context</p>
                <p className="mt-1 text-sm font-bold text-[#163828]">{context.topic}</p>
                <p className="text-xs text-[#5A7566]">
                  {context.subject} · Grade {context.gradeLevel}
                </p>
                {context.competencies?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {context.competencies.map((c, i) => (
                      <span key={i} className="rounded-full bg-[#D4EDDA] px-2 py-0.5 text-xs text-[#163828]">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              !loadingPlan && (
                <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
                  No lesson context found. Go to One Input → upload your lesson file → Extract with AI.
                </p>
              )
            )}

            <div className="mt-4 flex gap-2">
              <input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Optional: special instructions for the lesson plan"
                disabled={!AI_ENABLED}
                className="input flex-1"
              />
              <button
                onClick={handleGenerate}
                disabled={!AI_ENABLED || aiLoading || !context}
                className="btn-primary"
              >
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {aiLoading ? "Generating…" : "Generate with AI"}
              </button>
            </div>
            {!AI_ENABLED && (
              <p className="mt-1.5 text-xs text-[#5A7566]">
                Add <code className="rounded bg-[#F4FAF5] px-1">VITE_GEMINI_API_KEY</code> to .env to enable AI generation.
              </p>
            )}
          </>
        )}
      </div>

      {/* Editor */}
      {sessionId && (
        <div className="card card-accent p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-black text-[#163828]">
              {selectedSession?.title || "Lesson Plan"}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                disabled={!content.trim()}
                className="btn-outline"
              >
                <Printer size={14} />
                Print
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !content.trim()}
                className="btn-primary"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
              </button>
            </div>
          </div>

          {loadingPlan ? (
            <p className="py-8 text-center text-sm text-[#5A7566]">Loading…</p>
          ) : (
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setSaved(false); }}
              placeholder="Your lesson plan will appear here after AI generation, or type / paste manually."
              rows={28}
              className="input resize-none font-mono"
            />
          )}
        </div>
      )}

      {/* Hidden print area */}
      <div id="lp-print-area" style={{ display: "none" }}>
        <h1 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>
          Lesson Plan — {selectedSession?.title || ""}
        </h1>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, fontFamily: "Arial, sans-serif" }}>
          {content}
        </pre>
      </div>

      {/* Empty state */}
      {!sessionId && (
        <div className="card flex flex-col items-center gap-3 py-16">
          <div
            className="grid h-16 w-16 place-items-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, #DCEBDC 0%, #F0F7F1 100%)" }}
          >
            <BookOpen size={28} className="text-[#5A7566]" />
          </div>
          <p className="font-bold text-[#5A7566]">Select a session to view or generate a lesson plan.</p>
        </div>
      )}
    </div>
  );
}
