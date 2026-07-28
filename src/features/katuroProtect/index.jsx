import { useState, useEffect } from 'react';
import { ShieldCheck, ClipboardList, MessageSquare, Settings as SettingsIcon, FolderOpen } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { trackEvent } from '../../services/usageTracker';
import DisclaimerBanner from './components/DisclaimerBanner';
import ProtectChatLanding from './components/ProtectChatLanding';
import IntakeWizard from './components/IntakeWizard';
import FiledCases from './components/FiledCases';
import ReferralDirectory from './components/ReferralDirectory';

// Chat, Intake, and Filed Cases are open to every teacher — a class adviser
// files an initial report here, ahead of formal processing by the LFO/CPC.
// Filed Cases is scope-aware inside itself: admins see every school case
// (what the old separate "Cases" tab showed — same list, same detail view,
// so keeping both was pure duplication), everyone else sees only what they
// personally filed. Settings (referral directory management) stays
// admin-only. Firestore rules enforce the same case-data split server-side;
// this just matches the UI to it.
const TABS = [
  { id: 'chat',     label: 'Chat',        Icon: MessageSquare },
  { id: 'intake',   label: 'Intake',      Icon: ClipboardList },
  { id: 'filed',    label: 'Filed Cases', Icon: FolderOpen },
  { id: 'settings', label: 'Settings',    Icon: SettingsIcon, adminOnly: true },
];

export default function KaturoProtectPage() {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('chat'); // chat-ready landing per product decision
  const [openCaseId, setOpenCaseId] = useState(null);
  // Lifted out of ProtectChatLanding so IntakeWizard can draft a narrative
  // suggestion from the prior conversation when the user moves from Chat to Intake.
  const [chatMessages, setChatMessages] = useState([]);

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  // Adoption analytics — same '*_step_viewed' convention as every other
  // multi-tab tool (lessongen_step_viewed, dllgen_step_viewed, etc.), so the
  // admin dashboard can answer "how many teachers actually use kaTuro
  // Protect" and "how far do they get" (chat → intake → filed) the same way
  // it already does for every other feature.
  useEffect(() => {
    if (user?.uid) trackEvent(user.uid, 'protect_step_viewed', { step: activeTab });
  }, [user?.uid, activeTab]);

  function handleCaseCreated(caseId) {
    // Everyone (admin or not) can revisit what they just filed via Filed
    // Cases — admins additionally have the full Case Board on its own tab.
    setOpenCaseId(caseId);
    setActiveTab('filed');
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <ShieldCheck size={20} color="#2d6a4f" />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--kt-text-primary)' }}>kaTuro Protect</h1>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--kt-text-secondary)' }}>
        Decision-support and case documentation, from a class adviser's first report to formal review and resolution
        by the Learner Formation Officer, the Child Protection Committee, guidance designates, and school heads.
        Class advisers can chat through what happened and file an initial report here — the CPC takes it from there.
      </p>

      <DisclaimerBanner />

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: 'var(--kt-card)', borderRadius: 12, padding: 4, border: '1px solid var(--kt-border)', width: 'fit-content', flexWrap: 'wrap' }}>
        {visibleTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
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
        <IntakeWizard
          chatHistory={chatMessages.filter((m) => !m.pending).map((m) => ({ role: m.role, text: m.text }))}
          onCreated={handleCaseCreated}
        />
      )}

      {activeTab === 'filed'    && <FiledCases initialCaseId={openCaseId} onCaseOpened={setOpenCaseId} />}
      {activeTab === 'settings' && isAdmin && <ReferralDirectory />}

      <p style={{ margin: '24px 0 0', fontSize: 10, color: 'var(--kt-text-secondary)', textAlign: 'center' }}>
        Reference v1.0 · compiled July 2026 · Chat grounded in Layer 1 only — verify sanctions/deadlines against official sources
      </p>
    </div>
  );
}
