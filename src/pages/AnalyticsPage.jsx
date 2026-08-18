import { useState } from 'react';
import { MOCK_COMPETENCIES, MOCK_QUIZ_RESULTS, MOCK_LEARNERS } from '../data/mockData';
import { AlertTriangle, TrendingUp, Users, Award } from 'lucide-react';

const TABS = ['Competency Coverage', 'Quiz Performance', 'Students at Risk'];

function ProgressBar({ value, color = '#40916c', bg = '#d8f3dc' }) {
  return (
    <div style={{ height: 8, borderRadius: 100, background: bg, overflow: 'hidden', flex: 1 }}>
      <div style={{
        height: '100%', width: `${Math.max(0, Math.min(100, value))}%`,
        borderRadius: 100, background: color,
        transition: 'width 0.6s ease',
      }} />
    </div>
  );
}

function coverageColor(pct) {
  if (pct >= 80) return { bar: '#40916c', bg: '#d8f3dc', text: '#1a3d2b' };
  if (pct >= 50) return { bar: '#e8a320', bg: 'rgba(232,163,32,0.12)', text: '#b47a10' };
  if (pct > 0)   return { bar: '#e05c5c', bg: '#fde8e8', text: '#e05c5c' };
  return           { bar: 'rgba(45,106,79,0.2)', bg: '#f5faf7', text: '#4a6357' };
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState(0);

  const atRisk = MOCK_LEARNERS.filter(l => l.avg < 75);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page heading */}
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#0d2218' }}>Analytics</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#4a6357' }}>
          Science 7 – Aristotle · Q1 & Q2 performance
        </p>
      </div>

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: 'Quizzes Graded',      value: MOCK_QUIZ_RESULTS.length, Icon: Award, color: '#2d6a4f', bg: '#d8f3dc' },
          { label: 'Avg Class Score',     value: `${Math.round(MOCK_QUIZ_RESULTS.reduce((s, r) => s + r.avg, 0) / MOCK_QUIZ_RESULTS.length)}%`, Icon: TrendingUp, color: '#1565c0', bg: '#dbeafe' },
          { label: 'Competencies Taught', value: `${MOCK_COMPETENCIES.filter(c => c.coverage > 0).length}/${MOCK_COMPETENCIES.length}`, Icon: Users, color: '#7c3aed', bg: '#ede9fe' },
          { label: 'Students at Risk',    value: atRisk.length, Icon: AlertTriangle, color: '#e05c5c', bg: '#fde8e8' },
        ].map(({ label, value, Icon, color, bg }) => (
          <div key={label} style={{
            background: '#fff', borderRadius: 14, padding: '16px 18px',
            border: '1px solid rgba(45,106,79,0.12)',
            transition: 'border-color 0.2s, transform 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.3)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(45,106,79,0.12)'; e.currentTarget.style.transform = 'none'; }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 9, background: bg, display: 'grid', placeItems: 'center', marginBottom: 10 }}>
              <Icon size={17} color={color} />
            </div>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#2d6a4f', lineHeight: 1 }}>{value}</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1.2px' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs — scrollable on mobile */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '2px solid rgba(45,106,79,0.12)', paddingBottom: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            style={{
              padding: '9px 16px', background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === i ? '#2d6a4f' : 'transparent'}`,
              marginBottom: -2, cursor: 'pointer', whiteSpace: 'nowrap',
              fontSize: 13, fontWeight: tab === i ? 700 : 500,
              color: tab === i ? '#2d6a4f' : '#4a6357',
              transition: 'all 0.15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab: Competency Coverage */}
      {tab === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#4a6357' }}>
            Coverage = % of sessions taught · Mastery = class average score on related quizzes
          </p>
          {MOCK_COMPETENCIES.map(comp => {
            const cc = coverageColor(comp.coverage);
            const mc = coverageColor(comp.mastery);
            return (
              <div key={comp.code} style={{
                background: '#fff', borderRadius: 12, border: '1px solid rgba(45,106,79,0.12)',
                padding: '14px 18px',
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(45,106,79,0.3)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(45,106,79,0.12)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ background: '#f5faf7', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: '#4a6357', flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>
                    {comp.code}
                  </span>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0d2218', flex: 1 }}>{comp.name}</p>
                  <span style={{ fontSize: 11, color: '#4a6357', flexShrink: 0 }}>
                    {comp.quizzes} quiz{comp.quizzes !== 1 ? 'zes' : ''}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#4a6357', width: 68 }}>Coverage</span>
                    <ProgressBar value={comp.coverage} color={cc.bar} bg={cc.bg} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: cc.text, width: 36, textAlign: 'right', fontFamily: '"DM Mono", monospace' }}>
                      {comp.coverage}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#4a6357', width: 68 }}>Mastery</span>
                    <ProgressBar value={comp.mastery} color={mc.bar} bg={mc.bg} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: mc.text, width: 36, textAlign: 'right', fontFamily: '"DM Mono", monospace' }}>
                      {comp.mastery > 0 ? `${comp.mastery}%` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Quiz Performance */}
      {tab === 1 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ background: '#f5faf7' }}>
                {['Quiz', 'Date', 'Students', 'Avg Score', 'Highest', 'Lowest', 'Below 75%'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontSize: 11, fontWeight: 700, color: '#4a6357',
                    textTransform: 'uppercase', letterSpacing: '1.2px',
                    borderBottom: '2px solid rgba(45,106,79,0.12)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_QUIZ_RESULTS.map((r, i) => {
                const avgColor = r.avg >= 75 ? '#1a3d2b' : r.avg >= 60 ? '#b47a10' : '#e05c5c';
                const avgBg    = r.avg >= 75 ? '#d8f3dc' : r.avg >= 60 ? 'rgba(232,163,32,0.12)' : '#fde8e8';
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(45,106,79,0.08)', background: i % 2 === 0 ? '#fff' : '#fafcfb' }}>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#0d2218' }}>{r.quiz}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#4a6357' }}>{r.date}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#4a6357', fontFamily: '"DM Mono", monospace' }}>{r.students}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: avgBg, color: avgColor, borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700, fontFamily: '"DM Mono", monospace' }}>
                        {r.avg}%
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#1a3d2b', fontFamily: '"DM Mono", monospace' }}>{r.highest}%</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#e05c5c', fontFamily: '"DM Mono", monospace' }}>{r.lowest}%</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        background: r.below75 > 10 ? '#fde8e8' : 'rgba(232,163,32,0.12)',
                        color: r.below75 > 10 ? '#e05c5c' : '#b47a10',
                        borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700,
                      }}>
                        {r.below75} students
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Students at Risk */}
      {tab === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: 'rgba(232,163,32,0.08)', border: '1px solid rgba(232,163,32,0.3)',
            borderRadius: 12, padding: '12px 16px',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <AlertTriangle size={16} color="#e8a320" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#b47a10' }}>
              <strong>{atRisk.length} students</strong> are averaging below 75% and may need additional support or remediation.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {atRisk.map(s => {
              const color = s.avg < 60 ? '#e05c5c' : '#b47a10';
              const bg    = s.avg < 60 ? '#fde8e8' : 'rgba(232,163,32,0.12)';
              return (
                <div key={s.id} style={{
                  background: '#fff', borderRadius: 12,
                  border: '1px solid rgba(45,106,79,0.12)',
                  padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: bg, display: 'grid', placeItems: 'center',
                    fontSize: 11, fontWeight: 700, color,
                  }}>
                    {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0d2218' }}>{s.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <ProgressBar value={s.avg} color={s.avg < 60 ? '#e05c5c' : '#e8a320'} bg={bg} />
                      <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{s.avg}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
