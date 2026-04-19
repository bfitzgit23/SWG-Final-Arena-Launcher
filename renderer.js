// renderer.js - SWG Returns Launcher (Carbonite / SWGEmu.exe)
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

function getElement(id) {
  const el = document.getElementById(id);
  if (!el) console.error(`[Renderer] Element not found: #${id}`);
  return el;
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('[Renderer] DOM ready, initializing...');

  const closeButton = getElement('close-button');
  const minimizeButton = getElement('minimize-button');
  const maximizeButton = getElement('maximize-button');
  const playButton = getElement('play-button');
  const quickScanButton = getElement('quick-scan');
  const fullScanButton = getElement('full-scan');
  const repairButton = getElement('repair-button');
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

  const serverStatusSpan = getElement('server-status');
  const refreshServerBtn = getElement('refresh-server');
  const gameVersionSpan = getElement('game-version');
  const checkUpdatesBtn = getElement('check-updates');
  const exeStatusSpan = getElement('exe-status');
  const testExeButton = getElement('test-exe-button');
  const viewLogViewerButton = getElement('view-log-viewer');

  const modalOverlay = getElement('modal-overlay');
  const settingsModal = getElement('settings-modal');
  const settingsCloseButton = getElement('settings-close');
  const scanModeSelect = getElement('scan-mode-select');
  const autoLaunchCheckbox = getElement('auto-launch-checkbox');
  const autoUpdateCheckbox = getElement('auto-update-checkbox');
  const minimizeToTrayCheckbox = getElement('minimize-to-tray-checkbox');
  const timeoutInput = getElement('timeout-input');
  const saveSettingsButton = getElement('save-settings');
  const zoomSlider = getElement('zoom-slider');
  const zoomValue = getElement('zoom-value');
  const maxFpsSlider = getElement('max-fps-slider');
  const maxFpsValue = getElement('max-fps-value');
  const cameraZoomSlider = getElement('camera-zoom-slider');
  const cameraZoomValue = getElement('camera-zoom-value');

  let isScanning = false;
  let isPaused = false;
  let installDir = null;
  let lastDownloadUpdate = Date.now();
  let lastDownloadBytes = 0;
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

  async function refreshMaximizeIcon() {
    try {
      const isMax = await ipcRenderer.invoke('window:isMaximized');
      if (maximizeButton) maximizeButton.textContent = isMax ? '❐' : '▢';
    } catch (_) {}
  }
  if (closeButton) closeButton.addEventListener('click', () => ipcRenderer.invoke('window:close'));
  if (minimizeButton) minimizeButton.addEventListener('click', () => ipcRenderer.invoke('window:minimize'));
  if (maximizeButton) maximizeButton.addEventListener('click', async () => {
    await ipcRenderer.invoke('window:maximizeToggle');
    await refreshMaximizeIcon();
  });
  window.addEventListener('keydown', async (e) => {
    if (e.key === 'F11') { e.preventDefault(); await ipcRenderer.invoke('window:toggleFullscreen'); }
  });

  function openSettingsModal() {
    if (modalOverlay && settingsModal) {
      modalOverlay.style.display = 'block';
      settingsModal.style.display = 'block';
      loadSettings();
    }
  }
  function closeSettingsModal() {
    if (modalOverlay && settingsModal) {
      modalOverlay.style.display = 'none';
      settingsModal.style.display = 'none';
    }
  }
  if (settingsButton) settingsButton.addEventListener('click', openSettingsModal);
  if (settingsCloseButton) settingsCloseButton.addEventListener('click', closeSettingsModal);
  if (modalOverlay) modalOverlay.addEventListener('click', closeSettingsModal);
  if (settingsModal) settingsModal.addEventListener('click', (e) => e.stopPropagation());

  async function loadGameConfig() {
    if (!installDir) return;
    try {
      const gameConfig = await ipcRenderer.invoke('get-game-config', installDir);
      if (gameConfig) {
        if (cameraZoomSlider && cameraZoomValue) {
          cameraZoomSlider.value = gameConfig.maxCameraZoom || 10;
          cameraZoomValue.textContent = cameraZoomSlider.value;
        }
      }
      const settings = await ipcRenderer.invoke('get-settings');
      if (maxFpsSlider && maxFpsValue) {
        const savedFps = settings.maxFps || 60;
        maxFpsSlider.value = savedFps;
        maxFpsValue.textContent = `${savedFps} FPS`;
      }
    } catch (err) { console.warn('Could not load game config:', err); }
  }

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
        if (zoomSlider && zoomValue) {
          const savedZoom = settings.zoom || 100;
          zoomSlider.value = savedZoom;
          zoomValue.textContent = `${savedZoom}%`;
        }
        if (maxFpsSlider && maxFpsValue) {
          const savedFps = settings.maxFps || 60;
          maxFpsSlider.value = savedFps;
          maxFpsValue.textContent = `${savedFps} FPS`;
        }
      }
      await loadGameConfig();
    } catch (error) { console.error('Failed to load settings:', error); }
  }

  async function saveSettings() {
    try {
      const settings = {
        scanMode: scanModeSelect ? scanModeSelect.value : 'quick',
        autoLaunch: autoLaunchCheckbox ? autoLaunchCheckbox.checked : false,
        autoUpdate: autoUpdateCheckbox ? autoUpdateCheckbox.checked : false,
        minimizeToTray: minimizeToTrayCheckbox ? minimizeToTrayCheckbox.checked : false,
        timeout: timeoutInput ? parseInt(timeoutInput.value, 10) || 30 : 30,
        zoom: zoomSlider ? parseInt(zoomSlider.value, 10) : 100,
        maxFps: maxFpsSlider ? parseInt(maxFpsSlider.value, 10) : 60
      };
      await ipcRenderer.invoke('save-settings', settings);
      
      if (installDir) {
        const gameConfig = {
          maxCameraZoom: cameraZoomSlider ? parseInt(cameraZoomSlider.value, 10) : 10
        };
        await ipcRenderer.invoke('save-game-config', installDir, gameConfig);
      }
      
      updateStatus('Settings saved successfully');
      closeSettingsModal();
    } catch (error) { updateStatus(`Failed to save settings: ${error.message}`); }
  }
  if (saveSettingsButton) saveSettingsButton.addEventListener('click', saveSettings);

  if (zoomSlider && zoomValue) {
    zoomSlider.addEventListener('input', async (e) => {
      const val = parseInt(e.target.value, 10);
      zoomValue.textContent = `${val}%`;
      await ipcRenderer.invoke('set-zoom', val);
    });
  }
  if (maxFpsSlider && maxFpsValue) {
    maxFpsSlider.addEventListener('input', (e) => {
      maxFpsValue.textContent = `${e.target.value} FPS`;
    });
  }
  if (cameraZoomSlider && cameraZoomValue) {
    cameraZoomSlider.addEventListener('input', (e) => {
      cameraZoomValue.textContent = e.target.value;
    });
  }

  async function showInstallLocationDialog() {
    try {
      const selectedDir = await ipcRenderer.invoke('select-directory');
      if (selectedDir) {
        installDir = selectedDir;
        if (currentDirectoryElement) currentDirectoryElement.textContent = installDir;
        await ipcRenderer.invoke('save-install-dir', installDir);
        updateStatus(`Install directory set: ${installDir}`);
        checkExeStatus();
        await loadGameConfig();
      }
    } catch (error) { updateStatus(`Error selecting directory: ${error.message}`); }
  }
  if (installLocationButton) installLocationButton.addEventListener('click', showInstallLocationDialog);

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
        installDir = path.dirname(exePath);
        await ipcRenderer.invoke('save-install-dir', installDir);
        if (currentDirectoryElement) currentDirectoryElement.textContent = installDir;
      }
      
      try {
        const settings = await ipcRenderer.invoke('get-settings');
        const desiredFps = settings.maxFps || 60;
        updateStatus(`Setting max FPS to ${desiredFps}...`);
        const patchResult = await ipcRenderer.invoke('patch-game-fps', exePath, desiredFps);
        if (!patchResult.success) {
          updateStatus(`Warning: Could not patch FPS: ${patchResult.error}`);
        } else {
          updateStatus(`FPS patched to ${desiredFps}`);
        }
        
        const serverInfo = await ipcRenderer.invoke('get-server-info');
        const gameConfig = await ipcRenderer.invoke('get-game-config', installDir);
        const zoom = gameConfig.maxCameraZoom || 10;
        const loginCfg = `[ClientGame]\r\nloginServerAddress0=${serverInfo.ip}\r\nloginServerPort0=${serverInfo.port}\r\nfreeChaseCameraMaximumZoom=${zoom}\r\n0fd345d9 = true\r\n`;
        const loginCfgPath = path.join(installDir, 'swgemu_login.cfg');
        fs.writeFileSync(loginCfgPath, loginCfg, 'utf8');
        updateStatus('Login configuration written');
        
        const ram = settings.ram || 750;
        const result = await ipcRenderer.invoke('launch-game', { exePath, ram });
        updateStatus(`SWGEmu.exe launched successfully (PID: ${result.pid})`);
      } catch (error) {
        updateStatus(`Launch failed: ${error.message}`);
        alert(`Failed to launch game:\n${error.message}\n\nCheck antivirus or file permissions.`);
      }
    });
  }

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
      if (mode !== 'repair') await ipcRenderer.invoke('save-scan-mode', mode);
      updateStatus('Loading file list from server...');
      const files = await ipcRenderer.invoke('load-required-files');
      const totalFiles = files.length;

      let filesToDownload = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const localPath = path.join(installDir, file.name);
        let valid = false;
        if (fs.existsSync(localPath)) {
          try {
            const localMd5 = await ipcRenderer.invoke('check-md5', localPath);
            valid = (localMd5 === file.md5);
            if (!valid) console.warn(`[MD5 Mismatch] ${file.name}: local=${localMd5}, expected=${file.md5}`);
          } catch (err) { valid = false; }
        }
        if (mode === 'repair' && !valid) filesToDownload.push(file);
        else if (mode !== 'repair' && !valid) filesToDownload.push(file);
        updateProgress(i + 1, totalFiles, 'total');
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
          if (autoLaunchCheckbox && autoLaunchCheckbox.checked && playButton && mode !== 'repair') {
            updateStatus('Auto-launching game...');
            setTimeout(() => playButton.click(), 1000);
          }
        }
      };
      ipcRenderer.on('file-complete', fileCompleteHandler);
      ipcRenderer.on('file-progress', (event, { downloaded, total }) => {
        updateProgress(downloaded, total, 'file');
        updateDownloadSpeed(downloaded);
      });
    } catch (error) {
      updateStatus(`Scan error: ${error.message}`);
      console.error('Scan error:', error);
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
  if (repairButton) repairButton.addEventListener('click', () => {
    if (!installDir) { updateStatus('Set install location first'); showInstallLocationDialog(); return; }
    startScan('repair');
  });
  if (pauseButton) {
    pauseButton.addEventListener('click', async () => {
      if (!isScanning) return;
      isPaused = !isPaused;
      pauseButton.textContent = isPaused ? 'RESUME SCAN' : 'PAUSE SCAN';
      if (isPaused) await ipcRenderer.invoke('patcher-pause');
      else await ipcRenderer.invoke('patcher-resume');
      updateStatus(isPaused ? 'Scan paused' : 'Scan resumed');
    });
  }

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
      console.error('Game version check error:', err);
    }
  }
  if (checkUpdatesBtn) checkUpdatesBtn.addEventListener('click', checkGameVersion);
  setInterval(checkGameVersion, 600000);

  async function autoDetectInstall() {
    const detected = await ipcRenderer.invoke('detect-install-dir');
    if (detected && !installDir) {
      installDir = detected;
      if (currentDirectoryElement) currentDirectoryElement.textContent = installDir;
      await ipcRenderer.invoke('save-install-dir', installDir);
      updateStatus(`Auto-detected install directory: ${installDir}`);
      checkExeStatus();
      await loadGameConfig();
    }
  }

  ipcRenderer.on('update-available', () => updateStatus('New launcher version available. Downloading...'));
  ipcRenderer.on('update-downloaded', () => {
    const restart = confirm('Update downloaded. Restart now to apply?');
    if (restart) ipcRenderer.invoke('restart-and-update');
  });

  (async function init() {
    installDir = await ipcRenderer.invoke('get-install-dir');
    if (installDir) {
      if (currentDirectoryElement) currentDirectoryElement.textContent = installDir;
      updateStatus(`Install directory: ${installDir}`);
      checkExeStatus();
      await loadGameConfig();
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
