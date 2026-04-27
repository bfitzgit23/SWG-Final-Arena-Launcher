// main.js - SWG Returns Launcher (PreCU) with manual update check
// ... (everything same as previous final main.js up to autoUpdater setup)
// Then after the existing autoUpdater event handlers, add:

autoUpdater.on('update-not-available', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-not-available');
  }
});
autoUpdater.on('error', (err) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-error', err.message);
  }
});

// Then add the IPC handler anywhere after app ready:
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
