// main.js - SWG Returns Launcher (PreCU) – uses cmd /c start for maximum compatibility
const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const axios = require('axios');

let DiscordRPC;
try {
  DiscordRPC = require('discord-rpc');
} catch (e) {
  console.warn('Discord RPC not available:', e.message);
  DiscordRPC = null;
}

app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

let mainWindow;
let rpc;

const BASE_URL = 'http://15.204.254.253/tre/';
const VERSION_URL = `${BASE_URL}version.txt`;
const GAME_SERVER_IP = '144.217.255.58';
const GAME_SERVER_PORT = 44453;

const logFile = path.join(app.getPath('userData'), 'logs', 'launcher.log');
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  console.log(logLine.trim());
  try { fs.appendFileSync(logFile, logLine, { flag: 'a' }); } catch (_) {}
}

function initDiscordRPC() {
  if (!DiscordRPC) return;
  const clientId = '1490822251304714323';
  DiscordRPC.register(clientId);
  rpc = new DiscordRPC.Client({ transport: 'ipc' });
  rpc.on('ready', () => {
    log('Discord RPC ready');
    rpc.setActivity({
      details: 'Managing SWG Installation',
      state: 'Launcher ready',
      startTimestamp: new Date(),
      largeImageKey: 'swg_logo',
      largeImageText: 'Star Wars Galaxies',
      instance: false,
    });
  });
  rpc.login({ clientId }).catch(err => log(`Discord RPC error: ${err.message}`, 'ERROR'));
}
function updateDiscordStatus(status, details = '') {
  if (!rpc) return;
  let state = '';
  if (status === 'playing') state = 'In game';
  else if (status === 'downloading') state = 'Downloading files';
  else state = 'Launcher ready';
  rpc.setActivity({
    details: details || (status === 'playing' ? 'Playing SWG' : 'Managing SWG Installation'),
    state: state,
    startTimestamp: new Date(),
    largeImageKey: 'swg_logo',
    largeImageText: 'Star Wars Galaxies',
    instance: false,
  }).catch(err => log(`Discord RPC setActivity error: ${err.message}`, 'ERROR'));
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('error', (err) => log(`Auto-updater error: ${err.message}`, 'WARN'));
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => log(`Auto-updater check failed: ${err.message}`, 'WARN'));
  }, 5000);
}
autoUpdater.on('update-available', () => mainWindow && mainWindow.webContents.send('update-available'));
autoUpdater.on('update-downloaded', () => mainWindow && mainWindow.webContents.send('update-downloaded'));
autoUpdater.on('update-not-available', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-not-available');
});
autoUpdater.on('error', (err) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-error', err.message);
});
ipcMain.handle('restart-and-update', () => autoUpdater.quitAndInstall());

ipcMain.handle('check-for-updates-manual', async () => {
  log('Manual update check requested');
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.updateInfo) {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-not-available');
    }
  } catch (err) {
    log(`Manual update check error: ${err.message}`, 'ERROR');
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-error', err.message);
  }
});

function detectInstallDir() {
  const commonPaths = [
    'C:\\Program Files\\SWGEmu', 'C:\\SWGEmu', 'D:\\SWGEmu',
    'C:\\Program Files (x86)\\SWGEmu', process.env.ProgramFiles + '\\SWGEmu',
    process.env['ProgramFiles(x86)'] + '\\SWGEmu', app.getPath('documents') + '\\SWGEmu',
    app.getPath('home') + '\\SWGEmu',
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'SWGEmu.exe'))) return p;
  }
  return null;
}

function toggleFullscreen(win) {
  if (!win || win.isDestroyed()) return;
  win.setFullScreen(!win.isFullScreen());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 720, useContentSize: true, frame: false, transparent: true,
    resizable: true, minimizable: true, maximizable: true, fullscreenable: true,
    backgroundColor: '#00000000', hasShadow: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    show: false,
  });
  mainWindow.setMinimumSize(1024, 600);
  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const zoomLevel = (settings.zoom || 100) / 100;
        await mainWindow.webContents.setZoomFactor(zoomLevel);
      }
    } catch (_) {}
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      toggleFullscreen(mainWindow);
    }
    if (input.control && (input.key === '+' || input.key === '-' || input.key === '=' || input.key === '0')) {
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const targetWidth = Math.min(width, 1280);
    const targetHeight = Math.min(height, 720);
    mainWindow.setContentSize(targetWidth, targetHeight);
    mainWindow.center();
    mainWindow.show();
    log('Main window shown');
  });
}

app.whenReady().then(() => {
  createWindow();
  initDiscordRPC();
  setupAutoUpdater();
  const logDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  log('Launcher started');
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// IPC: Window controls (unchanged)
ipcMain.handle('window:minimize', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize(); });
ipcMain.handle('window:maximizeToggle', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window:close', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); });
ipcMain.handle('window:toggleFullscreen', () => toggleFullscreen(mainWindow));
ipcMain.handle('window:isMaximized', () => mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false);
ipcMain.handle('window:isFullscreen', () => mainWindow && !mainWindow.isDestroyed() ? mainWindow.isFullScreen() : false);

ipcMain.handle('set-zoom', async (event, percent) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const factor = percent / 100;
    await mainWindow.webContents.setZoomFactor(factor);
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        settings.zoom = percent;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      } catch (_) {}
    }
  }
});

// Game version checker
ipcMain.handle('check-game-version', async () => {
  try {
    const response = await axios.get(VERSION_URL, { timeout: 5000 });
    const remoteVersion = response.data.trim();
    const versionFile = path.join(app.getPath('userData'), 'game_version.txt');
    let localVersion = '';
    if (fs.existsSync(versionFile)) localVersion = fs.readFileSync(versionFile, 'utf8').trim();
    return { remoteVersion, localVersion, needsUpdate: remoteVersion !== localVersion };
  } catch (error) {
    log(`Version check failed: ${error.message}`, 'ERROR');
    return { remoteVersion: 'unknown', localVersion: 'none', needsUpdate: false };
  }
});
ipcMain.handle('save-game-version', (event, version) => {
  fs.writeFileSync(path.join(app.getPath('userData'), 'game_version.txt'), version);
});

// Write options.cfg – preserves INI format (same as before, omitted for brevity – must keep full function)
// (I'll include the full function later in the final answer)
ipcMain.handle('write-game-options', async (event, installDir, settings) => {
  // ... (keep your existing working implementation)
});

// FPS patching
ipcMain.handle('patch-game-fps', async (event, exePath, fps) => {
  // ... (keep your existing working implementation)
});

ipcMain.handle('get-server-info', async () => ({ ip: GAME_SERVER_IP, port: GAME_SERVER_PORT }));

ipcMain.handle('test-exe', async (event, exePath) => {
  try {
    if (!fs.existsSync(exePath)) return { valid: false, error: 'File does not exist' };
    const ext = path.extname(exePath).toLowerCase();
    if (ext !== '.exe') return { valid: false, error: 'Not an .exe file' };
    return { valid: true, version: 'unknown' };
  } catch (err) {
    return { valid: false, error: err.message };
  }
});

// ---------- FINAL LAUNCH METHOD: cmd /c start (mimics double-click) ----------
ipcMain.handle('launch-game', async (event, { exePath, settings }) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(exePath)) {
      reject(new Error(`Executable not found: ${exePath}`));
      return;
    }
    const exeDir = path.dirname(exePath);
    const command = `start "" "${exePath}"`;
    log(`Launching via cmd: ${command}`);
    log(`Working directory: ${exeDir}`);

    const child = exec(command, { cwd: exeDir, windowsHide: false }, (error, stdout, stderr) => {
      if (error) {
        log(`Exec error: ${error.message}`, 'ERROR');
        reject(error);
      } else {
        log(`Exec completed: stdout: ${stdout}, stderr: ${stderr}`);
      }
    });

    // The start command detaches immediately, so we can't get a PID.
    // But we consider it a success if no immediate error.
    child.unref();
    updateDiscordStatus('playing', 'Playing Star Wars Galaxies');
    log(`Launch command sent successfully (no PID tracking)`);
    resolve({ success: true, pid: null, method: 'start' });
  });
});

// ---------- PATCHER (unchanged, keep your existing full patcher code) ----------
// ... (all patcher variables and functions must remain exactly as before)

// Server status (patch server only)
ipcMain.handle('server-status', async () => {
  const start = Date.now();
  try {
    await axios.get(`http://${BASE_URL.split('/')[2]}/`, { timeout: 3000 });
    return { online: true, ping: Date.now() - start, method: 'HTTP' };
  } catch {
    return { online: false, ping: null, method: 'HTTP' };
  }
});

// Log viewer (unchanged)
ipcMain.handle('get-log-content', () => {
  if (fs.existsSync(logFile)) return fs.readFileSync(logFile, 'utf8');
  return '';
});
ipcMain.handle('open-log-viewer', () => {
  const logWindow = new BrowserWindow({
    width: 800, height: 600, parent: mainWindow, modal: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  logWindow.loadURL(`data:text/html,
    <html><head><title>Launcher Logs</title>
    <style>body{background:#1e1e2f;color:#fff;font-family:monospace;padding:10px;}pre{white-space:pre-wrap;}</style>
    </head><body><h2>Launcher Log</h2><pre id="log"></pre><script>
      const { ipcRenderer } = require('electron');
      ipcRenderer.invoke('get-log-content').then(log => document.getElementById('log').innerText = log);
    </script></body></html>`);
});

// Auto-detect install directory
ipcMain.handle('detect-install-dir', () => detectInstallDir());

// File list, MD5, download, directory selection (unchanged – must keep your working versions)
ipcMain.handle('load-required-files', async () => {
  // ... (keep your working implementation)
});
ipcMain.handle('check-md5', async (event, filePath) => {
  // ... (keep)
});
ipcMain.handle('download-file', async (event, { url, destination, expectedMd5 }) => {
  // ... (keep)
});
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select SWG Installation Directory' });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], title: 'Select SWGEmu.exe', filters: [{ name: 'Executable', extensions: ['exe'] }] });
  return result.canceled ? null : result.filePaths[0];
});

// Settings management (unchanged)
const getSettingsPath = () => path.join(app.getPath('userData'), 'settings.json');
ipcMain.handle('save-settings', (event, settings) => {
  try {
    const settingsPath = getSettingsPath();
    const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
    const merged = { ...existing, ...settings };
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});
ipcMain.handle('get-settings', () => {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch(_) { return {}; }
  return {};
});
ipcMain.handle('save-install-dir', (event, dir) => {
  const settingsPath = getSettingsPath();
  const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
  settings.installDir = dir;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
});
ipcMain.handle('get-install-dir', () => {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) try { const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); return s.installDir || null; } catch(_) { return null; }
  return null;
});
ipcMain.handle('save-scan-mode', (event, mode) => {
  const settingsPath = getSettingsPath();
  const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
  settings.scanMode = mode;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
});
ipcMain.handle('get-scan-mode', () => {
  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) try { const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); return s.scanMode || 'quick'; } catch(_) { return 'quick'; }
  return 'quick';
});
ipcMain.handle('clear-cache', async () => {
  try {
    const cachePaths = [path.join(app.getPath('userData'), 'Cache'), path.join(app.getPath('userData'), 'cache'), path.join(app.getPath('userData'), 'GPUCache')];
    let cleared = false;
    for (const p of cachePaths) if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); cleared = true; }
    return { success: true, message: cleared ? 'Cache cleared' : 'Cache empty' };
  } catch (error) { return { success: false, error: `Failed: ${error.message}` }; }
});
ipcMain.handle('open-logs', async () => {
  const logPath = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logPath)) fs.mkdirSync(logPath, { recursive: true });
  const logFileFull = path.join(logPath, 'launcher.log');
  if (!fs.existsSync(logFileFull)) fs.writeFileSync(logFileFull, `SWG Returns Launcher Log\nCreated: ${new Date().toISOString()}\n\n`);
  shell.openPath(logFileFull);
  return { success: true };
});

process.on('uncaughtException', error => {
  try { fs.appendFileSync(logFile, `${new Date().toISOString()} - Uncaught Exception: ${error.stack}\n`); } catch(_) {}
});
process.on('unhandledRejection', reason => {
  try { fs.appendFileSync(logFile, `${new Date().toISOString()} - Unhandled Rejection: ${reason}\n`); } catch(_) {}
});
