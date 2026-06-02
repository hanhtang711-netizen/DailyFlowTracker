const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  winMin:   () => ipcRenderer.send("win-min"),
  winMax:   () => ipcRenderer.send("win-max"),
  winClose: () => ipcRenderer.send("win-close"),
  onWinState: (callback) => ipcRenderer.on("win-state", (_event, state) => callback(state)),

  // Data file bridge — for Claude sync
  readDataFile:   () => ipcRenderer.invoke("read-data-file"),
  writeDataFile:  (data) => ipcRenderer.invoke("write-data-file", data),
  getDataFilePath:() => ipcRenderer.invoke("get-data-file-path"),

  // HTTP bridge — for immediate task injection from Claude
  onExternalAddTask: (callback) => ipcRenderer.on("external-add-task", (_event, data) => callback(data)),
  onExternalPatchTask: (callback) => ipcRenderer.on("external-patch-task", (_event, data) => callback(data)),
  onExternalDeleteTask: (callback) => ipcRenderer.on("external-delete-task", (_event, data) => callback(data)),
  onTriggerSync: (callback) => ipcRenderer.on("trigger-sync", () => callback()),

  // Notifications, auto-start, system beep
  showNotification: ({title, body}) => ipcRenderer.send("show-notification", {title, body}),
  getAutoStart: () => ipcRenderer.invoke("get-auto-start"),
  setAutoStart: (enabled) => ipcRenderer.invoke("set-auto-start", enabled),
  playBeep: () => ipcRenderer.send("play-beep"),
  getBeepDataUri: () => ipcRenderer.invoke("get-beep-data"),
});
