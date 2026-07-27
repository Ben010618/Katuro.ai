import { useState } from 'react';
import { ShieldCheck, ClipboardList, MessageSquare, LayoutList, Settings as SettingsIcon } from 'lucide-react';
import DisclaimerBanner from './components/DisclaimerBanner';
import ProtectChatLanding from './components/ProtectChatLanding';
import IntakeWizard from './components/IntakeWizard';
import CaseBoard from './components/CaseBoard';
import ReferralDirectory from './components/ReferralDirectory';

const TABS = [
  { id: 'chat',     label: 'Chat',     Icon: MessageSquare },
  { id: 'intake',   label: 'Intake',   Icon: ClipboardList },
  { id: 'cases',    label: 'Cases',    Icon: LayoutList },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export default function KaturoProtectPage() {
  const [activeTab, setActiveTab] = useState('chat'); // chat-ready landing per product decision
  const [openCaseId, setOpenCaseId] = useState(null);

  function handleCaseCreated(caseId) {
    setOpenCaseId(caseId);
    setActiveTab('cases');
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
        {TABS.map(({ id, label, Icon }) => (
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

      {activeTab === 'chat'     && <ProtectChatLanding onStartIntake={() => setActiveTab('intake')} />}
      {activeTab === 'intake'   && <IntakeWizard onCreated={handleCaseCreated} />}
      {activeTab === 'cases'    && <CaseBoard initialCaseId={openCaseId} onCaseOpened={setOpenCaseId} />}
      {activeTab === 'settings' && <ReferralDirectory />}

      <p style={{ margin: '24px 0 0', fontSize: 10, color: 'var(--kt-text-secondary)', textAlign: 'center' }}>
        BrainBank v1.0 · compiled July 2026 · Chat grounded in Layer 1 only — verify sanctions/deadlines against official sources
      </p>
    </div>
  );
}
