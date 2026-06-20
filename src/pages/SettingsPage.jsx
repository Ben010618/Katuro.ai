import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getTeacherProfile, updateTeacherProfile } from '../services/db';
import { useToast } from '../context/ToastContext';
import { Loader2, CheckCircle, User, CreditCard, Shield, Lock } from 'lucide-react';

const TABS = [
  { label: 'Profile',      Icon: User },
  { label: 'Subscription', Icon: CreditCard },
  { label: 'Account',      Icon: Shield },
];

const SUBJECTS = ['Science', 'Mathematics', 'English', 'Filipino', 'Araling Panlipunan', 'MAPEH', 'TLE', 'Values Education'];
const GRADES   = ['7', '8', '9', '10', '11', '12'];

function LabeledField({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { addToast }  = useToast();
  const { user }      = useAuth();
  const [tab, setTab] = useState(0);

  const [profile, setProfile] = useState({
    name:    user?.displayName || '',
    email:   user?.email       || '',
    school:  '',
    subject: 'Science',
    grade:   '7',
    section: '',
  });
  const [saving,        setSaving]        = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);


  useEffect(() => {
    if (!user?.uid) return;
    getTeacherProfile(user.uid).then(doc => {
      if (doc) {
        setProfile({
          name:    doc.name    || user.displayName || '',
          email:   user.email  || '',
          school:  doc.school  || '',
          subject: doc.subject || 'Science',
          grade:   doc.grade   || '7',
          section: doc.section || '',
        });
      }
      setProfileLoaded(true);
    }).catch(() => setProfileLoaded(true));
  }, [user?.uid]);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateTeacherProfile(user.uid, {
        name:    profile.name,
        school:  profile.school,
        subject: profile.subject,
        grade:   profile.grade,
        section: profile.section,
      });
      addToast('Profile saved successfully.', 'success');
    } catch {
      addToast('Failed to save profile. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page heading */}
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#0d2218' }}>Settings</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#4a6357' }}>
          Manage your profile and account preferences
        </p>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Tab sidebar */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid rgba(45,106,79,0.12)',
          padding: 8, display: 'flex', flexDirection: 'column', gap: 2,
          width: 180, flexShrink: 0,
        }}>
          {TABS.map(({ label, Icon }, i) => (
            <button
              key={label}
              onClick={() => setTab(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '9px 12px', borderRadius: 9, border: 'none',
                background: tab === i ? '#d8f3dc' : 'transparent',
                color: tab === i ? '#1a3d2b' : '#4a6357',
                fontSize: 13, fontWeight: tab === i ? 600 : 500,
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
              }}
              onMouseEnter={e => { if (tab !== i) e.currentTarget.style.background = '#f5faf7'; }}
              onMouseLeave={e => { if (tab !== i) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{
          flex: 1, background: '#fff', borderRadius: 14,
          border: '1px solid rgba(45,106,79,0.12)',
          padding: '24px 28px', minWidth: 0,
        }}>

          {/* Profile tab */}
          {tab === 0 && (
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: '#0d2218' }}>Profile Information</h2>
                <p style={{ margin: 0, fontSize: 14, color: '#4a6357' }}>Update your name, school, and subject information.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <LabeledField label="Full Name">
                  <input className="input" value={profile.name}
                    onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
                </LabeledField>
                <LabeledField label="Email Address">
                  <input className="input" type="email" value={profile.email} readOnly
                    style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                </LabeledField>
              </div>

              <LabeledField label="School Name">
                <input className="input" value={profile.school}
                  onChange={e => setProfile(p => ({ ...p, school: e.target.value }))} />
              </LabeledField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <LabeledField label="Subject">
                  <select className="select" value={profile.subject}
                    onChange={e => setProfile(p => ({ ...p, subject: e.target.value }))}>
                    {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </LabeledField>
                <LabeledField label="Grade Level">
                  <select className="select" value={profile.grade}
                    onChange={e => setProfile(p => ({ ...p, grade: e.target.value }))}>
                    {GRADES.map(g => <option key={g}>{g}</option>)}
                  </select>
                </LabeledField>
                <LabeledField label="Section">
                  <input className="input" value={profile.section}
                    onChange={e => setProfile(p => ({ ...p, section: e.target.value }))} />
                </LabeledField>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* Subscription tab */}
          {tab === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: '#0d2218' }}>Subscription</h2>
                <p style={{ margin: 0, fontSize: 14, color: '#4a6357' }}>Your current plan and usage.</p>
              </div>

              {/* Plan card */}
              <div style={{
                background: 'linear-gradient(135deg, #f5faf7 0%, #d8f3dc 100%)',
                border: '1px solid rgba(45,106,79,0.2)', borderRadius: 14, padding: '20px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1.2px' }}>Current Plan</p>
                  <p style={{ margin: '4px 0 2px', fontSize: 22, fontWeight: 700, color: '#0d2218' }}>Free Plan</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#4a6357' }}>Limited to 3 AI generations per month</p>
                </div>
                <button style={{
                  background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 10,
                  padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
                  opacity: 0.5,
                }} disabled>
                  Upgrade (Coming Soon)
                </button>
              </div>

              {/* Usage stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {[
                  { label: 'AI Generations Used', used: 2, total: 3 },
                  { label: 'Lesson Plans', used: 5, total: 10 },
                  { label: 'Quiz Exports', used: 3, total: 5 },
                ].map(({ label, used, total }) => (
                  <div key={label} style={{
                    background: '#f5faf7', borderRadius: 12, padding: '14px 16px',
                    border: '1px solid rgba(45,106,79,0.12)',
                  }}>
                    <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 100, background: 'rgba(45,106,79,0.12)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(used / total) * 100}%`, background: '#40916c', borderRadius: 100 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#2d6a4f', flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{used}/{total}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                background: '#f0f6ff', border: '1px solid rgba(37,99,235,0.2)',
                borderRadius: 12, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <CheckCircle size={16} color="#3b82f6" />
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
                  Pro plan coming soon — unlimited AI generations, advanced analytics, and priority support.
                </p>
              </div>
            </div>
          )}

          {/* Account tab */}
          {tab === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: '#0d2218' }}>Account Security</h2>
                <p style={{ margin: 0, fontSize: 14, color: '#4a6357' }}>Password management is handled by your administrator.</p>
              </div>

              <div style={{
                display: 'flex', gap: 14, alignItems: 'flex-start',
                background: '#f5faf7', border: '1px solid rgba(45,106,79,0.15)',
                borderRadius: 12, padding: '18px 20px',
              }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#d8f3dc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Lock size={18} color="#2d6a4f" />
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#0d2218' }}>Password changes are admin-only</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#4a6357', lineHeight: 1.6 }}>
                    Only your kaTuro administrator can change or reset your password.
                    Please contact your admin if you need a password update.
                  </p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(45,106,79,0.12)', paddingTop: 20 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#e05c5c' }}>Danger Zone</h3>
                <p style={{ margin: '0 0 14px', fontSize: 14, color: '#4a6357' }}>
                  These actions are permanent and cannot be undone.
                </p>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', background: '#fde8e8', borderRadius: 12,
                  border: '1px solid rgba(224,92,92,0.2)',
                }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e05c5c' }}>Delete Account</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#e05c5c', opacity: 0.7 }}>All data will be permanently removed.</p>
                  </div>
                  <button
                    onClick={() => addToast('Account deletion is disabled in preview mode.', 'warning')}
                    className="btn-danger"
                    style={{ fontSize: 12, padding: '7px 14px' }}
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
