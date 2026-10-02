/**
 * readers/index.js — turns an uploaded file (Uint8Array) into a ParsedDocument
 * the KaTuroDesk agent can reason over. Never throws for bad input: corrupt or
 * unknown files come back as kind 'unsupported' (or with `warnings`).
 *
 * Heavy libraries (mammoth, xlsx, jszip, pdfjs) are imported lazily per format.
 */

const VISION_MAX_BYTES = 15 * 1024 * 1024;
const SHEET_TEXT_MAX_ROWS = 500;

const IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

const KIND_BY_EXT = {
  docx: 'docx', dotx: 'docx',
  xlsx: 'xlsx', xlsm: 'xlsx', xls: 'xlsx',
  csv: 'csv', tsv: 'csv',
  pptx: 'pptx',
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', bmp: 'image',
  txt: 'text', md: 'text', json: 'text', html: 'text', htm: 'text', xml: 'text', rtf: 'text',
};

const MIME_TO_EXT = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/html': 'html',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'application/msword': 'doc',
  'application/vnd.ms-powerpoint': 'ppt',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

const LEGACY_WARNINGS = {
  doc: 'Old .doc format — please re-save as .docx',
  ppt: 'Old .ppt format — please re-save as .pptx',
};

export const SUPPORTED_EXTENSIONS = Object.keys(KIND_BY_EXT);

/**
 * @param {{ bytes: Uint8Array, name?: string, mimeType?: string }} input
 * @returns {Promise<object>} ParsedDocument
 */
export async function readDocument({ bytes, name = '', mimeType = '' } = {}) {
  let extension = extOf(name);
  if (!KIND_BY_EXT[extension] && !LEGACY_WARNINGS[extension]) {
    const fromMime = MIME_TO_EXT[String(mimeType || '').split(';')[0].trim().toLowerCase()];
    if (fromMime) extension = fromMime;
  }
  const base = {
    name,
    extension,
    kind: 'unsupported',
    text: '',
    needsVision: false,
    meta: { wordCount: 0 },
    warnings: [],
  };
  const data = toUint8(bytes);
  if (!data || !data.length) {
    base.warnings.push('The file is empty or could not be read.');
    return base;
  }
  if (LEGACY_WARNINGS[extension]) {
    base.warnings.push(LEGACY_WARNINGS[extension]);
    return base;
  }
  const kind = KIND_BY_EXT[extension];
  if (!kind) {
    base.warnings.push(`Unsupported file type${extension ? ` (.${extension})` : ''}.`);
    return base;
  }

  const readers = { docx: readDocx, xlsx: readSheets, csv: readSheets, pptx: readPptx, pdf: readPdf, image: readImage, text: readText };
  try {
    const out = await readers[kind](data, extension, base);
    out.meta.wordCount = countWords(out.text);
    return out;
  } catch (err) {
    return {
      ...base,
      kind: 'unsupported',
      warnings: [...base.warnings, `Could not read this ${extension.toUpperCase()} file — it may be corrupt or password-protected. (${err?.message || err})`],
    };
  }
}

/** One-line human summary, e.g. "Excel workbook · 2 sheets (Grade 7 - Rizal: 45 rows)". */
export function describeParsed(parsed) {
  if (!parsed) return '';
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const parts = [];
  const m = parsed.meta || {};
  switch (parsed.kind) {
    case 'docx':
      parts.push('Word document');
      if (m.pageCount) parts.push(plural(m.pageCount, 'page'));
      if (parsed.tables?.length) parts.push(plural(parsed.tables.length, 'table'));
      if (!m.pageCount && m.wordCount) parts.push(plural(m.wordCount, 'word'));
      break;
    case 'xlsx':
    case 'csv': {
      const sheets = parsed.sheets || [];
      const label = parsed.kind === 'csv' ? 'CSV table' : 'Excel workbook';
      const detail = sheets.slice(0, 3).map((s) => `${s.name}: ${plural(s.rowCount, 'row')}`).join('; ');
      const more = sheets.length > 3 ? `; +${sheets.length - 3} more` : '';
      parts.push(parsed.kind === 'csv' ? label : `${label} · ${plural(sheets.length, 'sheet')}`);
      if (detail) parts[parts.length - 1] += ` (${detail}${more})`;
      break;
    }
    case 'pptx':
      parts.push('PowerPoint presentation', plural(m.slideCount || 0, 'slide'));
      break;
    case 'pdf':
      if (parsed.needsVision) parts.push('Scanned PDF', m.pageCount ? plural(m.pageCount, 'page') : '', 'needs AI vision');
      else parts.push('PDF', plural(m.pageCount || 0, 'page'));
      break;
    case 'image':
      parts.push(`Image (${(parsed.extension || '').toUpperCase()})`, 'needs AI vision');
      break;
    case 'text':
      parts.push('Text file', plural(m.wordCount || 0, 'word'));
      break;
    default:
      parts.push('Unsupported file');
      if (parsed.warnings?.[0]) parts.push(parsed.warnings[0]);
  }
  return parts.filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- helpers

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

function toUint8(bytes) {
  if (!bytes) return null;
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return null;
}

/** Standalone ArrayBuffer copy of exactly these bytes (views may share a larger buffer). */
function toArrayBuffer(u8) {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function countWords(text) {
  const m = String(text || '').match(/\S+/g);
  return m ? m.length : 0;
}

function decodeUtf8(u8) {
  let s = new TextDecoder('utf-8').decode(u8);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

export function toBase64(u8) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function attachVision(out, u8, mimeType) {
  out.needsVision = true;
  if (u8.length > VISION_MAX_BYTES) {
    out.warnings.push(`File is ${(u8.length / 1048576).toFixed(1)} MB — too large to send to AI vision (limit 15 MB).`);
    return;
  }
  out.vision = { mimeType, base64: toBase64(u8) };
}

function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

async function loadZip(u8) {
  const mod = await import('jszip');
  const JSZip = mod.default || mod;
  return JSZip.loadAsync(u8);
}

// ---------------------------------------------------------------- docx

async function readDocx(u8, extension, base) {
  const out = { ...base, kind: 'docx', html: '', tables: [] };
  const mod = await import('mammoth');
  const mammoth = mod.default || mod;
  // Node build of mammoth reads `buffer`, the browser build reads `arrayBuffer`.
  const input = { arrayBuffer: toArrayBuffer(u8), buffer: u8 };
  const [htmlRes, textRes] = await Promise.all([
    mammoth.convertToHtml(input),
    mammoth.extractRawText({ arrayBuffer: toArrayBuffer(u8), buffer: u8 }),
  ]);
  out.html = htmlRes.value || '';
  out.text = String(textRes.value || '').replace(/\n{3,}/g, '\n\n').trim();
  const msgs = [...(htmlRes.messages || [])].filter((m) => m.type === 'error');
  if (msgs.length) out.warnings.push(...msgs.slice(0, 3).map((m) => m.message));

  try {
    const zip = await loadZip(u8);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (docXml) out.tables = extractDocxTables(docXml);
    const app = await zip.file('docProps/app.xml')?.async('string');
    const pages = app && /<Pages>(\d+)<\/Pages>/.exec(app);
    if (pages && Number(pages[1]) > 0) out.meta.pageCount = Number(pages[1]);
  } catch (err) {
    out.warnings.push(`Could not read tables: ${err?.message || err}`);
  }
  return out;
}

/**
 * Top-level w:tbl → rows of cell text. Nested tables are flattened into their
 * parent cell's text. Paragraphs inside a cell are joined with "\n".
 */
export function extractDocxTables(xml) {
  const tables = [];
  const re = /<(\/?)w:(tbl|tr|tc|p|t|tab|br|cr)(\s[^>]*?)?(\/?)>/g;
  let depth = 0;
  let table = null;
  let row = null;
  let cell = null;
  let tcDepth = 0;
  let inText = false;
  let textStart = 0;
  let m;
  while ((m = re.exec(xml))) {
    const [, close, tag, attrs, selfClose] = m;
    // <w:tab w:val=.. w:pos=../> inside <w:tabs> is a tab-stop definition, not a run tab.
    if (tag === 'tab' && attrs && /w:pos=/.test(attrs)) continue;
    if (tag === 't') {
      if (!close && !selfClose) {
        inText = true;
        textStart = re.lastIndex;
      } else if (close && inText) {
        inText = false;
        if (cell) cell.text += decodeXml(xml.slice(textStart, m.index));
      }
      continue;
    }
    if (tag === 'tbl') {
      if (!close) {
        depth += 1;
        if (depth === 1) table = { rows: [] };
      } else {
        if (depth === 1 && table) {
          if (table.rows.length) tables.push(table);
          table = null;
        }
        depth = Math.max(0, depth - 1);
      }
      continue;
    }
    if (depth !== 1) {
      // Nested table content: keep text flowing into the outer cell.
      if (cell && !close && (tag === 'p' || tag === 'br' || tag === 'cr') && cell.text && !cell.text.endsWith('\n')) cell.text += tag === 'p' ? '\n' : ' ';
      if (cell && tag === 'tab') cell.text += '\t';
      continue;
    }
    if (tag === 'tr') {
      if (!close) row = [];
      else if (row && table) {
        table.rows.push(row);
        row = null;
      }
    } else if (tag === 'tc') {
      if (!close) {
        cell = { text: '' };
        tcDepth = 0;
      } else if (cell && row) {
        row.push(cell.text.replace(/\n+$/, '').trim());
        cell = null;
      }
    } else if (cell) {
      if (tag === 'p' && !close && !selfClose) {
        if (tcDepth > 0) cell.text += '\n';
        tcDepth += 1;
      } else if (tag === 'tab') cell.text += '\t';
      else if ((tag === 'br' || tag === 'cr') && !close) cell.text += '\n';
    }
  }
  return tables;
}

// ---------------------------------------------------------------- xlsx / csv

async function readSheets(u8, extension, base) {
  const isCsv = extension === 'csv' || extension === 'tsv';
  const out = { ...base, kind: isCsv ? 'csv' : 'xlsx', sheets: [] };
  const mod = await import('xlsx');
  const XLSX = mod.read ? mod : mod.default;
  let wb;
  if (isCsv) {
    const text = decodeUtf8(u8);
    const opts = { type: 'string', cellDates: true, raw: false };
    if (extension === 'tsv' || (!/,/.test(text.split('\n')[0]) && /\t/.test(text.split('\n')[0]))) opts.FS = '\t';
    wb = XLSX.read(text, opts);
  } else {
    wb = XLSX.read(u8, { type: 'array', cellDates: true });
  }
  const parts = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = sheetRows(XLSX, ws);
    const colCount = rows.reduce((mx, r) => Math.max(mx, r.length), 0);
    const sheet = { name: isCsv ? (base.name || sheetName).replace(/\.[^.]+$/, '') : sheetName, rows, rowCount: rows.length, colCount };
    out.sheets.push(sheet);
    parts.push(renderSheetText(sheet, wb.SheetNames.length > 1 || !isCsv));
  }
  out.meta.sheetCount = out.sheets.length;
  out.text = parts.join('\n\n').trim();
  if (!out.sheets.some((s) => s.rowCount)) out.warnings.push('The spreadsheet has no data.');
  return out;
}

/** Cell values aligned to A1 (row 0 = Excel row 1), trailing empty rows/cols trimmed. */
function sheetRows(XLSX, ws) {
  const grid = [];
  for (const addr of Object.keys(ws)) {
    if (addr[0] === '!') continue;
    const cell = ws[addr];
    const v = cellValue(cell);
    if (v === null) continue;
    const { r, c } = XLSX.utils.decode_cell(addr);
    (grid[r] ||= [])[c] = v;
  }
  const rows = [];
  for (let r = 0; r < grid.length; r++) {
    const src = grid[r] || [];
    const row = [];
    for (let c = 0; c < src.length; c++) row.push(src[c] === undefined ? null : src[c]);
    rows.push(row);
  }
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return rows;
}

function cellValue(cell) {
  if (!cell) return null;
  if (cell.t === 'z' || cell.t === 'e') return null;
  let v = cell.v;
  if (v === undefined || v === null) return null;
  if (v instanceof Date || cell.t === 'd') return dateToIso(v instanceof Date ? v : new Date(v));
  if (typeof v === 'string') {
    if (!v.trim()) return null;
    return v;
  }
  return v;
}

function dateToIso(d) {
  if (Number.isNaN(d.getTime())) return null;
  // SheetJS builds dates in local time; round to the nearest minute to absorb its tz seconds drift.
  const t = new Date(Math.round(d.getTime() / 60000) * 60000);
  const p = (n) => String(n).padStart(2, '0');
  const date = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  if (t.getHours() || t.getMinutes()) return `${date}T${p(t.getHours())}:${p(t.getMinutes())}`;
  return date;
}

function renderSheetText(sheet, withTitle) {
  const lines = [];
  if (withTitle) lines.push(`Sheet: ${sheet.name}`);
  const shown = sheet.rows.slice(0, SHEET_TEXT_MAX_ROWS);
  for (const row of shown) lines.push(row.map((v) => (v === null ? '' : String(v).replace(/[\t\r\n]+/g, ' '))).join('\t'));
  if (sheet.rows.length > SHEET_TEXT_MAX_ROWS) lines.push(`(… ${sheet.rows.length - SHEET_TEXT_MAX_ROWS} more rows)`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- pptx

async function readPptx(u8, extension, base) {
  const out = { ...base, kind: 'pptx', slides: [] };
  const zip = await loadZip(u8);
  const slidePaths = await orderedSlidePaths(zip);
  if (!slidePaths.length) throw new Error('No slides found');
  let number = 0;
  for (const path of slidePaths) {
    const xml = await zip.file(path)?.async('string');
    if (!xml) continue;
    number += 1;
    const { title, text } = parseSlideXml(xml);
    let notes = '';
    const relsPath = path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
    const rels = await zip.file(relsPath)?.async('string');
    const notesTarget = rels && /Target="([^"]*notesSlide[^"]*)"/.exec(rels);
    if (notesTarget) {
      const notesPath = resolvePath('ppt/slides/', notesTarget[1]);
      const notesXml = await zip.file(notesPath)?.async('string');
      if (notesXml) notes = parseNotesXml(notesXml);
    }
    out.slides.push({ number, title, text, notes });
  }
  out.meta.slideCount = out.slides.length;
  out.text = out.slides
    .map((s) => {
      const body = s.text && s.text !== s.title ? `\n${s.text}` : '';
      const notes = s.notes ? `\nNotes: ${s.notes}` : '';
      return `Slide ${s.number}: ${s.title}${body}${notes}`;
    })
    .join('\n\n');
  return out;
}

/** Slide order comes from presentation.xml's sldIdLst; falls back to numeric file order. */
async function orderedSlidePaths(zip) {
  const all = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)[1]) - Number(/(\d+)\.xml$/.exec(b)[1]));
  try {
    const pres = await zip.file('ppt/presentation.xml')?.async('string');
    const rels = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
    if (!pres || !rels) return all;
    const relMap = {};
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /\bId="([^"]+)"/.exec(m[0]);
      const target = /\bTarget="([^"]+)"/.exec(m[0]);
      if (id && target) relMap[id[1]] = resolvePath('ppt/', target[1]);
    }
    const ordered = [];
    const lst = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(pres);
    for (const m of (lst?.[1] || '').matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)) {
      const p = relMap[m[1]];
      if (p && zip.file(p)) ordered.push(p);
    }
    return ordered.length ? ordered : all;
  } catch {
    return all;
  }
}

function resolvePath(baseDir, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (baseDir + target).split('/');
  const outParts = [];
  for (const p of parts) {
    if (p === '..') outParts.pop();
    else if (p !== '.' && p !== '') outParts.push(p);
  }
  return outParts.join('/');
}

function paragraphsOf(xml) {
  const paras = [];
  for (const m of xml.matchAll(/<a:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:p>)/g)) {
    const inner = m[1] || '';
    let t = '';
    for (const r of inner.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>|<a:tab\b[^>]*\/>/g)) {
      if (r[1] !== undefined) t += decodeXml(r[1]);
      else if (r[0].startsWith('<a:br')) t += '\n';
      else t += '\t';
    }
    t = t.trim();
    if (t) paras.push(t);
  }
  return paras;
}

function shapesOf(xml) {
  const shapes = [];
  for (const m of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    const ph = /<p:ph\b([^>]*)\/?>/.exec(m[0]);
    const type = ph ? (/\btype="([^"]+)"/.exec(ph[1])?.[1] || 'body') : null;
    shapes.push({ type, paras: paragraphsOf(m[0]) });
  }
  return shapes;
}

function parseSlideXml(xml) {
  const shapes = shapesOf(xml);
  const titleShape = shapes.find((s) => (s.type === 'title' || s.type === 'ctrTitle') && s.paras.length)
    || shapes.find((s) => s.paras.length);
  const title = titleShape ? titleShape.paras.join(' ').replace(/\s+/g, ' ').trim() : '';
  const text = paragraphsOf(xml)
    .filter((p, i, arr) => !(i === 0 && arr.length > 1 && p === title))
    .join('\n');
  return { title, text: text || '' };
}

function parseNotesXml(xml) {
  const shapes = shapesOf(xml).filter((s) => !['sldNum', 'sldImg', 'dt', 'ftr', 'hdr'].includes(s.type));
  const body = shapes.filter((s) => s.type === 'body');
  return (body.length ? body : shapes).flatMap((s) => s.paras).join('\n').trim();
}

// ---------------------------------------------------------------- pdf

let pdfjsPromise = null;

/** Loads pdfjs once: legacy build under Node (vitest), modern build + worker in the renderer. */
function loadPdfjs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    if (typeof window === 'undefined') {
      return import('pdfjs-dist/legacy/build/pdf.mjs');
    }
    const pdfjs = await import('pdfjs-dist');
    try {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      }
    } catch {
      // pdfjs falls back to a main-thread "fake worker" when the worker can't load.
    }
    return pdfjs;
  })().catch((err) => {
    pdfjsPromise = null;
    throw err;
  });
  return pdfjsPromise;
}

async function readPdf(u8, extension, base) {
  const out = { ...base, kind: 'pdf', pages: [] };
  const pdfjs = await loadPdfjs();
  // pdfjs transfers (detaches) the buffer it is given, so hand it a copy.
  const task = pdfjs.getDocument({
    data: u8.slice(),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  let doc;
  try {
    doc = await task.promise;
    for (let i = 1; i <= doc.numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        out.pages.push({ number: i, text: textItemsToString(content.items) });
        page.cleanup?.();
      } catch (err) {
        out.pages.push({ number: i, text: '' });
        out.warnings.push(`Page ${i}: ${err?.message || err}`);
      }
    }
  } finally {
    try {
      await (doc ? doc.destroy() : task.destroy());
    } catch {
      // ignore cleanup errors
    }
  }
  out.meta.pageCount = out.pages.length;
  out.text = out.pages.map((p) => `--- Page ${p.number} ---\n${p.text}`).join('\n\n');
  const chars = out.pages.reduce((n, p) => n + p.text.replace(/\s+/g, '').length, 0);
  if (!out.pages.length || chars / out.pages.length < 40) {
    attachVision(out, u8, 'application/pdf');
    out.warnings.push('This PDF has little or no selectable text (likely scanned) — AI vision is needed to read it.');
  }
  return out;
}

/** Joins pdfjs text items into lines, using hasEOL and y-position jumps as line breaks. */
function textItemsToString(items) {
  let s = '';
  let lastY = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const y = it.transform ? it.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !s.endsWith('\n')) s += '\n';
    else if (s && !s.endsWith('\n') && !s.endsWith(' ') && it.str && !it.str.startsWith(' ')) s += ' ';
    s += it.str;
    if (it.hasEOL) s += '\n';
    if (y !== null) lastY = y;
  }
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------- image / text

async function readImage(u8, extension, base) {
  const out = { ...base, kind: 'image' };
  attachVision(out, u8, IMAGE_MIME[extension] || 'application/octet-stream');
  return out;
}

async function readText(u8, extension, base) {
  const out = { ...base, kind: 'text' };
  let text = decodeUtf8(u8);
  if (extension === 'rtf') text = stripRtf(text);
  out.text = text;
  return out;
}

/** Crude RTF → text: drops groups like fonttbl/colortbl, control words and braces. */
export function stripRtf(rtf) {
  // Protect escaped braces/backslashes before stripping structure.
  let s = String(rtf).replace(/\\\\/g, '\u0003').replace(/\\\{/g, '\u0001').replace(/\\\}/g, '\u0002');
  s = s.replace(/\{\\\*[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '');
  s = s.replace(/\{\\(fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}\s*\}?/g, '');
  s = s.replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)));
  s = s.replace(/\\(par|line)\b ?/g, '\n').replace(/\\tab\b ?/g, '\t');
  s = s.replace(/\\[a-z]+-?\d* ?/gi, '').replace(/\\[^a-z]/gi, '').replace(/[{}]/g, '');
  s = s.split('\u0001').join('{').split('\u0002').join('}').split('\u0003').join('\\');
  return s.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
