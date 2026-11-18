/**
 * Pinned files and folders in the KaTuroDesk Explorer, kept per open folder on this computer
 * (localStorage; a convenience, nothing breaks without it). Paths are workspace-relative.
 */
import { remapPaths } from '../../services/desk/remapPaths';

const MAX_PINS = 30;
const keyFor = (rootPath) => `katuro-desk-pins:${String(rootPath || '').toLowerCase()}`;

export function loadPins(rootPath) {
  if (!rootPath) return [];
  try {
    const list = JSON.parse(localStorage.getItem(keyFor(rootPath)) || '[]');
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string' && p).slice(0, MAX_PINS) : [];
  } catch {
    return [];
  }
}

export function savePins(rootPath, pins) {
  if (!rootPath) return;
  try {
    localStorage.setItem(keyFor(rootPath), JSON.stringify(pins.slice(0, MAX_PINS)));
  } catch { /* private window or storage blocked */ }
}

export const togglePin = (pins, path) => (pins.includes(path) ? pins.filter((p) => p !== path) : [path, ...pins].slice(0, MAX_PINS));

/** After a rename (newPath) or delete (null): pins on it or inside it follow or go. */
export const movePins = (pins, oldPath, newPath) => remapPaths(pins, oldPath, newPath);

/** The KaTuro folder moved: its pins come along. */
export function carryPins(fromRoot, toRoot) {
  const pins = loadPins(fromRoot);
  if (pins.length && !loadPins(toRoot).length) savePins(toRoot, pins);
}

/** Every item of the tree by its path (folders and files). */
export function indexTree(items, map = new Map()) {
  for (const it of items || []) {
    map.set(it.path, it);
    if (Array.isArray(it.children)) indexTree(it.children, map);
  }
  return map;
}
