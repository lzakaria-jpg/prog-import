const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke("open-file"),
  saveFile: (opts) => ipcRenderer.invoke("save-file", opts),
  // Auto-update
  updateCheck: () => ipcRenderer.invoke("update-check"),
  updateDownload: () => ipcRenderer.invoke("update-download"),
  updateInstall: () => ipcRenderer.invoke("update-install"),
  onUpdateStatus: (callback) => {
    ipcRenderer.on("update-status", (_event, data) => callback(data));
  },
});
