import { useEffect } from 'react';
import ktLogo from './assets/KT Favicon.png';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useAuth } from './hooks/useAuth';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { ensureTeacherProfile } from './services/db';
import { auth } from './firebase';
import AppShell from './components/AppShell';
import { Clock, LogOut as LogOutIcon } from 'lucide-react';

// Pages
import LoginPage        from './pages/LoginPage';
import DashboardPage    from './pages/DashboardPage';
import MyLessonsPage    from './pages/MyLessonsPage';
import QuizBuilderPage         from './pages/QuizBuilderPage';
import ScanAnswerSheetsPage    from './pages/ScanAnswerSheetsPage';
import AdminDashboard          from './pages/AdminDashboard';
import ActionResearchPhase1    from './pages/ActionResearchPhase1';
import ActionResearchPhase2    from './pages/ActionResearchPhase2';
import ActionResearchPhase3    from './pages/ActionResearchPhase3';
import ActionResearchPhase4    from './pages/ActionResearchPhase4';
import ActionResearchPhase5    from './pages/ActionResearchPhase5';
import ActionResearchPhase6    from './pages/ActionResearchPhase6';

// Lesson Gen
import LessonGenGateway from './pages/lessonGen/LessonGenGateway';
import LessonGenLayout  from './pages/lessonGen/LessonGenLayout';
import Step1            from './pages/lessonGen/Step1';
import Step2            from './pages/lessonGen/Step2';
import Step3            from './pages/lessonGen/Step3';
import OutputPage       from './pages/lessonGen/OutputPage';

// DLL Gen
import DLLStep1      from './pages/dllGen/DLLStep1';
import DLLStep2      from './pages/dllGen/DLLStep2';
import DLLOutputPage from './pages/dllGen/DLLOutputPage';

// COT Gen
import CotLayout     from './pages/cotGen/CotLayout';
import CotStep1      from './pages/cotGen/CotStep1';
import CotStep2      from './pages/cotGen/CotStep2';
import CotStep3      from './pages/cotGen/CotStep3';
import CotOutputPage from './pages/cotGen/CotOutputPage';

// Test Builder
import TestBuilderWizard from './pages/testBuilder/TestBuilderWizard';

// Classroom Management Module
import ClassroomManagementPage from './pages/classroomMgmt/ClassroomManagementPage';
import SectionDetailPage       from './pages/classroomMgmt/SectionDetailPage';
import ClassesITeachPage       from './pages/classroomMgmt/ClassesITeachPage';
import GradingTablePage        from './pages/classroomMgmt/GradingTablePage';
import InvitePage              from './pages/classroomMgmt/InvitePage';
import SharedPlanPage          from './pages/SharedPlanPage';
import SharesModule            from './modules/shares/index';

function LoadingScreen() {
  return (
    <div style={{ display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center', background:'#f5faf7' }}>
      <style>{`
        @keyframes kt-spin { to { transform: rotate(360deg); } }
        @keyframes kt-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
      <div style={{ textAlign:'center' }}>
        <div style={{ position:'relative', width:56, height:56, margin:'0 auto 18px' }}>
          {/* Spinning ring */}
          <div style={{
            position:'absolute', inset:0, borderRadius:'50%',
            border:'3px solid rgba(45,106,79,0.12)',
            borderTopColor:'#2d6a4f',
            animation:'kt-spin 0.8s linear infinite',
          }} />
          <img
            src={ktLogo}
            alt="kaTuro AI"
            style={{ width:40, height:40, borderRadius:10, objectFit:'cover', position:'absolute', top:8, left:8 }}
          />
        </div>
        <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#4a6357', animation:'kt-pulse 1.6s ease-in-out infinite' }}>
          Loading workspace…
        </p>
      </div>
    </div>
  );
}

function PendingApprovalScreen() {
  return (
    <div style={{ display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center', background:'#f5faf7', padding: 24 }}>
      <div style={{ textAlign:'center', maxWidth: 420 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: '#fef3c7', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
          <Clock size={30} color="#d97706" />
        </div>
        <img src={ktLogo} alt="kaTuro AI" style={{ width:36, height:36, borderRadius:9, margin:'0 auto 12px', display:'block', objectFit:'cover' }} />
        <h2 style={{ margin:'0 0 10px', fontSize:22, fontWeight:700, color:'#0d2218', fontFamily:'"Playfair Display", serif' }}>
          Account Pending Approval
        </h2>
        <p style={{ margin:'0 0 24px', fontSize:14, color:'#4a6357', lineHeight:1.6 }}>
          Your account has been created and is waiting for administrator approval.
          You will be able to access kaTuro once your account is enabled.
          Please contact your school administrator or wait for an email confirmation.
        </p>
        <button
          onClick={() => signOut(auth)}
          style={{
            display:'inline-flex', alignItems:'center', gap:7,
            background:'#fff', border:'1px solid rgba(45,106,79,0.2)',
            borderRadius:9, padding:'10px 20px', fontSize:13, fontWeight:600,
            color:'#4a6357', cursor:'pointer',
          }}
        >
          <LogOutIcon size={14} /> Sign Out
        </button>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading, disabled, pendingApproval } = useAuth();

  useEffect(() => {
    if (user) {
      ensureTeacherProfile(user.uid, user.email).catch(console.error);
    }
  }, [user]);

  useEffect(() => {
    // Only auto-sign-out users manually disabled by admin, not pending-approval users
    if (disabled && !pendingApproval && user) {
      signOut(auth);
    }
  }, [disabled, pendingApproval, user]);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (pendingApproval) return <PendingApprovalScreen />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

          {/* Admin — standalone, no AppShell */}
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

          {/* Protected shell */}
          <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            <Route path="dashboard"      element={<DashboardPage />} />
            <Route path="my-lessons"     element={<MyLessonsPage />} />
            <Route path="quiz-builder"   element={<QuizBuilderPage />} />
            <Route path="quiz-builder/:quizId/scan" element={<ScanAnswerSheetsPage />} />
            <Route path="action-research">
              <Route path="phase-1"              element={<ActionResearchPhase1 />} />
              <Route path="phase-1/:docId"       element={<ActionResearchPhase1 />} />
              <Route path="phase-2/:docId"       element={<ActionResearchPhase2 />} />
              <Route path="phase-3/:docId"       element={<ActionResearchPhase3 />} />
              <Route path="phase-4/:docId"       element={<ActionResearchPhase4 />} />
              <Route path="phase-5/:docId"       element={<ActionResearchPhase5 />} />
              <Route path="phase-6/:docId"       element={<ActionResearchPhase6 />} />
            </Route>

            {/* Lesson Gen — nested routes */}
            <Route path="lesson-gen">
              <Route index element={<LessonGenGateway />} />
              <Route element={<LessonGenLayout />}>
                <Route path="step-1" element={<Step1 />} />
                <Route path="step-2" element={<Step2 />} />
                <Route path="step-3" element={<Step3 />} />
              </Route>
              <Route path="output/:id" element={<OutputPage />} />
            </Route>

            {/* DLL Gen */}
            <Route path="dll-gen">
              <Route path="step-1" element={<DLLStep1 />} />
              <Route path="step-2" element={<DLLStep2 />} />
              <Route path="output" element={<DLLOutputPage />} />
            </Route>

            {/* COT Gen — PPST-aligned Lesson Plan */}
            <Route path="cot-gen">
              <Route element={<CotLayout />}>
                <Route path="step-1" element={<CotStep1 />} />
                <Route path="step-2" element={<CotStep2 />} />
                <Route path="step-3" element={<CotStep3 />} />
              </Route>
              <Route path="output" element={<CotOutputPage />} />
            </Route>

            {/* Test Builder — DepEd-compliant Table of Specifications wizard */}
            <Route path="test-builder" element={<TestBuilderWizard />} />

            {/* Classroom Management Module */}
            <Route path="classroom-management" element={<ClassroomManagementPage />} />
            <Route path="classroom-management/section/:sectionId" element={<SectionDetailPage />} />
            <Route path="classes-i-teach" element={<ClassesITeachPage />} />
            <Route path="classes-i-teach/grade/:sectionId/:subject" element={<GradingTablePage />} />
          </Route>

          {/* Public invite route — handles logged-in and not-logged-in */}
          <Route path="/invite/:inviteCode" element={<InvitePage />} />

          {/* Public shared plan preview — no auth required */}
          <Route path="/shared/:shareId" element={<SharedPlanPage />} />

          {/* kaTuro Shares — standalone social feed module */}
          <Route path="/shares/*" element={<ProtectedRoute><SharesModule /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
    </ThemeProvider>
  );
}
