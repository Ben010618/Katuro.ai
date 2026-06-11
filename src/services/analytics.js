const BANDS = [
  { label: "0–49%",   min: 0,  max: 50,  color: "#ef4444" },
  { label: "50–59%",  min: 50, max: 60,  color: "#f97316" },
  { label: "60–69%",  min: 60, max: 70,  color: "#eab308" },
  { label: "70–79%",  min: 70, max: 80,  color: "#84cc16" },
  { label: "80–89%",  min: 80, max: 90,  color: "#22c55e" },
  { label: "90–100%", min: 90, max: 101, color: "#15803d" },
];

export function computeAnalytics(scores) {
  if (!scores.length) return null;

  const pcts = scores.map((s) => s.percentage ?? 0);
  const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const top = Math.max(...pcts);
  const low = Math.min(...pcts);
  const needsHelp = scores.filter((s) => s.percentage < 50).length;
  const passed = scores.filter((s) => s.percentage >= 50).length;
  const passRate = (passed / scores.length) * 100;

  const distribution = BANDS.map((band) => ({
    ...band,
    count: scores.filter((s) => s.percentage >= band.min && s.percentage < band.max).length,
  }));

  const sorted = [...scores].sort((a, b) => b.percentage - a.percentage);

  return { avg, top, low, needsHelp, passRate, distribution, total: scores.length, sorted };
}

export { BANDS };
