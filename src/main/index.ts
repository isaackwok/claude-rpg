import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { storeApiKey, hasApiKey, clearApiKey } from './api-key'
import { handleSendMessage, cancelStream } from './chat'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 640,
    minHeight: 480,
    title: 'Claude RPG',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // API key management
  ipcMain.handle('apikey:set', async (_event, key: string) => {
    if (typeof key !== 'string' || !key.startsWith('sk-ant-')) return false
    try {
      storeApiKey(key)
      return true
    } catch (err) {
      console.error('[apikey:set] Failed to store API key:', err)
      return false
    }
  })

  ipcMain.handle('apikey:check', async () => {
    return hasApiKey()
  })

  ipcMain.handle('apikey:clear', async () => {
    clearApiKey()
  })

  // Chat
  ipcMain.on('chat:send-message', (event, data: unknown) => {
    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as Record<string, unknown>).agentId !== 'string' ||
      typeof (data as Record<string, unknown>).message !== 'string' ||
      typeof (data as Record<string, unknown>).locale !== 'string'
    ) {
      console.warn('[chat:send-message] Received malformed IPC payload:', data)
      return
    }
    const { agentId, message, locale } = data as {
      agentId: string
      message: string
      locale: string
    }
    handleSendMessage(agentId, message, locale, event.sender)
  })

  ipcMain.on('chat:cancel-stream', (_event, data: unknown) => {
    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as Record<string, unknown>).agentId !== 'string'
    ) {
      console.warn('[chat:cancel-stream] Received malformed IPC payload:', data)
      return
    }
    cancelStream((data as { agentId: string }).agentId)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
