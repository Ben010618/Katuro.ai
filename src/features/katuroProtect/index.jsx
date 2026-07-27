import { useState } from 'react';
import { ShieldCheck, ClipboardList, MessageSquare, LayoutList, Settings as SettingsIcon, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import DisclaimerBanner from './components/DisclaimerBanner';
import ProtectChatLanding from './components/ProtectChatLanding';
import IntakeWizard from './components/IntakeWizard';
import CaseBoard from './components/CaseBoard';
import ReferralDirectory from './components/ReferralDirectory';

// Chat and Intake are open to every teacher — reporting something shouldn't
// require admin access. Cases and Settings stay admin-only: a teacher can
// file a report but shouldn't be able to browse every other case in the
// school (Firestore rules enforce this too, this is just matching UI to it).
const TABS = [
  { id: 'chat',     label: 'Chat',     Icon: MessageSquare },
  { id: 'intake',   label: 'Intake',   Icon: ClipboardList },
  { id: 'cases',    label: 'Cases',    Icon: LayoutList,     adminOnly: true },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon,   adminOnly: true },
];

export default function KaturoProtectPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('chat'); // chat-ready landing per product decision
  const [openCaseId, setOpenCaseId] = useState(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  // Lifted out of ProtectChatLanding so IntakeWizard can draft a narrative
  // suggestion from the prior conversation when the user moves from Chat to Intake.
  const [chatMessages, setChatMessages] = useState([]);

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  function handleCaseCreated(caseId) {
    if (isAdmin) {
      setOpenCaseId(caseId);
      setActiveTab('cases');
    } else {
      // Non-admins can't read the Case Board (Firestore rules only allow
      // admins to read protect_cases) — show a confirmation instead of
      // switching to a tab they'd have nothing to see on.
      setJustSubmitted(true);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <ShieldCheck size={20} color="#2d6a4f" />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--kt-text-primary)' }}>kaTuro Protect</h1>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--kt-text-secondary)' }}>
        Decision-support and case documentation for Child Protection Committees, guidance designates, and school heads.
      </p>

      <DisclaimerBanner />

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: 'var(--kt-card)', borderRadius: 12, padding: 4, border: '1px solid var(--kt-border)', width: 'fit-content' }}>
        {visibleTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setJustSubmitted(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: activeTab === id ? 700 : 500, fontFamily: 'inherit',
              background: activeTab === id ? '#2d6a4f' : 'transparent',
              color: activeTab === id ? '#fff' : 'var(--kt-text-secondary)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'chat' && (
        <ProtectChatLanding
          messages={chatMessages}
          setMessages={setChatMessages}
          onStartIntake={() => setActiveTab('intake')}
        />
      )}

      {activeTab === 'intake' && (
        justSubmitted ? (
          <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', padding: '48px 24px', textAlign: 'center' }}>
            <CheckCircle2 size={28} color="#2d6a4f" style={{ marginBottom: 8 }} />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Report submitted</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)' }}>
              Your school's Child Protection Committee has been notified and will follow up.
            </p>
          </div>
        ) : (
          <IntakeWizard
            chatHistory={chatMessages.filter((m) => !m.pending).map((m) => ({ role: m.role, text: m.text }))}
            onCreated={handleCaseCreated}
          />
        )
      )}

      {activeTab === 'cases' && isAdmin && <CaseBoard initialCaseId={openCaseId} onCaseOpened={setOpenCaseId} />}
      {activeTab === 'settings' && isAdmin && <ReferralDirectory />}

      <p style={{ margin: '24px 0 0', fontSize: 10, color: 'var(--kt-text-secondary)', textAlign: 'center' }}>
        Reference v1.0 · compiled July 2026 · Chat grounded in Layer 1 only — verify sanctions/deadlines against official sources
      </p>
    </div>
  );
}
