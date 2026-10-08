/**
 * slideHandout.js — a PowerPoint deck as a printable PDF handout (1, 2, 3 with note lines,
 * 4, 6 or 9 slides per page) or notes pages (each slide with its speaker notes), by code.
 * Each slide is drawn in a simplified way: background colour/picture, coloured shapes, text
 * (sizes, bold, colours, alignment, bullets), pictures, tables and grouped shapes.
 */
import { toUint8, interop, unescapeXml } from './shared.js';

const EMU = 12700; // EMU per point
const unesc = unescapeXml;
const attr = (xml, name) => (String(xml).match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];
const relsOf = (part) => part.replace(/([^/]+)$/, '_rels/$1.rels');
const resolve = (fromPart, target) => {
  const parts = fromPart.split('/').slice(0, -1);
  for (const seg of String(target).split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
};

function rels(zip, part) {
  const xml = zip.file(relsOf(part))?.asText() || '';
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => ({ id: attr(m[0], 'Id'), type: (attr(m[0], 'Type') || '').split('/').pop(), target: resolve(part, attr(m[0], 'Target') || '') }));
}

/** Theme colours (dk1, lt1, accent1 …) of the deck. */
function themeColors(zip, masterPart) {
  const theme = rels(zip, masterPart).find((r) => r.type === 'theme');
  const xml = theme ? zip.file(theme.target)?.asText() || '' : '';
  const out = {};
  for (const m of (xml.match(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/)?.[0] || '').matchAll(/<a:(\w+)>\s*<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")/g)) out[m[1]] = m[2] || m[3];
  return { dk1: '000000', lt1: 'FFFFFF', dk2: '1F2937', lt2: 'EEEEEE', ...out };
}

/** A colour inside an element: srgbClr, or a theme colour (schemeClr). → "RRGGBB" | null */
function colorOf(xml, theme) {
  const s = String(xml || '');
  const rgb = s.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  if (rgb) return rgb[1];
  const sch = s.match(/<a:schemeClr val="(\w+)"/);
  if (sch) {
    const map = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
    return theme[map[sch[1]] || sch[1]] || null;
  }
  return null;
}

const firstFill = (xml) => (String(xml || '').match(/<a:solidFill>[\s\S]*?<\/a:solidFill>|<a:gradFill\b[\s\S]*?<\/a:gradFill>|<a:blipFill\b[\s\S]*?<\/a:blipFill>|<a:noFill\/>/) || [''])[0];

/** Placeholder position from the layout or master when the slide does not give one. */
function placeholderXfrm(zip, part, ph) {
  const type = attr(ph, 'type') || 'body';
  const idx = attr(ph, 'idx');
  const layout = rels(zip, part).find((r) => r.type === 'slideLayout')?.target;
  const master = layout ? rels(zip, layout).find((r) => r.type === 'slideMaster')?.target : null;
  for (const p of [layout, master].filter(Boolean)) {
    const xml = zip.file(p)?.asText() || '';
    for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || []) {
      const lph = sp.match(/<p:ph\b[^>]*\/?>/)?.[0];
      if (!lph) continue;
      const ltype = attr(lph, 'type') || 'body';
      const same = (idx && attr(lph, 'idx') === idx) || ltype === type || (type === 'ctrTitle' && ltype === 'title') || (type === 'subTitle' && ltype === 'body');
      const x = sp.match(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/)?.[0];
      if (same && x) return x;
    }
  }
  return null;
}

const xfrmBox = (x) => {
  const off = x?.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
  const ext = x?.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
  return off && ext ? { x: Number(off[1]), y: Number(off[2]), w: Number(ext[1]), h: Number(ext[2]) } : null;
};

/** Paragraphs of a text body: [{ runs: [{ text, size, bold, color }], align, bullet, level }] */
function paragraphs(txBody, theme, { defaultSize, bulleted }) {
  const out = [];
  for (const p of txBody.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\/>/g) || []) {
    const pPr = p.match(/<a:pPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/)?.[0] || '';
    const level = Number(attr(pPr, 'lvl') || 0);
    const runs = [];
    for (const r of p.match(/<a:r>[\s\S]*?<\/a:r>|<a:br\b[^>]*\/>|<a:fld\b[\s\S]*?<\/a:fld>/g) || []) {
      if (r.startsWith('<a:br')) { runs.push({ text: '\n' }); continue; }
      const rPr = r.match(/<a:rPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:rPr>)/)?.[0] || '';
      const text = unesc((r.match(/<a:t>([\s\S]*?)<\/a:t>/) || ['', ''])[1]);
      if (!text) continue;
      runs.push({ text, size: attr(rPr, 'sz') ? Number(attr(rPr, 'sz')) / 100 : Math.max(10, defaultSize - level * 2), bold: attr(rPr, 'b') === '1', color: colorOf(rPr.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/)?.[0], theme) });
    }
    const hasText = runs.some((r) => r.text.trim());
    // A bullet: the paragraph's own (•, or 1. 2. 3.), or a body placeholder's unless turned off.
    const own = pPr.match(/<a:buChar char="([^"]*)"/)?.[1];
    const numbered = /<a:buAutoNum\b/.test(pPr);
    const bullet = hasText && !/<a:buNone\/>/.test(pPr) && (own !== undefined || numbered || bulleted);
    out.push({ runs, align: attr(pPr, 'algn') || 'l', bullet, mark: numbered ? 'num' : unesc(own || '•'), level });
  }
  return out;
}

/** Everything drawable on one slide, in slide EMU. */
function slideShapes(zip, part, theme) {
  const xml = zip.file(part)?.asText() || '';
  const shapes = [];
  const r = rels(zip, part);
  const walk = (tree, tx = (b) => b) => {
    for (const m of tree.matchAll(/<p:sp>[\s\S]*?<\/p:sp>|<p:pic>[\s\S]*?<\/p:pic>|<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>|<p:grpSp>[\s\S]*?<\/p:grpSp>|<p:cxnSp>[\s\S]*?<\/p:cxnSp>/g)) {
      const el = m[0];
      if (el.startsWith('<p:grpSp>')) {
        // Children are placed in the group's own space (chOff/chExt) scaled into its box.
        const g = el.match(/<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>/)?.[0] || '';
        const box = xfrmBox(g.match(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/)?.[0]);
        const ch = g.match(/<a:chOff x="(-?\d+)" y="(-?\d+)"\/>[\s\S]*?<a:chExt cx="(\d+)" cy="(\d+)"\/>/);
        const inner = el.slice(el.indexOf('</p:grpSpPr>') + 12, el.lastIndexOf('</p:grpSp>'));
        if (box && ch) {
          const [cx, cy, cw, chh] = ch.slice(1).map(Number);
          const sx = cw ? box.w / cw : 1;
          const sy = chh ? box.h / chh : 1;
          walk(inner, (b) => tx({ x: box.x + (b.x - cx) * sx, y: box.y + (b.y - cy) * sy, w: b.w * sx, h: b.h * sy }));
        } else walk(inner, tx);
        continue;
      }
      if (el.startsWith('<p:pic>')) {
        const box = xfrmBox(el.match(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/)?.[0]);
        const id = attr(el.match(/<a:blip\b[^>]*>/)?.[0] || '', 'r:embed');
        const target = r.find((x) => x.id === id)?.target;
        if (box && target) shapes.push({ kind: 'pic', box: tx(box), target });
        continue;
      }
      if (el.startsWith('<p:graphicFrame>')) {
        const box = xfrmBox(el.match(/<p:xfrm>[\s\S]*?<\/p:xfrm>/)?.[0]?.replace('<p:xfrm>', '<a:xfrm>').replace('</p:xfrm>', '</a:xfrm>'));
        const tbl = el.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)?.[0];
        if (box && tbl) {
          const cols = [...tbl.matchAll(/<a:gridCol w="(\d+)"/g)].map((c) => Number(c[1]));
          const rows = [...tbl.matchAll(/<a:tr h="(\d+)">([\s\S]*?)<\/a:tr>/g)].map((t) => ({ h: Number(t[1]), cells: (t[2].match(/<a:tc\b[\s\S]*?<\/a:tc>/g) || []).map((c) => unesc((c.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []).map((x) => x.replace(/<[^>]+>/g, '')).join(' '))) }));
          shapes.push({ kind: 'table', box: tx(box), cols, rows });
        }
        continue;
      }
      // Text boxes, placeholders and plain shapes (lines are skipped).
      if (el.startsWith('<p:cxnSp>')) continue;
      const ph = el.match(/<p:ph\b[^>]*\/?>/)?.[0];
      const spPr = el.match(/<p:spPr\b[^>]*(?:\/>|>[\s\S]*?<\/p:spPr>)/)?.[0] || '';
      const box = xfrmBox(spPr.match(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/)?.[0]) || (ph ? xfrmBox(placeholderXfrm(zip, part, ph)) : null);
      if (!box) continue;
      const type = ph ? attr(ph, 'type') || 'body' : null;
      const fill = firstFill(spPr.replace(/<a:ln\b[\s\S]*?<\/a:ln>/g, ''));
      const tx2 = el.match(/<p:txBody>[\s\S]*?<\/p:txBody>/)?.[0] || '';
      const isTitle = type === 'title' || type === 'ctrTitle';
      const defaultSize = isTitle ? 36 : type === 'subTitle' ? 22 : type === 'body' ? 22 : 18;
      shapes.push({
        kind: 'sp',
        box: tx(box),
        fill: fill.startsWith('<a:solidFill') ? colorOf(fill, theme) : null,
        anchor: attr(tx2.match(/<a:bodyPr\b[^>]*>/)?.[0] || '', 'anchor') || (isTitle ? 'ctr' : 't'),
        paras: tx2 ? paragraphs(tx2, theme, { defaultSize, bulleted: type === 'body' }) : [],
        title: isTitle,
      });
    }
  };
  walk(xml.match(/<p:spTree>[\s\S]*<\/p:spTree>/)?.[0] || '');
  return shapes;
}

/** The slide background: { color } or { target } (a picture), from the slide, layout or master. */
function background(zip, part, theme) {
  const layout = rels(zip, part).find((r) => r.type === 'slideLayout')?.target;
  const master = layout ? rels(zip, layout).find((r) => r.type === 'slideMaster')?.target : null;
  for (const p of [part, layout, master].filter(Boolean)) {
    const bg = zip.file(p)?.asText().match(/<p:bg>[\s\S]*?<\/p:bg>/)?.[0];
    if (!bg) continue;
    const blip = bg.match(/<a:blip\b[^>]*r:embed="([^"]+)"/);
    if (blip) { const t = rels(zip, p).find((x) => x.id === blip[1])?.target; if (t) return { target: t }; }
    const c = colorOf(bg, theme);
    if (c) return { color: c };
  }
  return { color: 'FFFFFF' };
}

/**
 * The deck read for printing.
 * → { width, height (EMU), slides: [{ n, part, bg, shapes, notes }], media: (target) → bytes }
 */
export async function readDeck(bytes) {
  const PizZip = interop(await import('pizzip'));
  const zip = new PizZip(toUint8(bytes));
  const pres = zip.file('ppt/presentation.xml')?.asText();
  if (!pres) throw new Error('This file is not a PowerPoint deck (.pptx).');
  const width = Number(attr(pres.match(/<p:sldSz\b[^>]*\/>/)?.[0] || '', 'cx')) || 9144000;
  const height = Number(attr(pres.match(/<p:sldSz\b[^>]*\/>/)?.[0] || '', 'cy')) || 6858000;
  const presRels = rels(zip, 'ppt/presentation.xml');
  const order = [...(pres.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '').matchAll(/r:id="([^"]+)"/g)].map((m) => presRels.find((r) => r.id === m[1])?.target).filter(Boolean);
  const slides = order.map((part, i) => {
    const layout = rels(zip, part).find((r) => r.type === 'slideLayout')?.target;
    const master = layout ? rels(zip, layout).find((r) => r.type === 'slideMaster')?.target : null;
    const theme = master ? themeColors(zip, master) : themeColors(zip, part);
    const notesPart = rels(zip, part).find((r) => r.type === 'notesSlide')?.target;
    let notes = '';
    if (notesPart) {
      const nx = zip.file(notesPart)?.asText() || '';
      const body = (nx.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || []).find((sp) => /<p:ph\b[^>]*type="body"/.test(sp)) || '';
      notes = (body.match(/<a:p>[\s\S]*?<\/a:p>/g) || []).map((p) => unesc((p.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''))).join('\n').trim();
    }
    return { n: i + 1, part, bg: background(zip, part, theme), shapes: slideShapes(zip, part, theme), notes };
  });
  return { width, height, slides, media: (target) => zip.file(target)?.asUint8Array() || null };
}

const PAPER = { long: [612, 936], a4: [595.28, 841.89], letter: [612, 792] };
const hex = (h, rgb) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);

/**
 * The handout PDF.
 *   perPage: 1 | 2 | 3 | 4 | 6 | 9; notes: notes pages (slide + speaker notes); title: printed on top
 */
export async function buildHandout(deck, { perPage = 3, notes = false, paper = 'long', title = '' } = {}) {
  const lib = await import('pdf-lib');
  const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = lib;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Letters the standard PDF font cannot show become "?" (instead of failing the whole file).
  const safe = (f, s) => [...String(s)].map((ch) => { try { f.encodeText(ch); return ch; } catch { return ch === '\t' ? ' ' : '?'; } }).join('');
  const images = new Map();
  const imageFor = async (target) => {
    if (images.has(target)) return images.get(target);
    const u8 = deck.media(target);
    let img = null;
    try {
      if (u8 && u8[0] === 0x89 && u8[1] === 0x50) img = await pdf.embedPng(u8);
      else if (u8 && u8[0] === 0xff && u8[1] === 0xd8) img = await pdf.embedJpg(u8);
    } catch { img = null; }
    images.set(target, img);
    return img;
  };
  const [PW, PH] = PAPER[paper] || PAPER.long;
  const margin = 36;
  const top = title ? 50 : 30;
  const grids = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 9: [3, 3] };
  const per = notes ? 1 : grids[perPage] ? perPage : 3;
  const [cols, rowsN] = notes ? [1, 1] : grids[per];
  const aspect = deck.height / deck.width;

  const drawSlide = async (page, slide, X, Ytop, W) => {
    const H = W * aspect;
    const s = W / deck.width; // slide EMU → handout points
    const k = W / (deck.width / EMU); // slide points → handout points
    const Y = Ytop - H;
    page.pushOperators(pushGraphicsState(), rectangle(X, Y, W, H), clip(), endPath());
    if (slide.bg.target) {
      const img = await imageFor(slide.bg.target);
      if (img) page.drawImage(img, { x: X, y: Y, width: W, height: H });
      else page.drawRectangle({ x: X, y: Y, width: W, height: H, color: rgb(1, 1, 1) });
    } else page.drawRectangle({ x: X, y: Y, width: W, height: H, color: hex(slide.bg.color, rgb) });
    for (const sh of slide.shapes) {
      const bx = X + sh.box.x * s;
      const bw = sh.box.w * s;
      const bh = sh.box.h * s;
      const byTop = Ytop - sh.box.y * s;
      if (sh.kind === 'pic') {
        const img = await imageFor(sh.target);
        if (img) page.drawImage(img, { x: bx, y: byTop - bh, width: bw, height: bh });
        else page.drawRectangle({ x: bx, y: byTop - bh, width: bw, height: bh, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
        continue;
      }
      if (sh.kind === 'table') {
        const total = sh.cols.reduce((a, b) => a + b, 0) || 1;
        let ry = byTop;
        for (const row of sh.rows) {
          // Rows tall enough for 14 pt slide text (scaled), even when the deck stores a small height.
          const size = Math.max(3, 14 * k);
          const rh = Math.max(row.h * s, size * 1.6);
          let cx = bx;
          sh.cols.forEach((cw, ci) => {
            const w = (cw / total) * bw;
            page.drawRectangle({ x: cx, y: ry - rh, width: w, height: rh, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.4 });
            let t = safe(font, row.cells[ci] || '');
            while (t && font.widthOfTextAtSize(t, size) > w - 2) t = t.slice(0, -1);
            if (t) page.drawText(t, { x: cx + 1, y: ry - rh / 2 - size / 3, size, font, color: rgb(0, 0, 0) });
            cx += w;
          });
          ry -= rh;
        }
        continue;
      }
      if (sh.fill) page.drawRectangle({ x: bx, y: byTop - bh, width: bw, height: bh, color: hex(sh.fill, rgb) });
      // Text: words wrapped to the box; each paragraph keeps its size, weight, colour, alignment.
      const lines = [];
      let num = 0;
      for (const p of sh.paras) {
        num = p.bullet && p.mark === 'num' ? num + 1 : 0;
        const markText = p.bullet ? (p.mark === 'num' ? `${num}. ` : `${p.mark} `) : '';
        const size0 = p.runs.find((r) => r.size)?.size || (sh.title ? 36 : 18);
        const size = Math.max(2.5, size0 * k); // slide points → handout points
        const runText = p.runs.map((r) => r.text).join('');
        const isBold = p.runs.some((r) => r.bold) || sh.title;
        const f = isBold ? bold : font;
        const color = p.runs.find((r) => r.color)?.color || '000000';
        const indent = p.bullet ? (p.level + 1) * size * 1.2 : 0;
        for (const hard of (`${markText}${runText}`).split('\n')) {
          let line = '';
          for (const word of safe(f, hard).split(/(\s+)/)) {
            const next = line + word;
            if (line && f.widthOfTextAtSize(next.trimEnd(), size) > bw - indent - 4) { lines.push({ text: line.trimEnd(), size, f, color, align: p.align, indent }); line = word.trimStart(); } else line = next;
          }
          lines.push({ text: line.trimEnd(), size, f, color, align: p.align, indent });
        }
      }
      const textH = lines.reduce((a, l) => a + l.size * 1.2, 0);
      let ty = sh.anchor === 'ctr' ? byTop - (bh - textH) / 2 : sh.anchor === 'b' ? byTop - bh + textH : byTop - 2;
      for (const l of lines) {
        ty -= l.size * 1.2;
        if (!l.text) continue;
        const lw = l.f.widthOfTextAtSize(l.text, l.size);
        const lx = l.align === 'ctr' ? bx + (bw - lw) / 2 : l.align === 'r' ? bx + bw - lw - 2 : bx + 2 + l.indent;
        page.drawText(l.text, { x: lx, y: ty + l.size * 0.25, size: l.size, font: l.f, color: hex(l.color, rgb) });
      }
    }
    page.pushOperators(popGraphicsState());
    page.drawRectangle({ x: X, y: Y, width: W, height: H, borderColor: rgb(0.55, 0.55, 0.55), borderWidth: 0.6 });
    return H;
  };

  const pages = Math.ceil(deck.slides.length / per);
  for (let pi = 0; pi < pages; pi += 1) {
    const page = pdf.addPage([PW, PH]);
    if (title) page.drawText(safe(bold, title).slice(0, 90), { x: margin, y: PH - 32, size: 11, font: bold, color: rgb(0.15, 0.15, 0.15) });
    page.drawText(`Page ${pi + 1} of ${pages}`, { x: PW / 2 - 25, y: 18, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    const areaW = PW - 2 * margin;
    const areaH = PH - top - margin;
    const group = deck.slides.slice(pi * per, pi * per + per);
    if (notes) {
      const slide = group[0];
      const W = areaW * 0.8;
      const H = await drawSlide(page, slide, margin + (areaW - W) / 2, PH - top, W);
      page.drawText(`Slide ${slide.n}`, { x: margin, y: PH - top - H - 16, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
      let y = PH - top - H - 34;
      const size = 11;
      for (const para of (slide.notes || '(No speaker notes on this slide.)').split('\n')) {
        let line = '';
        for (const word of safe(font, para).split(/(\s+)/)) {
          if (line && font.widthOfTextAtSize((line + word).trimEnd(), size) > areaW) { page.drawText(line.trimEnd(), { x: margin, y, size, font }); y -= size * 1.35; line = word.trimStart(); } else line += word;
          if (y < margin + 10) break;
        }
        if (y < margin + 10) break;
        page.drawText(line.trimEnd(), { x: margin, y, size, font });
        y -= size * 1.6;
      }
      continue;
    }
    const lined = per === 3;
    const cellW = lined ? areaW * 0.55 : areaW / cols;
    const cellH = areaH / rowsN;
    const gap = 14;
    for (const [k, slide] of group.entries()) {
      const c = k % cols;
      const r = Math.floor(k / cols);
      let W = cellW - gap;
      if (W * aspect > cellH - gap - 10) W = (cellH - gap - 10) / aspect;
      const X = margin + c * cellW + (lined ? 0 : (cellW - W) / 2);
      const Ytop = PH - top - r * cellH;
      const H = await drawSlide(page, slide, X, Ytop, W);
      page.drawText(`Slide ${slide.n}`, { x: X, y: Ytop - H - 9, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
      if (lined) {
        // Lines for the learner's own notes, beside the slide.
        const lx = margin + cellW + 8;
        for (let ly = Ytop - 14; ly > Ytop - cellH + gap; ly -= 18) page.drawLine({ start: { x: lx, y: ly }, end: { x: PW - margin, y: ly }, thickness: 0.4, color: rgb(0.6, 0.6, 0.6) });
      }
    }
  }
  return toUint8(await pdf.save());
}
