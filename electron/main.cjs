const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

// Every fs IPC call must target a folder the teacher picked in this session
// (or the one restored from last session). The renderer never gets raw disk access.
const allowedRoots = new Set();
const lastFolderFile = () => path.join(app.getPath('userData'), 'last-folder.json');

// Skip noise that would bloat the tree (and the AI file index) on real school drives.
const IGNORED_NAMES = new Set(['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information', 'desktop.ini', 'Thumbs.db', '.DS_Store']);
const MAX_TREE_ENTRIES = 5000;

function resolveInsideRoot(targetPath) {
  if (typeof targetPath !== 'string' || !targetPath) throw new Error('Invalid path');
  const resolved = path.resolve(targetPath);
  for (const root of allowedRoots) {
    const rel = path.relative(root, resolved);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return resolved;
  }
  throw new Error('Access denied: path is outside the opened classroom folder');
}

async function readDirectoryRecursive(dirPath, relativeRoot = '', counter = { n: 0 }) {
  const entries = [];
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (counter.n >= MAX_TREE_ENTRIES) break;
      if (IGNORED_NAMES.has(item.name) || item.name.startsWith('~$')) continue;
      const fullPath = path.join(dirPath, item.name);
      const relPath = relativeRoot ? `${relativeRoot}/${item.name}` : item.name;
      counter.n += 1;

      if (item.isDirectory()) {
        const children = await readDirectoryRecursive(fullPath, relPath, counter);
        entries.push({ name: item.name, path: relPath, fullPath, kind: 'directory', children });
      } else if (item.isFile()) {
        const stats = await fs.promises.stat(fullPath);
        entries.push({
          name: item.name,
          path: relPath,
          fullPath,
          kind: 'file',
          size: stats.size,
          lastModified: stats.mtimeMs,
          extension: item.name.includes('.') ? item.name.split('.').pop().toLowerCase() : '',
        });
      }
    }
  } catch (err) {
    console.error('Error reading directory:', err);
  }
  return entries.sort((a, b) => {
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === 'directory' ? -1 : 1;
  });
}

async function openFolder(selectedPath) {
  const resolved = path.resolve(selectedPath);
  allowedRoots.add(resolved);
  try {
    fs.writeFileSync(lastFolderFile(), JSON.stringify({ path: resolved }));
  } catch (e) {}
  return {
    canceled: false,
    path: resolved,
    name: path.basename(resolved),
    files: await readDirectoryRecursive(resolved),
  };
}

function toBuffer(content) {
  if (typeof content === 'string') return Buffer.from(content, 'utf-8');
  if (content instanceof ArrayBuffer) return Buffer.from(new Uint8Array(content));
  if (ArrayBuffer.isView(content)) return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  throw new Error('Unsupported file content type');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'KaTuroDesk — DepEd Co-Teacher Studio',
    backgroundColor: '#1b2620',
    icon: path.join(__dirname, '../dist/favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      plugins: true, // built-in Chromium PDF viewer for the Canvas preview
    },
  });

  // Remove default menu bar for clean app feel
  mainWindow.setMenuBarVisibility(false);

  const consoleLogFile = path.join(app.getPath('userData'), 'desk-console.log');
  try {
    fs.writeFileSync(consoleLogFile, `--- KaTuroDesk Started: ${new Date().toISOString()} ---\n`);
  } catch (e) {}

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    try {
      fs.appendFileSync(consoleLogFile, `[Level ${level}] ${message} (${sourceId}:${line})\n`);
    } catch (e) {}
  });

  mainWindow.webContents.on('did-finish-load', async () => {
    const statusFile = path.join(app.getPath('userData'), 'desk-status.json');
    try {
      // Allow React to mount
      await new Promise(r => setTimeout(r, 600));
      const probe = await mainWindow.webContents.executeJavaScript(`({
        hasKaturoDeskApi: typeof window.katuroDeskApi !== 'undefined',
        hasRoot: Boolean(document.getElementById('root')),
        rootChildCount: document.getElementById('root')?.children?.length || 0,
        htmlPreview: document.getElementById('root')?.innerText?.slice(0, 150) || ''
      })`);
      fs.writeFileSync(statusFile, JSON.stringify({
        loaded: true,
        probe,
        timestamp: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      fs.writeFileSync(statusFile, JSON.stringify({ error: e.message }, null, 2));
    }
  });

  // Links in AI answers open in the real browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const distHtml = path.join(__dirname, '../dist/index.html');
  const isDev = process.env.KATURO_DESK_DEV === '1';

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/desk');
  } else {
    mainWindow.loadFile(distHtml);
  }
}

// Setup IPC Handlers
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select DepEd Classroom Folder',
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true };
  }
  return openFolder(result.filePaths[0]);
});

ipcMain.handle('workspace:reopenLast', async () => {
  try {
    const { path: lastPath } = JSON.parse(fs.readFileSync(lastFolderFile(), 'utf-8'));
    if (lastPath && fs.existsSync(lastPath) && fs.statSync(lastPath).isDirectory()) {
      return openFolder(lastPath);
    }
  } catch (e) {}
  return { canceled: true };
});

ipcMain.handle('fs:readDirectory', async (_, dirPath) => {
  return await readDirectoryRecursive(resolveInsideRoot(dirPath));
});

ipcMain.handle('fs:readFile', async (_, filePath) => {
  return await fs.promises.readFile(resolveInsideRoot(filePath), 'utf-8');
});

// Binary-safe read: returns a Uint8Array (structured-clone friendly) for docx/xlsx/pptx/pdf/images.
ipcMain.handle('fs:readBinary', async (_, filePath) => {
  const buf = await fs.promises.readFile(resolveInsideRoot(filePath));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
});

ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
  const target = resolveInsideRoot(filePath);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, toBuffer(content));
  return { success: true };
});

ipcMain.handle('fs:exists', async (_, filePath) => {
  try {
    await fs.promises.access(resolveInsideRoot(filePath));
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('fs:createDirectory', async (_, dirPath) => {
  await fs.promises.mkdir(resolveInsideRoot(dirPath), { recursive: true });
  return { success: true };
});

ipcMain.handle('shell:openPath', async (_, filePath) => {
  const err = await shell.openPath(resolveInsideRoot(filePath));
  if (err) throw new Error(err);
  return { success: true };
});

ipcMain.handle('shell:showItemInFolder', async (_, filePath) => {
  shell.showItemInFolder(resolveInsideRoot(filePath));
  return { success: true };
});

// Renders print-ready HTML (a generated document, or a docx converted by mammoth)
// to a real PDF using Chromium's print engine. Long bond paper = 8.5" x 13".
ipcMain.handle('doc:htmlToPdf', async (_, html, options = {}) => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(html))}`);
    const pageSize = options.pageSize === 'a4' ? 'A4'
      : options.pageSize === 'letter' ? 'Letter'
      : { width: 8.5, height: 13 };
    const pdf = await win.webContents.printToPDF({
      pageSize,
      landscape: options.landscape === true,
      printBackground: true,
      margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.6, right: 0.6 },
    });
    return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  } finally {
    win.destroy();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
