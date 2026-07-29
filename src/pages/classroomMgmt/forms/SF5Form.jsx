import { useRef, useState, useEffect } from 'react';
import { X, Download, FileText } from 'lucide-react';
import { subscribeSubjectGrades } from '../../../services/classroomDb';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TERMS = ['term1', 'term2', 'term3'];

function proficiencyLevel(avg) {
  if (!avg || avg < 60) return '';
  if (avg < 75) return 'B';
  if (avg < 80) return 'D';
  if (avg < 85) return 'AP';
  if (avg < 90) return 'P';
  return 'A';
}

function proficiencyLabel(code) {
  return { B: 'Beginning', D: 'Developing', AP: 'Approaching Proficiency', P: 'Proficient', A: 'Advanced' }[code] || '';
}

function descriptiveLetter(avg) {
  if (!avg) return '';
  if (avg >= 90) return 'Outstanding';
  if (avg >= 85) return 'Very Satisfactory';
  if (avg >= 80) return 'Satisfactory';
  if (avg >= 75) return 'Fairly Satisfactory';
  return 'Did Not Meet Expectations';
}

function roundTwo(n) {
  return Math.round((n || 0) * 100) / 100;
}

// ── Print styles ──────────────────────────────────────────────────────────────

const TH = {
  background: '#D9D9D9', border: '1px solid #000',
  padding: '2px 3px', fontSize: 6.5, fontWeight: 'bold',
  textAlign: 'center', verticalAlign: 'middle', lineHeight: 1.25, color: '#000',
};
const TD = {
  border: '1px solid #000', padding: '1px 3px',
  fontSize: 7, textAlign: 'center', verticalAlign: 'middle',
  height: 17, color: '#000',
};
const TD_LEFT = { ...TD, textAlign: 'left' };
const TH_GRAY2 = { ...TH, background: '#BFBFBF' };

// ── DepEd logo placeholder ────────────────────────────────────────────────────

function DepEdLogo() {
  return (
    <div style={{ width: 55, height: 55, border: '1.5px solid #000', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ fontSize: 7, fontWeight: 'bold', color: '#000', textAlign: 'center', lineHeight: 1.2 }}>
        <div>DepEd</div>
        <div style={{ fontSize: 5.5, fontWeight: 'normal' }}>Republic of the</div>
        <div style={{ fontSize: 5.5, fontWeight: 'normal' }}>Philippines</div>
      </div>
    </div>
  );
}

// ── Table content ─────────────────────────────────────────────────────────────

function SF5TableContent({ section, students, allGrades, allSubjects, schoolProfile }) {
  const sp = schoolProfile || {};

  // Compute per-student general average
  const computeGA = (studentId) => {
    const grades = allSubjects.map(subj => {
      const termGrades = TERMS.map(t => allGrades[t]?.[subj]?.[studentId]?.finalGrade).filter(g => g !== undefined && g !== null && g > 0);
      if (!termGrades.length) return null;
      return termGrades.reduce((a, b) => a + b, 0) / termGrades.length;
    }).filter(g => g !== null);
    if (!grades.length) return null;
    return roundTwo(grades.reduce((a, b) => a + b, 0) / grades.length);
  };

  const studentRows = students.map(s => ({
    ...s,
    ga: computeGA(s.id),
  }));

  const maleStudents   = studentRows.filter(s => s.gender === 'Male');
  const femaleStudents = studentRows.filter(s => s.gender === 'Female');

  // Summary counts
  const promoted   = studentRows.filter(s => s.ga !== null && s.ga >= 75).length;
  const retained   = studentRows.filter(s => s.ga !== null && s.ga < 75).length;
  const maleP      = maleStudents.filter(s => s.ga !== null && s.ga >= 75).length;
  const maleR      = maleStudents.filter(s => s.ga !== null && s.ga < 75).length;
  const femaleP    = femaleStudents.filter(s => s.ga !== null && s.ga >= 75).length;
  const femaleR    = femaleStudents.filter(s => s.ga !== null && s.ga < 75).length;

  const profCodes = ['B', 'D', 'AP', 'P', 'A'];
  const profCount = (gender, code) => {
    const pool = gender === 'M' ? maleStudents : gender === 'F' ? femaleStudents : studentRows;
    return pool.filter(s => proficiencyLevel(s.ga) === code).length;
  };

  const MIN_ROWS = 25;

  const renderRows = (list) => {
    const rows = list.map(s => (
      <tr key={s.id} style={{ height: 17 }}>
        <td style={{ ...TD, fontSize: 6 }}>{s.lrn || ''}</td>
        <td style={{ ...TD_LEFT, fontSize: 7 }}>{[s.surname, s.givenName, s.middleInitial].filter(Boolean).join(', ')}</td>
        <td style={{ ...TD, fontWeight: s.ga ? 700 : 400 }}>{s.ga !== null ? s.ga?.toFixed(2) : '—'}</td>
        <td style={TD}>
          {s.ga !== null ? (
            <span style={{ fontSize: 6.5 }}>
              {s.ga >= 75 ? 'PROMOTED' : 'RETAINED'}
            </span>
          ) : ''}
        </td>
        <td style={TD}></td>
        <td style={TD}></td>
      </tr>
    ));

    const empty = Math.max(0, MIN_ROWS - list.length);
    for (let i = 0; i < empty; i++) {
      rows.push(
        <tr key={`e-${i}`} style={{ height: 17 }}>
          {Array.from({ length: 6 }, (_, j) => <td key={j} style={j === 1 ? TD_LEFT : TD}></td>)}
        </tr>
      );
    }
    return rows;
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#fff', color: '#000', padding: '10px 8px' }}>
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
        <DepEdLogo />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 'bold' }}>School Form 5 (SF 5) Report on Promotion &amp; Level of Proficiency</div>
          <div style={{ fontSize: 7.5, fontStyle: 'italic' }}>(This replaces Forms 18-E1, 18-E2, 18A and List of Graduates)</div>
        </div>
        <div style={{ width: 55 }} />
      </div>

      {/* Header fields */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 5, fontSize: 8, color: '#000' }}>
        <tbody>
          <tr>
            <td style={{ fontWeight: 'bold', paddingRight: 4, whiteSpace: 'nowrap' }}>School ID</td>
            <td style={{ borderBottom: '1px solid #000', paddingRight: 10, minWidth: 70 }}>{sp.schoolId || ''}</td>
            <td style={{ fontWeight: 'bold', padding: '0 8px', whiteSpace: 'nowrap' }}>Region</td>
            <td style={{ borderBottom: '1px solid #000', paddingRight: 10, minWidth: 90 }}>{sp.region || 'Region VIII'}</td>
            <td style={{ fontWeight: 'bold', padding: '0 8px', whiteSpace: 'nowrap' }}>Division</td>
            <td style={{ borderBottom: '1px solid #000', paddingRight: 10, minWidth: 120 }}>{sp.division || ''}</td>
            <td style={{ fontWeight: 'bold', padding: '0 8px', whiteSpace: 'nowrap' }}>District</td>
            <td style={{ borderBottom: '1px solid #000', minWidth: 100 }}>{sp.district || ''}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 'bold', paddingRight: 4, paddingTop: 3, whiteSpace: 'nowrap' }}>School Name</td>
            <td colSpan={3} style={{ borderBottom: '1px solid #000', paddingTop: 3, paddingRight: 10 }}>{sp.schoolName || ''}</td>
            <td style={{ fontWeight: 'bold', padding: '3px 8px 0', whiteSpace: 'nowrap' }}>School Year</td>
            <td style={{ borderBottom: '1px solid #000', paddingTop: 3 }}>{section?.academicYear || ''}</td>
            <td style={{ fontWeight: 'bold', padding: '3px 8px 0', whiteSpace: 'nowrap' }}>Curriculum</td>
            <td style={{ borderBottom: '1px solid #000', paddingTop: 3 }}>K to 12</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 'bold', paddingRight: 4, paddingTop: 3, whiteSpace: 'nowrap' }}>Grade Level</td>
            <td style={{ borderBottom: '1px solid #000', paddingTop: 3, paddingRight: 10 }}>{section?.gradeLevel || ''}</td>
            <td style={{ fontWeight: 'bold', padding: '3px 8px 0', whiteSpace: 'nowrap' }}>Section</td>
            <td colSpan={5} style={{ borderBottom: '1px solid #000', paddingTop: 3 }}>{section?.sectionName || ''}</td>
          </tr>
        </tbody>
      </table>

      {/* Two-column layout: main table left, summary table right */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>

        {/* Main table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', border: '2px solid #000' }}>
            <colgroup>
              <col style={{ width: 75 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 65 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 95 }} />
              <col style={{ width: 95 }} />
            </colgroup>
            <thead>
              <tr style={{ height: 50 }}>
                <th style={TH} rowSpan={2}>LRN</th>
                <th style={TH} rowSpan={2}>LEARNER'S NAME<br /><span style={{ fontSize: 5.5, fontWeight: 'normal' }}>(Last Name, First Name, Middle Name)</span></th>
                <th style={{ ...TH, fontSize: 6 }}>
                  GENERAL AVERAGE<br />
                  <span style={{ fontSize: 5.5, fontWeight: 'normal' }}>
                    (Numerical Value in 2 decimal places and 3 decimal places for honor learners, and Descriptive Letter)
                  </span>
                </th>
                <th style={{ ...TH, fontSize: 6 }}>
                  ACTION TAKEN:<br />
                  <span style={{ fontSize: 5.5, fontWeight: 'normal' }}>PROMOTED, IRREGULAR or RETAINED</span>
                </th>
                <th style={{ ...TH, fontSize: 6 }} colSpan={2}>
                  INCOMPLETE SUBJECT/S<br />
                  <span style={{ fontSize: 5.5, fontWeight: 'normal' }}>
                    (This column is for K to 12 Curriculum and remaining RBEC in High School)
                  </span>
                </th>
              </tr>
              <tr style={{ height: 24 }}>
                <th style={{ ...TH, fontSize: 5.5 }}>General Average</th>
                <th style={{ ...TH, fontSize: 5.5 }}>Action Taken</th>
                <th style={{ ...TH, fontSize: 5.5 }}>From previous school years completed as of end of current School Year</th>
                <th style={{ ...TH, fontSize: 5.5 }}>As of end of current School Year</th>
              </tr>
            </thead>
            <tbody>
              {renderRows(maleStudents)}
              <tr style={{ background: '#D9D9D9', height: 18 }}>
                <td colSpan={6} style={{ ...TD, background: '#D9D9D9', fontWeight: 'bold', fontSize: 8 }}>
                  ← TOTAL MALE ({maleStudents.length})
                </td>
              </tr>
              {renderRows(femaleStudents)}
              <tr style={{ background: '#D9D9D9', height: 18 }}>
                <td colSpan={6} style={{ ...TD, background: '#D9D9D9', fontWeight: 'bold', fontSize: 8 }}>
                  ← TOTAL FEMALE ({femaleStudents.length})
                </td>
              </tr>
              <tr style={{ background: '#BFBFBF', height: 18 }}>
                <td colSpan={6} style={{ ...TD, background: '#BFBFBF', fontWeight: 'bold', fontSize: 8 }}>
                  ← COMBINED ({studentRows.length})
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Summary table (right side) */}
        <div style={{ width: 180, flexShrink: 0 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', border: '2px solid #000', fontSize: 7, color: '#000' }}>
            <thead>
              <tr>
                <th style={{ ...TH, fontSize: 8 }} colSpan={4}>SUMMARY TABLE</th>
              </tr>
              <tr>
                <th style={TH}>STATUS</th>
                <th style={TH}>MALE</th>
                <th style={TH}>FEMALE</th>
                <th style={TH}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['PROMOTED', maleP, femaleP, promoted],
                ['IRREGULAR', 0, 0, 0],
                ['RETAINED', maleR, femaleR, retained],
              ].map(([label, m, f, t]) => (
                <tr key={label} style={{ height: 20 }}>
                  <td style={{ ...TD_LEFT, fontWeight: 'bold', fontSize: 7 }}>{label}</td>
                  <td style={TD}>{m || ''}</td>
                  <td style={TD}>{f || ''}</td>
                  <td style={{ ...TD, fontWeight: 'bold' }}>{t || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ borderCollapse: 'collapse', width: '100%', border: '2px solid #000', fontSize: 7, color: '#000', marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ ...TH, fontSize: 7.5 }} colSpan={4}>LEVEL OF PROFICIENCY</th>
              </tr>
              <tr>
                <th style={TH}></th>
                <th style={TH}>MALE</th>
                <th style={TH}>FEMALE</th>
                <th style={TH}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['BEGINNING\n(B: 74% and below)', 'B'],
                ['DEVELOPING\n(D: 75%-79%)', 'D'],
                ['APPROACHING\nPROFICIENCY\n(AP: 80%-84%)', 'AP'],
                ['PROFICIENT\n(P: 85%-89%)', 'P'],
                ['ADVANCED\n(A: 90% and above)', 'A'],
              ].map(([label, code]) => {
                const m = profCount('M', code);
                const f = profCount('F', code);
                const t = profCount('T', code);
                return (
                  <tr key={code} style={{ height: 20 }}>
                    <td style={{ ...TD_LEFT, fontSize: 6.5, whiteSpace: 'pre-line' }}>{label}</td>
                    <td style={TD}>{m || ''}</td>
                    <td style={TD}>{f || ''}</td>
                    <td style={{ ...TD, fontWeight: 'bold' }}>{t || ''}</td>
                  </tr>
                );
              })}
              <tr style={{ background: '#D9D9D9' }}>
                <td style={{ ...TH, textAlign: 'left' }}>TOTAL</td>
                <td style={TH}>{maleStudents.filter(s => s.ga).length || ''}</td>
                <td style={TH}>{femaleStudents.filter(s => s.ga).length || ''}</td>
                <td style={TH}>{studentRows.filter(s => s.ga).length || ''}</td>
              </tr>
            </tbody>
          </table>

          {/* Signatures */}
          <div style={{ marginTop: 12, fontSize: 7, color: '#000' }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 'bold' }}>PREPARED BY:</div>
              <div style={{ marginTop: 20, borderBottom: '1px solid #000', width: '95%' }}></div>
              <div style={{ fontSize: 6.5 }}>Class Adviser (Name and Signature)</div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 'bold' }}>CERTIFIED CORRECT &amp; SUBMITTED:</div>
              <div style={{ marginTop: 20, borderBottom: '1px solid #000', width: '95%' }}></div>
              <div style={{ fontSize: 6.5 }}>School Head (Name and Signature)</div>
            </div>
            <div>
              <div style={{ fontWeight: 'bold' }}>REVIEWED BY:</div>
              <div style={{ marginTop: 20, borderBottom: '1px solid #000', width: '95%' }}></div>
              <div style={{ fontSize: 6.5 }}>Division Representative (Name and Signature)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SF5Form({ section, students, allSubjects, schoolProfile, onClose }) {
  const printRef = useRef(null);
  const [generating, setGenerating] = useState(false);
  // allGrades[term][subject][studentId] = { finalGrade }
  const [allGrades, setAllGrades] = useState({});

  // Subscribe to grades for all subjects across all terms
  useEffect(() => {
    if (!section?.id || !allSubjects?.length) return;
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
  }, [section?.id, allSubjects?.join(',')]);

  async function downloadPDF() {
    setGenerating(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const el = printRef.current;
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#fff', useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pdfW / canvas.width, pdfH / canvas.height);
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width * ratio, canvas.height * ratio);
      pdf.save(`SF5_${section?.gradeLevel || 'G'}_${section?.sectionName || 'Section'}_${section?.academicYear || 'SY'}.pdf`);
    } catch (err) {
      console.error('SF5 PDF error:', err);
    } finally {
      setGenerating(false);
    }
  }

  async function downloadExcel() {
    const XLSX = await import('xlsx');
    const sp = schoolProfile || {};
    const computeGA = (studentId) => {
      const grades = allSubjects.map(subj => {
        const tg = TERMS.map(t => allGrades[t]?.[subj]?.[studentId]?.finalGrade).filter(g => g !== undefined && g !== null && g > 0);
        return tg.length ? tg.reduce((a, b) => a + b, 0) / tg.length : null;
      }).filter(g => g !== null);
      return grades.length ? roundTwo(grades.reduce((a, b) => a + b, 0) / grades.length) : null;
    };

    const rows = [
      ['SCHOOL FORM 5 (SF 5) REPORT ON PROMOTION & LEVEL OF PROFICIENCY'],
      ['School Name:', sp.schoolName || '', 'Grade Level:', section?.gradeLevel || '', 'Section:', section?.sectionName || '', 'School Year:', section?.academicYear || ''],
      [],
      ['LRN', 'Last Name', 'First Name', 'M.I.', 'Sex', 'General Average', 'Descriptive', 'Action Taken'],
      ...students.map(s => {
        const ga = computeGA(s.id);
        return [
          s.lrn || '', s.surname || '', s.givenName || '', s.middleInitial || '',
          s.gender === 'Male' ? 'M' : s.gender === 'Female' ? 'F' : '',
          ga !== null ? ga.toFixed(2) : '',
          ga !== null ? descriptiveLetter(ga) : '',
          ga !== null ? (ga >= 75 ? 'PROMOTED' : 'RETAINED') : '',
        ];
      }),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 6 }, { wch: 6 }, { wch: 14 }, { wch: 20 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SF5');
    XLSX.writeFile(wb, `SF5_${section?.gradeLevel || 'G'}_${section?.sectionName || 'Section'}_${section?.academicYear || 'SY'}.xlsx`);
  }

  const BTN = (bg, color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: bg, color, border: 'none', borderRadius: 8,
    padding: '7px 14px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <>
      <div ref={printRef} aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0, width: 900, zIndex: -1, pointerEvents: 'none' }}>
        <SF5TableContent section={section} students={students} allGrades={allGrades} allSubjects={allSubjects} schoolProfile={schoolProfile} />
      </div>

      <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <FileText size={18} color="#2d6a4f" />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px' }}>School Form 5</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0d2218' }}>Report on Promotion &amp; Level of Proficiency</p>
          </div>
          <button onClick={downloadExcel} style={BTN('rgba(34,197,94,0.12)', '#166534')}><Download size={13} /> Excel</button>
          <button onClick={downloadPDF} disabled={generating} style={{ ...BTN('#1a3d2b', '#fff'), opacity: generating ? 0.65 : 1 }}><Download size={13} /> {generating ? 'Generating…' : 'PDF'}</button>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#4a6357' }}><X size={15} /></button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', background: '#e5e7eb', padding: 20 }}>
          <div style={{ background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', margin: '0 auto', minWidth: 'max-content' }}>
            <SF5TableContent section={section} students={students} allGrades={allGrades} allSubjects={allSubjects} schoolProfile={schoolProfile} />
          </div>
          <p style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
            General Average is computed from all available subject Final Grades across all terms.
          </p>
        </div>
      </div>
    </>
  );
}
