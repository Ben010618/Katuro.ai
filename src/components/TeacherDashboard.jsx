import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  LayoutDashboard,
  Sparkles,
  ClipboardList,
  BarChart3,
  Download,
  Users,
  CreditCard,
  LogOut,
} from "lucide-react";
import DashboardPage from "./pages/DashboardPage";
import LessonGenPage from "./pages/LessonGenPage";
import QuizBuilderPage from "./pages/QuizBuilderPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ExportPage from "./pages/ExportPage";
import ClassroomPage from "./pages/ClassroomPage";

// Workflow-ordered navigation
const NAV = [
  ["Dashboard",     LayoutDashboard, "Overview & sessions"],
  ["Classroom",     Users,           "Classes & learners"],
  ["Lesson Gen",    Sparkles,        "Upload, analyze & lesson plan"],
  ["Quiz Builder",  ClipboardList,   "Create quiz & answer key"],
  ["Analytics",     BarChart3,       "Scores & item analysis"],
  ["Export",        Download,        "Download reports"],
  ["Subscription",  CreditCard,      "Plan & billing"],
];

function PlaceholderPage({ name }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-[28px] border border-[#DCEBDC] bg-white">
      <p className="text-lg font-bold text-[#5A7566]">{name} — coming soon</p>
    </div>
  );
}

function TeacherDashboard({ user }) {
  const [currentPage, setCurrentPage] = useState("Dashboard");
  const [selectedClass, setSelectedClass] = useState(null);

  function handleNavClick(label) {
    setCurrentPage(label);
    setSelectedClass(null);
  }

  async function handleLogout() {
    await signOut(auth);
  }

  function renderPage() {
    switch (currentPage) {
      case "Dashboard":     return <DashboardPage user={user} onNavigate={setCurrentPage} />;
      case "Lesson Gen":    return <LessonGenPage user={user} />;
      case "Quiz Builder":  return <QuizBuilderPage user={user} onNavigate={setCurrentPage} />;
      case "Analytics":     return <AnalyticsPage user={user} />;
      case "Export":        return <ExportPage user={user} />;
      case "Classroom":
        return (
          <ClassroomPage
            user={user}
            onOpenClass={setSelectedClass}
            selectedClass={selectedClass}
          />
        );
      default: return <PlaceholderPage name={currentPage} />;
    }
  }

  // Workflow step number (1-based) for active items
  const workflowSteps = ["Classroom", "Lesson Gen", "Quiz Builder", "Analytics", "Export"];
  const stepIndex = workflowSteps.indexOf(currentPage);

  return (
    <div className="flex min-h-screen bg-[#F4FAF5]">

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="flex w-[260px] shrink-0 flex-col bg-[#0D2518] p-5 text-white">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#4CAF50] font-black text-white">
            kT
          </div>
          <div>
            <h1 className="text-xl font-black">kaTuro AI</h1>
            <p className="text-xs text-white/50">Teacher Co-pilot</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="mt-8 flex-1 space-y-1">
          {NAV.map(([label, Icon, hint]) => {
            const active = currentPage === label;
            const isWorkflow = workflowSteps.includes(label);
            const stepNum = workflowSteps.indexOf(label) + 1;
            return (
              <button
                key={label}
                onClick={() => handleNavClick(label)}
                className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "bg-white text-[#163828]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="relative">
                  <Icon size={17} />
                  {isWorkflow && (
                    <span
                      className={`absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-black ${
                        active ? "bg-[#163828] text-white" : "bg-white/20 text-white"
                      }`}
                    >
                      {stepNum}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold leading-tight">{label}</p>
                  <p className={`text-[10px] leading-tight truncate ${active ? "text-[#5A7566]" : "text-white/40"}`}>
                    {hint}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20"
        >
          <LogOut size={16} />
          Logout
        </button>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-8">
        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#5A7566]">
              {stepIndex >= 0 ? `Step ${stepIndex + 1} of ${workflowSteps.length}` : "kaTuro Workspace"}
            </p>
            <h2 className="mt-0.5 text-2xl font-black text-[#163828]">{currentPage}</h2>
            <p className="mt-0.5 text-sm text-[#5A7566]">{user.email}</p>
          </div>
          <div className="rounded-full bg-[#D4EDDA] px-4 py-2 text-sm font-bold text-[#163828]">
            Free Plan
          </div>
        </div>

        {renderPage()}
      </main>
    </div>
  );
}

export default TeacherDashboard;
