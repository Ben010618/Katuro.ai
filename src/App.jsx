import { useEffect, lazy, Suspense } from 'react';
import ktLogo from './assets/KT-Favicon.webp';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useAuth } from './hooks/useAuth';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { ensureTeacherProfile } from './services/db';
import { auth } from './firebase';
import AppShell from './components/AppShell';
import { Clock, LogOut as LogOutIcon } from 'lucide-react';

// Pages — LoginPage stays eager (near-universal first paint); everything
// behind auth is lazy so a teacher only downloads the module(s) they visit.
import LoginPage from './pages/LoginPage';
const DashboardPage    = lazy(() => import('./pages/DashboardPage'));
const MyLessonsPage    = lazy(() => import('./pages/MyLessonsPage'));
const QuizBuilderPage         = lazy(() => import('./pages/QuizBuilderPage'));
const ScanAnswerSheetsPage    = lazy(() => import('./pages/ScanAnswerSheetsPage'));
const AssessmentGateway       = lazy(() => import('./pages/assessment/AssessmentGateway'));
const AdminDashboard          = lazy(() => import('./pages/AdminDashboard'));
const ActionResearchPhase1    = lazy(() => import('./pages/ActionResearchPhase1'));
const ActionResearchPhase2    = lazy(() => import('./pages/ActionResearchPhase2'));
const ActionResearchPhase3    = lazy(() => import('./pages/ActionResearchPhase3'));
const ActionResearchPhase4    = lazy(() => import('./pages/ActionResearchPhase4'));
const ActionResearchPhase5    = lazy(() => import('./pages/ActionResearchPhase5'));
const ActionResearchPhase6    = lazy(() => import('./pages/ActionResearchPhase6'));

// Lesson Gen
const LessonGenGateway = lazy(() => import('./pages/lessonGen/LessonGenGateway'));
const LessonGenLayout  = lazy(() => import('./pages/lessonGen/LessonGenLayout'));
const Step1            = lazy(() => import('./pages/lessonGen/Step1'));
const Step2            = lazy(() => import('./pages/lessonGen/Step2'));
const Step3            = lazy(() => import('./pages/lessonGen/Step3'));
const OutputPage       = lazy(() => import('./pages/lessonGen/OutputPage'));

// DLL Gen
const DLLStep1      = lazy(() => import('./pages/dllGen/DLLStep1'));
const DLLStep2      = lazy(() => import('./pages/dllGen/DLLStep2'));
const DLLOutputPage = lazy(() => import('./pages/dllGen/DLLOutputPage'));

// COT Gen
const CotLayout     = lazy(() => import('./pages/cotGen/CotLayout'));
const CotStep1      = lazy(() => import('./pages/cotGen/CotStep1'));
const CotStep2      = lazy(() => import('./pages/cotGen/CotStep2'));
const CotStep3      = lazy(() => import('./pages/cotGen/CotStep3'));
const CotOutputPage = lazy(() => import('./pages/cotGen/CotOutputPage'));

// Test Builder
const TestBuilderWizard = lazy(() => import('./pages/testBuilder/TestBuilderWizard'));

// Classroom Management Module
const ClassroomManagementPage = lazy(() => import('./pages/classroomMgmt/ClassroomManagementPage'));
const SectionDetailPage       = lazy(() => import('./pages/classroomMgmt/SectionDetailPage'));
const ClassesITeachPage       = lazy(() => import('./pages/classroomMgmt/ClassesITeachPage'));
const GradingTablePage        = lazy(() => import('./pages/classroomMgmt/GradingTablePage'));
const InvitePage              = lazy(() => import('./pages/classroomMgmt/InvitePage'));
const SharedPlanPage          = lazy(() => import('./pages/SharedPlanPage'));
const SharesLayout            = lazy(() => import('./modules/shares/index'));
const FeatureRequestBoard     = lazy(() => import('./features/feedback/FeatureRequestBoard'));
const KaturoProtectPage       = lazy(() => import('./features/katuroProtect'));

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
  if (user) return <Navigate to="/shares" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

          {/* Admin — standalone, no AppShell */}
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

          {/* Protected shell */}
          <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route index element={<Navigate to="/shares" replace />} />

            {/* kaTuro Shares — teacher community feed, the app's new landing page */}
            <Route path="shares/*" element={<SharesLayout />} />

            {/* kaTuro Protect — chat + intake open to all teachers; case data
                stays admin-only, enforced inside the page itself + Firestore rules */}
            <Route path="protect" element={<KaturoProtectPage />} />

            <Route path="dashboard"      element={<DashboardPage />} />
            <Route path="my-lessons"     element={<MyLessonsPage />} />

            {/* Assessment — gateway card page for Quiz Builder & Test Builder */}
            <Route path="assessment"     element={<AssessmentGateway />} />

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

            {/* Request Feature — public read-only board of admin-approved feature requests */}
            <Route path="feature-requests" element={<FeatureRequestBoard />} />
          </Route>

          {/* Public invite route — handles logged-in and not-logged-in */}
          <Route path="/invite/:inviteCode" element={<InvitePage />} />

          {/* Public shared plan preview — no auth required */}
          <Route path="/shared/:shareId" element={<SharedPlanPage />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
    </ThemeProvider>
  );
}
