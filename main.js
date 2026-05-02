// main.js - SWG Returns Launcher (PreCU/Core3) – smart server status
const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
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

// --- Patch server (where game files are downloaded from) ---
const BASE_URL = 'http://15.204.254.253/tre/';
const VERSION_URL = `${BASE_URL}version.txt`;

// --- Game login server (where the client connects to play) ---
const SERVER_IP = '144.217.255.58';
const SERVER_PORT = 44453;

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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-not-available');
      }
    }
  } catch (err) {
    log(`Manual update check error: ${err.message}`, 'ERROR');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', err.message);
    }
  }
});

function detectInstallDir() {
  const commonPaths = [
    'C:\\Program Files\\SWGEmu',
    'C:\\SWGEmu',
    'D:\\SWGEmu',
    'C:\\Program Files (x86)\\SWGEmu',
    process.env.ProgramFiles + '\\SWGEmu',
    process.env['ProgramFiles(x86)'] + '\\SWGEmu',
    app.getPath('documents') + '\\SWGEmu',
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
    width: 1280,
    height: 720,
    useContentSize: true,
    frame: false,
    transparent: true,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    backgroundColor: '#00000000',
    hasShadow: false,
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: Window controls
ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});
ipcMain.handle('window:maximizeToggle', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});
ipcMain.handle('window:toggleFullscreen', () => toggleFullscreen(mainWindow));
ipcMain.handle('window:isMaximized', () =>
  mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false,
);
ipcMain.handle('window:isFullscreen', () =>
  mainWindow && !mainWindow.isDestroyed() ? mainWindow.isFullScreen() : false,
);

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

// Game version checker (points to patch server) – returns fallback values on error
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

// Write options.cfg from settings - Preserves INI section format
ipcMain.handle('write-game-options', async (event, installDir, settings) => {
  const optionsPath = path.join(installDir, 'options.cfg');
  try {
    let originalLines = [];
    if (fs.existsSync(optionsPath)) {
      const content = fs.readFileSync(optionsPath, 'utf8');
      originalLines = content.split(/\r?\n/);
    }

    const updatedSettings = {
      screenWidth: parseInt(settings.resolution?.split('x')[0]) || 1920,
      screenHeight: parseInt(settings.resolution?.split('x')[1]) || 1080,
      fullscreen: settings.displayMode === 'fullscreen' ? 1 : 0,
      borderlessWindow: settings.displayMode === 'borderless' ? 1 : 0,
      windowed: settings.displayMode === 'windowed' ? 1 : 0,
      useHardwareMouseCursor: settings.hardwareCursor ? 1 : 0,
      skipIntro: settings.skipIntro ? 1 : 0,
      textureBaking: settings.textureBaking ? 1 : 0,
      dot3Terrain: settings.dot3Terrain ? 1 : 0,
      maxCameraZoom: settings.maxCameraZoom || 10,
      cache: settings.cacheSize === 'small' ? 'misc/cache_small.iff' : (settings.cacheSize === 'medium' ? 'misc/cache_medium.iff' : 'misc/cache_large.iff'),
    };

    const newLines = [];
    let inClientGraphics = false;
    let inSharedUtility = false;
    let updatedKeys = new Set();

    for (const line of originalLines) {
      let newLine = line;
      let updated = false;

      if (line.match(/^\[ClientGraphics\]/)) {
        inClientGraphics = true;
        inSharedUtility = false;
      } else if (line.match(/^\[SharedUtility\]/)) {
        inClientGraphics = false;
        inSharedUtility = true;
      } else if (line.match(/^\[/)) {
        inClientGraphics = false;
        inSharedUtility = false;
      }

      if (inClientGraphics) {
        const match = line.match(/^\s*(\w+)\s*=\s*(.+)$/);
        if (match) {
          const key = match[1];
          if (updatedSettings.hasOwnProperty(key)) {
            const indent = line.match(/^(\s*)/)[1];
            newLine = `${indent}${key}=${updatedSettings[key]}`;
            updatedKeys.add(key);
            updated = true;
          }
        }
      }

      if (inSharedUtility) {
        const match = line.match(/^\s*cache\s*=\s*(.+)$/);
        if (match) {
          const indent = line.match(/^(\s*)/)[1];
          newLine = `${indent}cache=${updatedSettings.cache}`;
          updatedKeys.add('cache');
          updated = true;
        }
      }

      newLines.push(updated ? newLine : line);
    }

    const missingKeys = Object.keys(updatedSettings).filter(k => !updatedKeys.has(k) && k !== 'cache');
    if (missingKeys.length > 0) {
      let clientGraphicsIndex = -1;
      let insertIndex = -1;
      for (let i = 0; i < newLines.length; i++) {
        if (newLines[i].match(/^\[ClientGraphics\]/)) {
          clientGraphicsIndex = i;
          insertIndex = i + 1;
        } else if (clientGraphicsIndex !== -1 && newLines[i].match(/^\[/)) {
          break;
        } else if (clientGraphicsIndex !== -1 && insertIndex === clientGraphicsIndex + 1 && newLines[i].trim() === '') {
          insertIndex = i + 1;
        }
      }
      if (insertIndex !== -1) {
        const indent = '	';
        for (const key of missingKeys) {
          if (key !== 'cache') {
            newLines.splice(insertIndex, 0, `${indent}${key}=${updatedSettings[key]}`);
            log(`Added missing option: ${key}`);
            insertIndex++;
          }
        }
      }
    }

    fs.writeFileSync(optionsPath, newLines.join('\n'), 'utf8');
    log(`Updated options.cfg in ${installDir} (preserved INI format)`);
    return { success: true };
  } catch (err) {
    log(`Error writing options.cfg: ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
});

// FPS patching for PreCU
ipcMain.handle('patch-game-fps', async (event, exePath, fps) => {
  return new Promise(resolve => {
    if (!fs.existsSync(exePath)) {
      resolve({ success: false, error: 'Executable not found' });
      return;
    }
    try {
      const fd = fs.openSync(exePath, 'r+');
      const buf = Buffer.alloc(7);
      const bytesRead = fs.readSync(fd, buf, 0, 7, 0x1153);
      if (
        bytesRead === 7 &&
        buf.readUInt8(0) === 0xc7 &&
        buf.readUInt8(1) === 0x45 &&
        buf.readUInt8(2) === 0x94
      ) {
        const floatBuf = Buffer.alloc(4);
        floatBuf.writeFloatLE(fps);
        fs.writeSync(fd, floatBuf, 0, 4, 0x1156);
        fs.closeSync(fd);
        log(`Patched SWGEmu.exe FPS to ${fps} at offset 0x1156`);
        resolve({ success: true });
      } else {
        fs.closeSync(fd);
        resolve({ success: false, error: 'Executable signature mismatch – cannot patch FPS' });
      }
    } catch (err) {
      log(`FPS patching error: ${err.message}`, 'ERROR');
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('get-server-info', async () => {
  return { ip: SERVER_IP, port: SERVER_PORT };
});

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

// Launch game (clean, no env vars, no arguments)
ipcMain.handle('launch-game', async (event, { exePath, settings }) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(exePath)) {
      reject(new Error(`Executable not found: ${exePath}`));
      return;
    }
    const exeDir = path.dirname(exePath);
    log(`Launching: ${exePath}`);
    log(`Working directory: ${exeDir}`);

    setTimeout(() => {
      const gameProcess = execFile(exePath, [], {
        cwd: exeDir,
        detached: true,
        windowsHide: false,
      }, (error) => {
        if (error) {
          log(`Process error: ${error.message}`, 'ERROR');
          reject(error);
        } else {
          log('Process exited cleanly');
        }
      });
      gameProcess.unref();
      if (gameProcess.pid) {
        updateDiscordStatus('playing', 'Playing Star Wars Galaxies');
        log(`Game launched with PID: ${gameProcess.pid}`);
        resolve({ success: true, pid: gameProcess.pid });
      } else {
        reject(new Error('Failed to obtain process ID'));
      }
    }, 300);
  });
});

// ------------- Patcher (unchanged, uses BASE_URL for downloads) -------------
let activeDownloads = new Map();
let downloadQueue = [];
let isDownloading = false;
let patcherPaused = false;
let MAX_CONCURRENT = 4;
let SPEED_LIMIT_BYTES = 0;
const MAX_RETRIES = 3;
const DOWNLOAD_TIMEOUT = 120000;

async function downloadFileWithResume(url, destination, expectedMd5, size, fileId, retryCount = 0) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destination);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let existingSize = 0;
    if (fs.existsSync(destination)) existingSize = fs.statSync(destination).size;
    const requestOptions = { headers: {} };
    if (existingSize > 0) requestOptions.headers.Range = `bytes=${existingSize}-`;
    const req = http.get(url, requestOptions, response => {
      if (response.statusCode === 200 && existingSize > 0) {
        fs.writeFileSync(destination, '');
        existingSize = 0;
      }
      if (response.statusCode !== 200 && response.statusCode !== 206) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const fileStream = fs.createWriteStream(destination, { flags: 'a' });
      activeDownloads.set(fileId, { req, fileStream });
      let downloadedBytes = existingSize;
      const totalBytes = parseInt(response.headers['content-range']?.split('/').pop() || response.headers['content-length'], 10) || size;
      let lastByteTimestamp = Date.now();
      let lastByteCount = downloadedBytes;
      response.on('data', chunk => {
        if (patcherPaused) { req.pause(); return; }
        if (SPEED_LIMIT_BYTES > 0) {
          const now = Date.now();
          const elapsed = (now - lastByteTimestamp) / 1000;
          const currentSpeed = (downloadedBytes - lastByteCount) / elapsed;
          if (currentSpeed > SPEED_LIMIT_BYTES) {
            req.pause();
            setTimeout(() => req.resume(), Math.ceil(((downloadedBytes - lastByteCount) / SPEED_LIMIT_BYTES) * 100));
          }
          lastByteTimestamp = now;
          lastByteCount = downloadedBytes;
        }
        downloadedBytes += chunk.length;
        fileStream.write(chunk);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-progress', { fileId, downloaded: downloadedBytes, total: totalBytes });
        }
      });
      response.on('end', () => {
        fileStream.end();
        activeDownloads.delete(fileId);
        if (expectedMd5) {
          const hash = crypto.createHash('md5');
          const readStream = fs.createReadStream(destination);
          readStream.on('data', d => hash.update(d));
          readStream.on('end', () => {
            const md5 = hash.digest('hex');
            if (md5 !== expectedMd5) {
              fs.unlinkSync(destination);
              reject(new Error('MD5 mismatch'));
            } else {
              resolve({ path: destination, md5 });
            }
          });
          readStream.on('error', reject);
        } else {
          resolve({ path: destination });
        }
        processQueue();
      });
      response.on('error', reject);
    });
    req.on('error', err => {
      if (retryCount < MAX_RETRIES) {
        log(`Download failed for ${fileId}, retrying (${retryCount + 1}/${MAX_RETRIES})...`, 'WARN');
        setTimeout(() => {
          downloadFileWithResume(url, destination, expectedMd5, size, fileId, retryCount + 1)
            .then(resolve).catch(reject);
        }, 2000);
      } else {
        reject(err);
      }
    });
    req.setTimeout(DOWNLOAD_TIMEOUT, () => {
      req.destroy();
      if (retryCount < MAX_RETRIES) {
        log(`Timeout for ${fileId}, retrying (${retryCount + 1}/${MAX_RETRIES})...`, 'WARN');
        setTimeout(() => {
          downloadFileWithResume(url, destination, expectedMd5, size, fileId, retryCount + 1)
            .then(resolve).catch(reject);
        }, 2000);
      } else {
        reject(new Error(`Timeout after ${DOWNLOAD_TIMEOUT / 1000}s (${MAX_RETRIES} retries)`));
      }
    });
  });
}

async function processQueue() {
  if (patcherPaused || isDownloading) return;
  while (activeDownloads.size < MAX_CONCURRENT && downloadQueue.length > 0) {
    const { file, destination, fileId, resolve, reject } = downloadQueue.shift();
    isDownloading = true;
    downloadFileWithResume(file.url, destination, file.md5, file.size, fileId, 0)
      .then(resolve).catch(reject)
      .finally(() => { isDownloading = false; processQueue(); });
  }
}

ipcMain.handle('patcher-start', async (event, files, installDir) => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      MAX_CONCURRENT = settings.concurrentDownloads || 4;
      const limitMB = settings.speedLimitMBps || 0;
      SPEED_LIMIT_BYTES = limitMB * 1024 * 1024;
    } catch (_) {}
  }
  downloadQueue = [];
  activeDownloads.clear();
  patcherPaused = false;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const destination = path.join(installDir, file.name);
    const fileId = `file_${i}`;
    const url = file.url && file.url.startsWith('http') ? file.url : BASE_URL + file.name;
    downloadQueue.push({
      file: { ...file, url }, destination, fileId,
      resolve: () => event.sender.send('file-complete', { fileId, success: true }),
      reject: err => event.sender.send('file-complete', { fileId, success: false, error: err.message })
    });
  }
  processQueue();
  return { started: true, total: files.length };
});

ipcMain.handle('patcher-pause', () => {
  patcherPaused = true;
  for (let [id, { req }] of activeDownloads) req.pause();
  log('Patcher paused');
});
ipcMain.handle('patcher-resume', () => {
  patcherPaused = false;
  for (let [id, { req }] of activeDownloads) req.resume();
  processQueue();
  log('Patcher resumed');
});

// ---------- SMART SERVER STATUS: try TCP, fallback to HTTP ping on patch server ----------
ipcMain.handle('server-status', async () => {
  const net = require('net');
  // First, try to connect to the game login server
  const tcpStart = Date.now();
  const tcpResult = await new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ online: false, ping: null, method: 'tcp', error: 'timeout' });
    }, 4000);
    socket.connect(SERVER_PORT, SERVER_IP, () => {
      clearTimeout(timeout);
      const ping = Date.now() - tcpStart;
      socket.destroy();
      resolve({ online: true, ping, method: 'tcp' });
    });
    socket.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ online: false, ping: null, method: 'tcp', error: err.message });
    });
  });

  if (tcpResult.online) {
    // Game login server responded
    return { online: true, ping: tcpResult.ping, method: 'tcp' };
  }

  // If TCP fails, try to ping the patch server's web server (which we know is online)
  // This gives a "server online" indication even if the login port is blocked.
  log(`TCP ping to login server failed: ${tcpResult.error} – falling back to patch server ping`, 'WARN');
  const httpStart = Date.now();
  try {
    await axios.get(`http://${BASE_URL.split('/')[2]}/`, { timeout: 3000 });
    const ping = Date.now() - httpStart;
    return { online: true, ping, method: 'http (patch server)' };
  } catch (err) {
    // Both methods failed – server is probably down
    return { online: false, ping: null, method: 'none' };
  }
});

// Log viewer
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

ipcMain.handle('detect-install-dir', () => detectInstallDir());

// File list, MD5, download fallback, directory selection
ipcMain.handle('load-required-files', async () => {
  return new Promise((resolve, reject) => {
    const url = BASE_URL + 'required-files.json';
    log(`Loading file list from ${url}`);
    const req = http.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      let data = '';
      response.on('data', chunk => (data += chunk));
      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          if (!Array.isArray(jsonData)) throw new Error('Not an array');
          const valid = jsonData.filter(item => item && item.name && item.url && item.md5 && item.size > 0);
          log(`Loaded ${valid.length} valid files`);
          resolve(valid);
        } catch (error) {
          reject(new Error('JSON parse failed: ' + error.message));
        }
      });
    });
    req.on('error', error => reject(new Error('Network error: ' + error.message)));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
});
ipcMain.handle('check-md5', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    if (!filePath || !fs.existsSync(filePath)) reject(new Error('File does not exist'));
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
});
ipcMain.handle('download-file', async (event, { url, destination, expectedMd5 }) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    const req = http.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        if (expectedMd5) {
          const hash = crypto.createHash('md5');
          const readStream = fs.createReadStream(destination);
          readStream.on('data', d => hash.update(d));
          readStream.on('end', () => {
            const md5 = hash.digest('hex');
            if (md5 !== expectedMd5) {
              fs.unlinkSync(destination);
              reject(new Error('MD5 mismatch'));
            } else {
              resolve({ path: destination, md5 });
            }
          });
        } else {
          resolve({ path: destination });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
});
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select SWG Installation Directory' });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], title: 'Select SWGEmu.exe', filters: [{ name: 'Executable', extensions: ['exe'] }] });
  return result.canceled ? null : result.filePaths[0];
});

// Settings management
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
