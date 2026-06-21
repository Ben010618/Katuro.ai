import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { subscribeAssignments, subscribeSectionComments } from '../../services/classroomDb';
import { GraduationCap, ChevronRight, BookOpen, Bell } from 'lucide-react';

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

export default function ClassesITeachPage() {
  const { user }      = useAuth();
  const navigate      = useNavigate();
  const { addToast }  = useToast();
  const [assignments,  setAssignments]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [sectionUnread, setSectionUnread] = useState({}); // { [sectionId]: count }

  // After login redirect: if a pending invite code is in sessionStorage,
  // send the teacher back to the invite confirmation page instead of auto-accepting
  useEffect(() => {
    if (!user) return;
    const code = sessionStorage.getItem('kt-invite-code');
    if (!code) return;
    sessionStorage.removeItem('kt-invite-code');
    navigate(`/invite/${code}`, { replace: true });
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeAssignments(user.uid, docs => {
      setAssignments(docs);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  // Subscribe to unread comment counts per section
  useEffect(() => {
    if (!user?.uid || assignments.length === 0) return;
    const seen = new Set();
    const unsubs = assignments
      .filter(a => { if (seen.has(a.sectionId)) return false; seen.add(a.sectionId); return true; })
      .map(a =>
        subscribeSectionComments(a.sectionId, comments => {
          const count = comments.filter(c => !(c.readBy || []).includes(user.uid)).length;
          setSectionUnread(prev => ({ ...prev, [a.sectionId]: count }));
        })
      );
    return () => unsubs.forEach(fn => fn());
  }, [user?.uid, assignments.map(a => a.sectionId).join(',')]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #0d2218 0%, #1a3d2b 50%, #2d6a4f 100%)',
        borderRadius: 16, padding: '28px 32px', marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <GraduationCap size={22} color="#52b788" />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>Classes I Teach</h1>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
          Classes appear here when you accept an invitation from an adviser.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#4a6357', fontSize: 14 }}>Loading…</div>
      ) : assignments.length === 0 ? (
        <div style={{ background: 'var(--kt-card)', borderRadius: 14, border: '1px solid var(--kt-border)', padding: '56px 32px', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: '#d8f3dc', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <GraduationCap size={28} color="#2d6a4f" />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600, color: 'var(--kt-text-primary)' }}>No classes yet</h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--kt-text-secondary)', lineHeight: 1.65 }}>
            Ask your class adviser for an invitation link.<br />
            Once accepted, your class will appear here automatically.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 16 }}>
          {assignments.map(a => {
            const { bg, text } = subjectColor(a.subject);
            return (
              <div
                key={a.id}
                onClick={() => navigate(`/classes-i-teach/grade/${a.sectionId}/${encodeURIComponent(a.subject)}`)}
                style={{
                  background: 'var(--kt-card)', borderRadius: 14,
                  border: '1px solid var(--kt-border)',
                  padding: '20px 22px', cursor: 'pointer',
                  transition: 'border-color 0.15s, transform 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.35)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.12)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ background: bg, color: text, borderRadius: 9, padding: '5px 12px', fontSize: 12, fontWeight: 700 }}>
                    {a.subject}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {sectionUnread[a.sectionId] > 0 && (
                      <div style={{ position: 'relative', display: 'inline-flex' }}>
                        <Bell size={15} color="#e07b39" />
                        <span style={{ position: 'absolute', top: -5, right: -7, background: '#e07b39', color: '#fff', borderRadius: 99, fontSize: 9, fontWeight: 800, padding: '1px 4px', lineHeight: '13px' }}>
                          {sectionUnread[a.sectionId]}
                        </span>
                      </div>
                    )}
                    <ChevronRight size={16} color="#4a6357" />
                  </div>
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
                  {a.gradeLevel} – {a.sectionName}
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <BookOpen size={11} /> Subject Teacher
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
