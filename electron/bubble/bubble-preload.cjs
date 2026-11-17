// The bubble page's only link to KaTuroDesk: it receives what to show and sends clicks back.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ktBubble', {
  onState: (callback) => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on('bubble:state', listener);
    return () => ipcRenderer.removeListener('bubble:state', listener);
  },
  action: (id, text) => ipcRenderer.send('bubble:action', { id, text }),
  // Dragging the head: the window's new top-left corner on the screen (end: let go).
  moveTo: (x, y, end = false) => ipcRenderer.send('bubble:drag', { x, y, end }),
});
