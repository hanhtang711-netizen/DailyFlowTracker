const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, systemPreferences } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

const DATA_FILE = path.join(app.getPath("userData"), "dft-data.json");
const BRIDGE_PORT = 25713;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function broadcast(channel, data) {
  BrowserWindow.getAllWindows().forEach(w => { try { w.webContents.send(channel, data); } catch {} });
}

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (e) { console.error("readData:", e.message); }
  return { updatedAt: new Date().toISOString(), settings: { focus: 25, short: 5, long: 15 }, theme: "dark", style: "classic", days: {} };
}

// Serialized write queue (prevents concurrent read-modify-write races)
let _q = [], _busy = false;
function enqueue(fn) {
  return new Promise(resolve => {
    _q.push({ fn, resolve });
    drain();
  });
}
function drain() {
  if (_busy || _q.length === 0) return;
  _busy = true;
  const job = _q.shift();
  try { job.resolve(job.fn()); } catch (e) { job.resolve(null); }
  _busy = false;
  drain();
}
function safeWrite(data) {
  try {
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, DATA_FILE);
    try {
      const bd = path.join(path.dirname(DATA_FILE), "backups");
      if (!fs.existsSync(bd)) fs.mkdirSync(bd, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      fs.copyFileSync(DATA_FILE, path.join(bd, `dft-data_backup_${ts}.json`));
      const files = fs.readdirSync(bd).filter(f => f.startsWith("dft-data_backup_"));
      if (files.length > 50) files.sort().slice(0, files.length - 50).forEach(f => { try { fs.unlinkSync(path.join(bd, f)); } catch {} });
    } catch {}
    return true;
  } catch (e) { console.error("writeData:", e.message); return false; }
}
// Atomic transaction: read → modify → write (queued)
function atomicModify(modifier) {
  return enqueue(() => {
    const data = readData();
    const result = modifier(data);
    data.updatedAt = new Date().toISOString();
    safeWrite(data);
    return result;
  });
}


// Allow audio without user gesture (Web Audio API in renderer)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Single-instance lock — prevent duplicate tray icons and windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let mainWin = null;
let appIsQuitting = false;
let tray = null;

// macOS 26 (Darwin 25) renders the bundled Icon Composer asset itself. Do not
// overwrite it with a flat PNG at runtime, or Tinted/Mono rendering is lost.
function usesLiquidGlassAppIcon() {
  return process.platform === "darwin" && Number.parseInt(os.release(), 10) >= 25;
}

// macOS appearance-aware icon switching — keeps the tray adaptive everywhere;
// Dock/window PNG switching remains only as a fallback for pre-macOS 26.
function updateAppIcon() {
  if (process.platform !== "darwin") return;
  try {
    const isDark = systemPreferences.effectiveAppearance === "dark";

    // Dock icon (legacy fallback only; macOS 26 uses Assets.car from DFT.icon)
    if (app.dock && !usesLiquidGlassAppIcon()) {
      const dockIcon = path.join(__dirname, isDark ? "icon-dark.png" : "icon.png");
      app.dock.setIcon(nativeImage.createFromPath(dockIcon));
    }

    // Window icon
    if (mainWin && !mainWin.isDestroyed() && !usesLiquidGlassAppIcon()) {
      const winIcon = path.join(__dirname, isDark ? "icon-dark.png" : "icon.png");
      mainWin.setIcon(nativeImage.createFromPath(winIcon));
    }
  } catch (e) {
    console.error("updateAppIcon:", e.message);
  }
}

function createWindow() {
  const iconExt = process.platform === "darwin" ? "png" : "ico";
  const iconPath = path.join(__dirname, `icon.${iconExt}`);
  mainWin = new BrowserWindow({
    width: 1000, height: 760, minWidth: 680, minHeight: 580,
    frame: false,
    simpleFullscreen: true, // macOS: use pre-Lion fullscreen (no new Space, double-click titlebar to exit)
    webPreferences: { preload: path.join(__dirname, "preload.js"), nodeIntegration: false, contextIsolation: true },
    backgroundColor: "#121212", show: false, title: "Daily Flow Tracker",
    icon: iconPath,
  });
  mainWin.loadFile("index.html");
  mainWin.once("ready-to-show", () => mainWin.show());
  // Bootstraps app icons to match macOS appearance (Dock, tray, window)
  if (process.platform === "darwin") updateAppIcon();
  // Close to tray instead of quitting
  mainWin.on("close", (e) => {
    if (!appIsQuitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });
  const sendWindowState = () => mainWin.webContents.send("win-state", mainWin.isMaximized() ? "maximized" : "normal");
  mainWin.on("maximize", sendWindowState);
  mainWin.on("unmaximize", sendWindowState);
  mainWin.on("restore", sendWindowState);

  // Auto-recover from renderer crash (prevents black-screen on wake)
  mainWin.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit") return; // normal quit
    console.error("Renderer crashed:", details.reason, details.exitCode);
    _rendererRecovering = true;
    if (mainWin && !mainWin.isDestroyed()) mainWin.destroy();
    mainWin = null;
    createWindow();
    _rendererRecovering = false;
  });
}

function createTray() {
  let trayIcon;
  if (process.platform === "darwin") {
    // Keep the established menu-bar glyph; macOS renders this template asset.
    trayIcon = nativeImage.createFromPath(path.join(__dirname, "icon-tray.png"));
  } else {
    trayIcon = nativeImage.createFromPath(path.join(__dirname, "icon.ico"));
  }
  tray = new Tray(trayIcon);
  tray.setToolTip("Daily Flow Tracker");

  const toggleWin = () => {
    if (mainWin.isVisible()) {
      mainWin.hide();
    } else {
      mainWin.show();
      mainWin.focus();
    }
  };

  tray.on("click", toggleWin);

  const ctxMenu = Menu.buildFromTemplate([
    { label: "Show / Hide", click: toggleWin },
    { type: "separator" },
    { label: "Quit", click: () => { appIsQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(ctxMenu);
}

// Second instance → focus existing window (or recreate if crashed)
app.on("second-instance", () => {
  if (!mainWin || mainWin.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
});

// Set app name for macOS menu bar
app.setName("Daily Flow Tracker");

app.whenReady().then(() => {
  // Clean up stale temp file from a prior crash mid-write
  try { const tmp = DATA_FILE + '.tmp'; if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
  createWindow();
  try { createTray(); } catch (e) { console.error('Tray creation failed:', e.message); }
  app.setLoginItemSettings({ openAtLogin: false });
  ensureBeepScript();

  // Ensure data file exists on startup
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), settings: { focus: 25, short: 5, long: 15 }, theme: 'dark', style: 'classic', days: {} }, null, 2), "utf-8");
    }
  } catch (e) {
    console.error("Failed to init data file:", e.message);
  }

  // Subscribe to macOS appearance changes → adaptive Dock / Tray / Window icons
  if (process.platform === "darwin") {
    try {
      systemPreferences.subscribe("appleInterfaceStyle", updateAppIcon);
    } catch (e) {
      console.error("Failed to subscribe to appearance changes:", e.message);
    }
  }

  // Start HTTP bridge for Claude to send tasks directly
  try {
    http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      req.setTimeout(10000, () => { try { req.destroy(); } catch {} }); // prevent hanging connections
      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

      if (req.method === "POST" && req.url === "/add-task") {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", async () => {
          let b = {};
          try { b = JSON.parse(body); } catch {}
          const taskText = (b.text || "").trim();
          if (!taskText) {
            res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "text is required" })); return;
          }
          const result = await atomicModify(data => {
            const dateKey = b.date || todayKey();
            if (!data.days) data.days = {};
            if (!data.days[dateKey]) data.days[dateKey] = { tasks: [] };
            if (!data.days[dateKey].tasks) data.days[dateKey].tasks = [];
            const task = {
              id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
              text: taskText,
              cat: b.cat || "Other",
              done: false,
              note: b.note || ""
            };
            data.days[dateKey].tasks.push(task);
            return { task, dateKey };
          });
          if (result) {
            broadcast("external-add-task", { ...result.task, date: result.dateKey });
            broadcast("trigger-sync", {});
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result ? { ok: true, id: result.task.id, date: result.dateKey } : { ok: false, error: "write failed" }));
        }); return;
      }

      if (req.method === "GET" && req.url === "/ping") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("pong");
        return;
      }

      if (req.method === "GET" && (req.url === "/tasks" || req.url.startsWith("/tasks?"))) {
        try {
          const urlObj = new URL(req.url, `http://127.0.0.1:${BRIDGE_PORT}`);
          const dateParam = urlObj.searchParams.get("date");
          const raw = fs.readFileSync(DATA_FILE, "utf-8");
          const data = JSON.parse(raw);
          const days = data.days || {};
          const targetKey = dateParam || todayKey();
          const day = days[targetKey] || { tasks: [], stats: { pomodoros: 0, focusSec: 0 } };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, date: targetKey, tasks: day.tasks, stats: day.stats }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/stats")) {
        try {
          const urlObj = new URL(req.url, `http://127.0.0.1:${BRIDGE_PORT}`);
          const dateParam = urlObj.searchParams.get("date");
          const raw = fs.readFileSync(DATA_FILE, "utf-8");
          const data = JSON.parse(raw);
          const days = data.days || {};
          const targetKey = dateParam || todayKey();
          const day = days[targetKey] || { tasks: [], stats: { pomodoros: 0, focusSec: 0 } };
          const tasks = day.tasks || [];
          const done = tasks.filter(t => t.done);
          const stats = day.stats || { pomodoros: 0, focusSec: 0 };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true, date: targetKey,
            totalTasks: tasks.length,
            completedTasks: done.length,
            completionRate: tasks.length > 0 ? Math.round(done.length / tasks.length * 100) : 0,
            pomodoros: stats.pomodoros || 0,
            focusMinutes: Math.round((stats.focusSec || 0) / 60)
          }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
      }

      if (req.method === "PATCH" && req.url === "/tasks") {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", async () => {
          let b = {};
          try { b = JSON.parse(body); } catch {}
          if (!b.id) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "id is required" })); return; }
          let updated = false;
          await atomicModify(data => {
            const dateKey = b.date || todayKey();
            if (!data.days) data.days = {};
            if (data.days[dateKey] && data.days[dateKey].tasks) {
              const task = data.days[dateKey].tasks.find(t => t.id === b.id);
              if (task) {
                if (b.text !== undefined) task.text = b.text;
                if (b.cat !== undefined) task.cat = b.cat;
                if (b.done !== undefined) task.done = Boolean(b.done);
                updated = true;
              }
            }
            return null;
          });
          broadcast("external-patch-task", b);
          broadcast("trigger-sync", {});
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, updated }));
        }); return;
      }

      if (req.method === "DELETE" && req.url.startsWith("/tasks")) {
        const u = new URL(req.url, `http://127.0.0.1:${BRIDGE_PORT}`);
        const id = u.searchParams.get("id");
        const dateKey = u.searchParams.get("date") || todayKey();
        if (!id) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "id is required" })); return; }
        (async () => {
          let deleted = false;
          await atomicModify(data => {
            if (!data.days) data.days = {};
            if (data.days[dateKey] && data.days[dateKey].tasks) {
              const before = data.days[dateKey].tasks.length;
              data.days[dateKey].tasks = data.days[dateKey].tasks.filter(t => t.id !== id);
              deleted = data.days[dateKey].tasks.length < before;
            }
            return null;
          });
          broadcast("external-delete-task", { id, date: dateKey });
          broadcast("trigger-sync", {});
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, deleted }));
        })(); return;
      }

      if (req.method === "POST" && req.url === "/sync") {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send("trigger-sync");
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 返回所有日期的未完成任务（按日期升序分组）
      if (req.method === "GET" && req.url === "/tasks/unfinished") {
        try {
          const raw = fs.readFileSync(DATA_FILE, "utf-8");
          const data = JSON.parse(raw);
          const days = data.days || {};
          const groups = [];

          for (const [dateKey, day] of Object.entries(days)) {
            const tasks = (day.tasks || []).filter(t => !t.done);
            if (tasks.length > 0) {
              groups.push({ date: dateKey, tasks });
            }
          }
          groups.sort((a, b) => new Date(a.date) - new Date(b.date));

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, groups }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    }).listen(BRIDGE_PORT, "127.0.0.1");
  } catch (e) {
    console.error("Failed to start bridge server:", e.message);
  }
}).catch(err => {
  console.error("Startup failed:", err);
  app.quit();
});

// Track whether we're recovering from a renderer crash to avoid
// window-all-closed mis-triggering a quit during recovery.
let _rendererRecovering = false;

app.on("window-all-closed", () => {
  // On Windows & Linux: only quit when user explicitly chose Quit from tray menu.
  // Hiding the window to tray does not fire this event.
  if (_rendererRecovering) return; // crash recovery in progress — new window incoming
  if (process.platform !== "darwin" && appIsQuitting) app.quit();
});
app.on("activate", () => {
  const wins = BrowserWindow.getAllWindows();
  if (wins.length === 0) { createWindow(); return; }
  // Show hidden windows (e.g. minimized-to-tray via close button)
  wins.forEach(w => { if (!w.isVisible() || w.isMinimized()) { w.show(); w.focus(); } });
});

// Save renderer state before quit — send sync trigger to renderer
app.on("before-quit", () => {
  appIsQuitting = true; // MARK: allow window close handler to proceed
  // Trigger sync while renderer is still alive; localStorage survives across restarts
  BrowserWindow.getAllWindows().forEach(win => {
    try { win.webContents.send("trigger-sync"); } catch {}
  });
});

// Clean up tray resource before final exit
app.on("will-quit", () => {
  if (tray) { try { tray.destroy(); } catch {} tray = null; }
});

// Window control IPC
ipcMain.on("win-min",    e => BrowserWindow.getFocusedWindow()?.minimize());
ipcMain.on("win-max",    e => {
  const w = BrowserWindow.getFocusedWindow();
  if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on("win-close",  e => BrowserWindow.getFocusedWindow()?.close());

// Data file IPC — read
ipcMain.handle("read-data-file", async () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    }
    return { updatedAt: new Date().toISOString(), settings: { focus: 25, short: 5, long: 15 }, theme: 'dark', style: 'classic', days: {} };
  } catch (e) {
    console.error("Failed to read data file (returning empty state):", e.message);
    return { updatedAt: new Date().toISOString(), settings: { focus: 25, short: 5, long: 15 }, theme: 'dark', style: 'classic', days: {} };
  }
});

// Data file IPC — write
ipcMain.handle("write-data-file", async (_event, data) => {
  try {
    // Auto-backup existing file before overwriting
    try {
      if (fs.existsSync(DATA_FILE)) {
        const backupDir = path.join(path.dirname(DATA_FILE), 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(DATA_FILE, path.join(backupDir, `dft-data_backup_${ts}.json`));
        // Keep only last 50 backups to avoid unbounded growth
        const files = fs.readdirSync(backupDir).filter(f => f.startsWith('dft-data_backup_'));
        if (files.length > 50) {
          files.sort().slice(0, files.length - 50).forEach(f => {
            try { fs.unlinkSync(path.join(backupDir, f)); } catch {}
          });
        }
      }
    } catch (e) { console.error("Backup failed:", e.message); }

    // Atomic write: write to temp file then rename (avoids corruption on crash mid-write)
    const tmpPath = DATA_FILE + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpPath, DATA_FILE);
    return true;
  } catch (e) {
    console.error("Failed to write data file:", e.message);
    return false;
  }
});

// Expose file path for Claude's reference
ipcMain.handle("get-data-file-path", async () => DATA_FILE);

// Notification IPC
ipcMain.on("show-notification", (_event, { title, body }) => {
  const n = new Notification({ title, body });
  n.show();
});

// Auto-start IPC
ipcMain.handle("get-auto-start", async () => {
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle("set-auto-start", async (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
  return true;
});

let BEEP_FILE = null; // resolved in ensureBeepPath() after app is ready
const BEEP_SCRIPT = path.join(os.tmpdir(), "dft-beep.ps1"); // Windows only

// Resolve custom beep MP3 path — cross-platform
function ensureBeepPath() {
  if (BEEP_FILE) return;
  const custom = path.join(app.getPath("userData"), "custom-beep.mp3");
  BEEP_FILE = fs.existsSync(custom) ? custom : null;
}

// Windows: generate PowerShell beep script
function ensureBeepScript() {
  if (process.platform !== "win32") return;
  try {
    ensureBeepPath();
    const hasMp3 = BEEP_FILE && fs.existsSync(BEEP_FILE);
    const script = hasMp3
      ? [
          `$mci = Add-Type -MemberDefinition @'`,
          `[DllImport("winmm.dll", CharSet = CharSet.Unicode)]`,
          `public static extern int mciSendString(string command, System.Text.StringBuilder buffer, int bufferSize, IntPtr hwndCallback);`,
          `'@ -Name "MCI" -Namespace "WinMM" -PassThru`,
          `[void][WinMM.MCI]::mciSendString('open "${BEEP_FILE}" alias beep', $null, 0, [IntPtr]::Zero)`,
          `[void][WinMM.MCI]::mciSendString('play beep wait', $null, 0, [IntPtr]::Zero)`,
          `[void][WinMM.MCI]::mciSendString('close beep', $null, 0, [IntPtr]::Zero)`,
        ].join("\n")
      : [
          `[System.Console]::Beep(880, 150)`,
          `Start-Sleep -Milliseconds 100`,
          `[System.Console]::Beep(880, 150)`,
        ].join("\n");
    fs.writeFileSync(BEEP_SCRIPT, script, "utf-8");
  } catch (e) { console.error("Failed to write beep script:", e); }
}

function playBeep() {
  try {
    ensureBeepPath();
    const { execFile } = require("child_process");

    if (process.platform === "darwin") {
      // macOS: use afplay for custom MP3, osascript beep as fallback
      if (BEEP_FILE && fs.existsSync(BEEP_FILE)) {
        execFile("afplay", [BEEP_FILE], { timeout: 10000 });
      } else {
        execFile("osascript", ["-e", "beep"], { timeout: 5000 });
      }
    } else {
      // Windows: PowerShell beep
      if (!fs.existsSync(BEEP_SCRIPT)) ensureBeepScript();
      execFile("powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", BEEP_SCRIPT], { timeout: 10000 });
    }
  } catch (e) { console.error("beep failed:", e); }
}
ipcMain.on("play-beep", playBeep);

// Cache MP3 as base64 data URI for instant renderer-side playback
let _beepDataUri = null;
let _beepChecked = false; // avoid re-checking fs on every call when no custom MP3 exists
ipcMain.handle("get-beep-data", () => {
  if (_beepDataUri) return _beepDataUri;
  if (_beepChecked) return null; // already confirmed no custom MP3
  _beepChecked = true;
  try {
    ensureBeepPath();
    if (BEEP_FILE && fs.existsSync(BEEP_FILE)) {
      const buf = fs.readFileSync(BEEP_FILE);
      _beepDataUri = "data:audio/mpeg;base64," + buf.toString("base64");
      return _beepDataUri;
    }
  } catch (e) { console.error("Failed to cache beep data URI:", e); }
  return null;
});
