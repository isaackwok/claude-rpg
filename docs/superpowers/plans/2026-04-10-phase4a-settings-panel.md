# Phase 4A — Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings panel with auth type switching (API Key / Claude CLI), global model selection, and language toggle.

**Architecture:** New `SettingsRepository` (SQLite key-value), `BackendManager` (backend lifecycle), `ClaudeCliChatBackend` (CLI wrapper). React overlay with sidebar tabs, accessible via HUD gear icon and ESC key.

**Tech Stack:** TypeScript, better-sqlite3, Electron IPC, React, i18n (react-i18next)

**Spec:** `docs/superpowers/specs/2026-04-10-phase4a-settings-panel-design.md`

---

### Task 1: Shared Types — AuthType, Locale, SettingsMap

**Files:**

- Modify: `src/shared/types.ts` (add types after line 8)

- [ ] **Step 1: Add settings types to shared/types.ts**

Add after the `AgentId` type alias (line 7):

```typescript
/** Authentication backend type */
export type AuthType = 'api_key' | 'claude_cli'

/** Supported locale */
export type Locale = 'zh-TW' | 'en'

/** Settings key-value map returned from settings:get-all */
export interface SettingsMap {
  auth_type: AuthType
  model: string
  locale: Locale
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(settings): add AuthType, Locale, SettingsMap shared types"
```

---

### Task 2: Settings Migration & Repository

**Files:**

- Modify: `src/main/db/migrations.ts` (add migration 6)
- Create: `src/main/db/settings-repository.ts`
- Create: `src/main/db/settings-repository.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/main/db/settings-repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'
import { SqliteSettingsRepository } from './settings-repository'

describe('SqliteSettingsRepository', () => {
  let db: Database.Database
  let repo: SqliteSettingsRepository

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    repo = new SqliteSettingsRepository(db)
  })

  afterEach(() => db.close())

  it('returns default auth_type when not set', () => {
    expect(repo.getAuthType()).toBe('api_key')
  })

  it('returns default model when not set', () => {
    expect(repo.getModel()).toBe('claude-sonnet-4-6')
  })

  it('returns default locale when not set', () => {
    expect(repo.getLocale()).toBe('zh-TW')
  })

  it('sets and gets auth_type', () => {
    repo.setAuthType('claude_cli')
    expect(repo.getAuthType()).toBe('claude_cli')
  })

  it('sets and gets model', () => {
    repo.setModel('claude-opus-4-6')
    expect(repo.getModel()).toBe('claude-opus-4-6')
  })

  it('sets and gets locale', () => {
    repo.setLocale('en')
    expect(repo.getLocale()).toBe('en')
  })

  it('getAll returns all settings with defaults', () => {
    const all = repo.getAll()
    expect(all).toEqual({
      auth_type: 'api_key',
      model: 'claude-sonnet-4-6',
      locale: 'zh-TW'
    })
  })

  it('getAll reflects updates', () => {
    repo.setAuthType('claude_cli')
    repo.setModel('claude-opus-4-6')
    repo.setLocale('en')
    const all = repo.getAll()
    expect(all).toEqual({
      auth_type: 'claude_cli',
      model: 'claude-opus-4-6',
      locale: 'en'
    })
  })

  it('set overwrites existing value', () => {
    repo.setModel('claude-opus-4-6')
    repo.setModel('claude-haiku-4-5-20251001')
    expect(repo.getModel()).toBe('claude-haiku-4-5-20251001')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/main/db/settings-repository.test.ts`
Expected: FAIL — `settings-repository` module not found

- [ ] **Step 3: Add migration 6 to migrations.ts**

In `src/main/db/migrations.ts`, add after the migration `5` entry (after line 121):

```typescript
  6: (db) => {
    db.exec(`
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  },
```

- [ ] **Step 4: Write SettingsRepository**

Create `src/main/db/settings-repository.ts`:

```typescript
import type Database from 'better-sqlite3'
import type { AuthType, Locale, SettingsMap } from '../../shared/types'

const DEFAULTS: SettingsMap = {
  auth_type: 'api_key',
  model: 'claude-sonnet-4-6',
  locale: 'zh-TW'
}

export class SqliteSettingsRepository {
  constructor(private db: Database.Database) {}

  private get(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value
  }

  private set(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
      )
      .run(key, value, value)
  }

  getAuthType(): AuthType {
    return (this.get('auth_type') as AuthType) ?? DEFAULTS.auth_type
  }

  setAuthType(value: AuthType): void {
    this.set('auth_type', value)
  }

  getModel(): string {
    return this.get('model') ?? DEFAULTS.model
  }

  setModel(value: string): void {
    this.set('model', value)
  }

  getLocale(): Locale {
    return (this.get('locale') as Locale) ?? DEFAULTS.locale
  }

  setLocale(value: Locale): void {
    this.set('locale', value)
  }

  getAll(): SettingsMap {
    return {
      auth_type: this.getAuthType(),
      model: this.getModel(),
      locale: this.getLocale()
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- src/main/db/settings-repository.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations.ts src/main/db/settings-repository.ts src/main/db/settings-repository.test.ts
git commit -m "feat(settings): add settings table migration and SettingsRepository"
```

---

### Task 3: BackendManager

**Files:**

- Create: `src/main/chat/backend-manager.ts`
- Modify: `src/main/chat/index.ts` (add re-export)

Note: `BackendManager` uses `execFile` (not `exec`) for CLI checks — this passes arguments as an array, preventing shell injection.

- [ ] **Step 1: Write BackendManager**

Create `src/main/chat/backend-manager.ts`:

```typescript
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { IChatBackend } from './types'
import type { AuthType } from '../../shared/types'
import { ApiKeyChatBackend } from './api-key-backend'

const execFileAsync = promisify(execFile)

export interface BackendManagerDeps {
  getApiKey: () => string | null
}

export class BackendManager {
  private currentBackend: IChatBackend
  private currentAuthType: AuthType
  private deps: BackendManagerDeps

  constructor(authType: AuthType, deps: BackendManagerDeps) {
    this.deps = deps
    this.currentAuthType = authType
    this.currentBackend = this.createBackend(authType)
  }

  private createBackend(authType: AuthType): IChatBackend {
    switch (authType) {
      case 'api_key':
        return new ApiKeyChatBackend(this.deps.getApiKey)
      case 'claude_cli':
        // ClaudeCliChatBackend will be added in Task 4
        throw new Error('Claude CLI backend not yet implemented')
    }
  }

  getBackend(): IChatBackend {
    return this.currentBackend
  }

  getAuthType(): AuthType {
    return this.currentAuthType
  }

  switchBackend(authType: AuthType): void {
    if (authType === this.currentAuthType) return
    this.currentBackend = this.createBackend(authType)
    this.currentAuthType = authType
  }

  /** Check if claude CLI is installed and authenticated.
   *  Uses execFile (not exec) — args are passed as array, no shell injection risk. */
  async checkCli(): Promise<{ installed: boolean; authenticated: boolean }> {
    try {
      await execFileAsync('claude', ['--version'])
    } catch {
      return { installed: false, authenticated: false }
    }
    try {
      await execFileAsync('claude', ['--print', '--max-turns', '0', 'test'], { timeout: 10_000 })
      return { installed: true, authenticated: true }
    } catch {
      return { installed: true, authenticated: false }
    }
  }

  /** Validate an API key by making a lightweight API call */
  async validateApiKey(key: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: key })
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
      return { valid: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { valid: false, error: message }
    }
  }
}
```

- [ ] **Step 2: Add re-export to barrel**

In `src/main/chat/index.ts`, add:

```typescript
export { BackendManager } from './backend-manager'
export type { BackendManagerDeps } from './backend-manager'
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/chat/backend-manager.ts src/main/chat/index.ts
git commit -m "feat(settings): add BackendManager for backend lifecycle"
```

---

### Task 4: ClaudeCliChatBackend

**Files:**

- Create: `src/main/chat/claude-cli-backend.ts`
- Modify: `src/main/chat/backend-manager.ts` (wire up CLI backend)
- Modify: `src/main/chat/index.ts` (add re-export)

Note: Uses `child_process.spawn` with explicit args array (no shell) — safe against command injection.

- [ ] **Step 1: Write ClaudeCliChatBackend**

Create `src/main/chat/claude-cli-backend.ts`:

```typescript
import { spawn } from 'child_process'
import type { AgentId } from '../../shared/types'
import type { IChatBackend, ChatOpts, StreamEvent, ToolResult } from './types'
import { ConversationHistoryManager } from './history'

/**
 * IChatBackend that delegates to the Claude CLI (`claude --print`).
 * Uses child_process.spawn with explicit args array — no shell, no injection risk.
 */
export class ClaudeCliChatBackend implements IChatBackend {
  private history = new ConversationHistoryManager()
  private activeProcesses = new Map<AgentId, { kill: () => void }>()
  private pendingToolResults = new Map<AgentId, { resolve: (results: ToolResult[]) => void }>()

  async *sendMessage(opts: ChatOpts, message: string): AsyncIterable<StreamEvent> {
    const history = this.history.getOrCreate(opts.agentId)

    // Avoid duplicate on retry
    const last = history[history.length - 1]
    if (!(last?.role === 'user' && last.content === message)) {
      history.push({ role: 'user', content: message })
    }

    // Build full prompt from history for --print mode
    const conversationPrompt = history
      .map((m) => (m.role === 'user' ? `Human: ${m.content}` : `Assistant: ${m.content}`))
      .join('\n\n')

    try {
      const result = await this.runClaude(opts, conversationPrompt)
      history.push({ role: 'assistant', content: result })
      yield { type: 'text', chunk: result }
      yield { type: 'end' }
    } catch (err) {
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.message.includes('killed'))
      if (isAbort) {
        yield { type: 'end' }
      } else {
        const error = err instanceof Error ? err.message : String(err)
        console.error(`[ClaudeCliChatBackend] Error for agent ${opts.agentId}:`, err)
        yield { type: 'error', error }
      }
    } finally {
      this.activeProcesses.delete(opts.agentId)
    }
  }

  /** Spawn claude CLI with explicit args array — no shell, safe against injection. */
  private runClaude(opts: ChatOpts, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '--print',
        '--model',
        opts.model,
        '--max-tokens',
        String(opts.maxTokens),
        '--system-prompt',
        opts.systemPrompt
      ]

      const proc = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      })

      this.activeProcesses.set(opts.agentId, { kill: () => proc.kill('SIGTERM') })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim())
        } else {
          reject(new Error(stderr.trim() || `claude exited with code ${code}`))
        }
      })

      proc.on('error', (err) => {
        reject(err)
      })

      // Write prompt to stdin and close
      proc.stdin.write(prompt)
      proc.stdin.end()
    })
  }

  supplyToolResults(agentId: AgentId, results: ToolResult[]): void {
    const pending = this.pendingToolResults.get(agentId)
    if (pending) {
      this.pendingToolResults.delete(agentId)
      pending.resolve(results)
    }
  }

  cancelStream(agentId: AgentId): void {
    const proc = this.activeProcesses.get(agentId)
    if (proc) {
      proc.kill()
    }
  }

  clearHistory(agentId: AgentId): void {
    this.history.clear(agentId)
  }
}
```

- [ ] **Step 2: Wire CLI backend into BackendManager**

In `src/main/chat/backend-manager.ts`, add import at top:

```typescript
import { ClaudeCliChatBackend } from './claude-cli-backend'
```

Replace the `case 'claude_cli':` in `createBackend`:

```typescript
      case 'claude_cli':
        return new ClaudeCliChatBackend()
```

- [ ] **Step 3: Add re-export to barrel**

In `src/main/chat/index.ts`, add:

```typescript
export { ClaudeCliChatBackend } from './claude-cli-backend'
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/chat/claude-cli-backend.ts src/main/chat/backend-manager.ts src/main/chat/index.ts
git commit -m "feat(settings): add ClaudeCliChatBackend and wire into BackendManager"
```

---

### Task 5: Wire BackendManager + SettingsRepository into Main Process

**Files:**

- Modify: `src/main/index.ts` (replace direct backend construction with BackendManager, add settings IPC handlers)
- Modify: `src/main/chat/orchestrator.ts` (add `setBackend` and model resolver methods)

- [ ] **Step 1: Add `setBackend` and model resolver to ChatOrchestrator**

In `src/main/chat/orchestrator.ts`, add after the constructor (line 58):

```typescript
  /** Replace the active backend (called by BackendManager on auth type switch) */
  setBackend(backend: IChatBackend): void {
    this.backend = backend
  }
```

Add a property and setter (after `private dependenciesInitialized = false` on line 54):

```typescript
  private getModelOverride: ((agentDefault: string) => string) | null = null

  /** Set a callback that returns the effective model, given the agent's default.
   *  Used by settings to inject global model preference. */
  setModelResolver(resolver: (agentDefault: string) => string): void {
    this.getModelOverride = resolver
  }
```

In the `processStream` method, replace `model: config.model` in the `opts` construction (line 155):

```typescript
      model: this.getModelOverride?.(config.model) ?? config.model,
```

- [ ] **Step 2: Wire BackendManager and settings in main/index.ts**

In `src/main/index.ts`, add imports:

```typescript
import { BackendManager } from './chat'
import { SqliteSettingsRepository } from './db/settings-repository'
```

Add to the imports from `../../shared/types`:

```typescript
import type { AuthType, Locale } from '../shared/types'
```

Replace lines 113-114 (backend + orchestrator construction):

```typescript
// Settings
const settingsRepo = new SqliteSettingsRepository(db)

// Wire BackendManager → ChatOrchestrator
const backendManager = new BackendManager(settingsRepo.getAuthType(), {
  getApiKey: () => getApiKey()
})
const chatOrchestrator = new ChatOrchestrator(backendManager.getBackend())

// Model resolver: use global setting as default for all agents
chatOrchestrator.setModelResolver((_agentDefault) => settingsRepo.getModel())
```

- [ ] **Step 3: Add settings IPC handlers in main/index.ts**

Add after the existing IPC handlers (before `createWindow()`):

```typescript
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
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/chat/orchestrator.ts
git commit -m "feat(settings): wire BackendManager and settings IPC into main process"
```

---

### Task 6: Preload Bridge — Settings API

**Files:**

- Modify: `src/preload/index.ts` (add settings API section)

- [ ] **Step 1: Add settings section to preload api object**

In `src/preload/index.ts`, add after the position persistence section (after line 231):

```typescript
  // Settings
  getSettings: (): Promise<import('../shared/types').SettingsMap> =>
    ipcRenderer.invoke('settings:get-all'),
  setSetting: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('settings:set', { key, value }),
  onSettingsChanged: (
    callback: (data: { key: string; value: string }) => void
  ): (() => void) => {
    const handler = (_event: unknown, data: { key: string; value: string }): void =>
      callback(data)
    ipcRenderer.on('settings:changed', handler)
    return () => ipcRenderer.removeListener('settings:changed', handler)
  },
  validateApiKey: (key: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:validate-api-key', { key }),
  checkCli: (): Promise<{ installed: boolean; authenticated: boolean }> =>
    ipcRenderer.invoke('settings:check-cli'),
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(settings): expose settings API in preload bridge"
```

---

### Task 7: EventBus — Settings Toggle Event

**Files:**

- Modify: `src/renderer/src/game/types.ts` (add event to GameEvents)

- [ ] **Step 1: Add settings:toggle event to GameEvents**

In `src/renderer/src/game/types.ts`, add to the `GameEvents` interface (after `'item:deleted'` on line 45):

```typescript
  'settings:toggle': Record<string, never>
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/game/types.ts
git commit -m "feat(settings): add settings:toggle event to GameEvents"
```

---

### Task 8: i18n Strings

**Files:**

- Modify: `src/renderer/src/i18n/locales/zh-TW.json`
- Modify: `src/renderer/src/i18n/locales/en.json`

- [ ] **Step 1: Add settings strings to zh-TW.json**

Add a `"settings"` section to the JSON:

```json
  "settings": {
    "title": "設定",
    "tabs": {
      "auth": "認證",
      "model": "模型",
      "language": "語言"
    },
    "auth": {
      "label": "認證方式",
      "apiKey": "API Key",
      "apiKeyDescription": "使用 Anthropic API 金鑰",
      "claudeCli": "Claude 訂閱",
      "claudeCliDescription": "使用 Claude CLI（需要訂閱）",
      "apiKeyPlaceholder": "sk-ant-...",
      "apiKeySaved": "API 金鑰已儲存",
      "apiKeyInvalid": "無效的 API 金鑰",
      "validating": "驗證中...",
      "cliNotInstalled": "未偵測到 Claude CLI。請先安裝 Claude CLI。",
      "cliNotAuthenticated": "Claude CLI 尚未登入。請在終端機執行 claude login。",
      "cliReady": "Claude CLI 已就緒"
    },
    "model": {
      "label": "預設模型",
      "description": "所有 NPC 對話使用的 AI 模型"
    },
    "language": {
      "label": "語言",
      "description": "介面語言與 NPC 回覆語言",
      "zhTW": "繁體中文",
      "en": "English"
    }
  }
```

- [ ] **Step 2: Add settings strings to en.json**

Add a `"settings"` section to the JSON:

```json
  "settings": {
    "title": "Settings",
    "tabs": {
      "auth": "Auth",
      "model": "Model",
      "language": "Language"
    },
    "auth": {
      "label": "Authentication",
      "apiKey": "API Key",
      "apiKeyDescription": "Use an Anthropic API key",
      "claudeCli": "Claude Subscription",
      "claudeCliDescription": "Use Claude CLI (requires subscription)",
      "apiKeyPlaceholder": "sk-ant-...",
      "apiKeySaved": "API key saved",
      "apiKeyInvalid": "Invalid API key",
      "validating": "Validating...",
      "cliNotInstalled": "Claude CLI not detected. Please install the Claude CLI first.",
      "cliNotAuthenticated": "Claude CLI not logged in. Run claude login in your terminal.",
      "cliReady": "Claude CLI ready"
    },
    "model": {
      "label": "Default Model",
      "description": "AI model used for all NPC conversations"
    },
    "language": {
      "label": "Language",
      "description": "Interface and NPC response language",
      "zhTW": "繁體中文",
      "en": "English"
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/locales/zh-TW.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(settings): add i18n strings for settings panel (zh-TW + en)"
```

---

### Task 9: SettingsPanel React Component

**Files:**

- Create: `src/renderer/src/components/ui/SettingsPanel.tsx`

- [ ] **Step 1: Write SettingsPanel component**

Create `src/renderer/src/components/ui/SettingsPanel.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '../../i18n'
import type { SettingsMap, AuthType, Locale } from '../../../../shared/types'

type TabId = 'auth' | 'model' | 'language'

const TABS: TabId[] = ['auth', 'model', 'language']

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
]

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { t, changeLanguage } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabId>('auth')
  const [settings, setSettings] = useState<SettingsMap | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'validating' | 'saved' | 'invalid'>(
    'idle'
  )
  const [cliStatus, setCliStatus] = useState<{
    installed: boolean
    authenticated: boolean
  } | null>(null)

  // Load settings on mount
  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

  // Check CLI status when switching to claude_cli
  const checkCliStatus = useCallback(async () => {
    const status = await window.api.checkCli()
    setCliStatus(status)
  }, [])

  // Listen for settings changes from main process
  useEffect(() => {
    const cleanup = window.api.onSettingsChanged(({ key, value }) => {
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    })
    return cleanup
  }, [])

  const updateSetting = useCallback(
    async (key: string, value: string) => {
      await window.api.setSetting(key, value)
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))

      if (key === 'locale') {
        changeLanguage(value)
      }
      if (key === 'auth_type' && value === 'claude_cli') {
        checkCliStatus()
      }
    },
    [changeLanguage, checkCliStatus]
  )

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return
    setApiKeyStatus('validating')
    const result = await window.api.validateApiKey(apiKeyInput.trim())
    if (result.valid) {
      await window.api.setApiKey(apiKeyInput.trim())
      setApiKeyStatus('saved')
      setApiKeyInput('')
    } else {
      setApiKeyStatus('invalid')
    }
  }, [apiKeyInput])

  if (!settings) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        pointerEvents: 'auto',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(10, 10, 30, 0.96)',
          border: '3px solid rgba(200, 180, 140, 0.6)',
          borderRadius: 12,
          width: 520,
          maxHeight: '80vh',
          display: 'flex',
          fontFamily: 'monospace',
          color: '#e8d5a8',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div
          style={{
            width: 120,
            borderRight: '1px solid rgba(200, 180, 140, 0.2)',
            padding: '16px 0'
          }}
        >
          <div
            style={{
              textAlign: 'center',
              fontSize: 16,
              color: '#c4a46c',
              padding: '8px 0 16px',
              borderBottom: '1px solid rgba(200, 180, 140, 0.15)'
            }}
          >
            {t('settings.title')}
          </div>
          {TABS.map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                fontSize: 13,
                color: activeTab === tab ? '#c4a46c' : '#a89060',
                background: activeTab === tab ? 'rgba(200, 180, 140, 0.15)' : 'transparent',
                borderLeft: activeTab === tab ? '2px solid #c4a46c' : '2px solid transparent',
                transition: 'all 0.15s'
              }}
            >
              {t(`settings.tabs.${tab}`)}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 24 }}>
          {activeTab === 'auth' && (
            <AuthTabContent
              settings={settings}
              apiKeyInput={apiKeyInput}
              apiKeyStatus={apiKeyStatus}
              cliStatus={cliStatus}
              onUpdateSetting={updateSetting}
              onApiKeyInputChange={setApiKeyInput}
              onSaveApiKey={handleSaveApiKey}
              onCheckCli={checkCliStatus}
              t={t}
            />
          )}
          {activeTab === 'model' && (
            <ModelTabContent settings={settings} onUpdateSetting={updateSetting} t={t} />
          )}
          {activeTab === 'language' && (
            <LanguageTabContent settings={settings} onUpdateSetting={updateSetting} t={t} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab Content Components ──────────────────────────────────────

function AuthTabContent({
  settings,
  apiKeyInput,
  apiKeyStatus,
  cliStatus,
  onUpdateSetting,
  onApiKeyInputChange,
  onSaveApiKey,
  onCheckCli,
  t
}: {
  settings: SettingsMap
  apiKeyInput: string
  apiKeyStatus: 'idle' | 'validating' | 'saved' | 'invalid'
  cliStatus: { installed: boolean; authenticated: boolean } | null
  onUpdateSetting: (key: string, value: string) => void
  onApiKeyInputChange: (value: string) => void
  onSaveApiKey: () => void
  onCheckCli: () => void
  t: (key: string) => string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: '#a89060',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 12
        }}
      >
        {t('settings.auth.label')}
      </div>

      {/* API Key option */}
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: 12,
          background: settings.auth_type === 'api_key' ? 'rgba(200, 180, 140, 0.1)' : 'transparent',
          border: `1px solid ${settings.auth_type === 'api_key' ? 'rgba(200, 180, 140, 0.4)' : 'rgba(200, 180, 140, 0.15)'}`,
          borderRadius: 6,
          cursor: 'pointer',
          marginBottom: 8
        }}
      >
        <input
          type="radio"
          name="auth_type"
          checked={settings.auth_type === 'api_key'}
          onChange={() => onUpdateSetting('auth_type', 'api_key')}
          style={{ marginTop: 2 }}
        />
        <div>
          <div style={{ fontSize: 14 }}>{t('settings.auth.apiKey')}</div>
          <div style={{ fontSize: 11, color: '#a89060', marginTop: 2 }}>
            {t('settings.auth.apiKeyDescription')}
          </div>
        </div>
      </label>

      {/* API Key input (shown when api_key is selected) */}
      {settings.auth_type === 'api_key' && (
        <div style={{ marginLeft: 24, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => onApiKeyInputChange(e.target.value)}
              placeholder={t('settings.auth.apiKeyPlaceholder')}
              style={{
                flex: 1,
                background: 'rgba(200, 180, 140, 0.08)',
                border: '1px solid rgba(200, 180, 140, 0.25)',
                borderRadius: 4,
                padding: '6px 8px',
                color: '#e8d5a8',
                fontFamily: 'monospace',
                fontSize: 12
              }}
            />
            <button
              onClick={onSaveApiKey}
              disabled={!apiKeyInput.trim() || apiKeyStatus === 'validating'}
              style={{
                padding: '6px 14px',
                background: 'rgba(200, 180, 140, 0.15)',
                border: '1px solid rgba(200, 180, 140, 0.3)',
                borderRadius: 4,
                color: '#c4a46c',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'monospace'
              }}
            >
              {apiKeyStatus === 'validating' ? t('settings.auth.validating') : t('apiKey.save')}
            </button>
          </div>
          {apiKeyStatus === 'saved' && (
            <div style={{ fontSize: 11, color: '#4ade80', marginTop: 6 }}>
              {t('settings.auth.apiKeySaved')}
            </div>
          )}
          {apiKeyStatus === 'invalid' && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>
              {t('settings.auth.apiKeyInvalid')}
            </div>
          )}
        </div>
      )}

      {/* Claude CLI option */}
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: 12,
          background:
            settings.auth_type === 'claude_cli' ? 'rgba(200, 180, 140, 0.1)' : 'transparent',
          border: `1px solid ${settings.auth_type === 'claude_cli' ? 'rgba(200, 180, 140, 0.4)' : 'rgba(200, 180, 140, 0.15)'}`,
          borderRadius: 6,
          cursor: 'pointer'
        }}
      >
        <input
          type="radio"
          name="auth_type"
          checked={settings.auth_type === 'claude_cli'}
          onChange={() => onUpdateSetting('auth_type', 'claude_cli')}
          style={{ marginTop: 2 }}
        />
        <div>
          <div style={{ fontSize: 14 }}>{t('settings.auth.claudeCli')}</div>
          <div style={{ fontSize: 11, color: '#a89060', marginTop: 2 }}>
            {t('settings.auth.claudeCliDescription')}
          </div>
        </div>
      </label>

      {/* CLI status (shown when claude_cli is selected) */}
      {settings.auth_type === 'claude_cli' && (
        <div style={{ marginLeft: 24, marginTop: 8 }}>
          {cliStatus === null ? (
            <button
              onClick={onCheckCli}
              style={{
                padding: '6px 14px',
                background: 'rgba(200, 180, 140, 0.15)',
                border: '1px solid rgba(200, 180, 140, 0.3)',
                borderRadius: 4,
                color: '#c4a46c',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'monospace'
              }}
            >
              Check CLI Status
            </button>
          ) : !cliStatus.installed ? (
            <div style={{ fontSize: 11, color: '#f87171' }}>
              {t('settings.auth.cliNotInstalled')}
            </div>
          ) : !cliStatus.authenticated ? (
            <div style={{ fontSize: 11, color: '#fbbf24' }}>
              {t('settings.auth.cliNotAuthenticated')}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#4ade80' }}>{t('settings.auth.cliReady')}</div>
          )}
        </div>
      )}
    </div>
  )
}

function ModelTabContent({
  settings,
  onUpdateSetting,
  t
}: {
  settings: SettingsMap
  onUpdateSetting: (key: string, value: string) => void
  t: (key: string) => string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: '#a89060',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4
        }}
      >
        {t('settings.model.label')}
      </div>
      <div style={{ fontSize: 11, color: '#a89060', marginBottom: 16 }}>
        {t('settings.model.description')}
      </div>
      <select
        value={settings.model}
        onChange={(e) => onUpdateSetting('model', e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(200, 180, 140, 0.08)',
          border: '1px solid rgba(200, 180, 140, 0.25)',
          borderRadius: 6,
          color: '#e8d5a8',
          fontFamily: 'monospace',
          fontSize: 13,
          cursor: 'pointer'
        }}
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function LanguageTabContent({
  settings,
  onUpdateSetting,
  t
}: {
  settings: SettingsMap
  onUpdateSetting: (key: string, value: string) => void
  t: (key: string) => string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: '#a89060',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4
        }}
      >
        {t('settings.language.label')}
      </div>
      <div style={{ fontSize: 11, color: '#a89060', marginBottom: 16 }}>
        {t('settings.language.description')}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {(
          [
            { value: 'zh-TW', label: 'settings.language.zhTW' },
            { value: 'en', label: 'settings.language.en' }
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onUpdateSetting('locale', value)}
            style={{
              flex: 1,
              padding: '12px 16px',
              background:
                settings.locale === value
                  ? 'rgba(200, 180, 140, 0.15)'
                  : 'rgba(200, 180, 140, 0.05)',
              border: `${settings.locale === value ? '2px' : '1px'} solid ${settings.locale === value ? '#c4a46c' : 'rgba(200, 180, 140, 0.2)'}`,
              borderRadius: 6,
              color: settings.locale === value ? '#e8d5a8' : '#a89060',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 14
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/SettingsPanel.tsx
git commit -m "feat(settings): add SettingsPanel with auth, model, and language tabs"
```

---

### Task 10: SettingsGearButton Component

**Files:**

- Create: `src/renderer/src/components/ui/SettingsGearButton.tsx`

- [ ] **Step 1: Write SettingsGearButton**

Create `src/renderer/src/components/ui/SettingsGearButton.tsx`:

```tsx
import { EventBus } from '../../game/EventBus'

export function SettingsGearButton() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        pointerEvents: 'auto',
        zIndex: 100
      }}
    >
      <button
        onClick={() => EventBus.emit('settings:toggle', {})}
        title="Settings"
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          background: 'rgba(10, 10, 30, 0.8)',
          border: '2px solid rgba(200, 180, 140, 0.4)',
          color: '#c4a46c',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.15s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(200, 180, 140, 0.7)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(200, 180, 140, 0.4)'
        }}
      >
        ⚙
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/ui/SettingsGearButton.tsx
git commit -m "feat(settings): add SettingsGearButton HUD component"
```

---

### Task 11: Mount Settings in App.tsx + ESC Key Binding

**Files:**

- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Add imports and state**

In `src/renderer/src/App.tsx`, add imports:

```typescript
import { SettingsPanel } from './components/ui/SettingsPanel'
import { SettingsGearButton } from './components/ui/SettingsGearButton'
```

Add state inside `App()` (after the existing `useState` declarations around line 28):

```typescript
const [showSettings, setShowSettings] = useState(false)
```

- [ ] **Step 2: Add EventBus listener for settings:toggle**

Add a new `useEffect` (after the backpack toggle effect around line 106):

```typescript
// Settings toggle from EventBus (gear button)
useEffect(() => {
  const handler = () => setShowSettings((v) => !v)
  EventBus.on('settings:toggle', handler)
  return () => {
    EventBus.off('settings:toggle', handler)
  }
}, [])
```

- [ ] **Step 3: Update ESC key handler**

Replace the existing keyboard shortcuts `useEffect` (lines 109-132) to include settings and add `SELECT` to the tag guard:

```typescript
// Keyboard shortcuts for panels
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Skip if focus is on an input/textarea/select
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    if (e.code === 'KeyP') {
      setShowSkillsPanel((v) => !v)
    }
    if (e.code === 'KeyB') {
      setShowBackpack((v) => !v)
    }
    if (e.code === 'KeyQ') {
      setShowQuestBoard((v) => !v)
    }
    if (e.code === 'Escape') {
      // Close panels in priority order
      if (showSkillsPanel) setShowSkillsPanel(false)
      else if (showBackpack) setShowBackpack(false)
      else if (showQuestBoard) setShowQuestBoard(false)
      else if (showSettings) setShowSettings(false)
      else setShowSettings(true)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [showSkillsPanel, showBackpack, showQuestBoard, showSettings])
```

- [ ] **Step 4: Add components to render tree**

In the JSX return, add `SettingsGearButton` after `BackpackButton` (around line 183):

```tsx
<SettingsGearButton />
```

Add `SettingsPanel` render after the `showQuestBoard` conditional (around line 196):

```tsx
{
  showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />
}
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(settings): mount SettingsPanel and gear button in App, wire ESC key"
```

---

### Task 12: Startup Auto-Open & Integration Test

**Files:**

- Modify: `src/renderer/src/App.tsx` (auto-open logic)

- [ ] **Step 1: Add startup check for missing auth config**

In `src/renderer/src/App.tsx`, add a `useEffect` after the existing IPC setup effects:

```typescript
// Auto-open settings if no auth is configured
useEffect(() => {
  const checkAuth = async () => {
    const settings = await window.api.getSettings()
    if (settings.auth_type === 'api_key') {
      const hasKey = await window.api.checkApiKey()
      if (!hasKey) {
        setShowSettings(true)
      }
    } else if (settings.auth_type === 'claude_cli') {
      const status = await window.api.checkCli()
      if (!status.installed || !status.authenticated) {
        setShowSettings(true)
      }
    }
  }
  checkAuth()
}, [])
```

- [ ] **Step 2: Manual integration test**

Run: `npm run dev`

Verify:

1. Gear icon appears in top-right corner of the HUD
2. Clicking gear icon opens settings panel with sidebar tabs
3. ESC key toggles settings panel (opens if nothing else is open, closes if settings is open)
4. Auth tab shows API Key / Claude CLI radio buttons
5. Model tab shows dropdown with 3 model options
6. Language tab shows zh-TW / English toggle buttons
7. Switching language immediately updates all UI text
8. Clicking outside the panel closes it
9. If no API key is set, settings panel auto-opens on startup

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(settings): auto-open settings panel when auth is not configured"
```

---

### Task 13: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update completed phases**

In `CLAUDE.md`, update the "Completed" line to include Phase 4A:

```
Completed: Phase 1 (Shell & World), Phase 2 (Agent Conversations), Phase 2.5 (NPC Tool Use), Phase 3A (Progression Engine), Phase 3B (Quests, Backpack & Title Tiers), Phase 3C (Achievements & Cosmetics), Phase 3D (Inventory & Books), Phase 4A (Settings Panel)
Next up: Phase 4B (Guild Hall)
```

Add a bullet for Phase 4A:

```
- Phase 4A delivered: Settings panel with auth type switching (API Key / Claude CLI), global model selector, language toggle. BackendManager for pluggable backend lifecycle. Accessible via HUD gear icon + ESC key.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Phase 4A completion"
```
