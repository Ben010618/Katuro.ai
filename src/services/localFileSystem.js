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
 * Reads text content from a file handle.
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
        },
        {
          name: 'Week 2 - Microscope Parts.docx',
          path: 'Lesson Logs (DLL)/Week 2 - Microscope Parts.docx',
          kind: 'file',
          size: 28900,
          lastModified: Date.now() - 86400000 * 2,
          extension: 'docx',
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
    },
  ];

  return {
    isVirtual: true,
    name,
    handle: {
      isVirtual: true,
      saveVirtualFile: (filename, content) => {
        virtualStorage.push({
          name: filename.split('/').pop(),
          path: filename,
          kind: 'file',
          size: typeof content === 'string' ? content.length : 32000,
          lastModified: Date.now(),
          extension: filename.split('.').pop().toLowerCase(),
          content: typeof content === 'string' ? content : 'Binary content saved',
        });
        return { success: true, name: filename, path: filename };
      },
    },
    files: virtualStorage,
  };
}
