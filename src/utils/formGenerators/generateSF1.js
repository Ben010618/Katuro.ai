import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ─── helpers ──────────────────────────────────────────────────────────────────

function firstFridayOfJune(yearStr) {
  const year = parseInt((yearStr || '').split('-')[0]) || new Date().getFullYear();
  const d = new Date(year, 5, 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return d;
}

function calcAge(birthdate, refDate) {
  if (!birthdate) return '';
  const birth = new Date(birthdate);
  if (isNaN(birth.getTime())) return '';
  let age = refDate.getFullYear() - birth.getFullYear();
  const m = refDate.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < birth.getDate())) age--;
  return age < 0 ? '' : age;
}

function formatBD(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

// ─── main generator ───────────────────────────────────────────────────────────

export async function generateSF1(sectionData, students) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'kaTuro.ai';

  const ws = workbook.addWorksheet('School Form 1 (SF1)', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 5,           // Legal
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25, right: 0.25,
        top: 0.75,  bottom: 0.75,
        header: 0.3, footer: 0.3,
      },
    },
  });

  // ── column widths (27 columns = A–AA) ────────────────────────────────────
  const colWidths = [
    3, 38.109375, 10.44140625, 3.5546875, 19.6640625, 22.6640625,
    8.88671875, 18.5546875, 12.88671875, 1.33203125, 20.88671875,
    18.0, 16.5546875, 19.109375, 18.5546875, 18.6640625, 19.33203125,
    0.88671875, 17.88671875, 15.88671875, 15.109375, 5.109375,
    28.5546875, 18.44140625, 13.0, 20.44140625, 24.5546875,
  ];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ── helpers ───────────────────────────────────────────────────────────────
  const thin = { style: 'thin' };

  function setCell(ref, value, {
    bold = false, size = 16, halign = 'center', valign = 'middle',
    wrap = false, italic = false,
    borderAll = false,
    borderTop = false, borderBottom = false,
    borderLeft = false, borderRight = false,
  } = {}) {
    const cell = ws.getCell(ref);
    cell.value = value;
    cell.font  = { name: 'Arial Narrow', size, bold, italic };
    cell.alignment = { horizontal: halign, vertical: valign, wrapText: wrap };
    cell.border = {
      top:    (borderAll || borderTop)    ? thin : undefined,
      bottom: (borderAll || borderBottom) ? thin : undefined,
      left:   (borderAll || borderLeft)   ? thin : undefined,
      right:  (borderAll || borderRight)  ? thin : undefined,
    };
  }

  function merge(range) { ws.mergeCells(range); }

  function rowH(rowNum, height) { ws.getRow(rowNum).height = height; }

  // ── row heights ───────────────────────────────────────────────────────────
  rowH(1, 28.2);
  rowH(2, 15.6);
  rowH(4, 49.5);
  rowH(5, 12);
  rowH(6, 64.5);
  rowH(7, 15.75);
  rowH(8, 42);
  rowH(9, 90);
  for (let r = 10; r <= 58; r++) rowH(r, 45.9);
  rowH(59, 33);
  rowH(60, 36);
  rowH(61, 53.25);
  rowH(62, 54);
  rowH(63, 23.25);
  rowH(64, 25.2);

  // ── ROW 1 — title ─────────────────────────────────────────────────────────
  merge('A1:AA1');
  setCell('A1', 'School Form 1 (SF 1) School Register', {
    bold: true, size: 22, halign: 'center', valign: 'middle',
  });

  // ── ROW 2 — subtitle ──────────────────────────────────────────────────────
  merge('A2:AA2');
  setCell('A2',
    '(This replaces  Form 1, Master List & STS Form 2-Family Background and Profile)',
    { size: 12, halign: 'center' },
  );

  // ── ROW 4 — school info line 1 ────────────────────────────────────────────
  merge('D4:E4');
  setCell('D4', 'School ID', { size: 28, halign: 'right' });

  merge('F4:G4');
  ws.getCell('F4').value = sectionData.schoolId || '';
  ws.getCell('F4').font  = { name: 'Arial Narrow', size: 28 };
  ws.getCell('F4').border = { bottom: thin };

  merge('H4:I4');
  setCell('H4', sectionData.region || 'Region VIII', { size: 28, halign: 'left', valign: 'middle' });

  merge('L4:M4');
  setCell('L4', 'Division', { size: 28, halign: 'right', valign: 'middle' });

  merge('N4:Q4');
  ws.getCell('N4').value = sectionData.division || '';
  ws.getCell('N4').font  = { name: 'Arial Narrow', size: 28 };
  ws.getCell('N4').border = { bottom: thin };

  setCell('S4', 'District', { size: 28, halign: 'right', valign: 'middle' });

  merge('U4:X4');
  ws.getCell('U4').value = sectionData.district || '';
  ws.getCell('U4').font  = { name: 'Arial Narrow', size: 28 };
  ws.getCell('U4').border = { bottom: thin };

  // ── ROW 6 — school info line 2 ────────────────────────────────────────────
  merge('C6:E6');
  setCell('C6', 'School Name', { size: 28, halign: 'right', valign: 'middle' });

  merge('F6:L6');
  ws.getCell('F6').value = sectionData.schoolName || '';
  ws.getCell('F6').font  = { name: 'Arial Narrow', size: 28 };
  ws.getCell('F6').border = { bottom: thin };

  merge('M6:O6');
  setCell('M6', 'School Year', { size: 28, halign: 'right', valign: 'middle' });

  merge('P6:Q6');
  ws.getCell('P6').value = sectionData.academicYear || '';
  ws.getCell('P6').font  = { name: 'Arial Narrow', size: 28 };
  ws.getCell('P6').border = { bottom: thin };

  setCell('S6', 'Grade Level', { size: 24, halign: 'right', valign: 'middle' });

  merge('U6:V6');
  ws.getCell('U6').value = sectionData.gradeLevel || '';
  ws.getCell('U6').font  = { name: 'Arial Narrow', size: 28 };
  ws.getCell('U6').border = { bottom: thin };

  setCell('W6', 'Section', { size: 28, halign: 'right', valign: 'middle', borderLeft: true });

  merge('X6:Z6');
  ws.getCell('X6').value = sectionData.sectionName || '';
  ws.getCell('X6').font  = { name: 'Arial Narrow', size: 28 };
  ws.getCell('X6').border = { bottom: thin };

  // ── ROWS 8–9 — column headers ─────────────────────────────────────────────
  const TH = (extra = {}) => ({
    bold: true, size: 16, borderAll: true, valign: 'middle', halign: 'center', wrap: true, ...extra,
  });

  merge('A8:A9');  setCell('A8', '',  TH());
  merge('B8:B9');  setCell('B8', 'LRN', TH());
  merge('C8:F9');  setCell('C8', 'NAME\n(Last Name, First Name, Middle Name)', TH());
  merge('G8:G9');  setCell('G8', 'Sex\n(M/F)', TH());
  merge('H8:H9');  setCell('H8', 'BIRTH DATE\n(mm/dd/yyyy)', TH());
  merge('I8:I9');  setCell('I8', 'AGE as of 1st Friday June', TH());
  merge('J8:K9');  setCell('J8', 'BIRTH PLACE\n(Province)', TH());
  merge('L8:L9');  setCell('L8', 'MOTHER TONGUE', TH());
  merge('M8:M9');  setCell('M8', 'IP\n(Ethnic Group)', TH());
  merge('N8:N9');  setCell('N8', 'RELIGION', TH());

  // Address group
  merge('O8:S8');  setCell('O8', 'ADDRESS', TH());
  setCell('O9', 'House #/ Street/\nSitio/ Purok', TH());
  setCell('P9', 'Barangay', TH());
  setCell('Q9', 'Municipality/\nCity', TH());
  setCell('R9', 'Province', TH());
  setCell('S9', '', TH());

  // Parents group
  merge('T8:W8');  setCell('T8', 'PARENTS', TH());
  merge('T9:U9');  setCell('T9', "Father's Name\n(Last Name, First Name, Middle Name)", TH());
  merge('V9:W9');  setCell('V9', "Mother's Maiden Name\n(Last Name, First Name, Middle Name)", TH());

  // Guardian group
  merge('X8:Y8');  setCell('X8', 'GUARDIAN\n(If not Parent)', TH({ wrap: true }));
  setCell('X9', 'Name', TH());
  setCell('Y9', 'Relation-\nship', TH());

  merge('Z8:Z9');  setCell('Z8', 'Contact Number of Parent or Guardian', TH());
  merge('AA8:AA9'); setCell('AA8', 'REMARKS', TH());

  // ── ROWS 10–58 — student data ─────────────────────────────────────────────
  const refDate = firstFridayOfJune(sectionData.academicYear);

  const TD = (extra = {}) => ({
    size: 16, borderAll: true, valign: 'middle', halign: 'center', ...extra,
  });

  students.forEach((s, idx) => {
    const r = 10 + idx;
    if (r > 58) return;

    // normalise field names (Firestore uses birthdate lowercase-d)
    const birthdate = s.birthDate || s.birthdate || '';
    const motherName = s.motherMaidenName || s.motherName || '';

    setCell(`A${r}`, idx + 1,    TD());
    setCell(`B${r}`, s.lrn || '', TD());

    merge(`C${r}:F${r}`);
    setCell(`C${r}`,
      [s.surname, s.givenName, s.middleInitial].filter(Boolean).join(', '),
      TD({ halign: 'left' }),
    );

    setCell(`G${r}`, s.gender === 'Male' ? 'M' : s.gender === 'Female' ? 'F' : '', TD());
    setCell(`H${r}`, formatBD(birthdate), TD());
    setCell(`I${r}`, calcAge(birthdate, refDate), TD());

    merge(`J${r}:K${r}`);
    setCell(`J${r}`, s.birthPlace || '', TD());

    setCell(`L${r}`, s.motherTongue || '',       TD());
    setCell(`M${r}`, s.ipGroup || '',             TD());
    setCell(`N${r}`, s.religion || '',            TD());
    setCell(`O${r}`, s.houseStreet || '',         TD({ halign: 'left' }));
    setCell(`P${r}`, s.barangay || '',            TD({ halign: 'left' }));
    setCell(`Q${r}`, s.municipality || '',        TD({ halign: 'left' }));

    merge(`R${r}:S${r}`);
    setCell(`R${r}`, s.province || '',            TD({ halign: 'left' }));

    merge(`T${r}:U${r}`);
    setCell(`T${r}`, s.fatherName || '',          TD({ halign: 'left' }));

    merge(`V${r}:W${r}`);
    setCell(`V${r}`, motherName,                  TD({ halign: 'left' }));

    setCell(`X${r}`, s.guardianName || '',        TD({ halign: 'left' }));
    setCell(`Y${r}`, s.guardianRelationship || '', TD());
    setCell(`Z${r}`, s.contactNumber || '',       TD());
    setCell(`AA${r}`, s.remarks || '',            TD());
  });

  // fill remaining empty rows
  for (let r = 10 + students.length; r <= 58; r++) {
    setCell(`A${r}`,  '', { borderAll: true });
    setCell(`B${r}`,  '', { borderAll: true });
    merge(`C${r}:F${r}`);  setCell(`C${r}`, '', { borderAll: true });
    setCell(`G${r}`,  '', { borderAll: true });
    setCell(`H${r}`,  '', { borderAll: true });
    setCell(`I${r}`,  '', { borderAll: true });
    merge(`J${r}:K${r}`);  setCell(`J${r}`, '', { borderAll: true });
    setCell(`L${r}`,  '', { borderAll: true });
    setCell(`M${r}`,  '', { borderAll: true });
    setCell(`N${r}`,  '', { borderAll: true });
    setCell(`O${r}`,  '', { borderAll: true });
    setCell(`P${r}`,  '', { borderAll: true });
    setCell(`Q${r}`,  '', { borderAll: true });
    merge(`R${r}:S${r}`);  setCell(`R${r}`, '', { borderAll: true });
    merge(`T${r}:U${r}`);  setCell(`T${r}`, '', { borderAll: true });
    merge(`V${r}:W${r}`);  setCell(`V${r}`, '', { borderAll: true });
    setCell(`X${r}`,  '', { borderAll: true });
    setCell(`Y${r}`,  '', { borderAll: true });
    setCell(`Z${r}`,  '', { borderAll: true });
    setCell(`AA${r}`, '', { borderAll: true });
  }

  // ── ROWS 59–64 — footer / legend ──────────────────────────────────────────
  const maleCount   = students.filter(s => s.gender === 'Male').length;
  const femaleCount = students.filter(s => s.gender === 'Female').length;

  // Row 59
  merge('A59:Q59');
  setCell('A59',
    '                                                            List and Code of Indicators under REMARKS column',
    { bold: true, size: 24, halign: 'left', borderTop: true },
  );
  setCell('W59', 'Prepared by:', { size: 22, halign: 'left', borderTop: true });
  merge('Z59:AA59');
  setCell('Z59', 'Certified Correct:', { size: 22, halign: 'left', borderTop: true });

  // Row 60
  setCell('A60', 'Indicator',          { bold: true, size: 22, halign: 'left', borderAll: true });
  setCell('C60', 'Code',               { bold: true, size: 22, halign: 'left', borderAll: true });
  setCell('E60', 'Required Information',{ bold: true, size: 22, halign: 'left', borderTop: true, borderBottom: true });
  setCell('K60', 'Indicator',          { bold: true, size: 22, halign: 'left', borderAll: true });
  setCell('M60', 'Code',               { bold: true, size: 22, halign: 'center', borderAll: true });
  setCell('N60', 'Required Information',{ bold: true, size: 22, halign: 'left', borderTop: true, borderBottom: true });
  setCell('S60', 'REGISTERED',         { bold: true, size: 12, halign: 'center', borderAll: true });
  setCell('T60', 'BoSY',               { size: 20, halign: 'center', borderAll: true });
  setCell('U60', 'EoSY',               { size: 20, halign: 'center', borderAll: true });

  // Row 61 — Transferred Out / CCT / MALE
  setCell('A61', 'Transferred Out',    { bold: true, size: 20, halign: 'left', borderLeft: true });
  setCell('C61', 'T/O',               { bold: true, size: 20, halign: 'center', borderLeft: true, borderRight: true });
  merge('D61:I61');
  setCell('D61', 'Name of Public (P) Private (PR) School & Effectivity Date', { bold: true, size: 20, halign: 'left', borderAll: true });
  setCell('K61', 'CCT Recipient',      { bold: true, size: 20, halign: 'left', borderLeft: true });
  setCell('M61', 'CCT',               { bold: true, size: 20, halign: 'center', borderLeft: true, borderRight: true });
  merge('N61:Q61');
  setCell('N61', 'CCT Control/reference number & Effectivity Date', { bold: true, size: 20, halign: 'left', borderRight: true });
  setCell('S61', 'MALE',              { bold: true, size: 14, halign: 'center', borderAll: true });
  setCell('T61', maleCount,           { size: 14,   halign: 'center', borderAll: true });

  // Row 62 — Transferred In / Balik-Aral / FEMALE + signatures
  setCell('A62', 'Transferred IN',    { bold: true, size: 20, halign: 'left', borderLeft: true });
  setCell('C62', 'T/I',               { bold: true, size: 20, halign: 'center', borderLeft: true, borderRight: true });
  merge('D62:I62');
  setCell('D62', 'Name of Public (P) Private (PR) School & Effectivity Date', { bold: true, size: 20, halign: 'left', borderAll: true });
  setCell('K62', 'Balik-Aral',        { bold: true, size: 20, halign: 'left', borderLeft: true });
  setCell('M62', 'B/A',               { bold: true, size: 20, halign: 'center', borderLeft: true, borderRight: true });
  setCell('N62', 'Name of school last attended & Year', { bold: true, size: 20, halign: 'left' });
  setCell('S62', 'FEMALE',            { bold: true, size: 14, halign: 'center', borderAll: true });
  setCell('T62', femaleCount,         { size: 14,   halign: 'center', borderAll: true });
  merge('W62:X62');
  setCell('W62', '(Signature of Adviser over Printed Name)', { size: 14, halign: 'center', borderTop: true });
  merge('Z62:AA62');
  setCell('Z62', '(Signature of School Head over Printed Name)', { size: 14, halign: 'center', borderTop: true });

  // Row 63 — Dropped / LWD / TOTAL
  setCell('A63', 'Dropped',           { bold: true, size: 20, halign: 'left', borderLeft: true });
  setCell('C63', 'DRP',               { bold: true, size: 20, halign: 'center', borderLeft: true, borderRight: true });
  merge('D63:I63');
  setCell('D63', 'Reason and Effectivity Date', { bold: true, size: 20, halign: 'left', borderAll: true });
  setCell('K63', 'Learner With Disability', { bold: true, size: 20, halign: 'left', borderLeft: true });
  setCell('M63', 'LWD',               { bold: true, size: 20, halign: 'center', borderLeft: true, borderRight: true });
  setCell('N63', 'Specify',           { bold: true, size: 20, halign: 'left' });
  merge('S63:S64');
  setCell('S63', 'TOTAL',             { bold: true, size: 14, halign: 'center', borderAll: true, valign: 'middle' });
  merge('T63:T64');
  setCell('T63', students.length,     { size: 14, halign: 'center', borderAll: true, valign: 'middle' });

  // Row 64 — Late Enrollment / ACL / BoSY–EoSY dates
  setCell('A64', 'Late Enrollment',   { bold: true, size: 20, halign: 'left', borderLeft: true, borderBottom: true });
  setCell('C64', 'LE',                { bold: true, size: 20, halign: 'center', borderLeft: true, borderRight: true, borderBottom: true });
  merge('D64:I64');
  setCell('D64', 'Reason (Enrollment beyond 1st Friday of June)', { bold: true, size: 20, halign: 'left', borderAll: true });
  setCell('K64', 'Accelerated',       { bold: true, size: 20, halign: 'left', borderLeft: true, borderBottom: true });
  setCell('M64', 'ACL',               { bold: true, size: 20, halign: 'center', borderLeft: true, borderRight: true, borderBottom: true });
  setCell('N64', 'Specify Level & Effectivity Data', { bold: true, size: 20, halign: 'left', borderBottom: true });
  setCell('W64', 'BoSY Date:                  EoSY Date:', { size: 20, borderBottom: true });
  setCell('Z64', 'BoSY Date:              EoSY Date:',    { size: 20, borderBottom: true });

  // ── download ──────────────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fname =
    `SF1_${sectionData.gradeLevel || 'G'}_${sectionData.sectionName || 'Section'}_${sectionData.academicYear || 'SY'}.xlsx`;
  saveAs(blob, fname);
}
