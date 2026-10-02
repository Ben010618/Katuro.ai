// Zip helpers shared by the map builders and patchers.
import JSZip from 'jszip';
import { parseXml, kids, getAttr } from './xml';

export const INVALID_FILE = 'Not a valid Excel/Word file';

export async function loadZip(bytes) {
  try {
    if (!bytes || !(bytes.byteLength > 0)) throw new Error('empty');
    return await JSZip.loadAsync(bytes);
  } catch {
    throw new Error(INVALID_FILE);
  }
}

export async function readText(zip, path) {
  const f = zip.file(path);
  return f ? f.async('string') : null;
}

export function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i + 1) : '';
}

export function resolveTarget(basePart, target) {
  if (!target) return '';
  if (target.startsWith('/')) return normalizePath(target.slice(1));
  return normalizePath(dirOf(basePart) + target);
}

function normalizePath(p) {
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

export function relsPathFor(part) {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
}

// Relationships of a part: [{id, type, target, external, path}]
export async function readRels(zip, part) {
  const xml = await readText(zip, relsPathFor(part));
  if (!xml) return [];
  const tree = parseXml(xml);
  const rootEl = kids(tree)[0];
  return kids(rootEl, 'Relationship').map((r) => {
    const target = getAttr(r, 'Target') || '';
    const external = getAttr(r, 'TargetMode') === 'External';
    return {
      id: getAttr(r, 'Id'),
      type: getAttr(r, 'Type') || '',
      target,
      external,
      path: external ? null : resolveTarget(part, target),
    };
  });
}

export async function mainPartPath(zip, fallback) {
  const rels = await readRels(zip, '');
  const r = rels.find((x) => /\/officeDocument$/.test(x.type));
  const p = r && r.path ? r.path : fallback;
  return zip.file(p) ? p : (zip.file(fallback) ? fallback : null);
}

export async function writeZip(zip) {
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export function toUint8(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return bytes;
}
