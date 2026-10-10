// The bubble page's only link to KaTuroDesk: it receives what to show and sends clicks back.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ktBubble', {
  onState: (callback) => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on('bubble:state', listener);
    return () => ipcRenderer.removeListener('bubble:state', listener);
  },
  action: (id, text) => ipcRenderer.send('bubble:action', { id, text }),
  drag: (dx, dy, end = false) => ipcRenderer.send('bubble:drag', { dx, dy, end }),
});
