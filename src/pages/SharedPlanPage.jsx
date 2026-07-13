import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSharedPlan } from '../services/db';
import ktLogo from '../assets/KT-Favicon.webp';
import { BookOpen, GraduationCap, Calendar, Sparkles, ArrowRight, Loader2 } from 'lucide-react';

const PLAN_LABELS = { dll: 'Daily Lesson Log', ilaw: 'ILAW Lesson Plan', cot: 'COT Lesson Plan' };
const PLAN_COLORS = { dll: '#4f46e5', ilaw: '#0d9488', cot: '#7c3aed' };

export default function SharedPlanPage() {
  const { shareId }   = useParams();
  const navigate      = useNavigate();
  const [plan,    setPlan]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!shareId) { setError('Invalid link.'); setLoading(false); return; }
    getSharedPlan(shareId)
      .then(data => {
        if (!data) { setError('This shared plan no longer exists.'); } else { setPlan(data); }
      })
      .catch(() => setError('Could not load the shared plan. Check your connection.'))
      .finally(() => setLoading(false));
  }, [shareId]);

  function handleCTA() {
    const ref = plan?.ownerUid ? `?ref=${plan.ownerUid}` : '';
    navigate(`/login${ref}`);
  }

  const accent = PLAN_COLORS[plan?.type] ?? '#2d6a4f';

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5faf7' }}>
      <div style={{ textAlign: 'center' }}>
        <Loader2 size={32} color="#2d6a4f" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
        <p style={{ color: '#4a6357', fontSize: 13, margin: 0, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5faf7', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <img src={ktLogo} alt="kaTuro AI" style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 16, objectFit: 'cover' }} />
        <p style={{ fontSize: 15, color: '#4a6357', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{error}</p>
        <button onClick={() => navigate('/login')} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 9, border: 'none', background: '#2d6a4f', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          Go to kaTuro AI
        </button>
      </div>
    </div>
  );

  const preview   = plan.preview || {};
  const previewEntries = Object.entries(preview).slice(0, 3);

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; background: #f0fdf4; font-family: 'Plus Jakarta Sans', sans-serif; }
        @media (max-width: 480px) {
          .sp-card { padding: 20px 16px !important; }
          .sp-cta  { font-size: 14px !important; padding: 14px 20px !important; }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#f0fdf4', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 48px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <img src={ktLogo} alt="kaTuro AI" style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover' }} />
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#2d6a4f', letterSpacing: '0.08em', textTransform: 'uppercase' }}>kaTuro AI</p>
            <p style={{ margin: 0, fontSize: 11, color: '#4a6357' }}>DepEd Teacher Co-pilot</p>
          </div>
        </div>

        {/* Card */}
        <div className="sp-card" style={{ background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(45,106,79,0.10)', padding: '28px 28px', maxWidth: 520, width: '100%' }}>

          {/* Plan type badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${accent}15`, borderRadius: 20, padding: '4px 12px', marginBottom: 18 }}>
            <Sparkles size={11} color={accent} />
            <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: '0.05em' }}>
              {PLAN_LABELS[plan.type] ?? 'Lesson Plan'} · AI-Generated
            </span>
          </div>

          {/* Subject + Grade */}
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#0d2218', lineHeight: 1.3 }}>
            {plan.subject}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#4a6357' }}>
              <GraduationCap size={13} /> {plan.gradeLevel}
            </span>
            {plan.term && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#4a6357' }}>
                <Calendar size={13} /> {plan.term}
              </span>
            )}
          </div>

          {/* MELC */}
          {plan.melc && (
            <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 18, borderLeft: `3px solid ${accent}` }}>
              <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#2d6a4f', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                MELC / Competency
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#1a3d2b', lineHeight: 1.5 }}>
                {plan.melc}
              </p>
            </div>
          )}

          {/* Preview entries (first day objectives or session summary) */}
          {previewEntries.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Preview
              </p>
              {previewEntries.map(([key, val], i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: '#1a3d2b', textTransform: 'capitalize' }}>
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: '#4a6357', lineHeight: 1.5 }}>
                    {typeof val === 'string' ? val.slice(0, 200) : JSON.stringify(val).slice(0, 200)}
                    {String(val).length > 200 && '…'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Teacher attribution */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid #e5f2eb', marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: accent, display: 'grid', placeItems: 'center' }}>
              <BookOpen size={13} color="#fff" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0d2218' }}>{plan.ownerName}</p>
              {plan.school && <p style={{ margin: 0, fontSize: 11, color: '#4a6357' }}>{plan.school}</p>}
            </div>
          </div>

          {/* CTA */}
          <button
            className="sp-cta"
            onClick={handleCTA}
            style={{
              width: '100%', padding: '15px 24px', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg, #2d6a4f, ${accent})`,
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            <Sparkles size={16} /> Generate yours for FREE
            <ArrowRight size={15} />
          </button>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#4a6357', margin: '10px 0 0' }}>
            No credit card needed · Made for DepEd teachers
          </p>
        </div>

        {/* Footer */}
        <p style={{ marginTop: 32, fontSize: 11, color: '#4a6357', textAlign: 'center' }}>
          Created with <strong>kaTuro AI</strong> · DepEd Teacher Co-pilot
        </p>
      </div>
    </>
  );
}
