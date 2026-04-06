// renderer.js - SWG Returns Launcher (Defensive + Error Logging)

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Helper to safely get element and log if missing
function getElement(id) {
  const el = document.getElementById(id);
  if (!el) console.error(`[Renderer] Element not found: #${id}`);
  return el;
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('[Renderer] DOM ready, initializing...');

  // DOM Elements
  const closeButton = getElement('close-button');
  const minimizeButton = getElement('minimize-button');
  const maximizeButton = getElement('maximize-button');
  const playButton = getElement('play-button');
  const quickScanButton = getElement('quick-scan');
  const fullScanButton = getElement('full-scan');
  const installLocationButton = getElement('install-location');
  const settingsButton = getElement('settings-button');
  const pauseButton = getElement('pause-button');
  const clearCacheButton = getElement('clear-cache');
  const viewLogsButton = getElement('view-logs');
  const donateButton = getElement('donate-button');
  const currentDirectoryElement = getElement('current-directory');
  const totalProgressBar = getElement('total-progress');
  const fileProgressBar = getElement('file-progress');
  const totalStatusElement = getElement('total-status');
  const statusElement = getElement('status');
  const downloadSpeedElement = getElement('download-speed');

  // New elements
  const serverStatusSpan = getElement('server-status');
  const refreshServerBtn = getElement('refresh-server');
  const gameVersionSpan = getElement('game-version');
  const checkUpdatesBtn = getElement('check-updates');
  const exeStatusSpan = getElement('exe-status');
  const testExeButton = getElement('test-exe-button');
  const viewLogViewerButton = getElement('view-log-viewer');

  // Modal elements
  const modalOverlay = getElement('modal-overlay');
  const settingsModal = getElement('settings-modal');
  const settingsCloseButton = getElement('settings-close');
  const scanModeSelect = getElement('scan-mode-select');
  const autoLaunchCheckbox = getElement('auto-launch-checkbox');
  const autoUpdateCheckbox = getElement('auto-update-checkbox');
  const minimizeToTrayCheckbox = getElement('minimize-to-tray-checkbox');
  const timeoutInput = getElement('timeout-input');
  const saveSettingsButton = getElement('save-settings');

  // Check critical elements exist
  if (!playButton) console.error('CRITICAL: play-button missing!');

  // State
  let isScanning = false;
  let isPaused = false;
  let installDir = null;
  let lastDownloadUpdate = Date.now();
  let lastDownloadBytes = 0;
  let currentTotalFiles = 0;
  let completedFiles = 0;

  function updateStatus(text) {
    if (statusElement) statusElement.textContent = text;
    console.log(`[Status] ${text}`);
  }

  function updateProgress(current, total, type = 'total') {
    if (!total || total <= 0) return;
    const percentage = (current / total) * 100;
    if (type === 'total' && totalProgressBar && totalStatusElement) {
      totalProgressBar.style.width = `${percentage}%`;
      totalStatusElement.textContent = `${current}/${total} files`;
    } else if (type !== 'total' && fileProgressBar) {
      fileProgressBar.style.width = `${percentage}%`;
    }
  }

  function updateDownloadSpeed(bytesSoFar) {
    if (!downloadSpeedElement) return;
    const now = Date.now();
    const timeDiff = (now - lastDownloadUpdate) / 1000;
    if (timeDiff >= 1) {
      const bytesDiff = bytesSoFar - lastDownloadBytes;
      const speed = bytesDiff / timeDiff;
      let speedText;
      if (speed >= 1048576) speedText = `${(speed / 1048576).toFixed(2)} MB/s`;
      else if (speed >= 1024) speedText = `${(speed / 1024).toFixed(2)} KB/s`;
      else speedText = `${speed.toFixed(0)} B/s`;
      downloadSpeedElement.textContent = `Download speed: ${speedText}`;
      lastDownloadUpdate = now;
      lastDownloadBytes = bytesSoFar;
    }
  }

  // Window controls
  async function refreshMaximizeIcon() {
    try {
      const isMax = await ipcRenderer.invoke('window:isMaximized');
      if (maximizeButton) maximizeButton.textContent = isMax ? '❐' : '▢';
    } catch (_) {}
  }
  if (closeButton) closeButton.addEventListener('click', async () => await ipcRenderer.invoke('window:close'));
  if (minimizeButton) minimizeButton.addEventListener('click', async () => await ipcRenderer.invoke('window:minimize'));
  if (maximizeButton) maximizeButton.addEventListener('click', async () => {
    await ipcRenderer.invoke('window:maximizeToggle');
    await refreshMaximizeIcon();
  });
  window.addEventListener('keydown', async (e) => {
    if (e.key === 'F11') { e.preventDefault(); await ipcRenderer.invoke('window:toggleFullscreen'); }
  });

  // Settings modal
  function openSettingsModal() { if (modalOverlay && settingsModal) { modalOverlay.style.display = 'block'; settingsModal.style.display = 'block'; loadSettings(); } }
  function closeSettingsModal() { if (modalOverlay && settingsModal) { modalOverlay.style.display = 'none'; settingsModal.style.display = 'none'; } }
  if (settingsButton) settingsButton.addEventListener('click', openSettingsModal);
  if (settingsCloseButton) settingsCloseButton.addEventListener('click', closeSettingsModal);
  if (modalOverlay) modalOverlay.addEventListener('click', closeSettingsModal);
  if (settingsModal) settingsModal.addEventListener('click', (e) => e.stopPropagation());

  async function loadSettings() {
    try {
      const scanMode = await ipcRenderer.invoke('get-scan-mode');
      if (scanModeSelect) scanModeSelect.value = scanMode || 'quick';
      const settings = await ipcRenderer.invoke('get-settings');
      if (settings) {
        if (autoLaunchCheckbox) autoLaunchCheckbox.checked = settings.autoLaunch || false;
        if (autoUpdateCheckbox) autoUpdateCheckbox.checked = settings.autoUpdate || false;
        if (minimizeToTrayCheckbox) minimizeToTrayCheckbox.checked = settings.minimizeToTray || false;
        if (timeoutInput) timeoutInput.value = settings.timeout || 30;
      }
    } catch (error) { console.error('Failed to load settings:', error); }
  }

  async function saveSettings() {
    try {
      const settings = {
        scanMode: scanModeSelect ? scanModeSelect.value : 'quick',
        autoLaunch: autoLaunchCheckbox ? autoLaunchCheckbox.checked : false,
        autoUpdate: autoUpdateCheckbox ? autoUpdateCheckbox.checked : false,
        minimizeToTray: minimizeToTrayCheckbox ? minimizeToTrayCheckbox.checked : false,
        timeout: timeoutInput ? parseInt(timeoutInput.value, 10) || 30 : 30
      };
      await ipcRenderer.invoke('save-settings', settings);
      updateStatus('Settings saved successfully');
      closeSettingsModal();
    } catch (error) { updateStatus(`Failed to save settings: ${error.message}`); }
  }
  if (saveSettingsButton) saveSettingsButton.addEventListener('click', saveSettings);

  // Install directory
  async function showInstallLocationDialog() {
    try {
      const selectedDir = await ipcRenderer.invoke('select-directory');
      if (selectedDir) {
        installDir = selectedDir;
        if (currentDirectoryElement) currentDirectoryElement.textContent = installDir;
        await ipcRenderer.invoke('save-install-dir', installDir);
        updateStatus(`Install directory set: ${installDir}`);
        checkExeStatus();
      }
    } catch (error) { updateStatus(`Error selecting directory: ${error.message}`); }
  }
  if (installLocationButton) installLocationButton.addEventListener('click', showInstallLocationDialog);

  // EXE test
  async function checkExeStatus() {
    if (!installDir) { if (exeStatusSpan) exeStatusSpan.textContent = 'No directory'; return; }
    const exePath = path.join(installDir, 'SWGEmu.exe');
    if (!fs.existsSync(exePath)) { if (exeStatusSpan) exeStatusSpan.textContent = 'Not found'; return; }
    const result = await ipcRenderer.invoke('test-exe', exePath);
    if (exeStatusSpan) exeStatusSpan.textContent = result.valid ? `Valid (${result.version || 'v?'})` : `Invalid: ${result.error}`;
  }
  if (testExeButton) {
    testExeButton.addEventListener('click', async () => {
      if (!installDir) { updateStatus('Set install directory first'); return; }
      const exePath = path.join(installDir, 'SWGEmu.exe');
      if (!fs.existsSync(exePath)) { updateStatus('SWGEmu.exe not found'); return; }
      updateStatus('Testing EXE...');
      const result = await ipcRenderer.invoke('test-exe', exePath);
      if (result.valid) updateStatus(`EXE valid, version: ${result.version || 'unknown'}`);
      else updateStatus(`EXE invalid: ${result.error}`);
      checkExeStatus();
    });
  }

  // Play button
  if (playButton) {
    playButton.addEventListener('click', async () => {
      if (!installDir) {
        updateStatus('Please set an install location first');
        await showInstallLocationDialog();
        if (!installDir) return;
      }
      let exePath = path.join(installDir, 'SWGEmu.exe');
      if (!fs.existsSync(exePath)) {
        updateStatus('SWGEmu.exe not found. Please locate manually.');
        const picked = await ipcRenderer.invoke('select-file');
        if (!picked) return;
        exePath = picked;
      }
      try {
        updateStatus(`Launching ${path.basename(exePath)}...`);
        const result = await ipcRenderer.invoke('launch-game', exePath);
        updateStatus(`${path.basename(exePath)} launched successfully (PID: ${result.pid})`);
      } catch (error) {
        updateStatus(`Launch failed: ${error.message}`);
        alert(`Failed to launch game:\n${error.message}\n\nCheck antivirus or file permissions.`);
      }
    });
  }

  // Patcher (multithread)
  async function startScan(mode) {
    if (isScanning) return updateStatus('Scan already in progress');
    isScanning = true;
    isPaused = false;
    if (pauseButton) pauseButton.textContent = 'PAUSE SCAN';
    if (downloadSpeedElement) downloadSpeedElement.textContent = '';
    lastDownloadUpdate = Date.now();
    lastDownloadBytes = 0;
    completedFiles = 0;

    try {
      updateStatus(`Starting ${mode} scan...`);
      await ipcRenderer.invoke('save-scan-mode', mode);
      updateStatus('Loading file list from server...');
      const files = await ipcRenderer.invoke('load-required-files');
      currentTotalFiles = files.length;

      let filesToDownload = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const localPath = path.join(installDir, file.name);
        let valid = false;
        if (fs.existsSync(localPath)) {
          try {
            const localMd5 = await ipcRenderer.invoke('check-md5', localPath);
            valid = (localMd5 === file.md5);
          } catch (_) { valid = false; }
        }
        if (!valid) filesToDownload.push(file);
        updateProgress(i + 1, files.length, 'total');
      }

      if (filesToDownload.length === 0) {
        updateStatus('All files are up to date!');
        isScanning = false;
        return;
      }

      updateStatus(`Downloading ${filesToDownload.length} files with parallel streams...`);
      await ipcRenderer.invoke('patcher-start', filesToDownload, installDir);

      const fileCompleteHandler = (event, { fileId, success, error }) => {
        completedFiles++;
        updateProgress(completedFiles, filesToDownload.length, 'total');
        if (!success) updateStatus(`Download error on ${fileId}: ${error}`);
        if (completedFiles === filesToDownload.length) {
          updateStatus('Patcher finished!');
          isScanning = false;
          ipcRenderer.removeListener('file-complete', fileCompleteHandler);
          const autoLaunch = autoLaunchCheckbox ? autoLaunchCheckbox.checked : false;
          if (autoLaunch && playButton) {
            updateStatus('Auto-launching game...');
            setTimeout(() => playButton.click(), 1000);
          }
        }
      };
      ipcRenderer.on('file-complete', fileCompleteHandler);
      ipcRenderer.on('file-progress', (event, { fileId, downloaded, total }) => {
        updateProgress(downloaded, total, 'file');
        updateDownloadSpeed(downloaded);
      });
    } catch (error) {
      updateStatus(`Scan error: ${error.message}`);
      isScanning = false;
    }
  }

  if (quickScanButton) quickScanButton.addEventListener('click', () => {
    if (!installDir) { updateStatus('Set install location first'); showInstallLocationDialog(); return; }
    startScan('quick');
  });
  if (fullScanButton) fullScanButton.addEventListener('click', () => {
    if (!installDir) { updateStatus('Set install location first'); showInstallLocationDialog(); return; }
    startScan('full');
  });
  if (pauseButton) {
    pauseButton.addEventListener('click', async () => {
      if (!isScanning) return;
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
  }

  // Other buttons
  if (clearCacheButton) clearCacheButton.addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke('clear-cache');
      updateStatus('Cache cleared');
    } catch (error) { updateStatus(`Failed to clear cache: ${error.message}`); }
  });
  if (viewLogsButton) viewLogsButton.addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke('open-logs');
      updateStatus('Opening logs...');
    } catch (error) { updateStatus(`Failed to open logs: ${error.message}`); }
  });
  if (viewLogViewerButton) viewLogViewerButton.addEventListener('click', async () => {
    await ipcRenderer.invoke('open-log-viewer');
  });
  if (donateButton) donateButton.addEventListener('click', () => {
    require('electron').shell.openExternal('https://www.paypal.me/Fitzpatrick251');
    updateStatus('Opening PayPal donation page...');
  });

  // Server status
  async function refreshServerStatus() {
    if (!serverStatusSpan) return;
    try {
      const status = await ipcRenderer.invoke('server-status');
      if (status.online) {
        serverStatusSpan.innerHTML = `ONLINE (${status.ping}ms via ${status.method})`;
        serverStatusSpan.className = 'server-online';
      } else {
        serverStatusSpan.innerHTML = 'OFFLINE';
        serverStatusSpan.className = 'server-offline';
      }
    } catch (err) {
      serverStatusSpan.innerHTML = 'Error';
      serverStatusSpan.className = 'server-offline';
    }
  }
  if (refreshServerBtn) refreshServerBtn.addEventListener('click', refreshServerStatus);
  setInterval(refreshServerStatus, 30000);

  // Game version
  async function checkGameVersion() {
    if (!gameVersionSpan) return;
    try {
      const versionInfo = await ipcRenderer.invoke('check-game-version');
      if (versionInfo.error) {
        gameVersionSpan.textContent = `Error: ${versionInfo.error}`;
        return;
      }
      const local = versionInfo.localVersion || 'none';
      const remote = versionInfo.remoteVersion;
      gameVersionSpan.innerHTML = `${local} / ${remote} ${versionInfo.needsUpdate ? '(update available)' : ''}`;
      if (versionInfo.needsUpdate) updateStatus('New game version available! Run a scan to update.');
    } catch (err) {
      gameVersionSpan.textContent = 'Check failed';
    }
  }
  if (checkUpdatesBtn) checkUpdatesBtn.addEventListener('click', checkGameVersion);
  setInterval(checkGameVersion, 600000);

  // Auto-detect
  async function autoDetectInstall() {
    const detected = await ipcRenderer.invoke('detect-install-dir');
    if (detected && !installDir) {
      installDir = detected;
      if (currentDirectoryElement) currentDirectoryElement.textContent = installDir;
      await ipcRenderer.invoke('save-install-dir', installDir);
      updateStatus(`Auto-detected install directory: ${installDir}`);
      checkExeStatus();
    }
  }

  // Launcher auto-updater events
  ipcRenderer.on('update-available', () => updateStatus('New launcher version available. Downloading...'));
  ipcRenderer.on('update-downloaded', () => {
    const restart = confirm('Update downloaded. Restart now to apply?');
    if (restart) ipcRenderer.invoke('restart-and-update');
  });

  // Initialization
  (async function init() {
    installDir = await ipcRenderer.invoke('get-install-dir');
    if (installDir) {
      if (currentDirectoryElement) currentDirectoryElement.textContent = installDir;
      updateStatus(`Install directory: ${installDir}`);
      checkExeStatus();
    } else {
      if (currentDirectoryElement) currentDirectoryElement.textContent = 'No install directory set';
      updateStatus('Please set an install location');
      autoDetectInstall();
    }
    await loadSettings();
    await refreshMaximizeIcon();
    refreshServerStatus();
    checkGameVersion();
    updateStatus('Ready');
    console.log('[Renderer] Initialization complete');
  })();
});
