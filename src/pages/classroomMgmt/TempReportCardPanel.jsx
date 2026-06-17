import { useState, useEffect, useRef } from 'react';
import { Download, ClipboardList } from 'lucide-react';
import { subscribeSubjectGrades } from '../../services/classroomDb';
import { subscribeSchoolProfile } from '../../services/schoolFormsDb';

const TERMS = ['term1', 'term2', 'term3'];

const PRINT_OPTIONS = [
  { key: 'term1', label: 'End of Term 1', show: ['term1'] },
  { key: 'term2', label: 'End of Term 2', show: ['term1', 'term2'] },
  { key: 'term3', label: 'End of Term 3 (Final)', show: ['term1', 'term2', 'term3'] },
];

const F = 'Georgia, "Times New Roman", serif';

// ── Single card ────────────────────────────────────────────────────────────────

function ReportCardInner({ student, grades, section, schoolProfile, showTerms, allSubjects }) {
  const name = [student.surname, student.givenName, student.middleInitial]
    .filter(Boolean).join(', ');

  const getGrade = (subj, term) =>
    grades[term]?.[subj]?.[student.id]?.finalGrade;

  const getFinal = (subj) => {
    const vals = showTerms
      .map(t => getGrade(subj, t))
      .filter(g => g !== undefined && g !== null && g > 0);
    if (!vals.length) return '';
    return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  };

  const subjectFinals = allSubjects.map(s => getFinal(s)).filter(g => g !== '');
  const GA = subjectFinals.length
    ? +(subjectFinals.reduce((a, b) => a + b, 0) / subjectFinals.length).toFixed(1)
    : '';

  const TH = {
    fontFamily: F, fontWeight: 'bold',
    color: '#fff', background: '#1a1a1a',
    border: '1px solid #444',
    padding: '4px 5px', textAlign: 'center',
    fontSize: 7.5, verticalAlign: 'middle', lineHeight: 1.25,
  };
  const TD = (extra = {}) => ({
    fontFamily: F, color: '#000',
    border: '1px solid #c0c0c0',
    padding: '0 5px',
    fontSize: 8.5, verticalAlign: 'middle',
    ...extra,
  });
  const GA_TD = (extra = {}) => ({
    fontFamily: F, fontWeight: 'bold', color: '#000',
    background: '#1a1a1a', border: '1px solid #444',
    padding: '0 5px', fontSize: 8.5,
    verticalAlign: 'middle', color: '#fff',
    ...extra,
  });

  return (
    <div style={{
      width: '100%', height: '100%',
      fontFamily: F, color: '#000', background: '#fff',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Title header ── */}
      <div style={{
        background: '#1a1a1a', color: '#fff',
        padding: '10px 14px 8px',
        textAlign: 'center', flexShrink: 0,
        letterSpacing: '0.5px',
      }}>
        <div style={{
          fontSize: 13, fontWeight: 'bold',
          fontFamily: F, letterSpacing: '1.8px',
          textTransform: 'uppercase',
        }}>
          Temporary Report Card
        </div>
        <div style={{
          fontSize: 7, marginTop: 4,
          fontStyle: 'italic', opacity: 0.75, fontFamily: F,
        }}>
          Republic of the Philippines &nbsp;·&nbsp; Department of Education
        </div>
      </div>

      {/* ── Student info ── */}
      <div style={{
        padding: '7px 12px 7px',
        borderBottom: '1.5px solid #1a1a1a',
        flexShrink: 0,
      }}>
        {/* Name */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 4,
          marginBottom: 4,
        }}>
          <span style={{ fontSize: 7.5, fontWeight: 'bold', fontFamily: F, whiteSpace: 'nowrap' }}>
            {"Learner's Name:"}
          </span>
          <span style={{
            flex: 1, borderBottom: '0.75px solid #555',
            paddingBottom: 1, paddingLeft: 4,
            fontSize: 8.5, fontFamily: F, fontStyle: 'italic',
          }}>{name}</span>
        </div>

        {/* Grade/Section + SY */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 7.5, fontWeight: 'bold', fontFamily: F, whiteSpace: 'nowrap' }}>
            {'Grade & Section:'}
          </span>
          <span style={{
            borderBottom: '0.75px solid #555', paddingBottom: 1, paddingLeft: 4,
            fontSize: 8.5, fontFamily: F, fontStyle: 'italic',
            minWidth: 80, marginRight: 8,
          }}>
            {section.gradeLevel}{section.sectionName ? ` – ${section.sectionName}` : ''}
          </span>
          <span style={{ fontSize: 7.5, fontWeight: 'bold', fontFamily: F, whiteSpace: 'nowrap' }}>
            {'School Year:'}
          </span>
          <span style={{
            borderBottom: '0.75px solid #555', paddingBottom: 1, paddingLeft: 4,
            fontSize: 8.5, fontFamily: F, fontStyle: 'italic', minWidth: 55,
          }}>
            {section.academicYear || ''}
          </span>
        </div>

        {/* School */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 7.5, fontWeight: 'bold', fontFamily: F, whiteSpace: 'nowrap' }}>
            {'School:'}
          </span>
          <span style={{
            flex: 1, borderBottom: '0.75px solid #555',
            paddingBottom: 1, paddingLeft: 4,
            fontSize: 8.5, fontFamily: F, fontStyle: 'italic',
          }}>
            {schoolProfile?.schoolName || ''}
          </span>
        </div>
      </div>

      {/* ── Grade table — fills remaining space ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <table style={{
          borderCollapse: 'collapse',
          width: '100%', tableLayout: 'fixed',
          height: '100%',
          border: '1px solid #aaa',
        }}>
          <colgroup>
            <col style={{ width: '48%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
          </colgroup>
          <thead>
            <tr style={{ height: 22 }}>
              <th style={{ ...TH, textAlign: 'left', padding: '4px 7px' }} rowSpan={2}>
                LEARNING AREAS
              </th>
              <th style={{ ...TH, background: '#333', border: '1px solid #555' }} colSpan={3}>
                TERMS
              </th>
              <th style={{ ...TH, background: '#333', lineHeight: 1.3, fontSize: 7 }} rowSpan={2}>
                FINAL<br />RATING
              </th>
            </tr>
            <tr style={{ height: 18 }}>
              {['TERM 1', 'TERM 2', 'TERM 3'].map(t => (
                <th key={t} style={{ ...TH, background: '#444', fontSize: 7, border: '1px solid #555' }}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allSubjects.map((subj, idx) => (
              <tr key={subj} style={{ background: idx % 2 === 0 ? '#fff' : '#f7f7f7' }}>
                <td style={TD({ textAlign: 'left', paddingLeft: 7, fontSize: 8 })}>
                  {subj}
                </td>
                <td style={TD({ textAlign: 'center' })}>
                  {showTerms.includes('term1') ? (getGrade(subj, 'term1') || '') : ''}
                </td>
                <td style={TD({ textAlign: 'center' })}>
                  {showTerms.includes('term2') ? (getGrade(subj, 'term2') || '') : ''}
                </td>
                <td style={TD({ textAlign: 'center' })}>
                  {showTerms.includes('term3') ? (getGrade(subj, 'term3') || '') : ''}
                </td>
                <td style={TD({ textAlign: 'center', fontWeight: 'bold', fontSize: 9, border: '1px solid #888' })}>
                  {getFinal(subj)}
                </td>
              </tr>
            ))}

            {/* General Average */}
            <tr>
              <td style={GA_TD({ textAlign: 'left', paddingLeft: 7, fontSize: 8.5 })}>
                GENERAL AVERAGE
              </td>
              <td style={GA_TD({ textAlign: 'center', background: '#333', border: '1px solid #555' })}></td>
              <td style={GA_TD({ textAlign: 'center', background: '#333', border: '1px solid #555' })}></td>
              <td style={GA_TD({ textAlign: 'center', background: '#333', border: '1px solid #555' })}></td>
              <td style={GA_TD({ textAlign: 'center', fontSize: 10, background: '#1a1a1a', border: '1px solid #444' })}>
                {GA}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Signatures ── */}
      <div style={{
        padding: '8px 16px 10px',
        borderTop: '1.5px solid #1a1a1a',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-end', flexShrink: 0,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ height: 24, borderBottom: '1px solid #000', width: 110, marginBottom: 3 }} />
          <div style={{ fontSize: 7.5, fontWeight: 'bold', fontFamily: F }}>Class Adviser</div>
          <div style={{ fontSize: 7, fontFamily: F, marginTop: 2, color: '#444' }}>
            Date: <span style={{ borderBottom: '0.5px solid #555', display: 'inline-block', width: 60 }} />
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ height: 24, borderBottom: '1px solid #000', width: 120, marginBottom: 3 }} />
          <div style={{ fontSize: 7.5, fontWeight: 'bold', fontFamily: F }}>Parent / Guardian</div>
          <div style={{ fontSize: 7, fontFamily: F, marginTop: 2, color: '#444' }}>
            Date: <span style={{ borderBottom: '0.5px solid #555', display: 'inline-block', width: 60 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── A4 page: 2×2 grid ─────────────────────────────────────────────────────────

function A4Page({ students, grades, section, schoolProfile, showTerms, allSubjects }) {
  return (
    <div style={{
      width: 794, height: 1123,
      background: '#e8e8e8',
      padding: 12, boxSizing: 'border-box',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr',
      gap: 10,
    }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          background: '#fff',
          border: '1.5px solid #1a1a1a',
          borderRadius: 3,
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          {students[i] ? (
            <ReportCardInner
              student={students[i]}
              grades={grades}
              section={section}
              schoolProfile={schoolProfile}
              showTerms={showTerms}
              allSubjects={allSubjects}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function TempReportCardPanel({ section, students, user }) {
  const [selectedPrint, setSelectedPrint] = useState('term1');
  const [allGrades,     setAllGrades]     = useState({ term1: {}, term2: {}, term3: {} });
  const [schoolProfile, setSchoolProfile] = useState({});
  const [generating,    setGenerating]    = useState(false);
  const hiddenRef = useRef(null);

  const allSubjects = [
    ...((section?.subjects) || []),
    ...((section?.specialSubjects) || []),
  ];

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeSchoolProfile(user.uid, setSchoolProfile);
  }, [user?.uid]);

  useEffect(() => {
    if (!section?.id || !allSubjects.length) return;
    const unsubs = [];
    TERMS.forEach(term => {
      allSubjects.forEach(subj => {
        const unsub = subscribeSubjectGrades(section.id, subj, map => {
          setAllGrades(prev => ({
            ...prev,
            [term]: { ...(prev[term] || {}), [subj]: map },
          }));
        }, term);
        unsubs.push(unsub);
      });
    });
    return () => unsubs.forEach(fn => fn());
  }, [section?.id, allSubjects.join(',')]);

  const currentOption = PRINT_OPTIONS.find(o => o.key === selectedPrint) || PRINT_OPTIONS[0];
  const showTerms     = currentOption.show;

  const pages = [];
  for (let i = 0; i < students.length; i += 4) {
    pages.push(students.slice(i, i + 4));
  }

  const sectionData = section ? { ...section } : {};

  async function generatePDF() {
    if (!pages.length) return;
    setGenerating(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF }   = await import('jspdf');
      const pdf         = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageEls     = hiddenRef.current.querySelectorAll('.rc-a4-page');

      for (let i = 0; i < pageEls.length; i++) {
        if (i > 0) pdf.addPage();
        const canvas = await html2canvas(pageEls[i], {
          scale: 2,
          backgroundColor: '#e8e8e8',
          useCORS: true,
          logging: false,
          width: 794,
          height: 1123,
        });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
      }

      const label = currentOption.label.replace(/\s+/g, '_');
      pdf.save(`TRC_${sectionData.sectionName || 'Section'}_${label}.pdf`);
    } catch (err) {
      console.error('TRC PDF error:', err);
    } finally {
      setGenerating(false);
    }
  }

  const termBtnStyle = (key) => ({
    padding: '7px 18px',
    border: selectedPrint === key ? '2px solid #1a3d2b' : '1.5px solid rgba(45,106,79,0.25)',
    borderRadius: 8,
    background: selectedPrint === key ? '#1a3d2b' : '#fff',
    color: selectedPrint === key ? '#fff' : '#1a3d2b',
    fontWeight: 700, fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.15s',
  });

  const PREVIEW_SCALE = 0.54;

  return (
    <div>
      {/* Controls */}
      <div style={{
        background: '#f0fdf4', borderRadius: 12,
        border: '1px solid rgba(45,106,79,0.15)',
        padding: '16px 20px', marginBottom: 22,
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div>
          <p style={{
            margin: '0 0 8px', fontSize: 10, fontWeight: 800,
            color: '#4a6357', textTransform: 'uppercase', letterSpacing: '1px',
          }}>
            Print Period
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {PRINT_OPTIONS.map(o => (
              <button key={o.key} style={termBtnStyle(o.key)} onClick={() => setSelectedPrint(o.key)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: '#4a6357' }}>
            <span style={{ fontWeight: 700 }}>{students.length}</span> students &middot;&nbsp;
            <span style={{ fontWeight: 700 }}>{pages.length}</span> page{pages.length !== 1 ? 's' : ''} &middot; 4 cards / page
          </div>
          <button
            onClick={generatePDF}
            disabled={generating || !students.length}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: generating ? '#6b7280' : '#1a3d2b',
              color: '#fff', border: 'none', borderRadius: 9,
              padding: '10px 22px', fontSize: 13, fontWeight: 700,
              cursor: generating || !students.length ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: !students.length ? 0.5 : 1,
              transition: 'background 0.15s',
            }}
          >
            <Download size={14} />
            {generating ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Preview heading */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList size={15} color="#2d6a4f" />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0d2218' }}>
          Preview &mdash; {currentOption.label}
        </p>
        <span style={{ fontSize: 11, color: '#6b7280' }}>(scroll to see all pages)</span>
      </div>

      {/* Scaled preview */}
      {pages.length > 0 ? (
        <div style={{
          background: '#4b5563', borderRadius: 12, padding: 24,
          display: 'flex', flexDirection: 'column', gap: 20,
          alignItems: 'center', overflowX: 'auto',
        }}>
          {pages.map((pageStudents, pi) => (
            <div
              key={pi}
              style={{
                width:  Math.round(794 * PREVIEW_SCALE),
                height: Math.round(1123 * PREVIEW_SCALE),
                overflow: 'hidden', position: 'relative', flexShrink: 0,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                borderRadius: 3,
              }}
            >
              <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
                <A4Page
                  students={pageStudents}
                  grades={allGrades}
                  section={sectionData}
                  schoolProfile={schoolProfile}
                  showTerms={showTerms}
                  allSubjects={allSubjects}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
          <ClipboardList size={40} color="#d1d5db" />
          <p style={{ margin: '12px 0 0', fontSize: 14 }}>No students in this section yet.</p>
        </div>
      )}

      {/* Hidden pages for PDF capture — must stay visible (no visibility:hidden) */}
      <div
        ref={hiddenRef}
        style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -1, pointerEvents: 'none' }}
      >
        {pages.map((pageStudents, pi) => (
          <div key={pi} className="rc-a4-page">
            <A4Page
              students={pageStudents}
              grades={allGrades}
              section={sectionData}
              schoolProfile={schoolProfile}
              showTerms={showTerms}
              allSubjects={allSubjects}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
