import { ShieldAlert } from 'lucide-react';

// Verbatim text from KaturoProtect/kaTuro_Protect_BrainBank.md — Part J4
// ("Product disclaimer — display persistently in UI"). Do not paraphrase.
export default function DisclaimerBanner() {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)',
      borderRadius: 10, padding: '10px 14px', marginBottom: 16,
    }}>
      <ShieldAlert size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--kt-text-primary)' }}>
        kaTuro Protect is a decision-support and documentation tool. It is not legal advice and does not
        replace the judgment of the Child Protection Committee, school officials, the Schools Division
        Office, or legal counsel. All disciplinary actions require due process.
      </p>
    </div>
  );
}
