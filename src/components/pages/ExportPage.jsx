import { useState } from "react";
import * as XLSX from "xlsx";
import { Download, Printer, FileSpreadsheet, FileText, Users, BarChart2 } from "lucide-react";
import { useSessions } from "../../hooks/useSessions";
import { useClasses } from "../../hooks/useClasses";
import { useSessionScores } from "../../hooks/useScores";
import { useQuiz } from "../../hooks/useQuiz";

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function downloadXLSX(sheetData, sheetName, fileName) {
  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

function ExportCard({ icon: Icon, title, description, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-4 rounded-[28px] border border-[#DCEBDC] bg-white p-5 text-left transition-all hover:border-[#4CAF50] hover:shadow-md hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
        style={{ background: "linear-gradient(135deg, #163828 0%, #2E7D32 100%)", boxShadow: "0 4px 12px rgba(22,56,40,0.3)" }}
      >
        <Icon size={20} className="text-white" />
      </div>
      <div className="flex-1">
        <p className="font-black text-[#163828]">{title}</p>
        <p className="mt-0.5 text-xs text-[#5A7566]">{description}</p>
      </div>
      <Download size={16} className="shrink-0 self-center text-[#5A7566]" />
    </button>
  );
}

export default function ExportPage({ user }) {
  const { sessions } = useSessions(user.uid);
  const { classes } = useClasses(user.uid);
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");

  const { scores, loading } = useSessionScores(user.uid, sessionId);
  const { quizzes } = useQuiz(user.uid, sessionId || undefined);

  const selectedSession = sessions.find((s) => s.id === sessionId);
  const selectedClass = classes.find((c) => c.id === classId);

  const classScores = classId ? scores.filter((s) => s.classId === classId) : scores;
  const linkedQuiz = quizzes.find((q) => q.status === "final") || quizzes[0] || null;

  const sessionLabel = selectedSession?.title || "session";
  const classLabel = selectedClass
    ? `Grade${selectedClass.grade}_${selectedClass.name}`
    : "all_classes";
  const fileBase = `${sessionLabel}_${classLabel}`.replace(/[^a-zA-Z0-9_-]/g, "_");

  function exportScoreSheet() {
    const data = classScores.map((s) => ({
      "Learner Name": s.learnerName,
      "Raw Score": s.rawScore,
      "Total Questions": s.numQuestions,
      "Percentage": s.percentage + "%",
      "Status": s.percentage >= 50 ? "Passed" : "Failed",
      "Date": formatDate(s.createdAt),
    }));
    downloadXLSX(data, "Scores", `score_sheet_${fileBase}.xlsx`);
  }

  function exportItemAnalysis() {
    if (!linkedQuiz?.answerKey) return;
    const key = linkedQuiz.answerKey;
    const questions = linkedQuiz.questions || [];
    const scoredWithAnswers = classScores.filter(
      (s) => Array.isArray(s.answers) && s.answers.length > 0
    );

    if (scoredWithAnswers.length === 0) {
      alert("No per-question answer data available. Item analysis requires scanner app data.");
      return;
    }

    const summaryData = key.map((correct, i) => {
      const total = scoredWithAnswers.length;
      const correctCount = scoredWithAnswers.filter(
        (s) => s.answers[i]?.toUpperCase() === correct?.toUpperCase()
      ).length;
      return {
        "Q#": i + 1,
        "Answer Key": correct,
        "Competency": questions[i]?.competency || "",
        "Correct": correctCount,
        "Total": total,
        "% Correct": total > 0 ? Math.round((correctCount / total) * 100) + "%" : "—",
      };
    });

    const matrixData = scoredWithAnswers.map((s) => {
      const row = { "Learner": s.learnerName };
      key.forEach((correct, i) => {
        const given = s.answers[i] || "";
        row[`Q${i + 1}`] = given === correct ? "✓" : given || "—";
      });
      row["Score"] = s.rawScore;
      row["%"] = s.percentage + "%";
      return row;
    });

    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    const ws2 = XLSX.utils.json_to_sheet(matrixData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Item Summary");
    XLSX.utils.book_append_sheet(wb, ws2, "Answer Matrix");
    XLSX.writeFile(wb, `item_analysis_${fileBase}.xlsx`);
  }

  function exportRemediation() {
    const below = classScores
      .filter((s) => s.percentage < 50)
      .sort((a, b) => a.percentage - b.percentage)
      .map((s) => ({
        "Learner Name": s.learnerName,
        "Raw Score": s.rawScore,
        "Total Questions": s.numQuestions,
        "Percentage": s.percentage + "%",
        "Gap to Passing": `${50 - s.percentage}%`,
        "Status": "NEEDS REMEDIATION",
      }));
    if (below.length === 0) {
      alert("No learners below 50% — no remediation list to export.");
      return;
    }
    downloadXLSX(below, "Remediation", `remediation_${fileBase}.xlsx`);
  }

  function exportLearnerReports() {
    const data = classScores.map((s) => ({
      "Learner Name": s.learnerName,
      "Session": selectedSession?.title || "",
      "Class": selectedClass ? `Grade ${selectedClass.grade} ${selectedClass.name}` : "",
      "Score": `${s.rawScore}/${s.numQuestions}`,
      "Percentage": s.percentage + "%",
      "Result": s.percentage >= 80 ? "Outstanding" : s.percentage >= 70 ? "Satisfactory" : s.percentage >= 50 ? "Adequate" : "Below Standard",
      "Date": formatDate(s.createdAt),
    }));
    downloadXLSX(data, "Learner Reports", `learner_reports_${fileBase}.xlsx`);
  }

  function printScoreSheet() {
    const style = document.createElement("style");
    style.id = "__kt_export_print__";
    style.innerHTML = `
      @media print {
        body > * { display: none !important; }
        #kt-export-print { display: block !important; font-family: Arial, sans-serif; padding: 15mm; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  }

  const hasScores = classScores.length > 0;

  return (
    <div className="space-y-8">

      {/* Session / Class selector */}
      <div className="card card-accent p-6">
        <h3 className="mb-4 text-lg font-black text-[#163828]">Export Reports</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#5A7566]">Session</label>
            <select
              value={sessionId}
              onChange={(e) => { setSessionId(e.target.value); setClassId(""); }}
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
          <div className="mt-4 rounded-2xl bg-[#F4FAF5] px-4 py-3">
            {loading ? (
              <p className="text-sm text-[#5A7566]">Loading scores…</p>
            ) : (
              <p className="text-sm font-bold text-[#163828]">
                {classScores.length} learner score{classScores.length !== 1 ? "s" : ""} found
                {selectedClass ? ` · ${selectedClass.name}` : " · all classes"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Export cards */}
      {sessionId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <ExportCard
            icon={FileSpreadsheet}
            title="Score Sheet"
            description="Learner names, scores, percentages, and pass/fail status — Excel"
            onClick={exportScoreSheet}
            disabled={!hasScores}
          />
          <ExportCard
            icon={FileText}
            title="Learner Reports"
            description="Individual performance summary per learner — Excel"
            onClick={exportLearnerReports}
            disabled={!hasScores}
          />
          <ExportCard
            icon={BarChart2}
            title="Item Analysis"
            description="Per-question pass rates + answer matrix — Excel (requires scanner app data)"
            onClick={exportItemAnalysis}
            disabled={!hasScores || !linkedQuiz}
          />
          <ExportCard
            icon={Users}
            title="Remediation List"
            description="Learners below 50% with gap-to-passing — Excel"
            onClick={exportRemediation}
            disabled={!hasScores}
          />
        </div>
      )}

      {/* Print score sheet */}
      {sessionId && hasScores && (
        <div className="card card-accent p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-[#163828]">Print Score Sheet</h3>
            <button onClick={printScoreSheet} className="btn-outline">
              <Printer size={15} /> Print
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-[#163828]">
                  <th className="pb-2 text-left font-black text-[#163828]">#</th>
                  <th className="pb-2 text-left font-black text-[#163828]">Learner Name</th>
                  <th className="pb-2 text-center font-black text-[#163828]">Score</th>
                  <th className="pb-2 text-center font-black text-[#163828]">%</th>
                  <th className="pb-2 text-center font-black text-[#163828]">Result</th>
                </tr>
              </thead>
              <tbody>
                {classScores
                  .sort((a, b) => b.percentage - a.percentage)
                  .map((s, i) => (
                    <tr key={s.id ?? i} className="border-b border-[#DCEBDC]">
                      <td className="py-2 text-[#5A7566]">{i + 1}</td>
                      <td className="py-2 font-bold text-[#163828]">{s.learnerName}</td>
                      <td className="py-2 text-center text-[#163828]">
                        {s.rawScore}/{s.numQuestions}
                      </td>
                      <td className={`py-2 text-center font-black ${s.percentage < 50 ? "text-red-500" : s.percentage < 70 ? "text-yellow-600" : "text-green-700"}`}>
                        {s.percentage}%
                      </td>
                      <td className="py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.percentage >= 50 ? "badge-final" : "badge-failed"}`}>
                          {s.percentage >= 50 ? "Pass" : "Fail"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hidden print area */}
      <div id="kt-export-print" style={{ display: "none" }}>
        <h2 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 4 }}>
          Score Sheet — {selectedSession?.title || ""}
        </h2>
        <p style={{ fontSize: 10, marginBottom: 12, color: "#555" }}>
          {selectedClass ? `Grade ${selectedClass.grade} ${selectedClass.name}` : "All Classes"}
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #163828" }}>
              {["#", "Learner Name", "Score", "%", "Result"].map((h) => (
                <th key={h} style={{ padding: "4px 8px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classScores
              .sort((a, b) => b.percentage - a.percentage)
              .map((s, i) => (
                <tr key={s.id ?? i} style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={{ padding: "4px 8px" }}>{i + 1}</td>
                  <td style={{ padding: "4px 8px", fontWeight: "bold" }}>{s.learnerName}</td>
                  <td style={{ padding: "4px 8px" }}>{s.rawScore}/{s.numQuestions}</td>
                  <td style={{ padding: "4px 8px" }}>{s.percentage}%</td>
                  <td style={{ padding: "4px 8px" }}>{s.percentage >= 50 ? "Pass" : "Fail"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!sessionId && (
        <div className="card flex flex-col items-center gap-3 py-16">
          <div
            className="grid h-16 w-16 place-items-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, #DCEBDC 0%, #F0F7F1 100%)" }}
          >
            <Download size={28} className="text-[#5A7566]" />
          </div>
          <p className="font-bold text-[#5A7566]">Select a session to export reports.</p>
        </div>
      )}
    </div>
  );
}
