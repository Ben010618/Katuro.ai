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

// ── Single card inner content ──────────────────────────────────────────────────

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

  const cell = (extra = {}) => ({
    border: '0.75px solid #000', padding: '2px 4px',
    fontSize: 8, color: '#000', ...extra,
  });
  const hdr = (extra = {}) => ({
    ...cell(), fontWeight: 700, background: '#d9d9d9',
    textAlign: 'center', ...extra,
  });

  return (
    <div style={{
      width: '100%', height: '100%', padding: '8px 10px',
      boxSizing: 'border-box',
      fontFamily: 'Arial, Helvetica, sans-serif',
      color: '#000', background: '#fff',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      {/* Title */}
      <div style={{
        textAlign: 'center', fontWeight: 'bold',
        fontSize: 10, letterSpacing: '0.4px', color: '#000',
      }}>
        TEMPORARY REPORT CARD
      </div>

      {/* Header fields */}
      <div style={{ fontSize: 8, lineHeight: 1.7, color: '#000' }}>
        <div>
          <span>{"Learner's Name: "}</span>
          <span style={{
            display: 'inline-block', borderBottom: '0.75px solid #000',
            minWidth: 170, paddingBottom: 0,
          }}>{name}</span>
        </div>
        <div>
          <span>{'Grade & Section: '}</span>
          <span style={{ display: 'inline-block', borderBottom: '0.75px solid #000', minWidth: 80 }}>
            {section.gradeLevel} {section.sectionName ? `– ${section.sectionName}` : ''}
          </span>
          <span style={{ marginLeft: 8 }}>{'School Year: '}</span>
          <span style={{ display: 'inline-block', borderBottom: '0.75px solid #000', minWidth: 50 }}>
            {section.academicYear || ''}
          </span>
        </div>
        <div>
          <span>{'School: '}</span>
          <span style={{ display: 'inline-block', borderBottom: '0.75px solid #000', minWidth: 210 }}>
            {schoolProfile?.schoolName || ''}
          </span>
        </div>
      </div>

      {/* Grade table */}
      <table style={{
        borderCollapse: 'collapse', width: '100%',
        color: '#000', tableLayout: 'fixed',
      }}>
        <colgroup>
          <col style={{ width: '50%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={hdr({ textAlign: 'left', padding: '2px 4px' })} rowSpan={2}>
              LEARNING AREAS
            </th>
            <th style={hdr()} colSpan={3}>TERMS</th>
            <th style={hdr()} rowSpan={2}>FINAL<br />RATING</th>
          </tr>
          <tr>
            <th style={hdr({ fontSize: 7 })}>TERM 1</th>
            <th style={hdr({ fontSize: 7 })}>TERM 2</th>
            <th style={hdr({ fontSize: 7 })}>TERM 3</th>
          </tr>
        </thead>
        <tbody>
          {allSubjects.map(subj => (
            <tr key={subj}>
              <td style={cell()}>{subj}</td>
              <td style={cell({ textAlign: 'center' })}>
                {showTerms.includes('term1') ? (getGrade(subj, 'term1') || '') : ''}
              </td>
              <td style={cell({ textAlign: 'center' })}>
                {showTerms.includes('term2') ? (getGrade(subj, 'term2') || '') : ''}
              </td>
              <td style={cell({ textAlign: 'center' })}>
                {showTerms.includes('term3') ? (getGrade(subj, 'term3') || '') : ''}
              </td>
              <td style={cell({ textAlign: 'center', fontWeight: 600 })}>{getFinal(subj)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell(), fontWeight: 700, background: '#d9d9d9' }}>GENERAL AVERAGE</td>
            <td style={{ ...cell(), background: '#d9d9d9' }}></td>
            <td style={{ ...cell(), background: '#d9d9d9' }}></td>
            <td style={{ ...cell(), background: '#d9d9d9' }}></td>
            <td style={{ ...cell(), textAlign: 'center', fontWeight: 700, background: '#d9d9d9' }}>
              {GA}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Signatures */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: 'auto', paddingTop: 5,
        fontSize: 7, color: '#000',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderBottom: '0.75px solid #000', width: 90, height: 18, marginBottom: 2 }} />
          <div style={{ fontWeight: 700 }}>Class Adviser</div>
          <div>Date: ___________</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderBottom: '0.75px solid #000', width: 110, height: 18, marginBottom: 2 }} />
          <div style={{ fontWeight: 700 }}>Parent / Guardian</div>
          <div>Date: ___________</div>
        </div>
      </div>
    </div>
  );
}

// ── A4 page layout: 2×2 grid ──────────────────────────────────────────────────

function A4Page({ students, grades, section, schoolProfile, showTerms, allSubjects }) {
  return (
    <div style={{
      width: 794, height: 1123,
      background: '#fff', padding: 10, boxSizing: 'border-box',
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr', gap: 8,
    }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          border: '1.5px solid #000', borderRadius: 2,
          overflow: 'hidden', background: '#fff',
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

// ── Main panel ────────────────────────────────────────────────────────────────

export default function TempReportCardPanel({ section, students, user }) {
  const [selectedPrint, setSelectedPrint] = useState('term1');
  const [allGrades, setAllGrades]         = useState({ term1: {}, term2: {}, term3: {} });
  const [schoolProfile, setSchoolProfile] = useState({});
  const [generating, setGenerating]       = useState(false);
  const hiddenRef = useRef(null);

  const allSubjects = [
    ...((section?.subjects) || []),
    ...((section?.specialSubjects) || []),
  ];

  // School profile
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeSchoolProfile(user.uid, setSchoolProfile);
  }, [user?.uid]);

  // Grades — all subjects × all 3 terms
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

  // Group students into pages of 4
  const pages = [];
  for (let i = 0; i < students.length; i += 4) {
    pages.push(students.slice(i, i + 4));
  }

  const sectionData = section ? { ...section } : {};

  async function generatePDF() {
    if (!pages.length) return;
    setGenerating(true);
    try {
      const html2canvas   = (await import('html2canvas')).default;
      const { jsPDF }     = await import('jspdf');
      const pdf           = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const container     = hiddenRef.current;
      const pageEls       = container.querySelectorAll('.rc-a4-page');

      for (let i = 0; i < pageEls.length; i++) {
        if (i > 0) pdf.addPage();
        const canvas = await html2canvas(pageEls[i], {
          scale: 2,
          backgroundColor: '#ffffff',
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
    padding: '7px 16px',
    border: selectedPrint === key ? '2px solid #1a3d2b' : '1.5px solid rgba(45,106,79,0.25)',
    borderRadius: 8,
    background: selectedPrint === key ? '#1a3d2b' : '#fff',
    color: selectedPrint === key ? '#fff' : '#1a3d2b',
    fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.15s',
  });

  const PREVIEW_SCALE = 0.55;

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
          <div style={{ fontSize: 11, color: '#4a6357', textAlign: 'right' }}>
            <span style={{ fontWeight: 700 }}>{students.length}</span> students&nbsp;&middot;&nbsp;
            <span style={{ fontWeight: 700 }}>{pages.length}</span>{' '}
            page{pages.length !== 1 ? 's' : ''}&nbsp;&middot;&nbsp;4 cards / page
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
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          (scroll to see all pages)
        </span>
      </div>

      {/* Scaled previews */}
      {pages.length > 0 ? (
        <div style={{
          background: '#6b7280', borderRadius: 12, padding: 20,
          display: 'flex', flexDirection: 'column', gap: 16,
          alignItems: 'center', overflowX: 'auto',
        }}>
          {pages.map((pageStudents, pi) => (
            <div
              key={pi}
              style={{
                width: Math.round(794 * PREVIEW_SCALE),
                height: Math.round(1123 * PREVIEW_SCALE),
                overflow: 'hidden', position: 'relative', flexShrink: 0,
                boxShadow: '0 6px 30px rgba(0,0,0,0.4)',
                borderRadius: 2,
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

      {/* Hidden A4 pages for PDF capture — must NOT be visibility:hidden or display:none */}
      <div
        ref={hiddenRef}
        style={{
          position: 'absolute', left: '-9999px', top: 0,
          zIndex: -1, pointerEvents: 'none',
        }}
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
