const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('katuroDeskApi', {
  isElectron: true,
  platform: process.platform,
  titleBarHeight: 40,
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
  heicToJpeg: (bytes, quality) => ipcRenderer.invoke('image:heicToJpeg', bytes, quality),
  getBackground: () => ipcRenderer.invoke('app:getBackground'),
  setBackground: (settings) => ipcRenderer.invoke('app:setBackground', settings),
  notify: (title, body, target) => ipcRenderer.invoke('app:notify', title, body, target),
  setUnreadBadge: (count, pngDataUrl) => ipcRenderer.invoke('app:setUnreadBadge', count, pngDataUrl),
  alarm: (title, body, id) => ipcRenderer.invoke('app:alarm', title, body, id),
  onNotificationClick: (callback) => {
    const listener = (_, target) => callback(target);
    ipcRenderer.on('notification:click', listener);
    return () => ipcRenderer.removeListener('notification:click', listener);
  },
  showWindow: () => ipcRenderer.invoke('app:showWindow'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  setTitleBarColors: (colors) => ipcRenderer.invoke('app:setTitleBarColors', colors),
  getUpdateStatus: () => ipcRenderer.invoke('update:getStatus'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => {
    const listener = (_, status) => callback(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
});
