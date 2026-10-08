/**
 * localFileSystem.js - Unified workspace file engine for KaTuroDesk
 *
 * One API over three backends, chosen by `handle.kind`:
 *   'electron' — KaTuroDesk desktop app, real disk via the preload IPC bridge (binary safe)
 *   'fsa'      — Chromium File System Access API (web /desk route)
 *   'virtual'  — in-memory demo workspace (browsers without FSA, tests)
 *
 * All paths passed in are workspace-relative and use forward slashes.
 */

export const isFileSystemAccessSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const desk = () => (typeof window !== 'undefined' ? window.katuroDeskApi : undefined);

function joinRoot(rootPath, relPath) {
  const sep = rootPath.includes('\\') ? '\\' : '/';
  const clean = String(relPath).replace(/^[\\/]+/, '').split(/[\\/]+/).join(sep);
  return `${rootPath.replace(/[\\/]+$/, '')}${sep}${clean}`;
}

function cleanRelPath(relPath) {
  const parts = String(relPath || '').replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) throw new Error('Invalid path: ".." is not allowed');
  return parts.join('/');
}

function toUint8(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  if (typeof content === 'string') return new TextEncoder().encode(content);
  throw new Error('Unsupported content type');
}

async function contentToBytes(content) {
  if (typeof Blob !== 'undefined' && content instanceof Blob) {
    return new Uint8Array(await content.arrayBuffer());
  }
  return toUint8(content);
}

function electronWorkspace(res) {
  return {
    handle: { kind: 'electron', isElectron: true, rootPath: res.path },
    name: res.name,
    rootPath: res.path,
    isVirtual: false,
    files: res.files || [],
  };
}

/**
 * Prompts the user to pick a local directory from their computer.
 * Returns { handle, name, files, isVirtual, rootPath? } or null if cancelled.
 */
export async function pickLocalDirectory() {
  if (desk()) {
    const res = await desk().selectFolder();
    if (!res || res.canceled) return null;
    return electronWorkspace(res);
  }

  if (!isFileSystemAccessSupported) {
    return createVirtualWorkspace('My DepEd Classroom Files (Cloud/Virtual)');
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    return {
      handle: dirHandle,
      name: dirHandle.name,
      isVirtual: false,
      files: await readDirectoryRecursively(dirHandle),
    };
  } catch (err) {
    if (err.name === 'AbortError') return null;
    console.warn('Native directory picker failed, falling back to virtual workspace:', err);
    return createVirtualWorkspace('My DepEd Classroom Files (Cloud/Virtual)');
  }
}

/** Desktop only: reopens the folder the teacher used last time. */
export async function reopenLastDirectory() {
  if (!desk()?.reopenLastFolder) return null;
  const res = await desk().reopenLastFolder();
  if (!res || res.canceled) return null;
  return electronWorkspace(res);
}

/**
 * Reads a directory (any backend) recursively and returns a tree of files and subdirectories.
 */
export async function readDirectoryRecursively(dirHandle, path = '') {
  if (!dirHandle) return [];
  if (dirHandle.kind === 'electron') {
    return desk().readDirectory(dirHandle.rootPath);
  }
  if (dirHandle.isVirtual) {
    return dirHandle.getFiles ? dirHandle.getFiles() : [];
  }

  const entries = [];
  try {
    for await (const entry of dirHandle.values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        entries.push({
          name: entry.name,
          path: entryPath,
          kind: 'file',
          size: file.size,
          lastModified: file.lastModified,
          extension: entry.name.split('.').pop().toLowerCase(),
          handle: entry,
        });
      } else if (entry.kind === 'directory') {
        entries.push({
          name: entry.name,
          path: entryPath,
          kind: 'directory',
          handle: entry,
          children: await readDirectoryRecursively(entry, entryPath),
        });
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dirHandle.name}:`, err);
  }
  return entries.sort((a, b) => {
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === 'directory' ? -1 : 1;
  });
}

async function fsaResolveDir(rootHandle, dirParts, create) {
  let dir = rootHandle;
  for (const part of dirParts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

/** True if a workspace-relative path already exists. */
export async function fileExists(dirHandle, relPath) {
  const rel = cleanRelPath(relPath);
  if (!dirHandle || !rel) return false;
  if (dirHandle.kind === 'electron') return desk().exists(joinRoot(dirHandle.rootPath, rel));
  if (dirHandle.isVirtual) return Boolean(dirHandle.findEntry?.(rel));
  try {
    const parts = rel.split('/');
    const dir = await fsaResolveDir(dirHandle, parts.slice(0, -1), false);
    const name = parts[parts.length - 1];
    try {
      await dir.getFileHandle(name);
      return true;
    } catch {
      await dir.getDirectoryHandle(name);
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Returns `relPath` if free, otherwise "name (2).ext", "name (3).ext"...
 * KaTuroDesk never silently overwrites a teacher's file.
 */
export async function getAvailablePath(dirHandle, relPath) {
  const rel = cleanRelPath(relPath);
  if (!(await fileExists(dirHandle, rel))) return rel;
  const slash = rel.lastIndexOf('/');
  const dir = slash >= 0 ? rel.slice(0, slash + 1) : '';
  const file = rel.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  const base = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : '';
  for (let i = 2; i < 500; i++) {
    const candidate = `${dir}${base} (${i})${ext}`;
    if (!(await fileExists(dirHandle, candidate))) return candidate;
  }
  return `${dir}${base} (${Date.now()})${ext}`;
}

/**
 * Writes text or binary (string | Uint8Array | ArrayBuffer | Blob) into the workspace.
 * Parent folders are created automatically. Overwrites by default; pass
 * { overwrite: false } to get an auto-renamed path instead.
 */
export async function writeFileToDirectory(dirHandle, filename, content, mimeType = 'text/plain', { overwrite = true } = {}) {
  if (!dirHandle) throw new Error('No directory selected');
  const rel = overwrite ? cleanRelPath(filename) : await getAvailablePath(dirHandle, filename);
  const actualName = rel.split('/').pop();

  if (dirHandle.kind === 'electron') {
    const fullPath = joinRoot(dirHandle.rootPath, rel);
    await desk().writeFile(fullPath, await contentToBytes(content));
    return { success: true, name: actualName, path: rel, fullPath };
  }

  if (dirHandle.isVirtual) {
    const data = typeof content === 'string' ? content : await contentToBytes(content);
    return dirHandle.saveVirtualFile(rel, data, mimeType);
  }

  const parts = rel.split('/');
  const targetDir = await fsaResolveDir(dirHandle, parts.slice(0, -1), true);
  const fileHandle = await targetDir.getFileHandle(actualName, { create: true });
  const writable = await fileHandle.createWritable();
  if (typeof content === 'string' || (typeof Blob !== 'undefined' && content instanceof Blob)) {
    await writable.write(content);
  } else {
    await writable.write(new Blob([toUint8(content)], { type: mimeType }));
  }
  await writable.close();
  return { success: true, name: actualName, path: rel };
}

/**
 * Reads raw bytes of a workspace file. Accepts a tree entry or a relative path.
 */
export async function readFileBytes(dirHandle, fileOrPath) {
  const entry = typeof fileOrPath === 'string' ? null : fileOrPath;
  const rel = cleanRelPath(entry ? entry.path : fileOrPath);

  if (entry?.bytes) return toUint8(entry.bytes);
  if (entry && typeof entry.content === 'string' && !entry.fullPath && !entry.handle) {
    return new TextEncoder().encode(entry.content);
  }
  if (entry?.fullPath && desk()) return toUint8(await desk().readBinary(entry.fullPath));
  if (entry?.handle?.getFile) return new Uint8Array(await (await entry.handle.getFile()).arrayBuffer());

  if (!dirHandle) throw new Error('No directory selected');
  if (dirHandle.kind === 'electron') return toUint8(await desk().readBinary(joinRoot(dirHandle.rootPath, rel)));
  if (dirHandle.isVirtual) {
    const found = dirHandle.findEntry?.(rel);
    if (!found) throw new Error(`File not found: ${rel}`);
    return found.bytes ? toUint8(found.bytes) : new TextEncoder().encode(found.content || '');
  }
  const parts = rel.split('/');
  const dir = await fsaResolveDir(dirHandle, parts.slice(0, -1), false);
  const fh = await dir.getFileHandle(parts[parts.length - 1]);
  return new Uint8Array(await (await fh.getFile()).arrayBuffer());
}

// ── Safe-edit SOP ────────────────────────────────────────────────
// KaTuroDesk never modifies a teacher's original file:
//   1. the original is backed up to "KaTuro Backups/<date>/<same folders>/"
//   2. edits go into a working clone next to it: "<name> (KaTuro edit).<ext>"
//   3. before a clone is changed again, its current version is backed up too
export const BACKUPS_ROOT = 'KaTuro Backups';
export const WORKING_COPY_SUFFIX = ' (KaTuro edit)';

function stamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
  };
}

function splitName(relPath) {
  const rel = cleanRelPath(relPath);
  const slash = rel.lastIndexOf('/');
  const dir = slash >= 0 ? rel.slice(0, slash) : '';
  const file = rel.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  return { dir, base: dot > 0 ? file.slice(0, dot) : file, ext: dot > 0 ? file.slice(dot) : '' };
}

/** "Grades/SF2.xlsx" → "Grades/SF2 (KaTuro edit).xlsx" (a clone's own path is returned unchanged). */
export function workingCopyPath(relPath) {
  const { dir, base, ext } = splitName(relPath);
  if (base.endsWith(WORKING_COPY_SUFFIX)) return cleanRelPath(relPath);
  return `${dir ? `${dir}/` : ''}${base}${WORKING_COPY_SUFFIX}${ext}`;
}

/** Copies a workspace file into KaTuro Backups (never overwrites an earlier backup). Returns the backup path. */
export async function backupFile(dirHandle, relPath, now = new Date()) {
  const { dir, base, ext } = splitName(relPath);
  const { date, time } = stamp(now);
  const bytes = await readFileBytes(dirHandle, relPath);
  const target = `${BACKUPS_ROOT}/${date}/${dir ? `${dir}/` : ''}${base} (backup ${time})${ext}`;
  const res = await writeFileToDirectory(dirHandle, target, bytes, 'application/octet-stream', { overwrite: false });
  return res.path;
}

/**
 * Saves edited bytes for `originalPath` following the safe-edit SOP.
 * Returns { path: the working clone, backups: [backup paths made this time] }.
 */
export async function saveWorkingCopy(dirHandle, originalPath, bytes, mimeType = 'application/octet-stream', now = new Date()) {
  const backups = [];
  const original = cleanRelPath(originalPath);
  const clone = workingCopyPath(original);
  if (clone !== original && (await fileExists(dirHandle, original))) {
    backups.push(await backupFile(dirHandle, original, now));
  }
  if (await fileExists(dirHandle, clone)) {
    backups.push(await backupFile(dirHandle, clone, now));
  }
  const res = await writeFileToDirectory(dirHandle, clone, bytes, mimeType, { overwrite: true });
  return { path: res.path, name: res.name, backups };
}

/**
 * Reads text content from a file handle or virtual file object.
 */
export async function readFileText(fileHandle) {
  if (!fileHandle) return '';
  if (fileHandle.isVirtual) return fileHandle.content || '';
  try {
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (err) {
    console.error('Error reading file text:', err);
    return '';
  }
}

/**
 * Creates a new directory (nested paths allowed) inside the workspace.
 */
export async function createDirectoryInWorkspace(dirHandle, folderName) {
  if (!dirHandle) throw new Error('No directory selected');
  const cleanName = cleanRelPath(folderName);

  if (dirHandle.kind === 'electron') {
    await desk().createDirectory(joinRoot(dirHandle.rootPath, cleanName));
    return { success: true, name: cleanName.split('/').pop(), path: cleanName };
  }
  if (dirHandle.isVirtual) {
    return dirHandle.createVirtualDirectory(cleanName);
  }
  const parts = cleanName.split('/');
  const current = await fsaResolveDir(dirHandle, parts, true);
  return { success: true, name: parts[parts.length - 1], path: cleanName, handle: current };
}

/** Desktop only: open a file in its default app (Word, Excel, PowerPoint...). */
export async function openInDefaultApp(dirHandle, relPath) {
  if (dirHandle?.kind !== 'electron') return false;
  await desk().openPath(joinRoot(dirHandle.rootPath, cleanRelPath(relPath)));
  return true;
}

/** Desktop only: show the file highlighted in Windows Explorer. */
export async function revealInFolder(dirHandle, relPath) {
  if (dirHandle?.kind !== 'electron') return false;
  await desk().showItemInFolder(joinRoot(dirHandle.rootPath, cleanRelPath(relPath)));
  return true;
}

/** Desktop only: iPhone photo (HEIC/HEIF) to JPEG bytes. Returns Uint8Array or null. */
export async function convertHeicToJpeg(bytes, quality) {
  if (!desk()?.heicToJpeg) return null;
  return toUint8(await desk().heicToJpeg(toUint8(bytes), quality));
}

/** Desktop only: Chromium print-to-PDF of a self-contained HTML page. Returns Uint8Array or null. */
export async function renderHtmlToPdf(html, options = {}) {
  if (!desk()?.htmlToPdf) return null;
  return toUint8(await desk().htmlToPdf(html, options));
}

/**
 * Recursively flattens a file/directory tree into a list of file items.
 */
export function flattenFileTree(entries = []) {
  const result = [];
  function traverse(list) {
    for (const item of list) {
      if (item.kind === 'file') result.push(item);
      if (Array.isArray(item.children)) traverse(item.children);
    }
  }
  traverse(entries);
  return result;
}

/** Demo-workspace files hold plain text under an Office extension; read them as text. */
export function readerNameFor(entry, name) {
  return entry && typeof entry.content === 'string' && !entry.bytes && !entry.fullPath && !entry.handle ? `${name}.txt` : name;
}

/** Finds a file entry in the tree by its workspace-relative path. */
export function findEntryByPath(entries = [], relPath) {
  const target = cleanRelPath(relPath).toLowerCase();
  return flattenFileTree(entries).find((f) => cleanRelPath(f.path).toLowerCase() === target) || null;
}

/**
 * Creates an initial virtual workspace with sample DepEd lesson folders
 * when running in demo mode or browsers without File System Access API.
 * Files with a `content` string are plain-text stand-ins (clearly marked demo data).
 */
export function createVirtualWorkspace(name = 'Grade 7 Science (Quarter 2)') {
  const virtualStorage = [
    {
      name: 'Lesson Logs (DLL)',
      path: 'Lesson Logs (DLL)',
      kind: 'directory',
      children: [
        {
          name: 'Week 1 - Cell Theory.docx',
          path: 'Lesson Logs (DLL)/Week 1 - Cell Theory.docx',
          kind: 'file',
          size: 24500,
          lastModified: Date.now() - 86400000 * 4,
          extension: 'docx',
          content: '### WEEK 1: INTRODUCTION TO CELL THEORY\nCompetency: [S7LT-IIa-1] Identify the parts of a compound microscope and their functions.\nObjectives: Explain the cell theory, recognize Robert Hooke and Anton van Leeuwenhoek, identify plant and animal cell differences.\nDay 1-5 Detailed procedures on slide mounting and cellular exploration.',
        },
        {
          name: 'Week 2 - Microscope Parts.docx',
          path: 'Lesson Logs (DLL)/Week 2 - Microscope Parts.docx',
          kind: 'file',
          size: 28900,
          lastModified: Date.now() - 86400000 * 2,
          extension: 'docx',
          content: '### WEEK 2: THE COMPOUND MICROSCOPE\nCompetency: [S7LT-IIa-2] Focus specimens using low and high power objectives.\nProcedures: Eyepiece magnification calculation, mechanical stage operation, iris diaphragm adjustment.',
        },
      ],
    },
    {
      name: 'Exams & TOS',
      path: 'Exams & TOS',
      kind: 'directory',
      children: [
        {
          name: 'Q1_Summative_Test_1_with_TOS.docx',
          path: 'Exams & TOS/Q1_Summative_Test_1_with_TOS.docx',
          kind: 'file',
          size: 38200,
          lastModified: Date.now() - 86400000 * 10,
          extension: 'docx',
          content: '### QUARTER 1 SUMMATIVE TEST 1 (CELL BIOLOGY)\nTotal Items: 30\nTable of Specifications:\n- Remembering (60%): 18 items\n- Understanding (20%): 6 items\n- Analyzing (20%): 6 items\nItem Analysis Note: 14 learners struggled with calculating total magnification and distinguishing plant vs animal cell vacuoles.',
        },
      ],
    },
    {
      name: 'Classroom Slides',
      path: 'Classroom Slides',
      kind: 'directory',
      children: [
        {
          name: 'Levels_of_Biological_Organization.pptx',
          path: 'Classroom Slides/Levels_of_Biological_Organization.pptx',
          kind: 'file',
          size: 154000,
          lastModified: Date.now() - 86400000 * 3,
          extension: 'pptx',
          content: 'Slide 1: Biological Organization Title\nSlide 2: Atoms to Organisms\nSlide 3: Cells, Tissues, Organs, Organ Systems.',
        },
      ],
    },
    {
      name: 'Class_Roster_G7_Sampaguita.xlsx',
      path: 'Class_Roster_G7_Sampaguita.xlsx',
      kind: 'file',
      size: 18400,
      lastModified: Date.now() - 86400000 * 14,
      extension: 'xlsx',
      content: 'Grade 7 Section Sampaguita - 45 Learners.\nStruggling Learners requiring remediation:\n1. Alcantara, John (Score: 12/30)\n2. Bautista, Maria (Score: 14/30)\n3. Cruz, Kevin (Score: 11/30)\n4. Dalisay, Andrea (Score: 13/30)\n5. Esteban, Paolo (Score: 10/30)',
    },
  ];

  function ensureDir(parts) {
    let list = virtualStorage;
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      let dir = list.find((i) => i.kind === 'directory' && i.name === part);
      if (!dir) {
        dir = { name: part, path, kind: 'directory', children: [] };
        list.unshift(dir);
      }
      list = dir.children;
    }
    return list;
  }

  const handle = {
    kind: 'virtual',
    isVirtual: true,
    getFiles: () => virtualStorage.slice(),
    findEntry: (relPath) => {
      const target = cleanRelPath(relPath).toLowerCase();
      const walk = (list) => {
        for (const item of list) {
          if (item.path.toLowerCase() === target) return item;
          if (item.children) {
            const hit = walk(item.children);
            if (hit) return hit;
          }
        }
        return null;
      };
      return walk(virtualStorage);
    },
    saveVirtualFile: (filename, content) => {
      const rel = cleanRelPath(filename);
      const parts = rel.split('/');
      const fileNameOnly = parts.pop();
      const isText = typeof content === 'string';
      const newFileItem = {
        name: fileNameOnly,
        path: rel,
        kind: 'file',
        size: isText ? content.length : content?.byteLength ?? content?.size ?? 0,
        lastModified: Date.now(),
        extension: fileNameOnly.split('.').pop().toLowerCase(),
        ...(isText ? { content } : { bytes: toUint8(content) }),
      };
      const list = ensureDir(parts);
      const idx = list.findIndex((f) => f.kind === 'file' && f.name === fileNameOnly);
      if (idx !== -1) list.splice(idx, 1);
      list.push(newFileItem);
      return { success: true, name: fileNameOnly, path: rel };
    },
    createVirtualDirectory: (folderName) => {
      const parts = cleanRelPath(folderName).split('/');
      ensureDir(parts);
      return { success: true, name: parts[parts.length - 1], path: parts.join('/') };
    },
  };

  return {
    isVirtual: true,
    name,
    handle,
    files: virtualStorage,
  };
}
