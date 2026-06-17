import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { X, Download, FileText } from 'lucide-react';
import { generateSF1 } from '../../../utils/formGenerators/generateSF1';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFirstFridayOfJune(year) {
  const d = new Date(year, 5, 1);
  const dow = d.getDay();
  d.setDate(1 + ((5 - dow + 7) % 7));
  return d;
}

function calcAge(birthdate, refDate) {
  if (!birthdate) return '';
  const birth = new Date(birthdate);
  const ref = refDate instanceof Date ? refDate : new Date(refDate || Date.now());
  if (isNaN(birth.getTime())) return '';
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return age < 0 ? '' : age;
}

function formatBirthdate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// ── Print-exact styles ────────────────────────────────────────────────────────

const TH = {
  background: '#D9D9D9',
  border: '1px solid #000',
  padding: '2px 3px',
  fontSize: 6.5,
  fontWeight: 'bold',
  textAlign: 'center',
  verticalAlign: 'middle',
  lineHeight: 1.25,
  color: '#000',
};

const TD = {
  border: '1px solid #000',
  padding: '1px 2px',
  fontSize: 6.5,
  textAlign: 'center',
  verticalAlign: 'middle',
  height: 17,
  color: '#000',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
};

const TD_LEFT = { ...TD, textAlign: 'left', paddingLeft: 3 };

// ── DepEd logo placeholder ────────────────────────────────────────────────────

function DepEdLogo() {
  return (
    <div style={{
      width: 55, height: 55, border: '1.5px solid #000', borderRadius: '50%',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>
      <div style={{ fontSize: 7, fontWeight: 'bold', color: '#000', textAlign: 'center', lineHeight: 1.2 }}>
        <div>DepEd</div>
        <div style={{ fontSize: 5.5, fontWeight: 'normal' }}>Republic of the</div>
        <div style={{ fontSize: 5.5, fontWeight: 'normal' }}>Philippines</div>
      </div>
    </div>
  );
}

// ── Main table content (rendered both in modal and hidden div for PDF) ─────────

function SF1TableContent({ section, students, schoolProfile, refDate }) {
  const maleCount   = students.filter(s => s.gender === 'Male').length;
  const femaleCount = students.filter(s => s.gender === 'Female').length;

  const MIN_ROWS = Math.max(40, students.length);
  const emptyRows = Math.max(0, MIN_ROWS - students.length);

  const sectionLabel = section?.sectionName || '';
  const gradeLabel   = section?.gradeLevel  || '';
  const syLabel      = section?.academicYear || '';

  const sp = schoolProfile || {};

  return (
    <div style={{
      fontFamily: 'Arial, sans-serif', background: '#fff', color: '#000',
      padding: '10px 8px', width: '100%', boxSizing: 'border-box',
    }}>
      {/* ── Form title ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
        <DepEdLogo />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#000' }}>
            School Form 1 (SF 1) School Register
          </div>
          <div style={{ fontSize: 7.5, fontStyle: 'italic', color: '#000' }}>
            (This replaces Form 1, Master List &amp; STS Form 2-Family Background and Profile)
          </div>
        </div>
        <div style={{ width: 55 }} />
      </div>

      {/* ── School info header ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 5, fontSize: 8, color: '#000' }}>
        <tbody>
          <tr>
            <td style={{ paddingRight: 4, whiteSpace: 'nowrap', fontWeight: 'bold' }}>School ID</td>
            <td style={{ borderBottom: '1px solid #000', paddingRight: 10, minWidth: 70 }}>{sp.schoolId || ''}</td>
            <td style={{ padding: '0 8px', whiteSpace: 'nowrap', fontWeight: 'bold' }}>Region</td>
            <td style={{ borderBottom: '1px solid #000', paddingRight: 10, minWidth: 80 }}>{sp.region || 'Region VIII'}</td>
            <td style={{ padding: '0 8px', whiteSpace: 'nowrap', fontWeight: 'bold' }}>Division</td>
            <td style={{ borderBottom: '1px solid #000', paddingRight: 10, minWidth: 140 }}>{sp.division || ''}</td>
            <td style={{ padding: '0 8px', whiteSpace: 'nowrap', fontWeight: 'bold' }}>District</td>
            <td style={{ borderBottom: '1px solid #000', minWidth: 130 }}>{sp.district || ''}</td>
          </tr>
          <tr>
            <td style={{ paddingRight: 4, whiteSpace: 'nowrap', paddingTop: 3, fontWeight: 'bold' }}>School Name</td>
            <td colSpan={3} style={{ borderBottom: '1px solid #000', paddingTop: 3, paddingRight: 10 }}>{sp.schoolName || ''}</td>
            <td style={{ padding: '3px 8px 0', whiteSpace: 'nowrap', fontWeight: 'bold' }}>School Year</td>
            <td style={{ borderBottom: '1px solid #000', paddingTop: 3 }}>{syLabel}</td>
            <td style={{ padding: '3px 8px 0', whiteSpace: 'nowrap', fontWeight: 'bold' }}>Grade Level</td>
            <td style={{ borderBottom: '1px solid #000', paddingTop: 3 }}>
              {gradeLabel}
              <span style={{ marginLeft: 20, fontWeight: 'bold' }}>Section</span>
              <span style={{ borderBottom: '1px solid #000', display: 'inline-block', minWidth: 80, marginLeft: 6 }}>{sectionLabel}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Main student table ── */}
      <table style={{
        borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed',
        border: '2px solid #000', color: '#000',
      }}>
        <colgroup>
          <col style={{ width: 80 }} />
          <col style={{ width: 148 }} />
          <col style={{ width: 23 }} />
          <col style={{ width: 62 }} />
          <col style={{ width: 32 }} />
          <col style={{ width: 43 }} />
          <col style={{ width: 33 }} />
          <col style={{ width: 46 }} />
          <col style={{ width: 52 }} />
          <col style={{ width: 52 }} />
          <col style={{ width: 52 }} />
          <col style={{ width: 46 }} />
          <col style={{ width: 88 }} />
          <col style={{ width: 88 }} />
          <col style={{ width: 52 }} />
          <col style={{ width: 46 }} />
          <col style={{ width: 54 }} />
          <col style={{ width: 70 }} />
        </colgroup>

        <thead>
          {/* Row 1: group headers */}
          <tr style={{ height: 36 }}>
            <th style={TH} rowSpan={2}>LRN</th>
            <th style={TH} rowSpan={2}>
              NAME<br />
              <span style={{ fontSize: 5.5, fontWeight: 'normal' }}>(Last Name, First Name, Middle Name)</span>
            </th>
            <th style={TH} rowSpan={2}>Sex<br /><span style={{ fontSize: 5.5, fontWeight: 'normal' }}>(M/F)</span></th>
            <th style={TH} rowSpan={2}>BIRTH DATE<br /><span style={{ fontSize: 5.5, fontWeight: 'normal' }}>(mm/dd/yyyy)</span></th>
            <th style={TH} rowSpan={2}>AGE as of<br />1st Friday<br />June</th>
            <th style={TH} rowSpan={2}>MOTHER<br />TONGUE</th>
            <th style={TH} rowSpan={2}>IP<br /><span style={{ fontSize: 5.5, fontWeight: 'normal' }}>(Ethnic<br />Group)</span></th>
            <th style={TH} rowSpan={2}>RELIGION</th>
            <th style={{ ...TH, fontSize: 7 }} colSpan={4}>ADDRESS</th>
            <th style={{ ...TH, fontSize: 7 }} colSpan={2}>PARENTS</th>
            <th style={{ ...TH, fontSize: 6.5 }} colSpan={2}>
              GUARDIAN<br />
              <span style={{ fontSize: 5.5, fontWeight: 'normal' }}>(If not Parent)</span>
            </th>
            <th style={TH} rowSpan={2}>
              Contact Number<br />
              <span style={{ fontSize: 5.5, fontWeight: 'normal' }}>of Parent or<br />Guardian</span>
            </th>
            <th style={TH} rowSpan={2}>
              REMARKS<br />
              <span style={{ fontSize: 5.5, fontWeight: 'normal' }}>(Please refer to the<br />legend on last page)</span>
            </th>
          </tr>
          {/* Row 2: sub-column headers */}
          <tr style={{ height: 28 }}>
            <th style={{ ...TH, fontSize: 5.5 }}>House #/<br />Street/<br />Sitio/<br />Purok</th>
            <th style={{ ...TH, fontSize: 5.5 }}>Barangay</th>
            <th style={{ ...TH, fontSize: 5.5 }}>Municipality/<br />City</th>
            <th style={{ ...TH, fontSize: 5.5 }}>Province</th>
            <th style={{ ...TH, fontSize: 5.5 }}>Father's Name<br />(Last Name, First Name,<br />Middle Name)</th>
            <th style={{ ...TH, fontSize: 5.5 }}>Mother's Maiden Name<br />(Last Name, First Name,<br />Middle Name)</th>
            <th style={{ ...TH, fontSize: 5.5 }}>Name</th>
            <th style={{ ...TH, fontSize: 5.5 }}>Relation-<br />ship</th>
          </tr>
        </thead>

        <tbody>
          {students.map(s => (
            <tr key={s.id} style={{ height: 17 }}>
              <td style={{ ...TD, fontSize: 6 }}>{s.lrn || ''}</td>
              <td style={{ ...TD_LEFT, fontSize: 6.5 }}>
                {[s.surname, s.givenName, s.middleInitial].filter(Boolean).join(', ')}
              </td>
              <td style={TD}>{s.gender === 'Male' ? 'M' : s.gender === 'Female' ? 'F' : ''}</td>
              <td style={{ ...TD, fontSize: 6 }}>{formatBirthdate(s.birthdate)}</td>
              <td style={TD}>{calcAge(s.birthdate, refDate)}</td>
              <td style={{ ...TD, fontSize: 6 }}>{s.motherTongue || ''}</td>
              <td style={{ ...TD, fontSize: 6 }}>{s.ipGroup || ''}</td>
              <td style={{ ...TD, fontSize: 6 }}>{s.religion || ''}</td>
              <td style={{ ...TD, fontSize: 6 }}>{s.houseStreet || ''}</td>
              <td style={{ ...TD, fontSize: 6 }}>{s.barangay || ''}</td>
              <td style={{ ...TD, fontSize: 6 }}>{s.municipality || ''}</td>
              <td style={{ ...TD, fontSize: 6 }}>{s.province || ''}</td>
              <td style={{ ...TD_LEFT, fontSize: 5.5 }}>{s.fatherName || ''}</td>
              <td style={{ ...TD_LEFT, fontSize: 5.5 }}>{s.motherMaidenName || ''}</td>
              <td style={{ ...TD_LEFT, fontSize: 6 }}>{s.guardianName || ''}</td>
              <td style={{ ...TD, fontSize: 6 }}>{s.guardianRelationship || ''}</td>
              <td style={{ ...TD, fontSize: 6 }}>{s.contactNumber || ''}</td>
              <td style={TD}></td>
            </tr>
          ))}

          {/* Empty filler rows to standard form length */}
          {Array.from({ length: emptyRows }, (_, i) => (
            <tr key={`e-${i}`} style={{ height: 17 }}>
              {Array.from({ length: 18 }, (_, j) => (
                <td key={j} style={j === 1 ? TD_LEFT : TD}></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Footer: legend + tally + signatures ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4, fontSize: 7, color: '#000', border: '1px solid #000' }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #000', background: '#D9D9D9', fontWeight: 'bold', fontSize: 7.5, padding: '2px 4px' }} colSpan={6}>
              List and Code of Indicators under REMARKS column
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', fontWeight: 'bold', padding: '1px 4px', width: 90 }}>Indicator</td>
            <td style={{ border: '1px solid #000', fontWeight: 'bold', padding: '1px 4px', width: 30 }}>Code</td>
            <td style={{ border: '1px solid #000', fontWeight: 'bold', padding: '1px 4px', width: 200 }}>Required Information</td>
            <td style={{ border: '1px solid #000', fontWeight: 'bold', padding: '1px 4px', width: 30 }}>Code</td>
            <td style={{ border: '1px solid #000', fontWeight: 'bold', padding: '1px 4px' }}>Required Information</td>
            <td style={{ border: '1px solid #000', padding: '1px 4px', width: 160 }} rowSpan={6}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Prepared by:</div>
              <div style={{ marginTop: 20, borderBottom: '1px solid #000', width: '90%' }}></div>
              <div style={{ fontSize: 6.5 }}>Signature of Adviser over Printed Name</div>
              <div style={{ marginTop: 8 }}>
                <span>BoSY Date: </span>
                <span style={{ display: 'inline-block', width: 50, borderBottom: '1px solid #000' }}></span>
                <span style={{ marginLeft: 6 }}>EoSY Date: </span>
                <span style={{ display: 'inline-block', width: 50, borderBottom: '1px solid #000' }}></span>
              </div>
            </td>
          </tr>
          {[
            ['Transferred Out', 'T/O', 'Name of Public (P) Private (PR) School & Effectivity Date', 'CCT', 'CCT Control/reference number & Effectivity Date'],
            ['Transferred In', 'T/I', 'Name of Public (P) Private (PR) School & Effectivity Date', 'B/A', 'Name of school last attended & Year'],
            ['Dropped', 'DRP', 'Reason and Effectivity Date', 'LWD', 'Specify'],
            ['Late Enrollment', 'LE', 'Reason (Enrollment beyond 1st Friday of June)', 'ACL', 'Specify Level & Effectivity Data'],
          ].map(([ind, code, req, code2, req2]) => (
            <tr key={ind}>
              <td style={{ border: '1px solid #000', padding: '1px 4px' }}>{ind}</td>
              <td style={{ border: '1px solid #000', padding: '1px 4px', fontWeight: 'bold', textAlign: 'center' }}>{code}</td>
              <td style={{ border: '1px solid #000', padding: '1px 4px' }}>{req}</td>
              <td style={{ border: '1px solid #000', padding: '1px 4px', fontWeight: 'bold', textAlign: 'center' }}>{code2}</td>
              <td style={{ border: '1px solid #000', padding: '1px 4px' }}>{req2}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000', background: '#D9D9D9', fontWeight: 'bold', padding: '1px 4px', textAlign: 'center' }}>REGISTERED</td>
            <td style={{ border: '1px solid #000', fontWeight: 'bold', padding: '1px 4px', textAlign: 'center' }}>BoSY</td>
            <td colSpan={2} style={{ border: '1px solid #000', fontWeight: 'bold', padding: '1px 4px', textAlign: 'center' }}>EoSY</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '1px 4px', fontWeight: 'bold' }}>MALE</td>
            <td style={{ border: '1px solid #000', padding: '1px 4px', textAlign: 'center' }}></td>
            <td style={{ border: '1px solid #000', padding: '1px 4px', textAlign: 'center' }}>{maleCount}</td>
            <td colSpan={2} style={{ border: '1px solid #000', padding: '1px 4px' }}></td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '1px 4px', fontWeight: 'bold' }}>FEMALE</td>
            <td style={{ border: '1px solid #000', padding: '1px 4px', textAlign: 'center' }}></td>
            <td style={{ border: '1px solid #000', padding: '1px 4px', textAlign: 'center' }}>{femaleCount}</td>
            <td colSpan={2} style={{ border: '1px solid #000', padding: '1px 4px' }}></td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '1px 4px', fontWeight: 'bold' }}>TOTAL</td>
            <td style={{ border: '1px solid #000', padding: '1px 4px', textAlign: 'center' }}></td>
            <td style={{ border: '1px solid #000', padding: '1px 4px', textAlign: 'center' }}>{students.length}</td>
            <td colSpan={2} style={{ border: '1px solid #000', padding: '1px 4px' }}></td>
            <td style={{ border: '1px solid #000', padding: '1px 4px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Certified Correct:</div>
              <div style={{ marginTop: 20, borderBottom: '1px solid #000', width: '90%' }}></div>
              <div style={{ fontSize: 6.5 }}>Signature of School Head over Printed Name</div>
              <div style={{ marginTop: 8 }}>
                <span>BoSY Date: </span>
                <span style={{ display: 'inline-block', width: 50, borderBottom: '1px solid #000' }}></span>
                <span style={{ marginLeft: 6 }}>EoSY Date: </span>
                <span style={{ display: 'inline-block', width: 50, borderBottom: '1px solid #000' }}></span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SF1Form({ section, students, schoolProfile, onClose }) {
  const printRef    = useRef(null);
  const [generating,     setGenerating]     = useState(false);
  const [generatingXlsx, setGeneratingXlsx] = useState(false);

  const syStart = section?.academicYear?.split('-')[0];
  const refDate = syStart ? getFirstFridayOfJune(parseInt(syStart)) : new Date();

  // ── PDF export ──────────────────────────────────────────────────────────────
  async function downloadPDF() {
    setGenerating(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const el = printRef.current;
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        width: el.scrollWidth,
        height: el.scrollHeight,
      });

      const imgData  = canvas.toDataURL('image/png');
      const pdfW     = 356;    // legal landscape width mm
      const pdfH     = 216;    // legal landscape height mm
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pdfH, pdfW] });

      const imgW = canvas.width;
      const imgH = canvas.height;
      const ratio = Math.min(pdfW / imgW, pdfH / imgH);
      const finalW = imgW * ratio;
      const finalH = imgH * ratio;
      const offsetX = (pdfW - finalW) / 2;
      const offsetY = (pdfH - finalH) / 2;

      pdf.addImage(imgData, 'PNG', offsetX, offsetY, finalW, finalH);
      pdf.save(`SF1_${section?.gradeLevel || 'G'}_${section?.sectionName || 'Section'}_${section?.academicYear || 'SY'}.pdf`);
    } catch (err) {
      console.error('SF1 PDF error:', err);
    } finally {
      setGenerating(false);
    }
  }

  // ── Excel export ────────────────────────────────────────────────────────────
  function downloadExcel() {
    const sp  = schoolProfile || {};
    const rows = [
      ['SCHOOL FORM 1 (SF 1) SCHOOL REGISTER'],
      ['(This replaces Form 1, Master List & STS Form 2-Family Background and Profile)'],
      [],
      ['School ID:', sp.schoolId || '', 'Region:', sp.region || 'Region VIII', 'Division:', sp.division || '', 'District:', sp.district || ''],
      ['School Name:', sp.schoolName || '', 'School Year:', section?.academicYear || '', 'Grade Level:', section?.gradeLevel || '', 'Section:', section?.sectionName || ''],
      [],
      [
        'LRN', 'Last Name', 'First Name', 'Middle Initial', 'Sex (M/F)',
        'Birth Date (mm/dd/yyyy)', 'Age (as of 1st Fri June)',
        'Mother Tongue', 'IP (Ethnic Group)', 'Religion',
        'House#/Street/Sitio/Purok', 'Barangay', 'Municipality/City', 'Province',
        "Father's Name (Last, First, Middle)",
        "Mother's Maiden Name (Last, First, Middle)",
        'Guardian Name', 'Relationship', 'Contact Number', 'Remarks',
      ],
      ...students.map(s => [
        s.lrn || '',
        s.surname || '',
        s.givenName || '',
        s.middleInitial || '',
        s.gender === 'Male' ? 'M' : s.gender === 'Female' ? 'F' : '',
        formatBirthdate(s.birthdate),
        calcAge(s.birthdate, refDate),
        s.motherTongue || '',
        s.ipGroup || '',
        s.religion || '',
        s.houseStreet || '',
        s.barangay || '',
        s.municipality || '',
        s.province || '',
        s.fatherName || '',
        s.motherMaidenName || '',
        s.guardianName || '',
        s.guardianRelationship || '',
        s.contactNumber || '',
        '',
      ]),
      [],
      ['MALE:', students.filter(s => s.gender === 'Male').length,
       'FEMALE:', students.filter(s => s.gender === 'Female').length,
       'TOTAL:', students.length],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 8 }, { wch: 6 },
      { wch: 14 }, { wch: 8 },
      { wch: 14 }, { wch: 10 }, { wch: 12 },
      { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
      { wch: 28 }, { wch: 28 },
      { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SF1');
    XLSX.writeFile(wb, `SF1_${section?.gradeLevel || 'G'}_${section?.sectionName || 'Section'}_${section?.academicYear || 'SY'}.xlsx`);
  }

  // ── ExcelJS pixel-perfect SF1 download ─────────────────────────────────────
  async function downloadSF1Official() {
    setGeneratingXlsx(true);
    try {
      const sp = schoolProfile || {};
      await generateSF1(
        {
          schoolName:   sp.schoolName   || '',
          schoolId:     sp.schoolId     || '',
          region:       sp.region       || 'Region VIII',
          division:     sp.division     || '',
          district:     sp.district     || '',
          academicYear: section?.academicYear  || '',
          gradeLevel:   section?.gradeLevel    || '',
          sectionName:  section?.sectionName   || '',
        },
        students,
      );
    } catch (err) {
      console.error('SF1 Excel error:', err);
    } finally {
      setGeneratingXlsx(false);
    }
  }

  // ── Shared button style ─────────────────────────────────────────────────────
  const BTN = (bg, color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: bg, color,
    border: 'none', borderRadius: 8, padding: '7px 14px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <>
      {/* Hidden off-screen div for PDF capture — always rendered */}
      <div
        ref={printRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', top: 0, width: 1200, zIndex: -1, pointerEvents: 'none' }}
      >
        <SF1TableContent
          section={section}
          students={students}
          schoolProfile={schoolProfile}
          refDate={refDate}
        />
      </div>

      {/* ── Modal ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <FileText size={18} color="#2d6a4f" />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              School Form 1
            </p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0d2218' }}>School Register</p>
          </div>

          <button
            onClick={downloadExcel}
            style={BTN('rgba(34,197,94,0.12)', '#166534')}
          >
            <Download size={13} /> Excel (simple)
          </button>
          <button
            onClick={downloadSF1Official}
            disabled={generatingXlsx}
            style={{ ...BTN('rgba(34,197,94,0.9)', '#fff'), opacity: generatingXlsx ? 0.65 : 1 }}
          >
            <Download size={13} /> {generatingXlsx ? 'Generating…' : 'SF1 Excel (Official)'}
          </button>
          <button
            onClick={downloadPDF}
            disabled={generating}
            style={{ ...BTN('#1a3d2b', '#fff'), opacity: generating ? 0.65 : 1 }}
          >
            <Download size={13} /> {generating ? 'Generating…' : 'PDF'}
          </button>
          <button
            onClick={onClose}
            style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#4a6357' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable form preview */}
        <div style={{ flex: 1, overflow: 'auto', background: '#e5e7eb', padding: 20 }}>
          <div style={{
            background: '#fff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            minWidth: 'max-content',
            margin: '0 auto',
          }}>
            <SF1TableContent
              section={section}
              students={students}
              schoolProfile={schoolProfile}
              refDate={refDate}
            />
          </div>
          <p style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
            Scroll right to see all columns · Click "PDF" for a print-ready download
          </p>
        </div>
      </div>
    </>
  );
}
