import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { storeApiKey, hasApiKey, clearApiKey, getApiKey } from './api-key'
import {
  ChatOrchestrator,
  BackendManager,
  handleToolApproved,
  handleToolDenied,
  handlePathApproved,
  handlePathDenied
} from './chat'
import { SlashCommandRegistry } from './chat/slash-command-registry'
import { SqliteSettingsRepository } from './db/settings-repository'
import type { AuthType, Locale, PermissionMode } from '../shared/types'
import {
  getProjectDirectory,
  setProjectDirectory,
  selectProjectDirectory,
  initProjectDirectory
} from './project-directory'
import { getDatabase, closeDatabase } from './db/database'
import { SqlitePlayerRepository } from './db/player-repository'
import { SqliteXPRepository } from './db/xp-repository'
import { SqliteConversationPersistence } from './db/conversation-persistence'
import { ProgressionEngine } from './progression-engine'
import { SqliteQuestRepository } from './db/quest-repository'
import { QuestEngine } from './quest-engine'
import { SqliteAchievementRepository } from './db/achievement-repository'
import { SqliteCosmeticRepository } from './db/cosmetic-repository'
import { SqliteItemRepository } from './db/item-repository'
import { AchievementEngine } from './achievement-engine'
import { generateBookName, stripMarkdown } from './book-name-generator'
import { getAgentConfig } from './agents/system-prompts'
import type { AtSource } from '../shared/types'
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
  const questRepo = new SqliteQuestRepository(db)
  const achievementRepo = new SqliteAchievementRepository(db)
  const cosmeticRepo = new SqliteCosmeticRepository(db)
  const itemRepo = new SqliteItemRepository(db)
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

  // Settings
  const settingsRepo = new SqliteSettingsRepository(db)

  // Wire BackendManager → ChatOrchestrator
  const backendManager = new BackendManager(settingsRepo.getAuthType(), {
    getApiKey: () => getApiKey()
  })
  const chatOrchestrator = new ChatOrchestrator(backendManager.getBackend())
  const slashCommandRegistry = new SlashCommandRegistry()

  // Model resolver: respect agent-specific model if set, otherwise use global setting
  chatOrchestrator.setModelResolver((agentDefault) =>
    agentDefault && agentDefault !== 'default' ? agentDefault : settingsRepo.getModel()
  )
  chatOrchestrator.setGlobalModeFallback(() => settingsRepo.getPermissionMode())
  chatOrchestrator.setDependencies({
    progressionEngine,
    questEngine,
    conversationPersistence,
    achievementEngine,
    achievementRepo,
    cosmeticRepo
  })
  initProjectDirectory(settingsRepo)

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

  // Item IPC handlers
  ipcMain.handle('items:get-all', () => {
    try {
      return itemRepo.getItems('player-1')
    } catch (err) {
      console.error('[items:get-all] Failed to load items:', err)
      throw err
    }
  })

  ipcMain.handle('items:add-book', async (_e, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof (payload as Record<string, unknown>).markdownContent !== 'string' ||
      typeof (payload as Record<string, unknown>).sourceAgentId !== 'string' ||
      typeof (payload as Record<string, unknown>).sourceQuestion !== 'string' ||
      typeof (payload as Record<string, unknown>).category !== 'string' ||
      typeof (payload as Record<string, unknown>).locale !== 'string' ||
      typeof (payload as Record<string, unknown>).npcName !== 'string'
    ) {
      throw new Error('Invalid items:add-book payload')
    }
    const p = payload as {
      markdownContent: string
      sourceAgentId: string
      sourceQuestion: string
      category: import('../shared/item-types').ItemCategory
      locale: string
      npcName: string
    }
    try {
      const preview = stripMarkdown(p.markdownContent)
      const itemCount = itemRepo.getItemCount('player-1', p.sourceAgentId)
      const name = await generateBookName(p.markdownContent, p.locale, p.npcName, itemCount)
      const book = itemRepo.addBookItem({
        playerId: 'player-1',
        type: 'book',
        name,
        icon: '📖',
        category: p.category,
        markdownContent: p.markdownContent,
        sourceAgentId: p.sourceAgentId,
        sourceQuestion: p.sourceQuestion,
        preview
      })
      BrowserWindow.getAllWindows()[0]?.webContents.send('items:updated')
      return book
    } catch (err) {
      console.error('[items:add-book] Failed to create book:', err)
      throw err
    }
  })

  ipcMain.handle('items:update-name', (_e, itemId: string, name: string) => {
    try {
      itemRepo.updateItemName(itemId, name)
      BrowserWindow.getAllWindows()[0]?.webContents.send('items:updated')
    } catch (err) {
      console.error(`[items:update-name] Failed for item ${itemId}:`, err)
      throw err
    }
  })

  ipcMain.handle('items:delete', (_e, itemId: string) => {
    try {
      itemRepo.deleteItem(itemId)
      BrowserWindow.getAllWindows()[0]?.webContents.send('items:updated')
    } catch (err) {
      console.error(`[items:delete] Failed for item ${itemId}:`, err)
      throw err
    }
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
    chatOrchestrator.handleSendMessage(agentId, message, locale, event.sender)
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
    chatOrchestrator.cancelStream((data as { agentId: string }).agentId)
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
    const { agentId, toolCallId } = data as {
      agentId: string
      toolCallId: string
    }
    handleToolApproved(agentId, toolCallId)
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
    const { agentId, path } = data as {
      agentId: string
      path: string
    }
    handlePathApproved(agentId, path)
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

  // Project directory
  ipcMain.handle('project-dir:get', () => getProjectDirectory())
  ipcMain.handle('project-dir:set', (_e, dirPath: string) => {
    setProjectDirectory(dirPath)
    return getProjectDirectory()
  })
  ipcMain.handle('project-dir:select', async () => selectProjectDirectory())

  // File/folder picker (returns paths without adding to approved list)
  ipcMain.handle('dialog:pick-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections']
    })
    if (result.canceled) return []
    return result.filePaths
  })

  // Settings IPC handlers
  ipcMain.handle('settings:get-all', () => {
    return settingsRepo.getAll()
  })

  ipcMain.handle('settings:set', (_e, { key, value }: { key: string; value: string }) => {
    switch (key) {
      case 'auth_type': {
        settingsRepo.setAuthType(value as AuthType)
        backendManager.switchBackend(value as AuthType)
        chatOrchestrator.setBackend(backendManager.getBackend())
        break
      }
      case 'model':
        settingsRepo.setModel(value)
        break
      case 'locale':
        settingsRepo.setLocale(value as Locale)
        break
      case 'permission_mode':
        settingsRepo.setPermissionMode(value as PermissionMode)
        break
    }
    // Broadcast change to renderer
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:changed', { key, value })
    }
  })

  ipcMain.handle('settings:validate-api-key', async (_e, { key }: { key: string }) => {
    return backendManager.validateApiKey(key)
  })

  ipcMain.handle('settings:check-cli', async () => {
    return backendManager.checkCli()
  })

  // Per-agent permission mode
  ipcMain.on('chat:set-agent-mode', (_event, data: { agentId: string; mode: string }) => {
    chatOrchestrator.setAgentMode(data.agentId, data.mode as PermissionMode)
  })

  ipcMain.handle('chat:get-agent-mode', (_e, agentId: string) => {
    return chatOrchestrator.getAgentMode(agentId)
  })

  ipcMain.handle('slash:list-commands', async () => {
    return slashCommandRegistry.getCommands()
  })

  const KNOWN_AGENT_IDS = [
    'elder',
    'guildMaster',
    'scholar',
    'scribe',
    'merchant',
    'commander',
    'artisan',
    'herald',
    'wizard',
    'bartender'
  ]

  ipcMain.handle(
    'at:list-sources',
    async (_e, { query: _query, agentId: _agentId }: { query: string; agentId: string }) => {
      const sources: AtSource[] = []

      // NPCs — use known agent IDs with getAgentConfig
      for (const id of KNOWN_AGENT_IDS) {
        const config = getAgentConfig(id)
        if (config) {
          sources.push({ type: 'npc', id, label: id })
        }
      }

      // Books — from items repo
      try {
        const items = itemRepo.getItems('player-1')
        for (const item of items) {
          if (item.type === 'book') {
            sources.push({
              type: 'book',
              id: item.id,
              label: item.name,
              secondary: item.sourceAgentId ?? undefined
            })
          }
        }
      } catch {
        /* items not available */
      }

      // Files — from project directory (shallow listing)
      const projectDir = getProjectDirectory()
      if (projectDir) {
        try {
          const { readdirSync } = await import('fs')
          const entries = readdirSync(projectDir, { withFileTypes: true }).slice(0, 50)
          for (const entry of entries) {
            sources.push({
              type: 'file',
              id: `${projectDir}/${entry.name}`,
              label: entry.name,
              secondary: projectDir
            })
          }
        } catch {
          /* dir not accessible */
        }
      }

      return sources
    }
  )

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
