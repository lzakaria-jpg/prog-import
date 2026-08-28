const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

let mainWindow;
let updateAvailable = null;
let updateDownloaded = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "مدقق استيراد القيود - قيود",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    rtl: true,
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

function sendUpdateStatus(status, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", { status, ...data });
  }
}

app.whenReady().then(() => {
  createWindow();

  // ── Auto-Update Logic ──────────────────────────────────────────────
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.forceDevUpdateConfig = false;
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "lzakaria-jpg",
      repo: "prog-import",
      releaseType: "release",
    });
    autoUpdater.logger = {
      info: (msg) => console.log("[update]", msg),
      warn: (msg) => console.warn("[update]", msg),
      error: (msg) => console.error("[update]", msg),
    };

    // Check for updates 3 seconds after app starts
    setTimeout(() => {
      console.log("[update] Checking for updates...");
      autoUpdater.checkForUpdates().catch((err) => {
        console.log("[update] Check failed:", err.message);
      });
    }, 3000);

    // Re-check periodically (every 60 min) so running clients pick up
    // newly published releases without needing to reopen the app.
    setInterval(() => {
      if (updateDownloaded) return;
      console.log("[update] Periodic check...");
      autoUpdater.checkForUpdates().catch((err) => {
        console.log("[update] Periodic check failed:", err.message);
      });
    }, 60 * 60 * 1000);

    autoUpdater.on("update-available", (info) => {
      updateAvailable = info;
      sendUpdateStatus("available", {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on("update-not-available", () => {
      sendUpdateStatus("not-available");
    });

    autoUpdater.on("download-progress", (progress) => {
      sendUpdateStatus("downloading", {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      updateDownloaded = true;
      updateAvailable = info;
      sendUpdateStatus("downloaded", { version: info.version });
    });

    autoUpdater.on("error", (err) => {
      console.error("[update] Error:", err.message);
      sendUpdateStatus("error", { message: err.message });
    });
  }
});

app.on("window-all-closed", () => { app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC: File dialogs ──────────────────────────────────────────────

ipcMain.handle("open-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "اختر ملف",
    filters: [
      { name: "ملفات Excel", extensions: ["xlsx", "xls"] },
      { name: "ملفات Word", extensions: ["docx"] },
      { name: "ملفات PDF", extensions: ["pdf"] },
      { name: "جميع الملفات", extensions: ["*"] },
    ],
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const files = result.filePaths.map((filePath) => {
    const data = fs.readFileSync(filePath);
    return { filePath, name: path.basename(filePath), data: Array.from(data) };
  });
  return files.length === 1 ? files[0] : files;
});

ipcMain.handle("save-file", async (_event, { data, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "حفظ ملف Excel",
    defaultPath: defaultName || "output.xlsx",
    filters: [{ name: "ملفات Excel", extensions: ["xlsx"] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, Buffer.from(data));
  return result.filePath;
});

// ── IPC: Auto-Update ────────────────────────────────────────────────

ipcMain.handle("update-check", async () => {
  if (!app.isPackaged) return { status: "dev-mode" };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { status: "checked", updateInfo: result?.updateInfo || null };
  } catch (err) {
    return { status: "error", message: err.message };
  }
});

ipcMain.handle("update-download", async () => {
  if (!updateAvailable) return { status: "no-update" };
  try {
    autoUpdater.downloadUpdate();
    return { status: "downloading" };
  } catch (err) {
    return { status: "error", message: err.message };
  }
});

ipcMain.handle("update-install", () => {
  if (updateDownloaded) {
    autoUpdater.quitAndInstall(false, true);
  }
});

ipcMain.handle("update-info", () => {
  return {
    available: !!updateAvailable,
    downloaded: updateDownloaded,
    version: updateAvailable?.version || null,
  };
});
