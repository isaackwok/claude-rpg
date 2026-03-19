import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { storeApiKey, hasApiKey, clearApiKey } from './api-key'
import {
  handleSendMessage,
  cancelStream,
  handleToolApproved,
  handleToolDenied,
  handlePathApproved,
  handlePathDenied,
  setChatDependencies
} from './chat'
import {
  getApprovedFolders,
  addApprovedFolder,
  removeApprovedFolder,
  selectAndAddFolder,
  isPathApproved,
  initFolderManager
} from './folder-manager'
import { getDatabase, closeDatabase } from './db/database'
import { SqlitePlayerRepository } from './db/player-repository'
import { SqliteXPRepository } from './db/xp-repository'
import { SqliteConversationPersistence } from './db/conversation-persistence'
import { SqliteFolderRepository } from './db/folder-repository'
import { ProgressionEngine } from './progression-engine'
import { SqliteQuestRepository } from './db/quest-repository'
import { QuestEngine } from './quest-engine'
import { SqliteAchievementRepository } from './db/achievement-repository'
import { SqliteCosmeticRepository } from './db/cosmetic-repository'
import { AchievementEngine } from './achievement-engine'
import { COSMETIC_DEFINITIONS } from './cosmetic-definitions'
import type { PlayerCosmetic } from '../shared/cosmetic-types'

function createWindow(): void {
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

  // Initialize SQLite database and repositories
  const db = getDatabase()
  const playerRepo = new SqlitePlayerRepository(db)
  const xpRepo = new SqliteXPRepository(db)
  const conversationPersistence = new SqliteConversationPersistence(db)
  const folderRepo = new SqliteFolderRepository(db)
  const questRepo = new SqliteQuestRepository(db)
  const achievementRepo = new SqliteAchievementRepository(db)
  const cosmeticRepo = new SqliteCosmeticRepository(db)
  const progressionEngine = new ProgressionEngine(xpRepo, playerRepo, 'player-1')
  const questEngine = new QuestEngine(questRepo)
  const achievementEngine = new AchievementEngine(achievementRepo, progressionEngine)

  // Ensure player exists
  playerRepo.getOrCreate('player-1')

  // Seed starter quests for the player (non-fatal — app works without quests)
  try {
    questEngine.seedStarterQuests('player-1')
  } catch (err) {
    console.error('[init] Failed to seed starter quests:', err)
  }

  // Wire dependencies into chat and folder manager
  setChatDependencies(
    progressionEngine,
    questEngine,
    conversationPersistence,
    achievementEngine,
    achievementRepo,
    cosmeticRepo
  )
  initFolderManager(folderRepo)

  // Progression IPC handlers — let errors propagate so the renderer can handle them
  ipcMain.handle('progression:get-player', () => {
    return progressionEngine.getPlayerState()
  })
  ipcMain.handle('progression:get-skills', () => {
    return progressionEngine.getPlayerState().skills
  })
  // Quest IPC handlers
  ipcMain.handle('quests:get-all', () => {
    return questEngine.getPlayerQuests('player-1')
  })
  ipcMain.handle('quests:get-board-suggestion', () => {
    return questEngine.getQuestBoardSuggestion('player-1')
  })

  // Achievement IPC handlers
  ipcMain.handle('achievements:get-all', () => {
    return achievementEngine.getAchievements('player-1')
  })

  // Cosmetic IPC handlers
  ipcMain.handle('cosmetics:get-all', () => {
    const unlocked = cosmeticRepo.getAll('player-1')
    const unlockedMap = new Map(unlocked.map((u) => [u.cosmeticDefId, u]))
    const result: PlayerCosmetic[] = COSMETIC_DEFINITIONS.map((def) => {
      const entry = unlockedMap.get(def.id)
      return {
        cosmeticDefId: def.id,
        unlocked: !!entry,
        unlockedAt: entry?.unlockedAt,
        equipped: entry?.equipped ?? false,
        definition: def
      }
    })
    return result
  })

  ipcMain.handle('cosmetics:equip', (_e, cosmeticDefId: string) => {
    cosmeticRepo.equip('player-1', cosmeticDefId)
    const unlocked = cosmeticRepo.getAll('player-1')
    const unlockedMap = new Map(unlocked.map((u) => [u.cosmeticDefId, u]))
    const updated: PlayerCosmetic[] = COSMETIC_DEFINITIONS.map((def) => {
      const entry = unlockedMap.get(def.id)
      return {
        cosmeticDefId: def.id,
        unlocked: !!entry,
        unlockedAt: entry?.unlockedAt,
        equipped: entry?.equipped ?? false,
        definition: def
      }
    })
    BrowserWindow.getAllWindows()[0]?.webContents.send('cosmetics:updated', updated)
  })

  ipcMain.handle('cosmetics:unequip', (_e, cosmeticDefId: string) => {
    cosmeticRepo.unequip('player-1', cosmeticDefId)
    const unlocked = cosmeticRepo.getAll('player-1')
    const unlockedMap = new Map(unlocked.map((u) => [u.cosmeticDefId, u]))
    const updated: PlayerCosmetic[] = COSMETIC_DEFINITIONS.map((def) => {
      const entry = unlockedMap.get(def.id)
      return {
        cosmeticDefId: def.id,
        unlocked: !!entry,
        unlockedAt: entry?.unlockedAt,
        equipped: entry?.equipped ?? false,
        definition: def
      }
    })
    BrowserWindow.getAllWindows()[0]?.webContents.send('cosmetics:updated', updated)
  })

  ipcMain.handle('cosmetics:place', (_e, cosmeticDefId: string, tileX: number, tileY: number) => {
    cosmeticRepo.placeDecoration('player-1', cosmeticDefId, tileX, tileY)
  })

  ipcMain.handle('cosmetics:remove', (_e, cosmeticDefId: string) => {
    cosmeticRepo.removeDecoration('player-1', cosmeticDefId)
  })

  ipcMain.handle('cosmetics:get-placements', () => {
    return cosmeticRepo.getPlacements('player-1')
  })

  // Zone visit tracking
  ipcMain.handle('zone:record-visit', (_e, zoneId: string) => {
    achievementRepo.recordZoneVisit('player-1', zoneId)
    const result = achievementEngine.checkExploration('player-1')
    const win = BrowserWindow.getAllWindows()[0]
    if (result.unlocked.length > 0) {
      win?.webContents.send('achievements:unlocked', result.unlocked)
      for (const achievement of result.unlocked) {
        if (achievement.cosmeticReward) {
          cosmeticRepo.unlock('player-1', achievement.cosmeticReward)
          win?.webContents.send('cosmetics:unlocked', { cosmeticDefId: achievement.cosmeticReward })
        }
      }
    }
  })

  // Player position persistence
  ipcMain.handle('player:save-position', (_e, scene: string, x: number, y: number) => {
    db.prepare('UPDATE players SET last_scene = ?, last_x = ?, last_y = ? WHERE id = ?').run(
      scene,
      x,
      y,
      'player-1'
    )
  })

  ipcMain.handle('player:get-position', () => {
    const row = db
      .prepare('SELECT last_scene, last_x, last_y FROM players WHERE id = ?')
      .get('player-1') as
      | { last_scene: string | null; last_x: number | null; last_y: number | null }
      | undefined
    if (!row || row.last_x === null || row.last_y === null) return null
    return { scene: row.last_scene, x: row.last_x, y: row.last_y }
  })

  ipcMain.handle('conversations:get-history', (_event, agentId: string) => {
    if (typeof agentId !== 'string') {
      console.warn('[ipc] conversations:get-history received invalid agentId:', agentId)
      return []
    }
    try {
      const conv = conversationPersistence.getOrCreateByAgent(agentId, 'player-1')
      return conversationPersistence.getMessages(conv.id)
    } catch (err) {
      console.error(`[ipc] conversations:get-history failed for ${agentId}:`, err)
      return []
    }
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

  // Tool confirmation responses
  ipcMain.on('chat:tool-approved', (_event, data: unknown) => {
    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as Record<string, unknown>).agentId !== 'string' ||
      typeof (data as Record<string, unknown>).toolCallId !== 'string'
    ) {
      return
    }
    const { agentId, toolCallId, addToApproved } = data as {
      agentId: string
      toolCallId: string
      addToApproved?: string
    }
    handleToolApproved(agentId, toolCallId, addToApproved)
  })

  ipcMain.on('chat:tool-denied', (_event, data: unknown) => {
    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as Record<string, unknown>).agentId !== 'string' ||
      typeof (data as Record<string, unknown>).toolCallId !== 'string'
    ) {
      return
    }
    const { agentId, toolCallId } = data as { agentId: string; toolCallId: string }
    handleToolDenied(agentId, toolCallId)
  })

  // Path approval responses
  ipcMain.on('chat:path-approved', (_event, data: unknown) => {
    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as Record<string, unknown>).agentId !== 'string' ||
      typeof (data as Record<string, unknown>).path !== 'string'
    ) {
      return
    }
    const { agentId, path, addToApproved } = data as {
      agentId: string
      path: string
      addToApproved?: string
    }
    handlePathApproved(agentId, path, addToApproved)
  })

  ipcMain.on('chat:path-denied', (_event, data: unknown) => {
    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as Record<string, unknown>).agentId !== 'string' ||
      typeof (data as Record<string, unknown>).path !== 'string'
    ) {
      return
    }
    const { agentId, path } = data as { agentId: string; path: string }
    handlePathDenied(agentId, path)
  })

  // Folder management (Notice Board)
  ipcMain.handle('folders:get-all', () => getApprovedFolders())
  ipcMain.handle('folders:add', (_event, path: string) => addApprovedFolder(path))
  ipcMain.handle('folders:remove', (_event, path: string) => removeApprovedFolder(path))
  ipcMain.handle('folders:select-add', () => selectAndAddFolder())

  // Check which paths are approved
  ipcMain.handle('folders:check-paths', (_event, paths: string[]) => {
    return paths.map((p) => ({ path: p, approved: isPathApproved(p) }))
  })

  // File/folder picker (returns paths without adding to approved list)
  ipcMain.handle('dialog:pick-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections']
    })
    if (result.canceled) return []
    return result.filePaths
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
app.on('before-quit', () => closeDatabase())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
