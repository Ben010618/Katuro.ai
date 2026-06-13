import { useEffect } from 'react';
import ktLogo from './assets/KT Favicon.png';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useAuth } from './hooks/useAuth';
import { ToastProvider } from './context/ToastContext';
import { ensureTeacherProfile } from './services/db';
import { auth } from './firebase';
import AppShell from './components/AppShell';

// Pages
import LoginPage        from './pages/LoginPage';
import DashboardPage    from './pages/DashboardPage';
import MyLessonsPage    from './pages/MyLessonsPage';
import QuizBuilderPage         from './pages/QuizBuilderPage';
import PresentationBuilderPage from './pages/PresentationBuilderPage';
import GamificationPage        from './pages/GamificationPage';
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

function LoadingScreen() {
  return (
    <div style={{ display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center', background:'#f5faf7' }}>
      <div style={{ textAlign:'center' }}>
        <img
          src={ktLogo}
          alt="kaTuro AI"
          style={{ width:42, height:42, borderRadius:11, margin:'0 auto 14px', display:'block', objectFit:'cover' }}
        />
        <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#4a6357' }}>Loading workspace…</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading, disabled } = useAuth();

  useEffect(() => {
    if (user) {
      ensureTeacherProfile(user.uid, user.email).catch(console.error);
    }
  }, [user]);

  useEffect(() => {
    if (disabled && user) {
      signOut(auth);
    }
  }, [disabled, user]);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
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
            <Route path="presentations"  element={<PresentationBuilderPage />} />
            <Route path="gamification"       element={<GamificationPage />} />
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
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
