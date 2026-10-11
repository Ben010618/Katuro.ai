/**
 * reader.js — reads a photo of a KaTuro bubble sheet. Pure code, no AI, no internet.
 *
 *   1. find the four black corner markers
 *   2. map the sheet's millimetres (layout.js) onto the photo (perspective-corrected)
 *   3. read the learner's QR code (this also tells which way up the sheet is)
 *   4. measure how dark each bubble is, against the white paper and the black markers
 *
 * Nothing is guessed: a light mark, two marks, an unreadable code or missing corners
 * are reported for the teacher to look at.
 */

import jsQR from 'jsqr';

// How dark a bubble must be (0 = paper white, 1 = printed black), above the sheet's
// normal empty-bubble level.
export const MARK = 0.3; // clearly shaded
export const FAINT = 0.1; // something is there, but too light to count on its own
export const SECOND = 0.2; // a second bubble this dark in the same item = two answers

/** RGBA pixels → one gray value per pixel. */
export function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i += 1, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}

/** Dark pixels, judged against their surroundings (works in uneven light). */
function darkMask(gray, w, h) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const s = Math.max(15, Math.round(Math.max(w, h) / 10)) >> 1;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - s);
    const y1 = Math.min(h, y + s + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - s);
      const x1 = Math.min(w, x + s + 1);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const v = gray[y * w + x];
      if (v * (x1 - x0) * (y1 - y0) < sum * 0.78 && v < 170) mask[y * w + x] = 1;
    }
  }
  return mask;
}

/** Connected dark shapes: [{ area, x0, y0, x1, y1, cx, cy }]. */
function blobs(mask, w, h) {
  const label = new Int32Array(w * h);
  const out = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || label[start]) continue;
    const id = out.length + 1;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    const b = { area: 0, x0: w, y0: h, x1: 0, y1: 0, sx: 0, sy: 0 };
    while (top) {
      const p = stack[--top];
      const x = p % w;
      const y = (p - x) / w;
      b.area += 1; b.sx += x; b.sy += y;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[top++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[top++] = p + 1; }
      if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = id; stack[top++] = p - w; }
      if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = id; stack[top++] = p + w; }
    }
    out.push({ area: b.area, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, cx: b.sx / b.area, cy: b.sy / b.area });
  }
  return out;
}

/** Solves A·x = b (n×n) by Gaussian elimination; null when singular. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** The perspective map taking 4 source points to 4 destination points: (x, y) → [x', y']. */
export function homography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  if (!h) return null;
  return (x, y) => {
    const d = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
  };
}

const polyArea = (q) => Math.abs(q.reduce((s, p, i) => {
  const n = q[(i + 1) % q.length];
  return s + p[0] * n[1] - n[0] * p[1];
}, 0)) / 2;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function convex(q) {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-9) return false;
    if (!sign) sign = Math.sign(z);
    else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

/**
 * Possible sets of the four corner markers, biggest first; each is clockwise from the one
 * nearest the photo's top-left: [[[x, y] ×4], …]. `frame` and `marker` come from the layout (mm).
 */
export function findCorners(gray, w, h, { frame, marker }) {
  const all = blobs(darkMask(gray, w, h), w, h);
  const cands = all
    .filter((b) => {
      const bw = b.x1 - b.x0 + 1;
      const bh = b.y1 - b.y0 + 1;
      return bw >= 6 && bh >= 6 && bw / bh > 0.5 && bw / bh < 2 && b.area / (bw * bh) > 0.5 && b.area < (w * h) / 40;
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, 18);
  const want = frame.w / frame.h;
  const F = [[0, 0], [frame.w, 0], [frame.w, frame.h], [0, frame.h]];
  const found = [];
  const n = cands.length;
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) for (let k = j + 1; k < n; k += 1) for (let l = k + 1; l < n; l += 1) {
    const four = [cands[i], cands[j], cands[k], cands[l]];
    const cx = four.reduce((s, b) => s + b.cx, 0) / 4;
    const cy = four.reduce((s, b) => s + b.cy, 0) / 4;
    const sorted = four.sort((a, b) => Math.atan2(a.cy - cy, a.cx - cx) - Math.atan2(b.cy - cy, b.cx - cx));
    const start = sorted.reduce((bi, b, idx, arr) => (b.cx + b.cy < arr[bi].cx + arr[bi].cy ? idx : bi), 0);
    const ordered = [0, 1, 2, 3].map((x) => sorted[(start + x) % 4]);
    const q = ordered.map((b) => [b.cx, b.cy]);
    if (!convex(q)) continue;
    const sideA = (dist(q[0], q[1]) + dist(q[2], q[3])) / 2;
    const sideB = (dist(q[1], q[2]) + dist(q[3], q[0])) / 2;
    const turn = [0, 1].find((t) => {
      const r = (t ? sideB / sideA : sideA / sideB) / want;
      return r > 0.65 && r < 1.55;
    });
    if (turn === undefined) continue;
    // Each blob must be the size a corner marker has at that spot of the (tilted) sheet;
    // a shaded bubble is smaller, the QR code bigger.
    const map = homography(F, [0, 1, 2, 3].map((x) => q[(x + turn) % 4]));
    if (!map) continue;
    const fits = [0, 1, 2, 3].every((x) => {
      const [fx, fy] = F[x];
      const sq = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => map(fx + (dx * marker) / 2, fy + (dy * marker) / 2));
      const r = ordered[(x + turn) % 4].area / polyArea(sq);
      return r > 0.6 && r < 1.6;
    });
    if (fits) found.push({ area: polyArea(q), q });
  }
  return found.sort((a, b) => b.area - a.area).slice(0, 6).map((f) => f.q);
}

/** Bilinear gray value at a (fractional) pixel; white outside the photo. */
function sample(gray, w, h, x, y) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 255;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = gray[y0 * w + x0] * (1 - fx) + gray[y0 * w + x1] * fx;
  const b = gray[y1 * w + x0] * (1 - fx) + gray[y1 * w + x1] * fx;
  return a * (1 - fy) + b * fy;
}

/** Average gray in a disk (mm) on the sheet. */
function diskMean(gray, w, h, map, x, y, r) {
  let sum = 0;
  let n = 0;
  for (const [rr, k] of [[0, 1], [0.33, 8], [0.66, 12], [1, 16]]) {
    for (let i = 0; i < k; i += 1) {
      const a = (i / k) * Math.PI * 2;
      const [px, py] = map(x + Math.cos(a) * r * rr, y + Math.sin(a) * r * rr);
      sum += sample(gray, w, h, px, py);
      n += 1;
    }
  }
  return sum / n;
}

/** The QR code's text, read from a straightened copy of its corner of the sheet. */
function readCode(gray, w, h, map, layout, decode) {
  const { qr } = layout;
  const margin = qr.size * 0.2;
  const ppm = Math.max(4, Math.min(16, 160 / qr.size)); // output pixels per mm
  const size = Math.round((qr.size + 2 * margin) * ppm);
  const g = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [px, py] = map(qr.x - margin + x / ppm, qr.y - margin + y / ppm);
      g[y * size + x] = sample(gray, w, h, px, py);
    }
  }
  const toRgba = (f) => {
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < g.length; i += 1) {
      const v = f(g[i]);
      rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
    }
    return rgba;
  };
  const first = decode(toRgba((v) => v), size, size);
  if (first) return first;
  // A blurry or dim code: sharpen the contrast to pure black and white, then try again.
  const sorted = Array.from(g).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.05)];
  const hi = sorted[Math.floor(sorted.length * 0.95)];
  const mid = (lo + hi) / 2;
  return decode(toRgba((v) => (v < mid ? 0 : 255)), size, size);
}

// Share of printed bubble outlines found exactly where the layout puts them. A wrong
// frame (wrong corners, or upside down) scores low and is never used.
export const ALIGNED = 0.75;
function alignment(gray, w, h, map, layout) {
  const step = Math.max(1, Math.floor(layout.bubbles.length / 120));
  let hit = 0;
  let n = 0;
  for (let i = 0; i < layout.bubbles.length; i += step) {
    const b = layout.bubbles[i];
    let ring = 0;
    for (let a = 0; a < 16; a += 1) {
      const t = (a / 16) * Math.PI * 2;
      const [px, py] = map(b.x + Math.cos(t) * b.r, b.y + Math.sin(t) * b.r);
      ring += sample(gray, w, h, px, py);
    }
    ring /= 16;
    // Paper just outside the outline, left and right (between neighbouring bubbles).
    const gap = Math.max(...[-1, 1].map((d) => {
      const [px, py] = map(b.x + d * (b.r + 0.45), b.y - b.r * 0.8);
      return sample(gray, w, h, px, py);
    }));
    if (gap - ring > Math.max(8, gap * 0.06)) hit += 1;
    n += 1;
  }
  return n ? hit / n : 0;
}

const defaultDecode = (rgba, w, h) => jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;

/**
 * Reads one photo.
 *   image: { gray, width, height }   layout: sheetLayout(...)
 *   accept(code) → true when the QR text belongs to this quiz (e.g. the right set id)
 * → { ok: true, code, answers: { 1: 'A' | '' | '?' }, notes: { 1: 'two marks' | 'light mark' }, fills }
 *   or { ok: false, error }
 */
export function readSheet(image, layout, { accept = () => true, decode = defaultDecode } = {}) {
  const { gray, width: w, height: h } = image;
  const frames = findCorners(gray, w, h, layout);
  if (!frames.length) return { ok: false, error: 'corners' };
  const F = layout.frame;
  const frameCorners = [[0, 0], [F.w, 0], [F.w, F.h], [0, F.h]];
  const want = F.w / F.h;
  // Which corners, and which way up: every fitting turn of every possible frame is tried.
  // The printed bubble outlines must sit where the layout says (alignment), and the QR
  // code is read; the best-aligned frame wins, a readable code breaks ties.
  let chosen = null;
  for (const corners of frames) {
    const sideA = (dist(corners[0], corners[1]) + dist(corners[2], corners[3])) / 2;
    const sideB = (dist(corners[1], corners[2]) + dist(corners[3], corners[0])) / 2;
    for (const k of [0, 1, 2, 3]) {
      const r = (k % 2 ? sideB / sideA : sideA / sideB) / want;
      if (r < 0.65 || r > 1.55) continue;
      const map = homography(frameCorners, [0, 1, 2, 3].map((i) => corners[(i + k) % 4]));
      if (!map) continue;
      const fit = alignment(gray, w, h, map, layout);
      if (fit < ALIGNED) continue;
      const text = readCode(gray, w, h, map, layout, decode);
      const code = text && accept(text) ? text : null;
      const score = fit + (code ? 1 : 0);
      if (!chosen || score > chosen.score) chosen = { map, code, fit, score };
    }
    if (chosen?.code) break;
  }
  if (!chosen) return { ok: false, error: 'alignment' };
  const { map, code } = chosen;

  // Printed black (the markers) and the paper white beside each item's bubbles.
  const black = frameCorners.reduce((s, [x, y]) => s + diskMean(gray, w, h, map, x, y, layout.marker * 0.25), 0) / 4;
  const byItem = new Map();
  for (const b of layout.bubbles) {
    if (!byItem.has(b.item)) byItem.set(b.item, []);
    byItem.get(b.item).push(b);
  }
  const fills = {};
  const all = [];
  for (const [item, row] of byItem) {
    const gaps = [];
    for (let i = 0; i + 1 < row.length; i += 1) gaps.push(diskMean(gray, w, h, map, (row[i].x + row[i + 1].x) / 2, row[i].y, 0.18));
    gaps.push(diskMean(gray, w, h, map, row[0].x - row[0].r - (row[1].x - row[0].x - 2 * row[0].r) / 2, row[0].y, 0.15));
    const white = Math.max(...gaps);
    const range = Math.max(30, white - black);
    fills[item] = row.map((b) => Math.max(0, Math.min(1, (white - diskMean(gray, w, h, map, b.x, b.y, b.r * 0.6)) / range)));
    all.push(...fills[item]);
  }
  const sorted = [...all].sort((a, b) => a - b);
  const base = sorted[Math.floor(sorted.length / 2)] || 0;
  const answers = {};
  const notes = {};
  for (const [item, row] of byItem) {
    const d = fills[item].map((f) => f - base);
    const order = d.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const [top, second = [-1]] = order;
    if (top[0] >= MARK && second[0] < SECOND) answers[item] = row[top[1]].letter;
    else if (top[0] >= MARK) { answers[item] = '?'; notes[item] = 'two marks'; }
    else if (top[0] >= FAINT) { answers[item] = '?'; notes[item] = 'light mark'; }
    else answers[item] = '';
  }
  return { ok: true, code, answers, notes, fills, alignment: Math.round(chosen.fit * 100) / 100 };
}
