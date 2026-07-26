import { useState, useEffect } from 'react';
import { Loader2, Save, CheckCircle2 } from 'lucide-react';
import { REFERRAL_OFFICES, REFERRAL_CATEGORY_LABELS } from '../constants/referralOffices';
import { subscribeReferralContacts, saveReferralContact } from '../services/referralService';

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px',
  border: '1.5px solid rgba(45,106,79,0.2)', borderRadius: 7, fontSize: 12,
  background: 'var(--kt-input-bg)', color: 'var(--kt-text-primary)', outline: 'none', fontFamily: 'inherit',
};
const btnSecondary = { background: 'var(--kt-surface)', color: '#1a3d2b', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 };

function OfficeRow({ office, saved }) {
  const [draft, setDraft] = useState({ contactName: '', contactNumber: '', contactEmail: '' });
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Adjust state during render (React's documented pattern for "seed local
  // state from a prop the first time it arrives") instead of an effect —
  // `saved` starts undefined until the Firestore subscription resolves, so a
  // lazy useState initializer alone can't catch it. Gated on a boolean, not
  // object identity: subscribeReferralContacts re-emits a new object for
  // every doc on every snapshot (even when saving a DIFFERENT office), so
  // comparing references would re-clobber in-progress typing on each fire.
  const [hasAppliedSaved, setHasAppliedSaved] = useState(false);
  if (saved && !hasAppliedSaved) {
    setDraft({ contactName: saved.contactName || '', contactNumber: saved.contactNumber || '', contactEmail: saved.contactEmail || '' });
    setHasAppliedSaved(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveReferralContact(office.id, draft);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--kt-border)' }}>
      <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{office.office}</p>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--kt-text-secondary)' }}>{office.when}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inputStyle, flex: '1 1 160px' }} placeholder="Contact name" value={draft.contactName} onChange={(e) => setDraft((d) => ({ ...d, contactName: e.target.value }))} />
        <input style={{ ...inputStyle, flex: '1 1 130px' }} placeholder="Phone / mobile" value={draft.contactNumber} onChange={(e) => setDraft((d) => ({ ...d, contactNumber: e.target.value }))} />
        <input style={{ ...inputStyle, flex: '1 1 160px' }} placeholder="Email (optional)" value={draft.contactEmail} onChange={(e) => setDraft((d) => ({ ...d, contactEmail: e.target.value }))} />
        <button onClick={handleSave} disabled={saving} style={{ ...btnSecondary, opacity: saving ? 0.6 : 1 }}>
          {saving ? <Loader2 size={11} style={{ animation: 'kt-spin 0.8s linear infinite' }} /> : justSaved ? <CheckCircle2 size={11} color="#2d6a4f" /> : <Save size={11} />}
          {justSaved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function ReferralDirectory() {
  const [contacts, setContacts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeReferralContacts((data) => { setContacts(data); setLoading(false); }, () => setLoading(false)), []);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={20} style={{ animation: 'kt-spin 0.8s linear infinite' }} /></div>;
  }

  const categories = ['internal', 'division', 'external'];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {categories.map((cat) => (
        <div key={cat} style={{ background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 14, padding: '18px 20px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{REFERRAL_CATEGORY_LABELS[cat]}</h3>
          {REFERRAL_OFFICES.filter((o) => o.category === cat).map((office) => (
            <OfficeRow key={office.id} office={office} saved={contacts[office.id]} />
          ))}
        </div>
      ))}
    </div>
  );
}
