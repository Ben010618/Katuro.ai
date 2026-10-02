const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('katuroDeskApi', {
  isElectron: true,
  platform: process.platform,
  version: '1.1.0',
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  reopenLastFolder: () => ipcRenderer.invoke('workspace:reopenLast'),
  readDirectory: (dirPath) => ipcRenderer.invoke('fs:readDirectory', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readBinary: (filePath) => ipcRenderer.invoke('fs:readBinary', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  createDirectory: (dirPath) => ipcRenderer.invoke('fs:createDirectory', dirPath),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  htmlToPdf: (html, options) => ipcRenderer.invoke('doc:htmlToPdf', html, options),
});
