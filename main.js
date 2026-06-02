const { app, BrowserWindow, ipcMain, Tray, Menu, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

const DATA_FILE = path.join("D:\\Programs\\DailyFlowTracker", "dft-data.json");
const BRIDGE_PORT = 25713;

// Allow audio without user gesture (Web Audio API in renderer)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Single-instance lock — prevent duplicate tray icons and windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let mainWin = null;
let appIsQuitting = false;

function createWindow() {
  const iconPath = path.join(__dirname, "icon.ico");
  mainWin = new BrowserWindow({
    width: 1000, height: 760, minWidth: 680, minHeight: 580,
    frame: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), nodeIntegration: false, contextIsolation: true },
    backgroundColor: "#121212", show: false, title: "Daily Flow Tracker",
    icon: iconPath,
  });
  mainWin.loadFile("index.html");
  mainWin.once("ready-to-show", () => mainWin.show());
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
}

function createTray() {
  const iconPath = path.join(__dirname, "icon.ico");
  // Pass path directly — let Electron handle native .ico sizing for the notification area.
  // Do NOT resize: on high-DPI displays forced 16×16 becomes invisible.
  const tray = new Tray(iconPath);
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

// Second instance → focus existing window
app.on("second-instance", () => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.setLoginItemSettings({ openAtLogin: false });
  ensureBeepScript();

  // Ensure data file exists on startup
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), days: {} }, null, 2), "utf-8");
    }
  } catch (e) {
    console.error("Failed to init data file:", e.message);
  }

  // Start HTTP bridge for Claude to send tasks directly
  try {
    http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

      if (req.method === "POST" && req.url === "/add-task") {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            BrowserWindow.getAllWindows().forEach(win => {
              win.webContents.send("external-add-task", data);
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
        return;
      }

      if (req.method === "GET" && req.url === "/ping") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("pong");
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/tasks")) {
        try {
          const urlObj = new URL(req.url, `http://127.0.0.1:${BRIDGE_PORT}`);
          const dateParam = urlObj.searchParams.get("date");
          const raw = fs.readFileSync(DATA_FILE, "utf-8");
          const data = JSON.parse(raw);
          const days = data.days || {};
          const targetKey = dateParam || (() => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; })();
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
          const targetKey = dateParam || (() => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; })();
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
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            BrowserWindow.getAllWindows().forEach(win => {
              win.webContents.send("external-patch-task", data);
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
        return;
      }

      if (req.method === "DELETE" && req.url.startsWith("/tasks")) {
        try {
          const urlObj = new URL(req.url, `http://127.0.0.1:${BRIDGE_PORT}`);
          const date = urlObj.searchParams.get("date") || undefined;
          const id = urlObj.searchParams.get("id");
          if (!id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Missing 'id' query param" }));
            return;
          }
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send("external-delete-task", { date, id });
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
      }

      if (req.method === "POST" && req.url === "/sync") {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send("trigger-sync");
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    }).listen(BRIDGE_PORT, "127.0.0.1");
  } catch (e) {
    console.error("Failed to start bridge server:", e.message);
  }
});

app.on("window-all-closed", () => {
  // On Windows & Linux: only quit when user explicitly chose Quit from tray menu.
  // Hiding the window to tray does not fire this event.
  if (process.platform !== "darwin" && appIsQuitting) app.quit();
});
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Save renderer state before quit
app.on("before-quit", async () => {
  // Give renderer a moment to flush any pending writes
  await new Promise(r => setTimeout(r, 100));
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
    return { updatedAt: new Date().toISOString(), days: {} };
  } catch (e) {
    console.error("Failed to read data file:", e.message);
    return null;
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

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
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

const BEEP_FILE = "C:\\Users\\19849\\Downloads\\universfield-new-notification-049-494249.mp3";
const BEEP_SCRIPT = path.join(os.tmpdir(), "dft-beep.ps1");

// Generate PowerShell beep script — rewritten each startup so MP3 path changes are picked up
function ensureBeepScript() {
  try {
    const hasMp3 = fs.existsSync(BEEP_FILE);
    const script = hasMp3
      ? [
          // Use WinMM MCI for reliable MP3 playback
          `$mci = Add-Type -MemberDefinition @'`,
          `[DllImport("winmm.dll", CharSet = CharSet.Unicode)]`,
          `public static extern int mciSendString(string command, System.Text.StringBuilder buffer, int bufferSize, IntPtr hwndCallback);`,
          `'@ -Name "MCI" -Namespace "WinMM" -PassThru`,
          `[void][WinMM.MCI]::mciSendString('open "${BEEP_FILE}" alias beep', $null, 0, [IntPtr]::Zero)`,
          `[void][WinMM.MCI]::mciSendString('play beep wait', $null, 0, [IntPtr]::Zero)`,
          `[void][WinMM.MCI]::mciSendString('close beep', $null, 0, [IntPtr]::Zero)`,
        ].join("\n")
      : [
          // Fallback: native system beep — no external files needed
          `[System.Console]::Beep(880, 150)`,
          `Start-Sleep -Milliseconds 100`,
          `[System.Console]::Beep(880, 150)`,
        ].join("\n");
    fs.writeFileSync(BEEP_SCRIPT, script, "utf-8");
  } catch (e) { console.error("Failed to write beep script:", e); }
}

function playBeep() {
  try {
    if (!fs.existsSync(BEEP_SCRIPT)) ensureBeepScript();
    const { execFile } = require("child_process");
    execFile("powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", BEEP_SCRIPT], { timeout: 10000 });
  } catch (e) { console.error("beep failed:", e); }
}
ipcMain.on("play-beep", playBeep);
