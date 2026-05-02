// renderer.js - SWG Returns Launcher (single server status)
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const packageJson = require('./package.json');

function getElement(id) {
  const el = document.getElementById(id);
  if (!el) console.error(`[Renderer] Element not found: #${id}`);
  return el;
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('[Renderer] DOM ready, initializing...');

  // --- DOM elements ---
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
  const saveSettingsButton = getElement('save-settings');

  const launcherVersionSpan = getElement('launcher-version');
  const checkUpdatesNowButton = getElement('check-updates-now');

  // Game settings
  const resolutionSelect = getElement('resolution-select');
  const displayModeSelect = getElement('display-mode-select');
  const fpsLimitSelect = getElement('fps-limit-select');
  const shaderQualitySelect = getElement('shader-quality-select');
  const cacheSizeSelect = getElement('cache-size-select');
  const soundCheckbox = getElement('sound-checkbox');
  const hardwareCursorCheckbox = getElement('hardware-cursor-checkbox');
  const skipIntroCheckbox = getElement('skip-intro-checkbox');
  const textureBakingCheckbox = getElement('texture-baking-checkbox');
  const dot3TerrainCheckbox = getElement('dot3-terrain-checkbox');
  const rendererSelect = getElement('renderer-select');
  const memorySlider = getElement('memory-slider');
  const memoryValue = getElement('memory-value');
  const cameraZoomSlider = getElement('camera-zoom-slider');
  const cameraZoomValue = getElement('camera-zoom-value');
  const allowMultipleInstancesCheckbox = getElement('allow-multiple-instances-checkbox');
  const concurrentDownloadsSelect = getElement('concurrent-downloads-select');
  const speedLimitInput = getElement('speed-limit-input');
  const additionalArgsInput = getElement('additional-args-input');
  const safeModeCheckbox = getElement('safe-mode-checkbox');
  const shareUsageCheckbox = getElement('share-usage-checkbox');

  // Legacy hidden elements
  const scanModeSelect = getElement('scan-mode-select');
  const autoLaunchCheckbox = getElement('auto-launch-checkbox');
  const autoUpdateCheckbox = getElement('auto-update-checkbox');
  const minimizeToTrayCheckbox = getElement('minimize-to-tray-checkbox');
  const timeoutInput = getElement('timeout-input');
  const zoomSlider = getElement('zoom-slider');
  const zoomValue = getElement('zoom-value');

  let isScanning = false;
  let isPaused = false;
  let installDir = null;
  let lastDownloadUpdate = Date.now();
  let lastDownloadBytes = 0;
  let completedFiles = 0;

  if (launcherVersionSpan) {
    launcherVersionSpan.textContent = packageJson.version || 'v0.1.17';
  }

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
      settingsModal.style.display = 'flex';
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

  if (checkUpdatesNowButton) {
    checkUpdatesNowButton.addEventListener('click', async () => {
      updateStatus('Checking for launcher updates...');
      await ipcRenderer.invoke('check-for-updates-manual');
    });
  }

  async function loadSettings() {
    try {
      const settings = await ipcRenderer.invoke('get-settings');
      if (!settings) return;

      if (resolutionSelect) resolutionSelect.value = settings.resolution || '1920x1080';
      if (displayModeSelect) displayModeSelect.value = settings.displayMode || 'fullscreen';
      if (fpsLimitSelect) fpsLimitSelect.value = settings.fpsLimit || '60';
      if (shaderQualitySelect) shaderQualitySelect.value = settings.shaderQuality || 'high';
      if (cacheSizeSelect) cacheSizeSelect.value = settings.cacheSize || 'large';
      if (soundCheckbox) soundCheckbox.checked = settings.soundEnabled !== false;
      if (hardwareCursorCheckbox) hardwareCursorCheckbox.checked = settings.hardwareCursor || false;
      if (skipIntroCheckbox) skipIntroCheckbox.checked = settings.skipIntro || false;
      if (textureBakingCheckbox) textureBakingCheckbox.checked = settings.textureBaking || false;
      if (dot3TerrainCheckbox) dot3TerrainCheckbox.checked = settings.dot3Terrain || false;
      if (rendererSelect) rendererSelect.value = settings.renderer || 'directx';
      if (memorySlider && memoryValue) {
        const mem = settings.memoryMB || 4096;
        memorySlider.value = mem;
        memoryValue.textContent = `${mem} MB`;
      }
      if (cameraZoomSlider && cameraZoomValue) {
        const zoom = settings.maxCameraZoom || 10;
        cameraZoomSlider.value = zoom;
        cameraZoomValue.textContent = zoom;
      }
      if (allowMultipleInstancesCheckbox) allowMultipleInstancesCheckbox.checked = settings.allowMultipleInstances || false;
      if (concurrentDownloadsSelect) concurrentDownloadsSelect.value = settings.concurrentDownloads || 4;
      if (speedLimitInput) speedLimitInput.value = settings.speedLimitMBps || 0;
      if (additionalArgsInput) additionalArgsInput.value = settings.additionalArgs || '';
      if (safeModeCheckbox) safeModeCheckbox.checked = settings.safeMode || false;
      if (shareUsageCheckbox) shareUsageCheckbox.checked = settings.shareUsage || false;

      if (scanModeSelect) scanModeSelect.value = settings.scanMode || 'quick';
      if (autoLaunchCheckbox) autoLaunchCheckbox.checked = settings.autoLaunch || false;
      if (autoUpdateCheckbox) autoUpdateCheckbox.checked = settings.autoUpdate || false;
      if (minimizeToTrayCheckbox) minimizeToTrayCheckbox.checked = settings.minimizeToTray || false;
      if (timeoutInput) timeoutInput.value = settings.timeout || 30;
      if (zoomSlider && zoomValue) {
        const savedZoom = settings.zoom || 100;
        zoomSlider.value = savedZoom;
        zoomValue.textContent = `${savedZoom}%`;
        await ipcRenderer.invoke('set-zoom', savedZoom);
      }
    } catch (error) { console.error('Failed to load settings:', error); }
  }

  async function saveSettings() {
    try {
      const settings = {
        resolution: resolutionSelect ? resolutionSelect.value : '1920x1080',
        displayMode: displayModeSelect ? displayModeSelect.value : 'fullscreen',
        fpsLimit: fpsLimitSelect ? parseInt(fpsLimitSelect.value, 10) : 60,
        shaderQuality: shaderQualitySelect ? shaderQualitySelect.value : 'high',
        cacheSize: cacheSizeSelect ? cacheSizeSelect.value : 'large',
        soundEnabled: soundCheckbox ? soundCheckbox.checked : true,
        hardwareCursor: hardwareCursorCheckbox ? hardwareCursorCheckbox.checked : false,
        skipIntro: skipIntroCheckbox ? skipIntroCheckbox.checked : false,
        textureBaking: textureBakingCheckbox ? textureBakingCheckbox.checked : false,
        dot3Terrain: dot3TerrainCheckbox ? dot3TerrainCheckbox.checked : false,
        renderer: rendererSelect ? rendererSelect.value : 'directx',
        memoryMB: memorySlider ? parseInt(memorySlider.value, 10) : 4096,
        maxCameraZoom: cameraZoomSlider ? parseInt(cameraZoomSlider.value, 10) : 10,
        allowMultipleInstances: allowMultipleInstancesCheckbox ? allowMultipleInstancesCheckbox.checked : false,
        concurrentDownloads: concurrentDownloadsSelect ? parseInt(concurrentDownloadsSelect.value, 10) : 4,
        speedLimitMBps: speedLimitInput ? parseFloat(speedLimitInput.value) || 0 : 0,
        additionalArgs: additionalArgsInput ? additionalArgsInput.value : '',
        safeMode: safeModeCheckbox ? safeModeCheckbox.checked : false,
        shareUsage: shareUsageCheckbox ? shareUsageCheckbox.checked : false,
        scanMode: scanModeSelect ? scanModeSelect.value : 'quick',
        autoLaunch: autoLaunchCheckbox ? autoLaunchCheckbox.checked : false,
        autoUpdate: autoUpdateCheckbox ? autoUpdateCheckbox.checked : false,
        minimizeToTray: minimizeToTrayCheckbox ? minimizeToTrayCheckbox.checked : false,
        timeout: timeoutInput ? parseInt(timeoutInput.value, 10) || 30 : 30,
        zoom: zoomSlider ? parseInt(zoomSlider.value, 10) : 100
      };
      await ipcRenderer.invoke('save-settings', settings);
      if (installDir) {
        await ipcRenderer.invoke('write-game-options', installDir, settings);
      }
      updateStatus('Settings saved successfully');
      closeSettingsModal();
    } catch (error) {
      updateStatus(`Failed to save settings: ${error.message}`);
    }
  }
  if (saveSettingsButton) saveSettingsButton.addEventListener('click', saveSettings);

  if (memorySlider && memoryValue) {
    memorySlider.addEventListener('input', (e) => {
      memoryValue.textContent = `${e.target.value} MB`;
    });
  }
  if (cameraZoomSlider && cameraZoomValue) {
    cameraZoomSlider.addEventListener('input', (e) => {
      cameraZoomValue.textContent = e.target.value;
    });
  }
  if (zoomSlider && zoomValue) {
    zoomSlider.addEventListener('input', async (e) => {
      const val = parseInt(e.target.value, 10);
      zoomValue.textContent = `${val}%`;
      await ipcRenderer.invoke('set-zoom', val);
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
        const desiredFps = settings.fpsLimit || 60;
        updateStatus(`Setting max FPS to ${desiredFps}...`);
        const patchResult = await ipcRenderer.invoke('patch-game-fps', exePath, desiredFps);
        if (!patchResult.success) {
          updateStatus(`Warning: Could not patch FPS: ${patchResult.error}`);
        } else {
          updateStatus(`FPS patched to ${desiredFps}`);
        }
        await ipcRenderer.invoke('write-game-options', installDir, settings);
        const result = await ipcRenderer.invoke('launch-game', { exePath, settings });
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
    }
  }

  ipcRenderer.on('update-available', () => updateStatus('New launcher version available. Downloading...'));
  ipcRenderer.on('update-downloaded', () => {
    const restart = confirm('Update downloaded. Restart now to apply?');
    if (restart) ipcRenderer.invoke('restart-and-update');
  });
  ipcRenderer.on('update-not-available', () => updateStatus('Launcher is up to date.'));
  ipcRenderer.on('update-error', (event, err) => updateStatus(`Update check failed: ${err}`));

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
