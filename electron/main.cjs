const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

async function readDirectoryRecursive(dirPath, relativeRoot = '') {
  const entries = [];
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      const relPath = relativeRoot ? `${relativeRoot}/${item.name}` : item.name;

      if (item.isDirectory()) {
        const children = await readDirectoryRecursive(fullPath, relPath);
        entries.push({
          name: item.name,
          path: relPath,
          fullPath,
          kind: 'directory',
          children,
        });
      } else if (item.isFile()) {
        const stats = await fs.promises.stat(fullPath);
        entries.push({
          name: item.name,
          path: relPath,
          fullPath,
          kind: 'file',
          size: stats.size,
          lastModified: stats.mtimeMs,
          extension: item.name.split('.').pop().toLowerCase(),
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'KaTuroDesk — DepEd Co-Teacher Studio',
    backgroundColor: '#1b2620',
    icon: path.join(__dirname, '../src/assets/KT-Favicon.webp'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Remove default menu bar for clean app feel
  mainWindow.setMenuBarVisibility(false);

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/desk');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: 'desk',
    });
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

  const selectedPath = result.filePaths[0];
  const name = path.basename(selectedPath);
  const files = await readDirectoryRecursive(selectedPath);

  return {
    canceled: false,
    path: selectedPath,
    name,
    files,
  };
});

ipcMain.handle('fs:readDirectory', async (_, dirPath) => {
  return await readDirectoryRecursive(dirPath);
});

ipcMain.handle('fs:readFile', async (_, filePath) => {
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (err) {
    console.error('Failed to read file:', err);
    throw err;
  }
});

ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
  try {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('Failed to write file:', err);
    throw err;
  }
});

ipcMain.handle('fs:createDirectory', async (_, dirPath) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (err) {
    console.error('Failed to create directory:', err);
    throw err;
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
