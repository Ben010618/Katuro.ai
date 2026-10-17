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
  // Teaching assistant bubble: what it shows, its clicks, and "is a slideshow on screen?".
  setBubble: (state) => ipcRenderer.invoke('bubble:set', state),
  onBubbleAction: (callback) => {
    const listener = (_, action) => callback(action);
    ipcRenderer.on('bubble:action', listener);
    return () => ipcRenderer.removeListener('bubble:action', listener);
  },
  isPresenting: () => ipcRenderer.invoke('app:isPresenting'),
  // Printing a KaTuro document to a printer the teacher picks.
  listPrinters: () => ipcRenderer.invoke('print:printers'),
  printDocument: (html, options) => ipcRenderer.invoke('print:document', html, options),
  // Wake phrase: the offline speech model's bytes (downloaded once, checked), and download progress.
  getWakeModel: () => ipcRenderer.invoke('wake:model'),
  onWakeProgress: (callback) => {
    const listener = (_, p) => callback(p);
    ipcRenderer.on('wake:progress', listener);
    return () => ipcRenderer.removeListener('wake:progress', listener);
  },
  // Bubble-sheet photos from the teacher's phone, saved into the quiz's Photos folder.
  startPhoneCapture: (dirPath, title) => ipcRenderer.invoke('capture:start', dirPath, title),
  stopPhoneCapture: () => ipcRenderer.invoke('capture:stop'),
  phoneCaptureStatus: () => ipcRenderer.invoke('capture:status'),
  onCapturePhoto: (callback) => {
    const listener = (_, p) => callback(p);
    ipcRenderer.on('capture:photo', listener);
    return () => ipcRenderer.removeListener('capture:photo', listener);
  },
  onCaptureEnded: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('capture:ended', listener);
    return () => ipcRenderer.removeListener('capture:ended', listener);
  },
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  setTitleBarColors: (colors) => ipcRenderer.invoke('app:setTitleBarColors', colors),
  // The teacher's own AI key: the key goes in once and never comes back out.
  brain: {
    status: () => ipcRenderer.invoke('brain:status'),
    detect: (key) => ipcRenderer.invoke('brain:detect', { key }),
    save: (input) => ipcRenderer.invoke('brain:save', input),
    remove: () => ipcRenderer.invoke('brain:remove'),
    models: (input) => ipcRenderer.invoke('brain:models', input),
    test: () => ipcRenderer.invoke('brain:test'),
    call: (req) => ipcRenderer.invoke('brain:call', req),
  },
  getUpdateStatus: () => ipcRenderer.invoke('update:getStatus'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => {
    const listener = (_, status) => callback(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
});
