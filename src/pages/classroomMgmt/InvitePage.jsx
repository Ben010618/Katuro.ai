import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getInvitationByCode, acceptInvitation } from '../../services/classroomDb';
import ktLogo from '../../assets/KT-Favicon.webp';
import { CheckCircle2, AlertCircle, Loader2, GraduationCap, X } from 'lucide-react';

const SUBJECT_COLORS = {
  'Science':                                   { bg: '#e0f2fe', text: '#0369a1' },
  'Mathematics':                               { bg: '#fef9c3', text: '#854d0e' },
  'English':                                   { bg: '#f3e8ff', text: '#7c3aed' },
  'Filipino':                                  { bg: '#fce7f3', text: '#be185d' },
  'Araling Panlipunan':                        { bg: '#dcfce7', text: '#15803d' },
  'MAPEH':                                     { bg: '#ffedd5', text: '#c2410c' },
  'Technology and Livelihood Education (TLE)': { bg: '#e0e7ff', text: '#4338ca' },
  'Edukasyon sa Pagpapakatao (EsP)':           { bg: '#d1fae5', text: '#065f46' },
};

function subjectColor(subject) {
  return SUBJECT_COLORS[subject] || { bg: '#d8f3dc', text: '#1a3d2b' };
}

const WRAP = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(135deg, #0d2218 0%, #1a3d2b 60%, #2d6a4f 100%)',
  padding: 24,
};
const CARD = {
  background: '#fff', borderRadius: 20,
  boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
  width: '100%', maxWidth: 440, overflow: 'hidden',
};

export default function InvitePage() {
  const { inviteCode }    = useParams();
  const { user, loading } = useAuth();
  const navigate          = useNavigate();

  // 'fetching' | 'confirm' | 'already_accepted' | 'not_found' | 'accepting' | 'done' | 'declined' | 'error'
  const [phase,  setPhase]  = useState('fetching');
  const [invite, setInvite] = useState(null);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (loading) return;
    if (!inviteCode) { navigate('/login'); return; }

    if (!user) {
      // Save code → redirect to login → ClassesITeachPage will redirect back here
      sessionStorage.setItem('kt-invite-code', inviteCode);
      navigate('/login');
      return;
    }

    // Logged in — fetch invite data to show confirmation screen
    getInvitationByCode(inviteCode)
      .then(inv => {
        if (!inv) { setPhase('not_found'); return; }
        if (inv.status === 'accepted') { setInvite(inv); setPhase('already_accepted'); return; }
        setInvite(inv);
        setPhase('confirm');
      })
      .catch(err => { setError(err.message); setPhase('error'); });
  }, [loading, user, inviteCode]);

  async function handleAccept() {
    if (!user || !invite) return;
    setPhase('accepting');
    try {
      const name = user.displayName || user.email?.split('@')[0] || 'Teacher';
      await acceptInvitation(inviteCode, user.uid, name);
      setPhase('done');
      setTimeout(() => navigate('/classes-i-teach'), 2200);
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  }

  function handleDecline() {
    setPhase('declined');
    setTimeout(() => navigate('/dashboard'), 2000);
  }

  // ── Loading / fetching ──────────────────────────────────────────────────────
  if (loading || phase === 'fetching') {
    return (
      <div style={WRAP}>
        <div style={{ textAlign: 'center' }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <Loader2 size={40} color="#52b788" style={{ animation: 'spin 1s linear infinite', marginBottom: 16 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Loading invitation…</p>
        </div>
      </div>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────────
  if (phase === 'not_found') {
    return (
      <div style={WRAP}>
        <div style={CARD}>
          <div style={{ padding: '32px 32px 28px', textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fde8e8', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}>
              <AlertCircle size={28} color="#e05c5c" />
            </div>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, color: '#0d2218' }}>Invitation Not Found</h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#4a6357', lineHeight: 1.65 }}>
              This link may have expired or been replaced by a newer one. Ask your adviser to resend the link.
            </p>
            <button onClick={() => navigate('/dashboard')} style={{ background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Already accepted ────────────────────────────────────────────────────────
  if (phase === 'already_accepted') {
    return (
      <div style={WRAP}>
        <div style={CARD}>
          <div style={{ padding: '32px 32px 28px', textAlign: 'center' }}>
            <img src={ktLogo} alt="kaTuro AI" style={{ width: 44, height: 44, borderRadius: 12, margin: '0 auto 18px', display: 'block', objectFit: 'cover' }} />
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#d8f3dc', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 size={28} color="#2d6a4f" />
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#0d2218' }}>Already Accepted</h2>
            <p style={{ margin: '0 0 4px', fontSize: 14, color: '#4a6357' }}>
              <strong>{invite?.subject}</strong> · {invite?.gradeLevel} – {invite?.sectionName}
            </p>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6b7280' }}>This class is already in your roster.</p>
            <button onClick={() => navigate('/classes-i-teach')} style={{ background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              View Classes I Teach
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Accepting (loading) ─────────────────────────────────────────────────────
  if (phase === 'accepting') {
    return (
      <div style={WRAP}>
        <div style={{ textAlign: 'center' }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <Loader2 size={40} color="#52b788" style={{ animation: 'spin 1s linear infinite', marginBottom: 16 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Accepting invitation…</p>
        </div>
      </div>
    );
  }

  // ── Done (accepted) ─────────────────────────────────────────────────────────
  if (phase === 'done') {
    const { bg, text } = subjectColor(invite?.subject);
    return (
      <div style={WRAP}>
        <div style={CARD}>
          <div style={{ background: 'linear-gradient(135deg, #1a3d2b, #2d6a4f)', padding: '24px 28px', textAlign: 'center' }}>
            <img src={ktLogo} alt="kaTuro AI" style={{ width: 40, height: 40, borderRadius: 11, margin: '0 auto 14px', display: 'block', objectFit: 'cover' }} />
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(82,183,136,0.2)', border: '2px solid #52b788', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
              <CheckCircle2 size={28} color="#52b788" />
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff' }}>Invitation Accepted!</h2>
          </div>
          <div style={{ padding: '24px 28px', textAlign: 'center' }}>
            <span style={{ background: bg, color: text, borderRadius: 9, padding: '5px 14px', fontSize: 13, fontWeight: 700 }}>
              {invite?.subject}
            </span>
            <p style={{ margin: '14px 0 4px', fontSize: 16, fontWeight: 700, color: '#0d2218' }}>
              {invite?.gradeLevel} – {invite?.sectionName}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#4a6357' }}>Redirecting to Classes I Teach…</p>
            <div style={{ height: 4, background: '#f3f4f6', borderRadius: 100, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#52b788', borderRadius: 100, animation: 'progress 2.2s linear forwards' }} />
            </div>
            <style>{`@keyframes progress { from { width: 0% } to { width: 100% } }`}</style>
          </div>
        </div>
      </div>
    );
  }

  // ── Declined ────────────────────────────────────────────────────────────────
  if (phase === 'declined') {
    return (
      <div style={WRAP}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 15, color: 'rgba(255,255,255,0.7)' }}>Invitation declined. Redirecting…</p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div style={WRAP}>
        <div style={CARD}>
          <div style={{ padding: '32px 32px 28px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fde8e8', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}>
              <AlertCircle size={28} color="#e05c5c" />
            </div>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, color: '#0d2218' }}>Something went wrong</h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#4a6357', lineHeight: 1.6 }}>{error}</p>
            <button onClick={() => navigate('/dashboard')} style={{ background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirm (main screen) ───────────────────────────────────────────────────
  if (phase === 'confirm' && invite) {
    const { bg, text } = subjectColor(invite.subject);
    return (
      <div style={WRAP}>
        <div style={CARD}>
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, #0d2218, #1a3d2b, #2d6a4f)', padding: '28px 28px 24px', textAlign: 'center' }}>
            <img src={ktLogo} alt="kaTuro AI" style={{ width: 40, height: 40, borderRadius: 11, margin: '0 auto 14px', display: 'block', objectFit: 'cover' }} />
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(216,243,220,0.15)', border: '2px solid rgba(82,183,136,0.5)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
              <GraduationCap size={24} color="#52b788" />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
              kaTuro AI · Class Invitation
            </p>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
              You've been invited<br />to teach a class
            </h2>
          </div>

          {/* Invite details */}
          <div style={{ padding: '24px 28px' }}>
            <div style={{ background: '#f5faf7', borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ background: bg, color: text, borderRadius: 9, padding: '5px 14px', fontSize: 13, fontWeight: 700 }}>
                  {invite.subject}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px' }}>Grade Level</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0d2218' }}>{invite.gradeLevel}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px' }}>Section</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0d2218' }}>{invite.sectionName}</p>
                </div>
              </div>
            </div>

            <p style={{ margin: '0 0 18px', fontSize: 13, color: '#4a6357', textAlign: 'center', lineHeight: 1.6 }}>
              Accept to start entering grades for this class. You can decline if this was sent to you by mistake.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleAccept}
                style={{
                  width: '100%', background: '#1a3d2b', color: '#fff', border: 'none',
                  borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#2d6a4f'}
                onMouseLeave={e => e.currentTarget.style.background = '#1a3d2b'}
              >
                <CheckCircle2 size={18} /> Accept Invitation
              </button>

              <button
                onClick={handleDecline}
                style={{
                  width: '100%', background: 'transparent', color: '#6b7280',
                  border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '13px',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#e05c5c'; e.currentTarget.style.color = '#e05c5c'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#6b7280'; }}
              >
                <X size={16} /> Decline
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
