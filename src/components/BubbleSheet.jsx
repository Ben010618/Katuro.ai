import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";

const CHOICE_LABELS = {
  4: ["A", "B", "C", "D"],
  5: ["A", "B", "C", "D", "E"],
};

function RegMark({ top, bottom, left, right }) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        bottom,
        left,
        right,
        width: 10,
        height: 10,
        background: "#000",
      }}
    />
  );
}

function Bubble({ label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, marginRight: 5 }}>
      <svg width={13} height={13} viewBox="0 0 13 13">
        <circle cx={6.5} cy={6.5} r={5.5} fill="none" stroke="#000" strokeWidth={1.3} />
      </svg>
      <span style={{ fontSize: 8, fontFamily: "Arial, sans-serif", lineHeight: 1 }}>{label}</span>
    </span>
  );
}

function QuestionRow({ num, choices }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: "7mm",
        borderBottom: "1px dotted #ccc",
        gap: 4,
      }}
    >
      <span
        style={{
          minWidth: 22,
          textAlign: "right",
          fontWeight: "bold",
          fontSize: 9,
          fontFamily: "Arial, sans-serif",
          color: "#000",
        }}
      >
        {num}.
      </span>
      {choices.map((c) => (
        <Bubble key={c} label={c} />
      ))}
    </div>
  );
}

/**
 * Printable A4 bubble sheet.
 *
 * Props:
 *   sheetId, sessionTitle, classLabel, numQuestions, numChoices
 *   learner   — { id, firstName, lastName, studentNumber } — enables per-learner mode
 *   teacherUid, quizId, classId — encoded into the learner QR code
 */
const BubbleSheet = forwardRef(function BubbleSheet(
  {
    sheetId,
    sessionTitle,
    classLabel,
    sectionCode,
    numQuestions,
    numChoices = 4,
    learner,
    teacherUid,
    quizId,
    classId,
    sessionId,
  },
  ref
) {
  const choices = CHOICE_LABELS[numChoices] ?? CHOICE_LABELS[4];
  const half = Math.ceil(numQuestions / 2);
  const col1 = Array.from({ length: half }, (_, i) => i + 1);
  const col2 = Array.from({ length: numQuestions - half }, (_, i) => half + i + 1);
  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // QR code payload — scanner app uses these to identify learner + look up answer key
  const qrData = learner && teacherUid
    ? JSON.stringify({ u: teacherUid, l: learner.id, q: quizId || "", c: classId || "", s: sessionId || "" })
    : null;

  return (
    <div
      ref={ref}
      id="bubble-sheet-root"
      style={{
        width: "210mm",
        minHeight: "297mm",
        background: "#fff",
        position: "relative",
        fontFamily: "Arial, sans-serif",
        boxSizing: "border-box",
        padding: "15mm 13mm 15mm 13mm",
        color: "#000",
      }}
    >
      {/* Corner registration marks */}
      <RegMark top={3} left={3} />
      <RegMark top={3} right={3} />
      <RegMark bottom={3} left={3} />
      <RegMark bottom={3} right={3} />

      {/* Header bar */}
      <div
        style={{
          background: "#163828",
          color: "#fff",
          padding: "5px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 11 }}>kaTuro AI — Answer Sheet</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 9 }}>{today}</span>
          {/* Per-learner QR code */}
          {qrData && (
            <div style={{ background: "#fff", padding: 3, borderRadius: 3 }}>
              <QRCodeSVG value={qrData} size={48} level="M" />
            </div>
          )}
        </div>
      </div>

      {/* Session + class row */}
      <div
        style={{
          display: "flex",
          gap: 24,
          fontSize: 9,
          borderBottom: "1px solid #999",
          paddingBottom: 5,
          marginBottom: 5,
        }}
      >
        <span>
          <strong>Session:</strong> {sessionTitle || "—"}
        </span>
        <span>
          <strong>Class:</strong> {classLabel || "—"}
          {sectionCode && (
            <span style={{ marginLeft: 8, background: "#163828", color: "#fff", padding: "1px 6px", borderRadius: 4, fontSize: 8, fontWeight: "bold", letterSpacing: 2 }}>
              #{sectionCode}
            </span>
          )}
        </span>
      </div>

      {/* Student info row — pre-filled if learner provided */}
      <div
        style={{
          display: "flex",
          gap: 20,
          fontSize: 9,
          borderBottom: "1px solid #999",
          paddingBottom: 6,
          marginBottom: 5,
        }}
      >
        <span style={{ flex: 1 }}>
          <strong>Name:</strong>{" "}
          {learner ? (
            <span style={{ fontWeight: "bold" }}>
              {learner.firstName} {learner.lastName}
            </span>
          ) : (
            <span
              style={{ display: "inline-block", width: 150, borderBottom: "1px solid #555" }}
            >
              &nbsp;
            </span>
          )}
        </span>
        <span>
          <strong>Learner No:</strong>{" "}
          {learner?.studentNumber ? (
            <span style={{ fontWeight: "bold" }}>{learner.studentNumber}</span>
          ) : (
            <span
              style={{ display: "inline-block", width: 80, borderBottom: "1px solid #555" }}
            >
              &nbsp;
            </span>
          )}
        </span>
      </div>

      {/* Sheet ID */}
      <div style={{ fontSize: 7, color: "#888", marginBottom: 10 }}>
        Sheet ID: {sheetId} &nbsp;|&nbsp; Questions: {numQuestions} &nbsp;|&nbsp; Choices:{" "}
        {choices.join(" / ")}
        {quizId ? ` | Quiz: ${quizId.slice(0, 8)}` : ""}
      </div>

      {/* Answer grid — 2 columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14mm" }}>
        <div>
          {col1.map((n) => (
            <QuestionRow key={n} num={n} choices={choices} />
          ))}
        </div>
        <div>
          {col2.map((n) => (
            <QuestionRow key={n} num={n} choices={choices} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 13,
          right: 13,
          borderTop: "1px solid #ccc",
          paddingTop: 4,
          fontSize: 7,
          color: "#777",
          textAlign: "center",
        }}
      >
        Use a dark pencil or ballpoint pen. Fill each bubble completely. Do not make stray marks.
        Erase cleanly if correcting.
      </div>
    </div>
  );
});

export default BubbleSheet;
