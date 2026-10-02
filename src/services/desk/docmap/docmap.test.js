/* global Buffer */
import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import {
  Document, Packer, Paragraph, TextRun, Header, Table, TableRow, TableCell, ImageRun, ShadingType, BorderStyle,
} from 'docx';
import {
  colToIndex, indexToCol, parseAddr, makeAddr, parseRange, inRange,
  buildXlsxMap, sheetGrid, getCell, applyXlsxEdits, buildDocxMap, applyDocxEdits,
  renderMapForAI, describeMap, buildMap, applyEdits,
} from './index';
import { parseXml, kids, textOf, decodeEntities } from './xml';
import { shiftFormula, formatKind, serialToDateText } from './xlsxMap';

// 1×1 transparent PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const TRICKY = 'A & B <c> "q" \'s\' Ñoño ñ 😀';

async function entries(bytes) {
  const z = await JSZip.loadAsync(bytes);
  const out = {};
  for (const name of Object.keys(z.files)) {
    if (!z.files[name].dir) out[name] = await z.file(name).async('uint8array');
  }
  return { order: Object.keys(z.files), files: out };
}

const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

async function expectUntouched(before, after, changed) {
  const a = await entries(before);
  const b = await entries(after);
  expect(b.order.filter((n) => a.order.includes(n))).toEqual(a.order.filter((n) => b.order.includes(n)));
  for (const name of Object.keys(a.files)) {
    if (changed.includes(name)) continue;
    expect(b.files[name], name).toBeDefined();
    expect(sameBytes(a.files[name], b.files[name]), `${name} byte-identical`).toBe(true);
  }
}

async function makeXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SF2');
  ws.getCell('A1').value = 'School Form 2';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
  ws.mergeCells('A1:F1');
  ['No.', 'Name', 'Q1', 'Q2', 'Total', 'Date'].forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  ws.getCell('A5').value = 1;
  ws.getCell('B5').value = 'Dela Cruz, Juan P.';
  ws.getCell('C5').value = 40;
  ws.getCell('C5').border = { top: { style: 'thin' } };
  ws.getCell('C5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  ws.getCell('D5').value = 45;
  ws.getCell('E5').value = { formula: 'SUM(C5:D5)', result: 85 };
  ws.getCell('F5').value = new Date(Date.UTC(2026, 5, 15));
  ws.getCell('G5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
  ws.getCell('G5').border = { bottom: { style: 'double' } };
  ws.getCell('AA5').value = 'beyondZ';
  ws.getCell('AB5').value = 28;
  ws.getCell('C6').value = 0.875;
  ws.getCell('C6').numFmt = '0.00%';
  ws.getCell('D6').value = 1234.5;
  ws.getCell('D6').numFmt = '#,##0.00';
  ws.getCell('F6').value = 46000;
  ws.getCell('F6').numFmt = 'dd/mm/yyyy';
  ws.getCell('B6').value = TRICKY;
  ws.getCell('B7').value = true;
  const img = wb.addImage({ buffer: PNG, extension: 'png' });
  ws.addImage(img, { tl: { col: 7, row: 0 }, ext: { width: 20, height: 20 } });
  const hidden = wb.addWorksheet('Hidden', { state: 'hidden' });
  hidden.getCell('A1').value = 'secret';
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

async function makeDocx() {
  const thin = { style: BorderStyle.SINGLE, size: 8, color: 'FF0000' };
  const doc = new Document({
    sections: [{
      headers: { default: new Header({ children: [new Paragraph('Republic of the Philippines')] }) },
      children: [
        new Paragraph({ children: [new TextRun({ text: 'Name: ', bold: true }), new TextRun('Juan')] }),
        new Paragraph({ children: [new TextRun('School Year 2025-'), new TextRun({ text: '2026', bold: true })] }),
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'No.', bold: true, size: 28 })] })],
                  shading: { fill: 'D9E2F3', type: ShadingType.CLEAR, color: 'auto' },
                  borders: { top: thin, bottom: thin, left: thin, right: thin },
                }),
                new TableCell({ children: [new Paragraph('Name of Learner')] }),
                new TableCell({ children: [new Paragraph('Remarks')] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '1', bold: true, size: 28 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Dela Cruz', italics: true })] })], columnSpan: 2 }),
              ],
            }),
          ],
        }),
        new Paragraph({ children: [new ImageRun({ type: 'png', data: PNG, transformation: { width: 10, height: 10 } })] }),
        new Paragraph('Prepared by: ____'),
        new Paragraph(TRICKY),
      ],
    }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

// Build a zip from {path: string} preserving order.
async function zipOf(files) {
  const z = new JSZip();
  for (const [p, c] of Object.entries(files)) z.file(p, c);
  return z.generateAsync({ type: 'uint8array' });
}

const CT = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';

async function makePrefixedXlsx() {
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipOf({
    '[Content_Types].xml': CT,
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="/xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><x:workbookPr date1904="1"/><x:sheets><x:sheet name="Data &amp; Co" sheetId="1" r:id="rId1"/></x:sheets><x:definedNames><x:definedName name="Area">'Data &amp; Co'!$A$1:$AB$3</x:definedName></x:definedNames></x:workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
    'xl/sharedStrings.xml': '<?xml version="1.0"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:si><x:t>Tom &amp; Jerry &lt;3 &quot;hi&quot; &apos;yo&apos;</x:t></x:si><x:si><x:r><x:rPr><x:b/></x:rPr><x:t xml:space="preserve">Rich </x:t></x:r><x:r><x:t>&#209;o&#xF1;o &#x1F600;</x:t></x:r><x:rPh sb="0" eb="1"><x:t>PHONETIC</x:t></x:rPh></x:si></x:sst>',
    'xl/styles.xml': '<?xml version="1.0"?><x:styleSheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:numFmts count="1"><x:numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></x:numFmts><x:cellXfs count="3"><x:xf numFmtId="0"/><x:xf numFmtId="164"/><x:xf numFmtId="4"/></x:cellXfs></x:styleSheet>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0"?>\n<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:dimension ref="A1:AB3"/><x:cols><x:col min="3" max="3" style="2" width="10"/></x:cols><x:sheetData>'
      + '<x:row r="1" spans="1:28"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="AA1" t="s"><x:v>1</x:v></x:c><x:c s="2" r="AB1"><x:v>3.5</x:v></x:c></x:row>'
      + '<x:row r="3" spans="1:2" s="2" customFormat="1"><x:c r="A3" t="inlineStr"><x:is><x:t xml:space="preserve">  padded  </x:t></x:is></x:c><x:c r="B3" s="1"><x:v>0</x:v></x:c><x:c r="D3" t="e"><x:v>#N/A</x:v></x:c><x:c r="E3"><x:f t="shared" ref="E3:F3" si="0">A1&amp;B3</x:f><x:v>x</x:v></x:c><x:c r="F3"><x:f t="shared" si="0"/><x:v>y</x:v></x:c></x:row>'
      + '</x:sheetData><x:mergeCells count="1"><x:mergeCell ref="G1:H2"/></x:mergeCells></x:worksheet>',
  });
}

function makeComplexDocx() {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const body = '<w:p><w:pPr><w:pStyle w:val="Title"/><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Tab</w:t></w:r><w:r><w:tab/><w:t>bed</w:t><w:br/><w:t>line</w:t></w:r></w:p>'
    + '<w:p><w:ins w:id="1"><w:r><w:t>Inserted </w:t></w:r></w:ins><w:del w:id="2"><w:r><w:delText>Deleted</w:delText></w:r></w:del><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>7</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
    + '<w:sdt><w:sdtPr><w:alias w:val="ctl"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t xml:space="preserve">In control </w:t></w:r></w:p></w:sdtContent></w:sdt>'
    + '<w:tbl><w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Outer</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Inner A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Inner B</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p/></w:tc><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:ins w:id="9" w:author="x"/></w:rPr></w:pPr></w:p></w:tc></w:tr>'
    + '<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc><w:tc><w:p><w:r><w:t>&#209;&amp;&lt;</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:bookmarkStart w:id="0" w:name="bm"/><w:r><w:rPr><w:i/></w:rPr><w:t>Keep bookmark</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>'
    + '<w:sectPr/>';
  return zipOf({
    '[Content_Types].xml': CT,
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
    'word/footer2.xml': `<?xml version="1.0"?><w:ftr ${W}><w:p><w:r><w:t>Page footer</w:t></w:r></w:p></w:ftr>`,
  });
}

describe('addr', () => {
  it('converts columns and addresses', () => {
    expect(colToIndex('A')).toBe(0);
    expect(colToIndex('Z')).toBe(25);
    expect(colToIndex('AA')).toBe(26);
    expect(colToIndex('XFD')).toBe(16383);
    expect(indexToCol(27)).toBe('AB');
    expect(indexToCol(16383)).toBe('XFD');
    expect(parseAddr('F12')).toEqual({ col: 5, row: 12 });
    expect(parseAddr('$AB$3')).toEqual({ col: 27, row: 3 });
    expect(parseAddr('12F')).toBeNull();
    expect(makeAddr(27, 4)).toBe('AB4');
    expect(parseRange('D3:A1')).toEqual({ start: { col: 0, row: 1 }, end: { col: 3, row: 3 } });
    expect(inRange('B2', 'A1:D3')).toBe(true);
    expect(inRange('E2', 'A1:D3')).toBe(false);
  });
});

describe('xml scanner', () => {
  it('handles prefixes, self-closing tags, attributes with > and entities', () => {
    const xml = '<?xml version="1.0"?><!-- c --><a:root x="1&gt;2" y=\'q"\'><a:t xml:space="preserve"> &amp;&#65;&#x42; </a:t><b/><![CDATA[<raw>]]></a:root>';
    const tree = parseXml(xml);
    const root = kids(tree)[0];
    expect(root.name).toBe('root');
    expect(root.prefix).toBe('a');
    const [t, b] = kids(root);
    expect(textOf(xml, t)).toBe(' &AB ');
    expect(b.selfClosing).toBe(true);
    expect(textOf(xml, root)).toBe(' &AB <raw>');
    expect(decodeEntities('&lt;&gt;&quot;&apos;&#128512;&bogus;')).toBe('<>"\'😀&bogus;');
  });
});

describe('xlsx map', () => {
  let bytes;
  let map;
  beforeAll(async () => {
    bytes = await makeXlsx();
    map = await buildXlsxMap(bytes);
  });

  it('reads sheets, values, dates, formulas, merges', () => {
    expect(map.kind).toBe('xlsx');
    expect(map.sheets.map((s) => [s.name, s.state])).toEqual([['SF2', 'visible'], ['Hidden', 'hidden']]);
    const s = map.sheets[0];
    expect(s.xmlPath).toBe('xl/worksheets/sheet1.xml');
    expect(s.merges).toEqual(['A1:F1']);
    expect(getCell(map, 'SF2', 'A1').v).toBe('School Form 2');
    expect(getCell(map, 'SF2', 'B5').text).toBe('Dela Cruz, Juan P.');
    expect(getCell(map, 'SF2', 'C5').v).toBe(40);
    const e5 = getCell(map, 'SF2', 'E5');
    expect(e5.f).toBe('SUM(C5:D5)');
    expect(e5.v).toBe(85);
    const f5 = getCell(map, 'SF2', 'F5');
    expect(typeof f5.v).toBe('number');
    expect(f5.text).toBe('2026-06-15');
    expect(getCell(map, 'SF2', 'F6').text).toBe(serialToDateText(46000, 'date', false));
    expect(getCell(map, 'SF2', 'C6').v).toBe(0.875);
    expect(getCell(map, 'SF2', 'D6').text).toBe('1234.5');
    expect(getCell(map, 'SF2', 'B6').v).toBe(TRICKY);
    expect(getCell(map, 'SF2', 'B7').v).toBe(true);
    expect(getCell(map, 'SF2', 'AA5').v).toBe('beyondZ');
    expect(getCell(map, 'SF2', 'AB5').v).toBe(28);
    expect(getCell(map, 'SF2', 'G5')).toBeNull(); // styled but empty
    expect(s.maxCol).toBe(28);
    expect(getCell(map, 'Hidden', 'A1').v).toBe('secret');
  });

  it('builds a value grid', () => {
    const g = sheetGrid(map, 'SF2');
    expect(g[4][1]).toBe('Dela Cruz, Juan P.');
    expect(g[4][5]).toBe('2026-06-15');
    expect(g[4][4]).toBe(85);
    expect(g[1][0]).toBeNull();
    expect(sheetGrid(map, 'SF2', { maxRows: 2 }).length).toBe(2);
  });

  it('describes and renders', () => {
    expect(describeMap(map)).toMatch(/^Excel · 2 sheets · SF2 \(7 rows × 28 cols\)/);
    const txt = renderMapForAI(map);
    expect(txt).toContain('### Sheet "SF2" (rows 1–7, merges: A1:F1)');
    expect(txt).toContain('B5:Dela Cruz, Juan P.');
    expect(txt).toContain('E5:=SUM(C5:D5)→85');
    expect(txt).toMatch(/^5 \| A5:1 \| B5:Dela Cruz/m);
    expect(txt).toContain('F5:2026-06-15');
    expect(txt).toMatch(/AA\d+:beyondZ/);
    expect(txt).toContain('### Sheet "Hidden" [hidden]');
    expect(renderMapForAI(map, { sheets: ['Hidden'] })).not.toContain('SF2');
  });
});

describe('xlsx patch', () => {
  let bytes;
  let before;
  let res;
  let after;
  beforeAll(async () => {
    bytes = await makeXlsx();
    before = await buildXlsxMap(bytes);
    res = await applyXlsxEdits(bytes, [
      { sheet: 'SF2', cell: 'C5', value: 50 },
      { sheet: 'SF2', cell: 'G5', value: 'OK ñ 😀 & <x>' },
      { sheet: 'SF2', cell: 'H10', value: 7 },
      { sheet: 'SF2', cell: 'E5', value: 99 },
      { sheet: 'SF2', cell: 'B1', value: 'nope' },
      { sheet: 'SF2', cell: 'B9', value: true },
      { sheet: 'SF2', cell: 'D5', value: null },
      { sheet: 'SF2', cell: 'F6', value: null },
      { sheet: 'Nope', cell: 'A1', value: 1 },
      { sheet: 'SF2', cell: 'Z0', value: 1 },
    ]);
    after = await buildXlsxMap(res.bytes);
  });

  it('reports applied and skipped edits', () => {
    expect(res.applied.map((a) => a.cell)).toEqual(['C5', 'G5', 'H10', 'B9', 'D5', 'F6']);
    expect(res.applied[0]).toEqual({ sheet: 'SF2', cell: 'C5', before: 40, after: 50 });
    const reasons = Object.fromEntries(res.skipped.map((s) => [s.cell, s]));
    expect(reasons.E5.reason).toBe('formula');
    expect(reasons.B1).toMatchObject({ reason: 'merged', anchor: 'A1' });
    expect(reasons.A1.reason).toBe('sheet');
    expect(reasons.Z0.reason).toBe('address');
  });

  it('writes new values while keeping styles', () => {
    const sb = before.sheets[0].cells;
    const c5 = getCell(after, 'SF2', 'C5');
    expect(c5.v).toBe(50);
    expect(c5.s).toBe(sb.C5.s);
    expect(c5.s).toBeGreaterThan(0);
    const g5 = getCell(after, 'SF2', 'G5');
    expect(g5.v).toBe('OK ñ 😀 & <x>');
    expect(g5.t).toBe('inlineStr');
    expect(g5.s).toBeGreaterThan(0);
    expect(getCell(after, 'SF2', 'H10').v).toBe(7);
    expect(getCell(after, 'SF2', 'B9').v).toBe(true);
    expect(getCell(after, 'SF2', 'D5')).toBeNull();
    expect(getCell(after, 'SF2', 'E5').f).toBe('SUM(C5:D5)');
    expect(getCell(after, 'SF2', 'F5').text).toBe('2026-06-15');
  });

  it('keeps empty-cleared cell formatting and row order', async () => {
    const z = await JSZip.loadAsync(res.bytes);
    const sheet = await z.file('xl/worksheets/sheet1.xml').async('string');
    const s6 = before.sheets[0].cells.F6.s;
    expect(s6).toBeGreaterThan(0);
    expect(sheet).toContain(`<c r="F6" s="${s6}"/>`);
    expect(sheet).toContain('<c r="D5"/>');
    const rowNums = [...sheet.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1]));
    expect(rowNums).toEqual([...rowNums].sort((a, b) => a - b));
    expect(sheet).toMatch(/<dimension ref="A1:AB10"\/>/);
    const wbXml = await z.file('xl/workbook.xml').async('string');
    expect(wbXml).toMatch(/<calcPr[^>]*fullCalcOnLoad="1"/);
  });

  it('leaves every other zip entry byte-identical (media, drawings, styles)', async () => {
    const names = Object.keys((await JSZip.loadAsync(res.bytes)).files);
    expect(names.some((n) => n.startsWith('xl/media/'))).toBe(true);
    expect(names.some((n) => n.startsWith('xl/drawings/'))).toBe(true);
    await expectUntouched(bytes, res.bytes, ['xl/worksheets/sheet1.xml', 'xl/workbook.xml']);
  });

  it('re-opens with exceljs', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.bytes);
    const ws = wb.getWorksheet('SF2');
    expect(ws.getCell('C5').value).toBe(50);
    expect(ws.getCell('H10').value).toBe(7);
    expect(ws.getCell('C5').fill.fgColor.argb).toBe('FFFFFF00');
    expect(wb.getImage(0)).toBeDefined();
  });

  it('allows formula overwrite on request and drops calcChain only then', async () => {
    const z = await JSZip.loadAsync(bytes);
    z.file('xl/calcChain.xml', '<?xml version="1.0"?><calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><c r="E5" i="1"/></calcChain>');
    const rels = await z.file('xl/_rels/workbook.xml.rels').async('string');
    z.file('xl/_rels/workbook.xml.rels', rels.replace('</Relationships>', '<Relationship Id="rIdCC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>'));
    const ct = await z.file('[Content_Types].xml').async('string');
    z.file('[Content_Types].xml', ct.replace('</Types>', '<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>'));
    const withChain = await z.generateAsync({ type: 'uint8array' });

    const plain = await applyXlsxEdits(withChain, [{ sheet: 'SF2', cell: 'C5', value: 1 }]);
    expect((await JSZip.loadAsync(plain.bytes)).file('xl/calcChain.xml')).not.toBeNull();

    const forced = await applyXlsxEdits(withChain, [{ sheet: 'SF2', cell: 'E5', value: 99 }], { allowFormulaOverwrite: true });
    expect(forced.applied).toHaveLength(1);
    const fz = await JSZip.loadAsync(forced.bytes);
    expect(fz.file('xl/calcChain.xml')).toBeNull();
    expect(await fz.file('xl/_rels/workbook.xml.rels').async('string')).not.toContain('calcChain');
    expect(await fz.file('[Content_Types].xml').async('string')).not.toContain('calcChain');
    const m = await buildXlsxMap(forced.bytes);
    expect(getCell(m, 'SF2', 'E5')).toMatchObject({ v: 99 });
    expect(getCell(m, 'SF2', 'E5').f).toBeUndefined();
  });

  it('returns the original bytes when nothing applies', async () => {
    const r = await applyXlsxEdits(bytes, [{ sheet: 'SF2', cell: 'E5', value: 1 }]);
    expect(r.bytes).toBe(bytes);
    expect(r.applied).toEqual([]);
  });
});

describe('xlsx robustness', () => {
  it('reads x:-prefixed sheets, entities, rich text, AA/AB refs, shared formulas, 1904 dates', async () => {
    const bytes = await makePrefixedXlsx();
    const map = await buildMap(bytes, 'weird.XLSM');
    const s = map.sheets[0];
    expect(s.name).toBe('Data & Co');
    expect(map.definedNames).toEqual([{ name: 'Area', ref: "'Data & Co'!$A$1:$AB$3" }]);
    expect(s.cells.A1.v).toBe('Tom & Jerry <3 "hi" \'yo\'');
    expect(s.cells.AA1.v).toBe('Rich Ñoño 😀');
    expect(s.cells.AB1.v).toBe(3.5);
    expect(s.cells.A3.v).toBe('  padded  ');
    expect(s.cells.B3.text).toBe('1904-01-01');
    expect(s.cells.D3).toMatchObject({ v: '#N/A', text: '#N/A', t: 'e' });
    expect(s.cells.E3.f).toBe('A1&B3');
    expect(s.cells.F3.f).toBe('B1&C3');
    expect(s.merges).toEqual(['G1:H2']);
    expect(s.maxCol).toBe(28);
  });

  it('patches x:-prefixed sheets with the same prefix and inherited styles', async () => {
    const bytes = await makePrefixedXlsx();
    const res = await applyEdits(bytes, 'weird.xlsx', [
      { sheet: 'data & co', cell: 'C1', value: 'Ñ & 😀' },
      { sheet: 'Data & Co', cell: 'C2', value: 5 },
      { sheet: 'Data & Co', cell: 'B3', value: 'x' },
      { sheet: 'Data & Co', cell: 'C3', value: 1 },
      { sheet: 'Data & Co', cell: 'H2', value: 1 },
      { sheet: 'Data & Co', cell: 'F3', value: 1 },
      { sheet: 'Data & Co', cell: 'AD1', value: '_x0041_' },
    ]);
    expect(res.skipped.map((x) => [x.cell, x.reason])).toEqual([['H2', 'merged'], ['F3', 'formula']]);
    const z = await JSZip.loadAsync(res.bytes);
    const xml = await z.file('xl/worksheets/sheet1.xml').async('string');
    expect(xml).toContain('<x:c r="C1" s="2" t="inlineStr"><x:is><x:t xml:space="preserve">Ñ &amp; 😀</x:t></x:is></x:c>');
    expect(xml).toContain('<x:row r="2"><x:c r="C2" s="2"><x:v>5</x:v></x:c></x:row>');
    expect(xml).toContain('<x:c r="C3" s="2"><x:v>1</x:v></x:c>'); // row customFormat style
    expect(xml).toContain('<x:row r="1" spans="1:30">');
    expect(xml).toContain('<x:dimension ref="A1:AD3"/>');
    const wb = await z.file('xl/workbook.xml').async('string');
    expect(wb).toContain('</x:definedNames><x:calcPr fullCalcOnLoad="1"/></x:workbook>');
    const map = await buildXlsxMap(res.bytes);
    const c = map.sheets[0].cells;
    expect(c.C1.v).toBe('Ñ & 😀');
    expect(c.B3).toMatchObject({ v: 'x', s: 1 });
    expect(c.AD1.v).toBe('_x0041_');
    expect(Object.keys(c).filter((k) => /^[A-Z]+1$/.test(k))).toEqual(['A1', 'C1', 'AA1', 'AB1', 'AD1']);
    await expectUntouched(bytes, res.bytes, ['xl/worksheets/sheet1.xml', 'xl/workbook.xml']);
  });

  it('handles self-closing rows and sheetData', async () => {
    const bytes = await makePrefixedXlsx();
    const z = await JSZip.loadAsync(bytes);
    z.file('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>');
    const empty = await z.generateAsync({ type: 'uint8array' });
    const r1 = await applyXlsxEdits(empty, [{ sheet: 'Data & Co', cell: 'B2', value: 3 }, { sheet: 'Data & Co', cell: 'A1', value: 'a' }]);
    const m1 = await buildXlsxMap(r1.bytes);
    expect(m1.sheets[0].cells.B2.v).toBe(3);
    expect(m1.sheets[0].cells.A1.v).toBe('a');
    z.file('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="4" ht="30" customHeight="1"/></sheetData></worksheet>');
    const r2 = await applyXlsxEdits(await z.generateAsync({ type: 'uint8array' }), [{ sheet: 'Data & Co', cell: 'C4', value: 9 }]);
    const xml = await (await JSZip.loadAsync(r2.bytes)).file('xl/worksheets/sheet1.xml').async('string');
    expect(xml).toContain('<row r="4" ht="30" customHeight="1"><c r="C4"><v>9</v></c></row>');
  });

  it('helpers: shared formula shift and date formats', () => {
    expect(shiftFormula('SUM(A1:$B$2)+"A1"+Sheet1!C3+LOG10(4)', 2, 1)).toBe('SUM(B3:$B$2)+"A1"+Sheet1!D5+LOG10(4)');
    expect(formatKind(14)).toBe('date');
    expect(formatKind(164, 'dd/mm/yyyy')).toBe('date');
    expect(formatKind(164, '0.00%')).toBeNull();
    expect(formatKind(164, '#,##0 "days"')).toBeNull();
    expect(formatKind(164, 'h:mm AM/PM')).toBe('time');
    expect(formatKind(164, '[$-409]mmmm d, yyyy;@')).toBe('date');
    expect(serialToDateText(45000, 'date', false)).toBe('2023-03-15');
    expect(serialToDateText(45000.5, 'datetime', false)).toBe('2023-03-15 12:00');
    expect(serialToDateText(0.75, 'time', false)).toBe('18:00');
    expect(serialToDateText(60, 'date', false)).toBe('1900-02-29');
    expect(serialToDateText(1, 'date', false)).toBe('1900-01-01');
  });

  it('rejects corrupted files with a clear error', async () => {
    const junk = new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await expect(buildXlsxMap(junk)).rejects.toThrow('Not a valid Excel/Word file');
    await expect(applyXlsxEdits(junk, [])).rejects.toThrow('Not a valid Excel/Word file');
    await expect(buildDocxMap(new Uint8Array(0))).rejects.toThrow('Not a valid Excel/Word file');
    await expect(applyDocxEdits(junk, [])).rejects.toThrow('Not a valid Excel/Word file');
    const docx = await makeDocx();
    await expect(buildXlsxMap(docx)).rejects.toThrow('Not a valid Excel/Word file');
    await expect(buildDocxMap(await makePrefixedXlsx())).rejects.toThrow('Not a valid Excel/Word file');
    expect(await buildMap(junk, 'notes.pdf')).toBeNull();
    await expect(applyEdits(junk, 'notes.pdf', [])).rejects.toThrow(/Unsupported/);
  });
});

describe('docx map', () => {
  let map;
  beforeAll(async () => {
    map = await buildDocxMap(await makeDocx());
  });

  it('numbers blocks and reads text', () => {
    expect(map.kind).toBe('docx');
    const ids = map.blocks.map((b) => b.id);
    expect(ids).toEqual(['p0', 'p1', 't0', 'p2', 'p3', 'p4']);
    expect(map.blocks[0].text).toBe('Name: Juan');
    expect(map.blocks[1].text).toBe('School Year 2025-2026');
    expect(map.blocks[3].isEmpty).toBe(true); // image-only paragraph
    expect(map.blocks[5].text).toBe(TRICKY);
    const t = map.blocks[2];
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].map((c) => c.text)).toEqual(['No.', 'Name of Learner', 'Remarks']);
    expect(t.rows[1][1]).toMatchObject({ id: 't0.r1.c1', text: 'Dela Cruz', gridSpan: 2, vMerge: null });
    expect(t.rows[1][1].paragraphs).toEqual([{ id: 't0.r1.c1.p0', text: 'Dela Cruz' }]);
    expect(map.headers[0].part).toBe('word/header1.xml');
    expect(map.headers[0].blocks[0]).toMatchObject({ id: 'h1:p0', text: 'Republic of the Philippines' });
  });

  it('renders for AI', () => {
    const txt = renderMapForAI(map);
    expect(txt).toContain('[p0] Name: Juan');
    expect(txt).toContain('[t0] table 2×3');
    expect(txt).toContain('[t0.r0] c0:No. | c1:Name of Learner | c2:Remarks');
    expect(txt).toContain('[t0.r1] c0:1 | c1:Dela Cruz');
    expect(txt).toContain('[p2] (empty)');
    expect(txt).toMatch(/--- Header \(word\/header1\.xml\) ---\n\[h1:p0\] Republic/);
    expect(describeMap(map)).toBe('Word · 4 paragraphs · 1 table · 1 header');
  });

  it('handles tabs, breaks, ins/del, fields, content controls, nested tables, footers', async () => {
    const m = await buildDocxMap(await makeComplexDocx());
    expect(m.blocks.map((b) => b.id)).toEqual(['p0', 'p1', 'p2', 't0', 'p3']);
    expect(m.blocks[0]).toMatchObject({ text: 'Tab\tbed\nline', style: 'Title' });
    expect(m.blocks[1].text).toBe('Inserted 7');
    expect(m.blocks[2].text).toBe('In control ');
    const cell = m.blocks[3].rows[0][0];
    expect(cell.vMerge).toBe('restart');
    expect(cell.tables[0].id).toBe('t0.r0.c0.t0');
    expect(cell.tables[0].rows[0][1].id).toBe('t0.r0.c0.t0.r0.c1');
    expect(cell.text).toBe('Outer\nInner A\tInner B\n');
    expect(cell.paragraphs.map((p) => p.id)).toEqual(['t0.r0.c0.p0', 't0.r0.c0.p1']);
    expect(m.blocks[3].rows[1][0].vMerge).toBe('continue');
    expect(m.blocks[3].rows[0][1].gridSpan).toBe(2);
    expect(m.blocks[3].rows[1][1].text).toBe('Ñ&<');
    expect(m.footers).toEqual([{ part: 'word/footer2.xml', blocks: [{ id: 'f2:p0', type: 'paragraph', text: 'Page footer', style: null, isEmpty: false }] }]);
    expect(renderMapForAI(m)).toContain('[t0.r0.c0.t0] table 1×2');
  });
});

describe('docx patch', () => {
  let bytes;
  let res;
  let after;
  let docBefore;
  let docAfter;
  beforeAll(async () => {
    bytes = await makeDocx();
    res = await applyDocxEdits(bytes, [
      { id: 't0.r0.c0', text: 'No' },
      { id: 't0.r1.c1', text: 'Line A\nLine B' },
      { id: 'p3', text: 'Prepared by: Maria Ñ & <ok>' },
      { find: '2025-2026', replace: '2026-2027' },
      { id: 'p2', text: 'x' },
      { id: 'p99', text: 'x' },
      { id: 't0', text: 'x' },
    ]);
    after = await buildDocxMap(res.bytes);
    docBefore = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
    docAfter = await (await JSZip.loadAsync(res.bytes)).file('word/document.xml').async('string');
  });

  it('reports applied / skipped', () => {
    expect(res.applied.map((a) => a.id)).toEqual(['t0.r0.c0', 't0.r1.c1', 'p3', 'p1']);
    expect(res.applied[3]).toEqual({ id: 'p1', before: 'School Year 2025-2026', after: 'School Year 2026-2027' });
    expect(res.skipped).toEqual([
      { id: 'p2', reason: 'complex' },
      { id: 'p99', reason: 'notFound' },
      { id: 't0', reason: 'unsupported' },
    ]);
  });

  it('writes text while keeping cell and run formatting', () => {
    const t = after.blocks[2];
    expect(t.rows[0][0].text).toBe('No');
    expect(t.rows[1][1].text).toBe('Line A\nLine B');
    expect(t.rows[1][1].paragraphs.map((p) => p.id)).toEqual(['t0.r1.c1.p0', 't0.r1.c1.p1']);
    expect(t.rows[1][1].gridSpan).toBe(2);
    expect(after.blocks[4].text).toBe('Prepared by: Maria Ñ & <ok>');
    expect(after.blocks[1].text).toBe('School Year 2026-2027');
    expect(after.blocks[0].text).toBe('Name: Juan');
    const tcPrs = (s) => s.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/g);
    expect(tcPrs(docAfter)).toEqual(tcPrs(docBefore));
    const firstCell = docAfter.match(/<w:tc>[\s\S]*?<\/w:tc>/)[0];
    expect(firstCell).toMatch(/<w:rPr>(?=[\s\S]*<w:b\/>)(?=[\s\S]*<w:sz w:val="28"\/>)[\s\S]*?<\/w:rPr><w:t xml:space="preserve">No<\/w:t>/);
    expect(firstCell).toContain('w:fill="D9E2F3"');
    // both lines of the multi-line cell keep the italic run style
    const mergedCell = docAfter.match(/<w:tc>(?:(?!<w:tc>)[\s\S])*?Line A[\s\S]*?<\/w:tc>/)[0];
    expect(mergedCell.match(/<w:i\/>/g).length).toBeGreaterThanOrEqual(2);
    // the drawing paragraph is untouched
    expect(docAfter).toContain('<w:drawing>');
    // find/replace: first affected run carries the replacement, bold run trimmed
    expect(docAfter).toContain('<w:t xml:space="preserve">School Year 2026-2027</w:t>');
  });

  it('leaves untouched parts byte-identical and stays readable by mammoth', async () => {
    const names = Object.keys((await JSZip.loadAsync(res.bytes)).files);
    expect(names.some((n) => n.startsWith('word/media/'))).toBe(true);
    await expectUntouched(bytes, res.bytes, ['word/document.xml']);
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(res.bytes) });
    expect(value).toContain('Line A');
    expect(value).toContain('Line B');
    expect(value).toContain('School Year 2026-2027');
    expect(value).toContain('Prepared by: Maria Ñ & <ok>');
  });

  it('edits headers, cell paragraphs and scoped find/replace', async () => {
    const r = await applyDocxEdits(bytes, [
      { id: 'h1:p0', text: 'Republika ng Pilipinas 😀' },
      { id: 't0.r0.c1.p0', text: 'Learner\nname' },
      { find: 'Dela', replace: 'De la', scope: 't0.r1.c1' },
      { find: 'Juan', replace: 'X', scope: 'p3' },
    ]);
    expect(r.skipped).toEqual([{ id: 'p3', find: 'Juan', reason: 'noMatch' }]);
    const m = await buildDocxMap(r.bytes);
    expect(m.headers[0].blocks[0].text).toBe('Republika ng Pilipinas 😀');
    expect(m.blocks[2].rows[0][1].text).toBe('Learner\nname');
    expect(m.blocks[2].rows[0][1].paragraphs).toHaveLength(1); // '\n' in a paragraph = line break
    expect(m.blocks[2].rows[1][1].text).toBe('De la Cruz');
    await expectUntouched(bytes, r.bytes, ['word/document.xml', 'word/header1.xml']);
  });

  it('handles complex paragraphs, bookmarks, empty cells and sequential cell edits', async () => {
    const src = await makeComplexDocx();
    const r = await applyDocxEdits(src, [
      { id: 'p1', text: 'nope' },
      { find: 'Inserted', replace: 'Added' },
      { id: 't0.r0.c1', text: 'Filled' },
      { id: 't0.r1.c1', text: 'one\ntwo\nthree' },
      { id: 't0.r1.c1.p2', text: 'THREE' },
      { id: 't0.r0.c0', text: 'x' },
      { id: 'p3', text: 'Bookmarked' },
      { id: 'f2:p0', text: 'Pahina' },
    ]);
    expect(r.skipped).toEqual([{ id: 'p1', reason: 'complex' }, { id: 't0.r0.c0', reason: 'complex' }]);
    const m = await buildDocxMap(r.bytes);
    expect(m.blocks[1].text).toBe('Added 7');
    expect(m.blocks[3].rows[0][1].text).toBe('Filled');
    expect(m.blocks[3].rows[1][1].text).toBe('one\ntwo\nTHREE');
    expect(m.blocks[4].text).toBe('Bookmarked');
    expect(m.footers[0].blocks[0].text).toBe('Pahina');
    const xml = await (await JSZip.loadAsync(r.bytes)).file('word/document.xml').async('string');
    expect(xml).toContain('<w:instrText> PAGE </w:instrText>');
    expect(xml).toContain('<w:p><w:bookmarkStart w:id="0" w:name="bm"/><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">Bookmarked</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>');
    // empty paragraph inherits the paragraph-mark rPr (minus tracked-change markers)
    expect(xml).toContain('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Filled</w:t></w:r>');
  });
});

describe('render capping', () => {
  it('caps long sheets and tables', () => {
    const cells = {};
    for (let r = 1; r <= 300; r++) {
      cells[`A${r}`] = { v: r, text: String(r), t: 'n', s: 0 };
      cells[`B${r}`] = { v: 'x'.repeat(100), text: 'x'.repeat(100), t: 's', s: 0 };
    }
    const map = { kind: 'xlsx', sheets: [{ name: 'Big', state: 'visible', maxRow: 300, maxCol: 2, merges: [], cells }] };
    const txt = renderMapForAI(map);
    const lines = txt.split('\n');
    expect(lines.filter((l) => /^\d+ \|/.test(l))).toHaveLength(80);
    expect(txt).toContain('… (220 rows omitted; rows look like row 60)');
    expect(txt).toMatch(/^300 \| A300:300 \| B300:x{59}…$/m);
    expect(renderMapForAI(map, { maxRows: 12 }).split('\n').filter((l) => /^\d+ \|/.test(l))).toHaveLength(8);
    expect(renderMapForAI(map, { maxCellsPerRow: 1 })).toContain('1 | A1:1 | … +1 cells');
    expect(renderMapForAI(map, { maxChars: 500 }).length).toBeLessThan(520);

    const rows = Array.from({ length: 50 }, (_, ri) => [{ id: `t0.r${ri}.c0`, text: `L${ri}`, gridSpan: 1, vMerge: null, paragraphs: [] }]);
    const dm = { kind: 'docx', blocks: [{ id: 't0', type: 'table', rows }], headers: [], footers: [] };
    const dt = renderMapForAI(dm, { maxRows: 12 });
    expect(dt).toContain('[t0] table 50×1');
    expect(dt).toContain('[t0.r5] c0:L5');
    expect(dt).not.toContain('[t0.r6]');
    expect(dt).toContain('[t0.r49] c0:L49');
    expect(dt).toContain('… (42 rows omitted; rows look like [t0.r5])');
  });
});

describe('makeAddr helper sanity', () => {
  it('round-trips', () => {
    for (const a of ['A1', 'Z9', 'AA10', 'AZ3', 'BA1', 'ZZ2', 'AAA7']) {
      const p = parseAddr(a);
      expect(makeAddr(p.col, p.row)).toBe(a);
    }
  });
});
