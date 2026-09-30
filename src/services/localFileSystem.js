/**
 * localFileSystem.js - Web File System Access API Engine for KaTuroDesk
 * 
 * Provides native file system access in modern Chromium browsers (Chrome, Edge)
 * with graceful in-memory virtual fallback for unsupported environments.
 */

export const isFileSystemAccessSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/**
 * Prompts the user to pick a local directory from their computer.
 * Returns { handle, name, files }
 */
export async function pickLocalDirectory() {
  // If running in Native KaTuroDesk Desktop App (Electron)
  if (typeof window !== 'undefined' && window.katuroDeskApi) {
    const res = await window.katuroDeskApi.selectFolder();
    if (!res || res.canceled) return null;
    return {
      handle: {
        isElectron: true,
        path: res.path,
        saveVirtualFile: async (filename, content) => {
          const fullPath = `${res.path}/${filename}`;
          await window.katuroDeskApi.writeFile(fullPath, content);
          return { success: true, name: filename, path: fullPath };
        },
        createVirtualDirectory: async (dirName) => {
          const fullPath = `${res.path}/${dirName}`;
          await window.katuroDeskApi.createDirectory(fullPath);
          return { success: true, name: dirName, path: fullPath };
        },
      },
      name: res.name,
      isVirtual: false,
      files: res.files || [],
    };
  }

  if (!isFileSystemAccessSupported) {
    return createVirtualWorkspace('My DepEd Classroom Files (Cloud/Virtual)');
  }

  try {
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
    });

    const fileTree = await readDirectoryRecursively(dirHandle);
    return {
      handle: dirHandle,
      name: dirHandle.name,
      isVirtual: false,
      files: fileTree,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return null; // User cancelled
    }
    console.warn('Native directory picker failed, falling back to virtual workspace:', err);
    return createVirtualWorkspace('My DepEd Classroom Files (Cloud/Virtual)');
  }
}

/**
 * Reads a directory handle recursively and returns a tree of files and subdirectories.
 */
export async function readDirectoryRecursively(dirHandle, path = '') {
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
        const children = await readDirectoryRecursively(entry, entryPath);
        entries.push({
          name: entry.name,
          path: entryPath,
          kind: 'directory',
          handle: entry,
          children,
        });
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dirHandle.name}:`, err);
  }
  return entries.sort((a, b) => {
    // Directories first, then alphabetically
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === 'directory' ? -1 : 1;
  });
}

/**
 * Writes or saves a file directly into the local directory handle.
 */
export async function writeFileToDirectory(dirHandle, filename, content, mimeType = 'text/plain') {
  if (!dirHandle) throw new Error('No directory selected');

  // If virtual workspace
  if (dirHandle.isVirtual) {
    return dirHandle.saveVirtualFile(filename, content, mimeType);
  }

  try {
    // Resolve subpaths if filename contains '/'
    const parts = filename.split('/');
    let targetDir = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      targetDir = await targetDir.getDirectoryHandle(parts[i], { create: true });
    }

    const actualName = parts[parts.length - 1];
    const fileHandle = await targetDir.getFileHandle(actualName, { create: true });
    const writable = await fileHandle.createWritable();

    if (content instanceof Blob) {
      await writable.write(content);
    } else if (typeof content === 'string') {
      await writable.write(content);
    } else {
      await writable.write(new Blob([content], { type: mimeType }));
    }
    await writable.close();

    return {
      success: true,
      name: actualName,
      path: filename,
    };
  } catch (err) {
    console.error(`Error writing file ${filename}:`, err);
    throw err;
  }
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
 * Creates a new directory inside the workspace directory handle.
 */
export async function createDirectoryInWorkspace(dirHandle, folderName) {
  if (!dirHandle) throw new Error('No directory selected');

  const cleanName = folderName.replace(/^\/+|\/+$/g, '');
  if (dirHandle.isVirtual) {
    return dirHandle.createVirtualDirectory(cleanName);
  }

  try {
    const parts = cleanName.split('/');
    let current = dirHandle;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
    return {
      success: true,
      name: parts[parts.length - 1],
      path: cleanName,
      handle: current,
    };
  } catch (err) {
    console.error(`Error creating directory ${cleanName}:`, err);
    throw err;
  }
}

/**
 * Recursively flattens a file/directory tree into a list of file items.
 */
export function flattenFileTree(entries = []) {
  const result = [];
  function traverse(list) {
    for (const item of list) {
      if (item.kind === 'file') {
        result.push(item);
      }
      if (item.children && Array.isArray(item.children)) {
        traverse(item.children);
      }
    }
  }
  traverse(entries);
  return result;
}

/**
 * Finds files matching one or more search queries/filenames.
 */
export function findFilesByNames(entries = [], names = []) {
  const allFiles = flattenFileTree(entries);
  return allFiles.filter((f) =>
    names.some((n) => f.name.toLowerCase().includes(n.toLowerCase().trim()))
  );
}

/**
 * Reads content from a file object (virtual or native handle).
 */
export async function readWorkspaceFileContent(fileObj) {
  if (!fileObj) return '';
  if (fileObj.content) return fileObj.content;
  if (fileObj.handle) {
    return await readFileText(fileObj.handle);
  }
  return '';
}

/**
 * Creates an initial virtual workspace with sample DepEd lesson folders
 * when running in demo mode or browsers without File System Access API.
 */
export function createVirtualWorkspace(name = 'Grade 7 Science (Quarter 2)') {
  let virtualStorage = [
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

  return {
    isVirtual: true,
    name,
    handle: {
      isVirtual: true,
      saveVirtualFile: (filename, content) => {
        const parts = filename.split('/');
        const fileNameOnly = parts[parts.length - 1];

        const newFileItem = {
          name: fileNameOnly,
          path: filename,
          kind: 'file',
          size: typeof content === 'string' ? content.length : 32000,
          lastModified: Date.now(),
          extension: fileNameOnly.split('.').pop().toLowerCase(),
          content: typeof content === 'string' ? content : 'Binary content saved',
        };

        if (parts.length > 1) {
          const folderName = parts[0];
          let folder = virtualStorage.find((i) => i.name === folderName && i.kind === 'directory');
          if (!folder) {
            folder = {
              name: folderName,
              path: folderName,
              kind: 'directory',
              children: [],
            };
            virtualStorage.unshift(folder);
          }
          folder.children = folder.children.filter((f) => f.name !== fileNameOnly);
          folder.children.push(newFileItem);
        } else {
          const idx = virtualStorage.findIndex((f) => f.name === fileNameOnly);
          if (idx !== -1) virtualStorage.splice(idx, 1);
          virtualStorage.push(newFileItem);
        }

        return { success: true, name: fileNameOnly, path: filename };
      },
      createVirtualDirectory: (folderName) => {
        const existing = virtualStorage.find((i) => i.name === folderName && i.kind === 'directory');
        if (!existing) {
          virtualStorage.unshift({
            name: folderName,
            path: folderName,
            kind: 'directory',
            children: [],
          });
        }
        return { success: true, name: folderName, path: folderName };
      },
    },
    files: virtualStorage,
  };
}
