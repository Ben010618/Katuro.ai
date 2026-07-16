/**
 * Gemini AI service — lesson context extraction + 4As lesson plan generation.
 * Replaces the previous Mistral implementation.
 * Streaming via Gemini's SSE endpoint for real-time progress bar updates.
 */
import * as pdfjsLib from "pdfjs-dist";
import PDFWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import { getGeminiKey } from "./geminiConfig";
import { parseAIJson } from "./aiJsonParse";

pdfjsLib.GlobalWorkerOptions.workerSrc = PDFWorkerUrl;

const GEMINI_MODEL = "gemini-2.5-flash";

export const OR_ENABLED = true; // always enabled — key fetched from Firestore

// ── Gemini streaming call ─────────────────────────────────────────────────────

/**
 * Stream a Gemini response via SSE.
 * onToken(chunk, fullText) is called for each delta.
 * Returns the full text when complete.
 */
async function streamGemini(parts, { onToken, maxTokens = 4096, temperature = 0.5, json = true } = {}) {
  const key = await getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${key}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 },
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${err}`);
  }

  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const raw = decoder.decode(value, { stream: true });
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta  = parsed.candidates?.[0]?.content?.parts
          ?.map(p => p.text ?? "").join("") ?? "";
        if (delta) {
          full += delta;
          onToken?.(delta, full);
        }
      } catch {
        // malformed SSE chunk — skip
      }
    }
  }

  return full;
}

// ── File extraction helpers (no AI — client-side only) ────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map(item => item.str).join(" "));
  }
  return parts.join("\n").slice(0, 20000);
}

async function extractDocxText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result      = await mammoth.extractRawText({ arrayBuffer });
  return result.value.slice(0, 20000);
}

/**
 * Build Gemini `parts` array from a file.
 * Images → inlineData vision. PDF/DOCX → extracted text part.
 */
export async function prepareFileContent(file, onProgress) {
  const type = file.type;
  onProgress(10, "Reading file…");

  if (type.startsWith("image/")) {
    onProgress(35, "Encoding image for AI…");
    const b64 = await fileToBase64(file);
    onProgress(60, "Sending image to AI…");
    return [
      { inlineData: { mimeType: type, data: b64 } },
      { text: "Extract the lesson/educational content from this image." },
    ];
  }

  if (type === "application/pdf") {
    onProgress(25, "Reading PDF pages…");
    const text = await extractPdfText(file);
    onProgress(60, "Sending PDF content to AI…");
    return [{ text: `Document content:\n\n${text}` }];
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/msword" ||
    file.name.endsWith(".docx") ||
    file.name.endsWith(".doc")
  ) {
    onProgress(25, "Reading Word document…");
    const text = await extractDocxText(file);
    onProgress(60, "Sending document content to AI…");
    return [{ text: `Document content:\n\n${text}` }];
  }

  throw new Error(`Unsupported file type: "${type}". Use PDF, Word (.docx), PNG, or JPG.`);
}

// ── Part 1 — Extract lesson context from a file ───────────────────────────────

const CONTEXT_SHAPE = `{
  "subject": "",
  "topic": "",
  "gradeLevel": "",
  "objectives": [],
  "keyTerms": [],
  "competencies": [],
  "summary": ""
}`;

export async function extractContextFromFile(file, onProgress) {
  const content = await prepareFileContent(file, onProgress);

  const systemText = `You are an expert curriculum analyst. Extract educational lesson information from the provided content and return ONLY valid JSON matching this shape (no markdown fences, no extra keys):
${CONTEXT_SHAPE}

Rules:
- objectives: array of specific learning objectives (3–6 items)
- keyTerms: array of key vocabulary words or phrases
- competencies: array of measurable skills or competencies
- summary: 1–2 sentence summary of the lesson content
- If something is unclear, make a reasonable inference from the content`;

  onProgress(65, "AI is analyzing the document…");

  let tokenCount = 0;
  const text = await streamGemini(
    [{ text: systemText }, ...content],
    {
      temperature: 0.2,
      maxTokens:   3000,
      onToken: (_chunk, full) => {
        tokenCount = full.length;
        const raw = Math.min(92, 65 + (tokenCount / 900) * 27);
        onProgress(Math.round(raw), "Extracting lesson content…");
      },
    }
  );

  onProgress(100, "Complete!");
  return parseAIJson(text);
}

// ── Part 2 — Generate 5-day 4As lesson plan ───────────────────────────────────

function buildPlanShape(dayLabels, weekLabel) {
  return `{
  "overview": {
    "subject": "", "topic": "", "grade": "", "weekLabel": "${weekLabel}",
    "objectives": [], "materials": []
  },
  "days": [
    {
      "day": 1, "dateLabel": "${dayLabels[0]}", "phase": "Activity",
      "duration": "", "description": "", "steps": [], "teacherTip": ""
    },
    {
      "day": 2, "dateLabel": "${dayLabels[1]}", "phase": "Analysis",
      "duration": "", "description": "", "guidingQuestions": [], "discussion": ""
    },
    {
      "day": 3, "dateLabel": "${dayLabels[2]}", "phase": "Abstraction",
      "duration": "", "description": "", "keyPoints": [],
      "definitions": [{"term": "", "definition": ""}]
    },
    {
      "day": 4, "dateLabel": "${dayLabels[3]}", "phase": "Application",
      "duration": "", "description": "", "tasks": [], "assessment": ""
    },
    {
      "day": 5, "dateLabel": "${dayLabels[4]}", "phase": "Review",
      "duration": "", "description": "", "reviewActivities": [], "homework": ""
    }
  ]
}`;
}

const PHASE_THRESHOLDS = [
  { pct: 15, label: "Writing Day 1 — Activity…"     },
  { pct: 35, label: "Writing Day 2 — Analysis…"     },
  { pct: 55, label: "Writing Day 3 — Abstraction…"  },
  { pct: 73, label: "Writing Day 4 — Application…"  },
  { pct: 87, label: "Writing Day 5 — Review…"       },
];

export async function generate4AsLesson(context, weekDates, onProgress) {
  onProgress(5, "Preparing 5-day lesson structure…");

  const weekLabel = weekDates?.label || "Week ___";
  const dayLabels = weekDates?.start
    ? Array.from({ length: 5 }, (_, i) => {
        const d = new Date(weekDates.start);
        d.setDate(d.getDate() + i);
        return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      })
    : ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"];

  const PLAN_SHAPE = buildPlanShape(dayLabels, weekLabel);
  const cap = (arr, n, len = 100) =>
    (arr || []).slice(0, n).map(s => String(s).slice(0, len)).join("; ");

  const prompt = `You are an expert Filipino curriculum designer. Create a detailed 5-day weekly lesson plan using the 4As model across the week. Return ONLY valid JSON — no markdown fences.

Subject: ${context.subject} | Topic: ${String(context.topic || "").slice(0, 120)} | Grade: ${context.gradeLevel}
Objectives: ${cap(context.objectives, 3)}
Key Terms: ${cap(context.keyTerms, 5, 40)}
Competencies: ${cap(context.competencies, 3)}
Week: ${weekLabel}
Days: ${dayLabels.join(", ")}
4As model: Day1=Activity, Day2=Analysis, Day3=Abstraction, Day4=Application, Day5=Review (45–60 min each).

Return ONLY valid JSON: ${PLAN_SHAPE}`;

  let tokenCount = 0;
  const ESTIMATED_CHARS = 4000;

  const text = await streamGemini(
    [{ text: prompt }],
    {
      temperature: 0.6,
      maxTokens:   3000,
      onToken: (_chunk, full) => {
        tokenCount = full.length;
        const raw   = Math.min(95, (tokenCount / ESTIMATED_CHARS) * 95);
        const stage = PHASE_THRESHOLDS.findLast(s => raw >= s.pct) ?? { label: "Building lesson plan…" };
        onProgress(Math.round(raw), stage.label);
      },
    }
  );

  onProgress(100, "5-day lesson plan complete!");
  return parseAIJson(text);
}
