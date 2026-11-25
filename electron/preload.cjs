const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('katuroDeskApi', {
  isElectron: true,
  platform: process.platform,
  titleBarHeight: 40,
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  reopenLastFolder: () => ipcRenderer.invoke('workspace:reopenLast'),
  openHomeFolder: () => ipcRenderer.invoke('workspace:openHome'),
  readDirectory: (dirPath) => ipcRenderer.invoke('fs:readDirectory', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readBinary: (filePath) => ipcRenderer.invoke('fs:readBinary', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  createDirectory: (dirPath) => ipcRenderer.invoke('fs:createDirectory', dirPath),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  renamePath: (filePath, newName) => ipcRenderer.invoke('fs:rename', filePath, newName),
  trashPath: (filePath) => ipcRenderer.invoke('fs:trash', filePath),
  homeInfo: () => ipcRenderer.invoke('home:info'),
  showHomeFolder: () => ipcRenderer.invoke('home:show'),
  moveHomeFolder: () => ipcRenderer.invoke('home:move'),
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
  // KaTuro App: phones linked to this KaTuroDesk (Settings → Phones).
  linkStatus: () => ipcRenderer.invoke('link:status'),
  linkPhone: () => ipcRenderer.invoke('link:pair'),
  cancelLinkPhone: () => ipcRenderer.invoke('link:cancel'),
  removeLinkedPhone: (id) => ipcRenderer.invoke('link:remove', id),
  setPhoneAccess: (deviceId, key, level) => ipcRenderer.invoke('link:access', deviceId, key, level),
  // Windows Firewall on this network: { checked, public, allowed }; allowLinkNetwork() asks Windows once.
  linkNetwork: () => ipcRenderer.invoke('link:network'),
  allowLinkNetwork: () => ipcRenderer.invoke('link:allowNetwork'),
  addPhoneFolder: () => ipcRenderer.invoke('link:addFolder'),
  removePhoneFolder: (id) => ipcRenderer.invoke('link:removeFolder', id),
  setLinkAccount: (uid) => ipcRenderer.invoke('link:account', uid),
  // Backup of the KaTuro folder to a USB drive or folder (Settings → Backup).
  lastBackup: () => ipcRenderer.invoke('backup:last'),
  runBackup: () => ipcRenderer.invoke('backup:run'),
  onBackupProgress: (callback) => {
    const listener = (_, p) => callback(p);
    ipcRenderer.on('backup:progress', listener);
    return () => ipcRenderer.removeListener('backup:progress', listener);
  },
  // KaTuroDesk answers the phone's class-record requests (src/pages/desk/usePhoneRequests.js).
  phoneHomeRoot: () => ipcRenderer.invoke('workspace:homeRoot'),
  onLinkRequest: (callback) => {
    const listener = (_, req) => {
      Promise.resolve()
        .then(() => callback(req))
        .then((result) => ipcRenderer.invoke('link:reply', req.id, { result }))
        .catch((err) => ipcRenderer.invoke('link:reply', req.id, { error: err?.message || 'KaTuroDesk could not do that.', code: err?.code || 'ERROR', details: err?.details }));
    };
    ipcRenderer.on('link:request', listener);
    ipcRenderer.invoke('link:answering', true);
    return () => {
      ipcRenderer.removeListener('link:request', listener);
      ipcRenderer.invoke('link:answering', false);
    };
  },
  onPhoneFileAdded: (callback) => {
    const listener = (_, info) => callback(info);
    ipcRenderer.on('link:fileAdded', listener);
    return () => ipcRenderer.removeListener('link:fileAdded', listener);
  },
  onLinkChanged: (callback) => {
    const listener = (_, st) => callback(st);
    ipcRenderer.on('link:changed', listener);
    return () => ipcRenderer.removeListener('link:changed', listener);
  },
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  isFirstRun: () => ipcRenderer.invoke('app:firstRun'),
  setTitleBarColors: (colors) => ipcRenderer.invoke('app:setTitleBarColors', colors),
  getZoom: () => ipcRenderer.invoke('app:getZoom'),
  setZoom: (value) => ipcRenderer.invoke('app:setZoom', value),
  onZoom: (callback) => {
    const listener = (_, factor) => callback(factor);
    ipcRenderer.on('app:zoom', listener);
    return () => ipcRenderer.removeListener('app:zoom', listener);
  },
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
