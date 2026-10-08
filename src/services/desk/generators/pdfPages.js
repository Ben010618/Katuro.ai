/**
 * pdfPages.js — page tools for a PDF, by code (pdf-lib): delete, reorder and rotate pages,
 * then page numbers, a watermark ("DRAFT") and a logo on every page. Stamps are placed on
 * the page as it is SEEN, so they sit right on turned (landscape/rotated) pages too.
 */
import { toUint8 } from './shared.js';

/**
 * "1,3-5", "all", "odd", "even", "last", "2-last" → sorted page numbers (1-based), or an error text.
 */
export function parsePages(spec, total) {
  const s = String(spec ?? '').toLowerCase().replace(/\s+/g, '').replace(/pages?/g, '');
  if (!s) return { error: 'no pages given' };
  if (s === 'all') return { pages: Array.from({ length: total }, (_, i) => i + 1) };
  if (s === 'odd' || s === 'even') return { pages: Array.from({ length: total }, (_, i) => i + 1).filter((n) => n % 2 === (s === 'odd' ? 1 : 0)) };
  const out = new Set();
  for (const part of s.split(',').filter(Boolean)) {
    const m = part.replace(/last/g, String(total)).match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return { error: `"${part}" is not a page number` };
    const a = Number(m[1]);
    const b = Number(m[2] ?? m[1]);
    if (a < 1 || b > total || a > b) return { error: `page ${a > total || b > total ? Math.max(a, b) : a} is not in this ${total}-page PDF` };
    for (let n = a; n <= b; n += 1) out.add(n);
  }
  return { pages: [...out].sort((x, y) => x - y) };
}

/** How to draw on a page as it is seen: its seen size and seen → PDF coordinates. */
function seen(page) {
  const { width: w, height: h } = page.getSize();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  if (rot === 90) return { W: h, H: w, rot, at: (X, Y) => ({ x: w - Y, y: X }) };
  if (rot === 180) return { W: w, H: h, rot, at: (X, Y) => ({ x: w - X, y: h - Y }) };
  if (rot === 270) return { W: h, H: w, rot, at: (X, Y) => ({ x: Y, y: h - X }) };
  return { W: w, H: h, rot: 0, at: (X, Y) => ({ x: X, y: Y }) };
}

/**
 * Applies the page tools in a safe order: delete → reorder → rotate → numbers, watermark, logo.
 *   ops: { remove: [n], order: [n], rotate: { pages: [n], degrees }, numbers: { position, format, start },
 *          watermark: { text, opacity }, logo: { bytes, position, widthIn } }
 * → { bytes, pages, done: [text], logoBoxes: [seen box per page] }
 */
export async function applyPageTools(bytes, ops = {}) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const src = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
  if (src.isEncrypted) throw new Error('This PDF is password-protected. Remove the password first.');
  const total = src.getPageCount();
  const done = [];
  // 1–2. Which pages, in which order (copied into a new PDF so links to removed pages go away).
  let order = Array.from({ length: total }, (_, i) => i + 1);
  if (ops.remove?.length) {
    order = order.filter((n) => !ops.remove.includes(n));
    if (!order.length) throw new Error('That would remove every page.');
    done.push(`removed page${ops.remove.length > 1 ? 's' : ''} ${ops.remove.join(', ')}`);
  }
  if (ops.order?.length) {
    const kept = new Set(order);
    const wanted = ops.order.filter((n) => kept.has(n));
    order = [...wanted, ...order.filter((n) => !wanted.includes(n))];
    done.push(`pages now in the order ${order.join(', ')}`);
  }
  const out = await PDFDocument.create();
  (await out.copyPages(src, order.map((n) => n - 1))).forEach((p) => out.addPage(p));
  const pages = out.getPages();
  // 3. Turn pages (numbers refer to the original page numbers).
  if (ops.rotate?.pages?.length && ops.rotate.degrees) {
    const deg = ((Number(ops.rotate.degrees) % 360) + 360) % 360;
    order.forEach((orig, i) => { if (ops.rotate.pages.includes(orig)) pages[i].setRotation(degrees((pages[i].getRotation().angle + deg) % 360)); });
    done.push(`turned page${ops.rotate.pages.length > 1 ? 's' : ''} ${ops.rotate.pages.join(', ')} by ${deg}°`);
  }
  // 4. Stamps.
  const font = await out.embedFont(StandardFonts.Helvetica);
  const boldFont = await out.embedFont(StandardFonts.HelveticaBold);
  if (ops.numbers) {
    const start = Number(ops.numbers.start) || 1;
    const fmt = ops.numbers.format || 'Page {n} of {total}';
    const last = start + pages.length - 1;
    pages.forEach((p, i) => {
      const v = seen(p);
      const text = fmt.replace('{n}', String(start + i)).replace('{total}', String(last));
      const size = 10;
      const tw = font.widthOfTextAtSize(text, size);
      const pos = ops.numbers.position || 'bottom-center';
      const X = /right/.test(pos) ? v.W - 40 - tw : /left/.test(pos) ? 40 : (v.W - tw) / 2;
      const Y = /top/.test(pos) ? v.H - 30 : 22;
      const { x, y } = v.at(X, Y);
      p.drawText(text, { x, y, size, font, color: rgb(0.2, 0.2, 0.2), rotate: degrees(v.rot) });
    });
    done.push(`page numbers (${fmt.replace('{n}', String(start)).replace('{total}', String(last))} …) at the ${(ops.numbers.position || 'bottom-center').replace('-', ' ')}`);
  }
  if (ops.watermark?.text) {
    const text = String(ops.watermark.text).slice(0, 30);
    const opacity = Math.min(0.5, Math.max(0.05, Number(ops.watermark.opacity) || 0.18));
    pages.forEach((p) => {
      const v = seen(p);
      const angle = Math.atan2(v.H, v.W); // along the diagonal
      let size = 120;
      while (size > 20 && boldFont.widthOfTextAtSize(text, size) > Math.hypot(v.W, v.H) * 0.7) size -= 4;
      const tw = boldFont.widthOfTextAtSize(text, size);
      const th = size * 0.7;
      // Start so the text is centred on the page along the diagonal.
      const X = v.W / 2 - (tw / 2) * Math.cos(angle) + (th / 2) * Math.sin(angle);
      const Y = v.H / 2 - (tw / 2) * Math.sin(angle) - (th / 2) * Math.cos(angle);
      const { x, y } = v.at(X, Y);
      p.drawText(text, { x, y, size, font: boldFont, color: rgb(0.6, 0.6, 0.6), opacity, rotate: degrees(v.rot + (angle * 180) / Math.PI) });
    });
    done.push(`"${text}" watermark on every page`);
  }
  const logoBoxes = [];
  if (ops.logo?.bytes) {
    const u8 = toUint8(ops.logo.bytes);
    const img = u8[0] === 0x89 ? await out.embedPng(u8) : await out.embedJpg(u8);
    const wPt = Math.min(2.5, Math.max(0.4, Number(ops.logo.widthIn) || 0.9)) * 72;
    const hPt = (img.height / img.width) * wPt;
    const pos = ops.logo.position || 'top-left';
    pages.forEach((p) => {
      const v = seen(p);
      const X = /right/.test(pos) ? v.W - 30 - wPt : /center/.test(pos) ? (v.W - wPt) / 2 : 30;
      const Y = /bottom/.test(pos) ? 30 : v.H - 24 - hPt;
      const { x, y } = v.at(X, Y);
      p.drawImage(img, { x, y, width: wPt, height: hPt, rotate: degrees(v.rot) });
      // Where the logo sits as seen (top-left origin), to check it does not cover text.
      logoBoxes.push({ left: X, right: X + wPt, top: v.H - Y - hPt, bottom: v.H - Y });
    });
    done.push(`logo at the ${pos.replace('-', ' ')} of every page`);
  }
  return { bytes: toUint8(await out.save()), pages: pages.length, done, logoBoxes };
}
