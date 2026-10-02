// Format-preserving document map + patch engine (xlsx/xlsm/docx/dotx).
import { buildXlsxMap } from './xlsxMap';
import { applyXlsxEdits } from './xlsxPatch';
import { buildDocxMap } from './docxMap';
import { applyDocxEdits } from './docxPatch';

export { colToIndex, indexToCol, parseAddr, makeAddr, parseRange, inRange } from './addr';
export { buildXlsxMap, sheetGrid, getCell } from './xlsxMap';
export { applyXlsxEdits } from './xlsxPatch';
export { buildDocxMap } from './docxMap';
export { applyDocxEdits } from './docxPatch';
export { renderMapForAI, describeMap } from './renderForAI';

export function mapKindFor(name) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
  if (ext === 'docx' || ext === 'dotx') return 'docx';
  return null;
}

export async function buildMap(bytes, name) {
  const kind = mapKindFor(name);
  if (kind === 'xlsx') return buildXlsxMap(bytes);
  if (kind === 'docx') return buildDocxMap(bytes);
  return null;
}

export async function applyEdits(bytes, name, edits, opts) {
  const kind = mapKindFor(name);
  if (kind === 'xlsx') return applyXlsxEdits(bytes, edits, opts);
  if (kind === 'docx') return applyDocxEdits(bytes, edits);
  throw new Error(`Unsupported file type for editing: ${name}`);
}
