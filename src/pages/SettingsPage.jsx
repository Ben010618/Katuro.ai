import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getTeacherProfile, updateTeacherProfile } from '../services/db';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PLAN_LIMITS, planStatusText, manilaToday, SUBSCRIBE_CONTACT_URL } from '../services/plans';
import { useToast } from '../context/ToastContext';
import TeacherProfileForm from '../components/TeacherProfileForm';
import { Loader2, User, CreditCard, Shield, Lock } from 'lucide-react';

const TABS = [
  { label: 'Profile',      Icon: User },
  { label: 'Plan', Icon: CreditCard },
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
  const { user, plan, profile: liveProfile } = useAuth();
  // The tab follows the address (?tab=plan|account), so the plan badge works even
  // when Settings is already open.
  const [searchParams, setSearchParams] = useSearchParams();
  const TAB_KEYS = ['profile', 'plan', 'account'];
  const tab = Math.max(0, TAB_KEYS.indexOf(searchParams.get('tab') || 'profile'));
  const setTab = (i) => setSearchParams(i === 0 ? {} : { tab: TAB_KEYS[i] }, { replace: true });
  const [usageToday, setUsageToday] = useState(null);

  // Today's AI usage (server-kept counters, read-only for teachers).
  useEffect(() => {
    if (tab !== 1 || !user?.uid) return undefined;
    let cancelled = false;
    getDoc(doc(db, 'teachers', user.uid, 'usage', manilaToday()))
      .then((snap) => { if (!cancelled) setUsageToday(snap.data() || {}); })
      .catch(() => { if (!cancelled) setUsageToday({}); });
    return () => { cancelled = true; };
  }, [tab, user?.uid]);

  const [profile, setProfile] = useState({
    name:    user?.displayName || '',
    email:   user?.email       || '',
    school:  '',
    subject: '',
    grade:   '',
    section: '',
  });
  const [saving,        setSaving]        = useState(false);
  const [, setProfileLoaded] = useState(false);


  useEffect(() => {
    if (!user?.uid) return;
    getTeacherProfile(user.uid).then(doc => {
      if (doc) {
        setProfile({
          name:    doc.name    || user.displayName || '',
          email:   user.email  || '',
          school:  doc.school  || '',
          subject: doc.subject || '',
          grade:   doc.grade   || '',
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
        subject: profile.subject,
        grade:   profile.grade,
        section: profile.section,
      });
      addToast('Teaching defaults saved.', 'success');
    } catch {
      addToast('Failed to save profile. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .settings-layout {
          display: flex;
          gap: 20px;
          align-items: flex-start;
        }
        .settings-nav {
          background: var(--kt-card);
          border-radius: var(--kt-radius-md);
          border: 1px solid var(--kt-border);
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          width: 180px;
          flex-shrink: 0;
        }
        @media (max-width: 768px) {
          .settings-layout {
            flex-direction: column;
          }
          .settings-nav {
            width: 100%;
            flex-direction: row;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            box-sizing: border-box;
          }
          .settings-nav button {
            white-space: nowrap;
          }
        }
      `}</style>

      {/* Page heading */}
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: 'var(--kt-font-heading)' }}>Settings</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--kt-text-secondary)' }}>
          Manage your teacher profile and account preferences
        </p>
      </div>

      <div className="settings-layout">

        {/* Tab sidebar */}
        <div className="settings-nav">
          {TABS.map(({ label, Icon }, i) => (
            <button
              key={label}
              onClick={() => setTab(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '9px 12px', borderRadius: 'var(--kt-radius-sm)', border: 'none',
                background: tab === i ? 'var(--kt-manila)' : 'transparent',
                color: tab === i ? 'var(--kt-text-primary)' : 'var(--kt-text-secondary)',
                fontSize: 13, fontWeight: tab === i ? 700 : 500,
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (tab !== i) e.currentTarget.style.background = 'var(--kt-card-2)'; }}
              onMouseLeave={e => { if (tab !== i) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{
          flex: 1, background: 'var(--kt-card)', borderRadius: 'var(--kt-radius-md)',
          border: '1px solid var(--kt-border)',
          padding: '24px', minWidth: 0, width: '100%', boxSizing: 'border-box',
        }}>

          {/* Profile tab */}
          {tab === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary)', fontFamily: 'var(--kt-font-heading)' }}>Teacher Profile</h2>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--kt-text-secondary)' }}>
                  Fill this in once. KaTuro and KaTuroDesk use it for your DLL, lesson plans, COT and other documents, so you don't retype names and signatories. Signed in as {user?.email}.
                </p>
              </div>
              <TeacherProfileForm uid={user?.uid} profile={liveProfile} user={user} onSaved={() => addToast('Profile saved.', 'success')} />
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid var(--kt-border)', paddingTop: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Teaching defaults</h2>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--kt-text-secondary)' }}>Pre-selected subject, grade and section in the generators.</p>
              </div>

              <div className="kt-grid-3" style={{ gap: 14 }}>
                <LabeledField label="Subject">
                  <select className="select" value={profile.subject}
                    onChange={e => setProfile(p => ({ ...p, subject: e.target.value }))}>
                    <option value="">Not set</option>
                    {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </LabeledField>
                <LabeledField label="Grade Level">
                  <select className="select" value={profile.grade}
                    onChange={e => setProfile(p => ({ ...p, grade: e.target.value }))}>
                    <option value="">Not set</option>
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
                  {saving ? 'Saving…' : 'Save defaults'}
                </button>
              </div>
            </form>
            </div>
          )}

          {/* Subscription tab */}
          {tab === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: '#0d2218' }}>Your plan</h2>
                <p style={{ margin: 0, fontSize: 14, color: '#4a6357' }}>Plans are activated by the KaTuro admin. Free plans have lower daily AI limits; Subscriptions get the full limits.</p>
              </div>

              {/* Plan card */}
              <div style={{
                background: plan.plan === 'subscription' ? 'linear-gradient(135deg, #1F3A2E 0%, #2d6a4f 100%)' : 'linear-gradient(135deg, #f5faf7 0%, #d8f3dc 100%)',
                border: '1px solid rgba(45,106,79,0.2)', borderRadius: 14, padding: '20px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: plan.plan === 'subscription' ? '#E4D5AC' : '#4a6357', textTransform: 'uppercase', letterSpacing: '1.2px' }}>Current plan</p>
                  <p style={{ margin: '4px 0 2px', fontSize: 22, fontWeight: 700, color: plan.plan === 'subscription' ? '#fff' : '#0d2218' }}>{plan.label}</p>
                  <p style={{ margin: 0, fontSize: 13, color: plan.plan === 'subscription' ? '#d8f3dc' : '#4a6357' }}>
                    {planStatusText(plan)}{plan.expiringSoon ? ` · ${plan.daysLeft} day${plan.daysLeft === 1 ? '' : 's'} left` : ''}
                  </p>
                </div>
                {(plan.plan === 'free' || plan.expiringSoon) && (
                  <a href={SUBSCRIBE_CONTACT_URL} target="_blank" rel="noreferrer" style={{
                    background: plan.plan === 'subscription' ? '#E4D5AC' : '#2d6a4f', color: plan.plan === 'subscription' ? '#1F3A2E' : '#fff',
                    borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                  }}>
                    {plan.plan === 'free' ? 'Message KaTuro to subscribe' : 'Message KaTuro to renew'}
                  </a>
                )}
              </div>

              {/* Daily limits, with today's usage */}
              <div style={{ border: '1px solid rgba(45,106,79,0.15)', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f5faf7', textAlign: 'left', color: '#4a6357' }}>
                      <th style={{ padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px' }}>Daily limit</th>
                      <th style={{ padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', background: plan.plan === 'free' ? '#d8f3dc' : undefined }}>Free</th>
                      <th style={{ padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', background: plan.plan === 'subscription' ? '#d8f3dc' : undefined }}>Subscription</th>
                      <th style={{ padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px' }}>Used today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLAN_LIMITS.map((row) => {
                      const used = usageToday?.[row.action] ?? 0;
                      const limit = row[plan.plan];
                      return (
                        <tr key={row.action} style={{ borderTop: '1px solid rgba(45,106,79,0.1)' }}>
                          <td style={{ padding: '9px 14px', color: '#0d2218' }}>{row.feature}</td>
                          <td style={{ padding: '9px 14px', fontWeight: plan.plan === 'free' ? 700 : 400 }}>{row.free}</td>
                          <td style={{ padding: '9px 14px', fontWeight: plan.plan === 'subscription' ? 700 : 400 }}>{row.subscription}</td>
                          <td style={{ padding: '9px 14px', fontFamily: '"DM Mono", monospace', color: used >= limit ? '#c0392b' : '#2d6a4f' }}>{used}/{limit}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#4a6357' }}>Limits reset every midnight (Philippine time).</p>
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
                  <p style={{ margin: 0, fontSize: 12, color: '#e05c5c', fontWeight: 600, maxWidth: 220, textAlign: 'right' }}>
                    Ask your kaTuro admin to delete your account.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
