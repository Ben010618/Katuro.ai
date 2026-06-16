import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { acceptInvitation } from '../../services/classroomDb';
import ktLogo from '../../assets/KT Favicon.png';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function InvitePage() {
  const { inviteCode }    = useParams();
  const { user, loading } = useAuth();
  const navigate          = useNavigate();
  const [status, setStatus] = useState('loading'); // loading | accepting | done | error
  const [error,  setError]  = useState('');
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!inviteCode) { navigate('/login'); return; }

    if (user) {
      // Logged in — accept now
      setStatus('accepting');
      const name = user.displayName || user.email?.split('@')[0] || 'Teacher';
      acceptInvitation(inviteCode, user.uid, name)
        .then(inv => {
          setInvite(inv);
          setStatus('done');
          setTimeout(() => navigate('/classes-i-teach'), 2000);
        })
        .catch(err => { setError(err.message); setStatus('error'); });
    } else {
      // Not logged in — save code and send to login
      sessionStorage.setItem('kt-invite-code', inviteCode);
      navigate('/login');
    }
  }, [loading, user, inviteCode]);

  const containerStyle = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f5faf7', padding: 24,
  };
  const cardStyle = {
    background: '#fff', borderRadius: 18,
    border: '1px solid rgba(45,106,79,0.12)',
    boxShadow: '0 8px 32px rgba(13,34,24,0.08)',
    padding: '40px 36px', textAlign: 'center', maxWidth: 420, width: '100%',
  };

  if (status === 'loading' || loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <Loader2 size={36} color="#2d6a4f" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ margin: 0, fontSize: 15, color: '#4a6357' }}>Validating invitation…</p>
        </div>
      </div>
    );
  }

  if (status === 'accepting') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <img src={ktLogo} alt="kaTuro AI" style={{ width: 44, height: 44, borderRadius: 12, margin: '0 auto 16px', display: 'block', objectFit: 'cover' }} />
          <Loader2 size={28} color="#2d6a4f" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0d2218' }}>Accepting your invitation…</p>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <img src={ktLogo} alt="kaTuro AI" style={{ width: 44, height: 44, borderRadius: 12, margin: '0 auto 16px', display: 'block', objectFit: 'cover' }} />
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#d8f3dc', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <CheckCircle2 size={28} color="#2d6a4f" />
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#0d2218' }}>Invitation Accepted!</h2>
          {invite && (
            <p style={{ margin: '0 0 6px', fontSize: 14, color: '#4a6357' }}>
              <strong>{invite.subject}</strong> · {invite.gradeLevel} – {invite.sectionName}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 13, color: '#4a6357' }}>Redirecting to your classes…</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fde8e8', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
            <AlertCircle size={28} color="#e05c5c" />
          </div>
          <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, color: '#0d2218' }}>Could Not Accept Invitation</h2>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: '#4a6357', lineHeight: 1.6 }}>{error}</p>
          <button
            onClick={() => navigate('/classes-i-teach')}
            style={{
              background: '#2d6a4f', color: '#fff', border: 'none',
              borderRadius: 10, padding: '10px 24px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Go to Classes I Teach
          </button>
        </div>
      </div>
    );
  }

  return null;
}
