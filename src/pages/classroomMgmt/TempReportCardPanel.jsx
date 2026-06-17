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

// kaTuro brand palette
const KT_DARK  = '#1a3d2b';
const KT_MID   = '#2d6a4f';
const KT_LIGHT = '#d8f3dc';
const KT_PALE  = '#f0fdf4';

const F = 'Georgia, "Times New Roman", serif';

// ── Single report card ─────────────────────────────────────────────────────────

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

  // ── Shared cell styles ───────────────────────────────────────────────────────
  const headCell = (extra = {}) => ({
    fontFamily: F, fontWeight: 'bold', fontSize: 7.5,
    color: KT_DARK, background: KT_LIGHT,
    border: `1px solid ${KT_MID}`,
    padding: '3px 5px', textAlign: 'center',
    verticalAlign: 'middle', lineHeight: 1.25,
    ...extra,
  });

  const subHeadCell = (extra = {}) => ({
    ...headCell(),
    background: '#b7e4c7',
    fontSize: 7,
    ...extra,
  });

  const dataCell = (extra = {}) => ({
    fontFamily: F, fontSize: 8.5,
    color: '#000', border: '1px solid #bbb',
    padding: '0 6px', verticalAlign: 'middle',
    ...extra,
  });

  const gaCell = (extra = {}) => ({
    fontFamily: F, fontWeight: 'bold', fontSize: 8.5,
    color: '#fff', background: KT_DARK,
    border: `1px solid ${KT_DARK}`,
    padding: '0 6px', verticalAlign: 'middle',
    ...extra,
  });

  // ── Info field helper ─────────────────────────────────────────────────────────
  const Line = ({ label, value, minWidth, flex }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
      <span style={{ fontFamily: F, fontWeight: 'bold', fontSize: 8, color: '#000', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{
        fontFamily: F, fontSize: 8.5, color: '#000',
        borderBottom: '1px solid #555',
        paddingBottom: 1, paddingLeft: 3,
        minWidth: minWidth || 0,
        flex: flex ? 1 : undefined,
        display: 'inline-block',
      }}>
        {value}
      </span>
    </div>
  );

  return (
    <div style={{
      width: '100%', height: '100%',
      fontFamily: F, background: '#fff', color: '#000',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Title ── */}
      <div style={{
        padding: '10px 14px 8px',
        textAlign: 'center',
        borderBottom: `2px solid ${KT_DARK}`,
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: F, fontWeight: 'bold',
          fontSize: 13, color: KT_DARK,
          letterSpacing: '2px', textTransform: 'uppercase',
        }}>
          Temporary Report Card
        </div>
      </div>

      {/* ── Learner info ── */}
      <div style={{
        padding: '7px 12px 6px',
        borderBottom: `1px solid ${KT_MID}`,
        flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 5,
      }}>
        {/* Name — full width */}
        <Line label="Learner's Name:" value={name} flex />

        {/* Grade+Section / SY on one row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <Line label="Grade & Section:" value={
            `${section.gradeLevel || ''}${section.sectionName ? ' – ' + section.sectionName : ''}`
          } minWidth={70} />
          <Line label="School Year:" value={section.academicYear || ''} minWidth={55} />
        </div>

        {/* School — full width */}
        <Line label="School:" value={schoolProfile?.schoolName || ''} flex />
      </div>

      {/* ── Grade table — fills remaining space ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <table style={{
          borderCollapse: 'collapse',
          width: '100%', height: '100%',
          tableLayout: 'fixed',
        }}>
          <colgroup>
            <col style={{ width: '44%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>

          {/* Header row 1 */}
          <thead>
            <tr style={{ height: 22 }}>
              <th style={headCell({ textAlign: 'left', paddingLeft: 8 })} rowSpan={2}>
                LEARNING AREAS
              </th>
              <th style={headCell()} colSpan={3}>
                TERMS
              </th>
              <th style={headCell({ lineHeight: 1.3, fontSize: 7 })} rowSpan={2}>
                FINAL<br />RATING
              </th>
            </tr>
            {/* Header row 2 */}
            <tr style={{ height: 18 }}>
              {['TERM 1', 'TERM 2', 'TERM 3'].map(t => (
                <th key={t} style={subHeadCell()}>{t}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {allSubjects.map((subj, idx) => (
              <tr key={subj} style={{ background: idx % 2 === 0 ? '#fff' : KT_PALE }}>
                <td style={dataCell({ paddingLeft: 8, fontSize: 8 })}>{subj}</td>
                <td style={dataCell({ textAlign: 'center' })}>
                  {showTerms.includes('term1') ? (getGrade(subj, 'term1') || '') : ''}
                </td>
                <td style={dataCell({ textAlign: 'center' })}>
                  {showTerms.includes('term2') ? (getGrade(subj, 'term2') || '') : ''}
                </td>
                <td style={dataCell({ textAlign: 'center' })}>
                  {showTerms.includes('term3') ? (getGrade(subj, 'term3') || '') : ''}
                </td>
                <td style={dataCell({ textAlign: 'center', fontWeight: 'bold', border: `1px solid ${KT_MID}` })}>
                  {getFinal(subj)}
                </td>
              </tr>
            ))}

            {/* General Average row */}
            <tr>
              <td style={gaCell({ paddingLeft: 8, textAlign: 'left' })}>
                GENERAL AVERAGE
              </td>
              <td style={gaCell({ textAlign: 'center', background: KT_MID, border: `1px solid ${KT_MID}` })}></td>
              <td style={gaCell({ textAlign: 'center', background: KT_MID, border: `1px solid ${KT_MID}` })}></td>
              <td style={gaCell({ textAlign: 'center', background: KT_MID, border: `1px solid ${KT_MID}` })}></td>
              <td style={gaCell({ textAlign: 'center', fontSize: 9.5 })}>{GA}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Signatures ── */}
      <div style={{
        padding: '8px 20px 10px',
        borderTop: `1px solid ${KT_MID}`,
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', flexShrink: 0,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ height: 22, borderBottom: '1px solid #000', width: 110, margin: '0 auto 3px' }} />
          <div style={{ fontFamily: F, fontSize: 7.5, fontWeight: 'bold', color: '#000' }}>Class Adviser</div>
          <div style={{ fontFamily: F, fontSize: 7, color: '#555', marginTop: 2 }}>
            {'Date: '}
            <span style={{ display: 'inline-block', width: 65, borderBottom: '0.5px solid #555' }} />
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ height: 22, borderBottom: '1px solid #000', width: 120, margin: '0 auto 3px' }} />
          <div style={{ fontFamily: F, fontSize: 7.5, fontWeight: 'bold', color: '#000' }}>Parent/Guardian</div>
          <div style={{ fontFamily: F, fontSize: 7, color: '#555', marginTop: 2 }}>
            {'Date: '}
            <span style={{ display: 'inline-block', width: 65, borderBottom: '0.5px solid #555' }} />
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
      background: '#f5f5f5',
      padding: 14, boxSizing: 'border-box',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr',
      gap: 12,
    }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          background: '#fff',
          border: `1.5px solid ${KT_DARK}`,
          borderRadius: 7,
          overflow: 'hidden',
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

// ── Main panel ─────────────────────────────────────────────────────────────────

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
          backgroundColor: '#f5f5f5',
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
    border: selectedPrint === key ? `2px solid ${KT_DARK}` : '1.5px solid rgba(45,106,79,0.25)',
    borderRadius: 8,
    background: selectedPrint === key ? KT_DARK : '#fff',
    color: selectedPrint === key ? '#fff' : KT_DARK,
    fontWeight: 700, fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.15s',
  });

  const SCALE = 0.54;

  return (
    <div>
      {/* Controls */}
      <div style={{
        background: KT_PALE, borderRadius: 12,
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
              background: generating ? '#6b7280' : KT_DARK,
              color: '#fff', border: 'none', borderRadius: 9,
              padding: '10px 22px', fontSize: 13, fontWeight: 700,
              cursor: generating || !students.length ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: !students.length ? 0.5 : 1,
            }}
          >
            <Download size={14} />
            {generating ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Preview label */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList size={15} color={KT_MID} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0d2218' }}>
          Preview &mdash; {currentOption.label}
        </p>
        <span style={{ fontSize: 11, color: '#6b7280' }}>(scroll to see all pages)</span>
      </div>

      {/* Scaled preview */}
      {pages.length > 0 ? (
        <div style={{
          background: '#374151', borderRadius: 12, padding: 24,
          display: 'flex', flexDirection: 'column', gap: 20,
          alignItems: 'center', overflowX: 'auto',
        }}>
          {pages.map((pg, pi) => (
            <div
              key={pi}
              style={{
                width:  Math.round(794 * SCALE),
                height: Math.round(1123 * SCALE),
                overflow: 'hidden', flexShrink: 0,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                borderRadius: 4,
              }}
            >
              <div style={{ transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
                <A4Page
                  students={pg}
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

      {/* Off-screen pages for PDF capture — must NOT use visibility:hidden */}
      <div
        ref={hiddenRef}
        style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -1, pointerEvents: 'none' }}
      >
        {pages.map((pg, pi) => (
          <div key={pi} className="rc-a4-page">
            <A4Page
              students={pg}
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
