const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// QA only: run on a separate profile (e.g. to test updates without touching the teacher's data).
if (process.env.KATURO_DESK_USER_DATA) app.setPath('userData', process.env.KATURO_DESK_USER_DATA);

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Scheduled tasks run inside the window, so only ONE KaTuroDesk may run at a time
// (two copies would run every task twice). A second launch just shows the first window.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();

// Theme colors of the top studio bar, used for the window controls area.
const TITLE_BAR = { color: '#16211a', symbolColor: '#c9d8ce', height: 40 };

// Background mode: keep running in the tray when the window is closed, so scheduled
// tasks still run on time. Saved on this PC; off until the teacher turns it on.
const backgroundFile = () => path.join(app.getPath('userData'), 'background.json');
function readBackgroundSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(backgroundFile(), 'utf-8'));
    return { keepRunning: s.keepRunning === true, openAtLogin: s.keepRunning === true && s.openAtLogin === true };
  } catch (e) {
    return { keepRunning: false, openAtLogin: false };
  }
}
let backgroundSettings = { keepRunning: false, openAtLogin: false };
const startedHidden = process.argv.includes('--background');

// ── Auto-update (GitHub Releases) ─────────────────────────────
// New versions download quietly in the background. They install when the teacher
// clicks "Restart to update" or the next time KaTuroDesk quits, never mid-task.
// Each download is checked against the SHA-512 published with the release.
const UPDATE_CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
let updater = null;
let updateStatus = { state: app.isPackaged ? 'idle' : 'unsupported', version: null, percent: 0, error: null };

function sendUpdateStatus(patch) {
  updateStatus = { ...updateStatus, ...patch };
  // Small log for support: what the updater did and when (kept under ~50 KB).
  try {
    const logFile = path.join(app.getPath('userData'), 'update.log');
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 50000) fs.writeFileSync(logFile, '');
    if (patch.state !== 'downloading' || patch.percent === 0 || patch.percent === 100 || patch.percent % 25 === 0) {
      fs.appendFileSync(logFile, `${new Date().toISOString()} v${app.getVersion()} ${JSON.stringify(updateStatus)}\n`);
    }
  } catch (e) {}
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', updateStatus);
  if (tray) refreshTrayMenu();
}

function setupAutoUpdate() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try {
    ({ autoUpdater: updater } = require('./vendor/updater.cjs'));
  } catch (e) {
    sendUpdateStatus({ state: 'unsupported', error: 'Updater not bundled' });
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.logger = null;
  updater.on('checking-for-update', () => sendUpdateStatus({ state: 'checking', error: null }));
  updater.on('update-available', (info) => sendUpdateStatus({ state: 'downloading', version: info.version, percent: 0 }));
  updater.on('update-not-available', () => sendUpdateStatus({ state: 'current', percent: 0 }));
  updater.on('download-progress', (p) => sendUpdateStatus({ state: 'downloading', percent: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', (info) => sendUpdateStatus({ state: 'ready', version: info.version, percent: 100 }));
  updater.on('error', (err) => {
    // Offline or GitHub unreachable: stay quiet, try again at the next check.
    if (updateStatus.state !== 'ready') sendUpdateStatus({ state: 'error', error: String((err && err.message) || err).slice(0, 200) });
  });
  const check = () => {
    if (updateStatus.state === 'ready' || updateStatus.state === 'downloading') return;
    updater.checkForUpdates().catch(() => {});
  };
  setTimeout(check, 15000);
  setInterval(check, UPDATE_CHECK_EVERY_MS);
}

function installUpdateNow() {
  if (!updater || updateStatus.state !== 'ready') return false;
  isQuitting = true;
  // Silent install, then KaTuroDesk opens again on the new version.
  setImmediate(() => updater.quitAndInstall(true, true));
  return true;
}

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

const appIconPath = () => path.join(__dirname, '../dist/favicon.png');

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function ensureTray() {
  if (tray || !backgroundSettings.keepRunning) return;
  const icon = nativeImage.createFromPath(appIconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('KaTuroDesk — running in the background for your scheduled tasks');
  refreshTrayMenu();
  tray.on('click', showMainWindow);
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open KaTuroDesk', click: showMainWindow },
    ...(updateStatus.state === 'ready' ? [{ label: `Restart to update (v${updateStatus.version})`, click: installUpdateNow }] : []),
    { type: 'separator' },
    { label: 'Quit KaTuroDesk', click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function removeTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function applyBackgroundSettings(next) {
  backgroundSettings = {
    keepRunning: next.keepRunning === true,
    openAtLogin: next.keepRunning === true && next.openAtLogin === true,
  };
  try {
    fs.writeFileSync(backgroundFile(), JSON.stringify(backgroundSettings));
  } catch (e) {}
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: backgroundSettings.openAtLogin, args: ['--background'] });
  }
  if (backgroundSettings.keepRunning) ensureTray();
  else removeTray();
  return backgroundSettings;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'KaTuroDesk',
    backgroundColor: '#16211a',
    icon: appIconPath(),
    // The Windows title bar is replaced by the app's own dark top bar (same theme);
    // the minimize / maximize / close buttons stay, drawn in the bar's colors.
    titleBarStyle: 'hidden',
    titleBarOverlay: TITLE_BAR,
    show: !(startedHidden && backgroundSettings.keepRunning),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      plugins: true, // built-in Chromium PDF viewer for the Canvas preview
      backgroundThrottling: false, // scheduled tasks keep their timing while hidden in the tray
    },
  });

  // Remove default menu bar for clean app feel
  mainWindow.setMenuBarVisibility(false);

  // Keep "KaTuroDesk" as the window/taskbar name instead of the web page title.
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  // In background mode, closing the window hides it to the tray (tasks keep running).
  mainWindow.on('close', (event) => {
    if (backgroundSettings.keepRunning && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

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

// ── Background mode, notifications, window ───────────────────
ipcMain.handle('app:getBackground', async () => ({ ...backgroundSettings, supported: true }));

ipcMain.handle('app:setBackground', async (_, next = {}) => applyBackgroundSettings(next || {}));

ipcMain.handle('app:notify', async (_, title, body) => {
  if (!Notification.isSupported()) return { shown: false };
  const n = new Notification({
    title: String(title || 'KaTuroDesk').slice(0, 120),
    body: String(body || '').slice(0, 300),
    icon: appIconPath(),
  });
  n.on('click', showMainWindow);
  n.show();
  return { shown: true };
});

ipcMain.handle('app:showWindow', async () => {
  showMainWindow();
  return { success: true };
});

ipcMain.handle('app:getVersion', async () => app.getVersion());

ipcMain.handle('update:getStatus', async () => updateStatus);

ipcMain.handle('update:check', async () => {
  if (!updater) return updateStatus;
  if (updateStatus.state !== 'ready' && updateStatus.state !== 'downloading') {
    try {
      await updater.checkForUpdates();
    } catch (e) {
      sendUpdateStatus({ state: 'error', error: String((e && e.message) || e).slice(0, 200) });
    }
  }
  return updateStatus;
});

ipcMain.handle('update:install', async () => ({ started: installUpdateNow() }));

app.on('second-instance', () => showMainWindow());

app.on('before-quit', () => {
  isQuitting = true;
});

app.whenReady().then(() => {
  if (!hasInstanceLock) return;
  // Windows shows notifications under the app's ID (must match build.appId).
  if (process.platform === 'win32') app.setAppUserModelId('ai.katuro.desk');
  backgroundSettings = readBackgroundSettings();
  createWindow();
  if (backgroundSettings.keepRunning) ensureTray();
  setupAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !backgroundSettings.keepRunning) app.quit();
});
