// ---------- New DOM Elements (add to HTML) ----------
// Add these elements to your index.html:
// <div id="server-status">Server: Checking...</div>
// <button id="test-exe-button">Test EXE</button>
// <button id="view-log-viewer">Open Log Viewer</button>
// <div id="game-version">Game version: ...</div>
// <button id="check-updates">Check Game Updates</button>

const serverStatusDiv = document.getElementById('server-status');
const testExeButton = document.getElementById('test-exe-button');
const logViewerButton = document.getElementById('view-log-viewer');
const gameVersionDiv = document.getElementById('game-version');
const checkGameUpdatesButton = document.getElementById('check-updates');

// Server status refresh
async function refreshServerStatus() {
  try {
    const status = await ipcRenderer.invoke('server-status');
    if (status.online) {
      serverStatusDiv.textContent = `Server: ONLINE (${status.ping}ms via ${status.method})`;
      serverStatusDiv.style.color = '#4caf50';
    } else {
      serverStatusDiv.textContent = `Server: OFFLINE`;
      serverStatusDiv.style.color = '#f44336';
    }
  } catch (err) {
    serverStatusDiv.textContent = 'Server: Error';
  }
}
refreshServerStatus();
setInterval(refreshServerStatus, 30000); // every 30 sec

// Test EXE validation
testExeButton.addEventListener('click', async () => {
  if (!installDir) {
    updateStatus('Set install directory first');
    return;
  }
  const exePath = path.join(installDir, 'SWGEmu.exe');
  if (!fs.existsSync(exePath)) {
    updateStatus('SWGEmu.exe not found in install directory');
    return;
  }
  updateStatus('Testing EXE...');
  const result = await ipcRenderer.invoke('test-exe', exePath);
  if (result.valid) {
    updateStatus(`EXE is valid. Version: ${result.version || 'unknown'}`);
  } else {
    updateStatus(`EXE invalid: ${result.error}`);
  }
});

// Log viewer
logViewerButton.addEventListener('click', async () => {
  await ipcRenderer.invoke('open-log-viewer');
});

// Game version checker
async function checkGameVersion() {
  try {
    const versionInfo = await ipcRenderer.invoke('check-game-version');
    if (versionInfo.error) {
      gameVersionDiv.textContent = `Version check failed: ${versionInfo.error}`;
      return;
    }
    gameVersionDiv.textContent = `Game version: ${versionInfo.localVersion || 'none'} | Latest: ${versionInfo.remoteVersion}`;
    if (versionInfo.needsUpdate) {
      updateStatus('New game version available! Run a scan to update.');
      // Optionally auto-start patcher
    }
  } catch (err) {
    gameVersionDiv.textContent = 'Version check error';
  }
}
checkGameVersion();
setInterval(checkGameVersion, 600000); // every 10 min

checkGameUpdatesButton.addEventListener('click', checkGameVersion);

// ----- Patcher with pause/resume and parallel downloads -----
// Replace your existing startScan function with this enhanced version
async function startScan(mode) {
  if (isScanning) return updateStatus('Scan already in progress');
  isScanning = true;
  isPaused = false;
  pauseButton.textContent = 'PAUSE SCAN';
  downloadSpeedElement.textContent = '';
  lastDownloadUpdate = Date.now();
  lastDownloadBytes = 0;

  try {
    updateStatus(`Starting ${mode} scan...`);
    await ipcRenderer.invoke('save-scan-mode', mode);
    updateStatus('Loading file list from server...');
    const files = await ipcRenderer.invoke('load-required-files');

    // First, verify existing files (fast)
    let filesToDownload = [];
    for (const file of files) {
      const localPath = path.join(installDir, file.name);
      let valid = false;
      if (fs.existsSync(localPath)) {
        try {
          const localMd5 = await ipcRenderer.invoke('check-md5', localPath);
          valid = (localMd5 === file.md5);
        } catch (_) { valid = false; }
      }
      if (!valid) filesToDownload.push(file);
    }

    if (filesToDownload.length === 0) {
      updateStatus('All files are up to date!');
      isScanning = false;
      return;
    }

    updateStatus(`Downloading ${filesToDownload.length} files with ${MAX_CONCURRENT} parallel streams...`);
    updateDiscordStatus('downloading', 'Downloading game files');

    // Start patcher
    await ipcRenderer.invoke('patcher-start', filesToDownload, installDir);

    // Listen for file completion
    ipcRenderer.once('file-complete', (event, { fileId, success, error }) => {
      if (!success) updateStatus(`Download error: ${error}`);
    });

    // You may want to track overall progress with a counter
    let completed = 0;
    const fileCompleteHandler = () => {
      completed++;
      updateProgress(completed, filesToDownload.length, 'total');
      if (completed === filesToDownload.length) {
        updateStatus('Patcher finished!');
        updateDiscordStatus('ready');
        ipcRenderer.removeListener('file-complete', fileCompleteHandler);
      }
    };
    ipcRenderer.on('file-complete', fileCompleteHandler);

  } catch (error) {
    updateStatus(`Scan error: ${error.message}`);
    log(`Scan error: ${error.message}`, 'ERROR');
  } finally {
    isScanning = false;
    downloadSpeedElement.textContent = '';
  }
}

// Modify pause button to call patcher pause/resume
pauseButton.addEventListener('click', async () => {
  isPaused = !isPaused;
  pauseButton.textContent = isPaused ? 'RESUME SCAN' : 'PAUSE SCAN';
  if (isPaused) {
    await ipcRenderer.invoke('patcher-pause');
    updateStatus('Scan paused');
  } else {
    await ipcRenderer.invoke('patcher-resume');
    updateStatus('Scan resumed');
  }
});

// Auto-detect install directory on init
async function autoDetectInstall() {
  const detected = await ipcRenderer.invoke('detect-install-dir'); // you need to add this handler in main.js
  if (detected && !installDir) {
    installDir = detected;
    currentDirectoryElement.textContent = installDir;
    await ipcRenderer.invoke('save-install-dir', installDir);
    updateStatus(`Auto-detected install directory: ${installDir}`);
  }
}
autoDetectInstall();

// Launcher auto-updater UI
ipcRenderer.on('update-available', () => {
  updateStatus('A new launcher version is available. Downloading...');
});
ipcRenderer.on('update-downloaded', () => {
  const restart = confirm('Update downloaded. Restart now to apply?');
  if (restart) ipcRenderer.invoke('restart-and-update');
});
