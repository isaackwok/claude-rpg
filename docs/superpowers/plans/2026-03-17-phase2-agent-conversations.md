# Phase 2: Agent Conversations — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up AI-powered NPC dialogue via Anthropic SDK with streaming responses, parallel conversations, and speech bubble indicators.

**Architecture:** Electron main process holds the API key and runs Anthropic SDK calls. IPC bridges main↔renderer via typed preload APIs. Renderer holds a ConversationManager (in-memory, `IConversationRepository` interface) that drives the React DialoguePanel and Phaser speech bubble indicators. Conversations are tagged by `agentId` for parallel support.

**Tech Stack:** Electron (safeStorage, IPC), @anthropic-ai/sdk, React 19, Phaser 3.90, TypeScript

---

## File Structure

### New Files

| File                                               | Responsibility                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/main/api-key.ts`                              | API key storage via safeStorage (encrypt/decrypt/check/clear)                                  |
| `src/main/chat.ts`                                 | Chat handler — manages streaming API calls, conversation history, concurrency queue            |
| `src/main/agents/system-prompts.ts`                | System prompt registry — RPG personas for all 10 built-in NPCs + AgentConfig type              |
| `src/renderer/src/services/ConversationManager.ts` | In-memory IConversationRepository — conversation state, streaming chunks, speech bubble events |
| `src/renderer/src/components/ui/ApiKeyModal.tsx`   | Simple modal for API key entry                                                                 |

### Modified Files

| File                                               | Changes                                           |
| -------------------------------------------------- | ------------------------------------------------- |
| `package.json`                                     | Add `@anthropic-ai/sdk` dependency                |
| `src/main/index.ts`                                | Register IPC handlers for chat and API key        |
| `src/preload/index.ts`                             | Expose chat + API key methods via contextBridge   |
| `src/preload/index.d.ts`                           | Type declarations for `window.api`                |
| `src/renderer/src/game/types.ts`                   | Add `npc:speech-bubble` event to `GameEvents`     |
| `src/renderer/src/game/entities/NPC.ts`            | Add speech bubble sprite + EventBus listener      |
| `src/renderer/src/components/ui/DialoguePanel.tsx` | Full overhaul — scrollable chat UI with streaming |
| `src/renderer/src/App.tsx`                         | Add ApiKeyModal, wire ConversationManager         |
| `src/renderer/src/i18n/locales/zh-TW.json`         | Add dialogue + apiKey i18n keys                   |
| `src/renderer/src/i18n/locales/en.json`            | Add dialogue + apiKey i18n keys                   |

---

## Chunk 1: API Key Management

### Task 1: API Key Storage (Main Process)

**Files:**

- Create: `src/main/api-key.ts`

- [ ] **Step 1: Create api-key module**

`src/main/api-key.ts`:

```typescript
import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

const KEY_FILE = 'anthropic-key.enc'

function getKeyPath(): string {
  return join(app.getPath('userData'), KEY_FILE)
}

export function storeApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system')
  }
  const encrypted = safeStorage.encryptString(key)
  writeFileSync(getKeyPath(), encrypted)
}

export function getApiKey(): string | null {
  const keyPath = getKeyPath()
  if (!existsSync(keyPath)) return null
  const encrypted = readFileSync(keyPath)
  return safeStorage.decryptString(encrypted)
}

export function hasApiKey(): boolean {
  return existsSync(getKeyPath())
}

export function clearApiKey(): void {
  const keyPath = getKeyPath()
  if (existsSync(keyPath)) unlinkSync(keyPath)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/api-key.ts
git commit -m "feat: add API key storage via Electron safeStorage"
```

---

### Task 2: IPC — API Key Handlers + Preload Bridge

**Files:**

- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Add API key IPC handlers to main process**

In `src/main/index.ts`, add after the existing `ipcMain.on('ping', ...)`:

```typescript
import { storeApiKey, hasApiKey, clearApiKey } from './api-key'

ipcMain.handle('apikey:set', async (_event, key: string) => {
  if (typeof key !== 'string' || !key.startsWith('sk-ant-')) return false
  storeApiKey(key)
  return true
})

ipcMain.handle('apikey:check', async () => {
  return hasApiKey()
})

ipcMain.handle('apikey:clear', async () => {
  clearApiKey()
})
```

- [ ] **Step 2: Expose API key methods in preload**

In `src/preload/index.ts`, replace the `const api = {}` with:

```typescript
import { ipcRenderer } from 'electron'

const api = {
  setApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('apikey:set', key),
  checkApiKey: (): Promise<boolean> => ipcRenderer.invoke('apikey:check'),
  clearApiKey: (): Promise<void> => ipcRenderer.invoke('apikey:clear')
}
```

- [ ] **Step 3: Update preload type declarations**

Replace `src/preload/index.d.ts`:

```typescript
import { ElectronAPI } from '@electron-toolkit/preload'

interface ChatAPI {
  // API key
  setApiKey(key: string): Promise<boolean>
  checkApiKey(): Promise<boolean>
  clearApiKey(): Promise<void>
  // Chat (added in Task 5)
  sendMessage(agentId: string, message: string, locale: string): void
  cancelStream(agentId: string): void
  onStreamChunk(callback: (data: { agentId: string; chunk: string }) => void): () => void
  onStreamEnd(callback: (data: { agentId: string }) => void): () => void
  onStreamError(callback: (data: { agentId: string; error: string }) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ChatAPI
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: add API key IPC handlers and preload bridge"
```

---

### Task 3: API Key Modal (Renderer)

**Files:**

- Create: `src/renderer/src/components/ui/ApiKeyModal.tsx`
- Modify: `src/renderer/src/i18n/locales/zh-TW.json`
- Modify: `src/renderer/src/i18n/locales/en.json`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Add i18n keys for API key UI**

Add to `src/renderer/src/i18n/locales/zh-TW.json` (merge into existing object):

```json
"apiKey": {
  "title": "API 金鑰設定",
  "prompt": "請輸入你的 Anthropic API 金鑰",
  "placeholder": "sk-ant-...",
  "save": "儲存",
  "cancel": "取消"
},
"dialogue": {
  "placeholder": "......",
  "thinking": "思考中...",
  "inputPlaceholder": "輸入訊息...",
  "send": "發送",
  "connectionError": "通訊中斷...請檢查你的 API 金鑰",
  "noApiKey": "需要 API 金鑰才能與 NPC 對話",
  "setApiKey": "設定 API 金鑰",
  "apiKeySet": "API 金鑰已設定",
  "apiKeyInvalid": "API 金鑰格式不正確",
  "retry": "重試"
}
```

Add matching English keys to `src/renderer/src/i18n/locales/en.json`:

```json
"apiKey": {
  "title": "API Key Settings",
  "prompt": "Enter your Anthropic API key",
  "placeholder": "sk-ant-...",
  "save": "Save",
  "cancel": "Cancel"
},
"dialogue": {
  "placeholder": "......",
  "thinking": "Thinking...",
  "inputPlaceholder": "Type a message...",
  "send": "Send",
  "connectionError": "Connection lost... please check your API key",
  "noApiKey": "An API key is required to talk to NPCs",
  "setApiKey": "Set API Key",
  "apiKeySet": "API key saved",
  "apiKeyInvalid": "Invalid API key format",
  "retry": "Retry"
}
```

- [ ] **Step 2: Create ApiKeyModal component**

`src/renderer/src/components/ui/ApiKeyModal.tsx`:

```tsx
import { useState, useCallback } from 'react'
import { useTranslation } from '../../i18n'

interface ApiKeyModalProps {
  onClose: () => void
  onSaved: () => void
}

export function ApiKeyModal({ onClose, onSaved }: ApiKeyModalProps) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!key.trim()) return
    setSaving(true)
    setError('')
    const ok = await window.api.setApiKey(key.trim())
    setSaving(false)
    if (ok) {
      onSaved()
    } else {
      setError(t('dialogue.apiKeyInvalid'))
    }
  }, [key, t, onSaved])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        pointerEvents: 'auto',
        zIndex: 100
      }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 30, 0.95)',
          border: '3px solid rgba(200, 180, 140, 0.6)',
          padding: '24px',
          fontFamily: 'monospace',
          color: '#ffffff',
          width: 420,
          maxWidth: '90%'
        }}
      >
        <h3 style={{ color: '#c4a46c', margin: '0 0 12px' }}>{t('apiKey.title')}</h3>
        <p style={{ fontSize: 14, marginBottom: 12 }}>{t('apiKey.prompt')}</p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t('apiKey.placeholder')}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{
            width: '100%',
            padding: '8px',
            fontFamily: 'monospace',
            fontSize: 14,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(200,180,140,0.4)',
            color: '#fff',
            boxSizing: 'border-box'
          }}
        />
        {error && <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 4 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              fontFamily: 'monospace',
              background: 'transparent',
              border: '1px solid rgba(200,180,140,0.4)',
              color: '#aaa',
              cursor: 'pointer'
            }}
          >
            {t('apiKey.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !key.trim()}
            style={{
              padding: '6px 16px',
              fontFamily: 'monospace',
              background: 'rgba(200,180,140,0.3)',
              border: '1px solid rgba(200,180,140,0.6)',
              color: '#c4a46c',
              cursor: saving ? 'wait' : 'pointer'
            }}
          >
            {t('apiKey.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire ApiKeyModal into App.tsx**

In `src/renderer/src/App.tsx`, add state for the modal and expose a way to open it (e.g., from DialoguePanel when no key is set):

```tsx
import { useState } from 'react'
import { ApiKeyModal } from './components/ui/ApiKeyModal'

// Inside App component, add:
const [showApiKeyModal, setShowApiKeyModal] = useState(false)

// In the overlay div, add:
{
  showApiKeyModal && (
    <ApiKeyModal
      onClose={() => setShowApiKeyModal(false)}
      onSaved={() => setShowApiKeyModal(false)}
    />
  )
}
```

Also expose `setShowApiKeyModal` to child components. The simplest approach for Phase 2: pass it as a prop to `DialoguePanel`, or use the EventBus with a new event. Use a simple React context or direct prop — keep it minimal.

- [ ] **Step 4: Verify the modal renders**

```bash
npm run dev
```

Manually toggle the modal (temporarily set `showApiKeyModal` default to `true`). Verify it renders, accepts input, and calls `window.api.setApiKey`. Reset default to `false`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/ApiKeyModal.tsx src/renderer/src/App.tsx src/renderer/src/i18n/locales/
git commit -m "feat: add API key modal and i18n keys for dialogue"
```

---

## Chunk 2: Main Process AI Integration

### Task 4: Install Anthropic SDK + System Prompt Registry

**Files:**

- Modify: `package.json`
- Create: `src/main/agents/system-prompts.ts`

- [ ] **Step 1: Install Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

This is a main-process-only dependency. electron-vite's main process config will bundle it.

- [ ] **Step 2: Create system prompt registry**

`src/main/agents/system-prompts.ts`:

Define `AgentConfig` interface and a `Map` of all 10 built-in NPC configs.

```typescript
export interface AgentConfig {
  id: string
  systemPrompt: string
  model: string
  maxTokens: number
  temperature: number
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_MAX_TOKENS = 1024
const DEFAULT_TEMPERATURE = 0.7

// TODO(phase-4): Allow custom system prompts via Guild Hall
const BUILT_IN_AGENTS: AgentConfig[] = [
  {
    id: 'elder',
    systemPrompt: `你是「長老」，克勞德鎮上最年長、最有智慧的居民。你住在城鎮廣場，是每位新冒險者抵達時第一個遇見的人。

性格：你慈祥、有耐心，喜歡用諺語和比喻說話。你稱呼玩家為「年輕的冒險者」。你見證過許多冒險者來來去去，因此對世事有深刻的洞察。

能力：你擅長引導和教學。你可以回答關於這個世界的問題、提供人生建議，並引導冒險者找到適合的 NPC 完成任務。

重要：用玩家使用的語言回覆。保持角色扮演，但要真正有幫助。`,
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  },
  {
    id: 'guildMaster',
    systemPrompt: `你是「會長」，公會大廳的管理者。你負責管理所有冒險者和他們的隊伍。

性格：你威嚴但鼓勵人心，說話直接，常用公會術語。你關心每位冒險者的成長。

能力：你擅長組織管理、團隊建設和策略規劃。你可以幫助冒險者了解自己的能力、建議隊伍組成。

重要：用玩家使用的語言回覆。保持角色扮演，但要真正有幫助。`,
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  },
  {
    id: 'scholar',
    systemPrompt: `你是「學者」，駐守在圖書館的博學研究者。你對知識有無盡的渴望。

性格：你好奇心旺盛、分析力強、做事徹底。你喜歡引用文獻，說話帶有學術腔調。你會為了有趣的問題而興奮。

能力：你擅長研究、資料搜尋、文獻摘要、資訊比較分析。你可以幫助冒險者調查任何主題。

重要：用玩家使用的語言回覆。保持角色扮演，但要真正有幫助。`,
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  },
  {
    id: 'scribe',
    systemPrompt: `你是「書記官」，書記工坊的主人。你是鎮上最傑出的文字匠人。

性格：你一絲不苟、富有詩意、對文字有極高的品味。你追求完美的措辭和優雅的表達。

能力：你擅長各種寫作任務——起草郵件、撰寫文章、編輯文稿、翻譯文本。你對語言有深刻的理解。

重要：用玩家使用的語言回覆。保持角色扮演，但要真正有幫助。`,
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  },
  {
    id: 'merchant',
    systemPrompt: `你是「商人」，市場上最精明的交易者。你對數據和商業有敏銳的洞察力。

性格：你務實、機智、說話犀利。你喜歡用商業比喻，重視效率。你能一眼看穿數據中的規律。

能力：你擅長數據分析、CSV 處理、圖表解讀、數學計算、商業分析。

重要：用玩家使用的語言回覆。保持角色扮演，但要真正有幫助。`,
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  },
  {
    id: 'commander',
    systemPrompt: `你是「指揮官」，駐守在市場的戰略家和組織大師。

性格：你紀律嚴明、說話直接、思維有條理。你用軍事化的精確度處理每個任務，回覆結構清晰。

能力：你擅長任務規劃、時間管理、清單製作、專案排程、流程優化。你把每個任務都當作一場戰役來規劃。

重要：用玩家使用的語言回覆。保持角色扮演，但要真正有幫助。`,
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  },
  {
    id: 'artisan',
    systemPrompt: `你是「匠師」，匠師工坊的創意大師。你用藝術的眼光看待一切。

性格：你富有創意、善於表達、思維活躍。你喜歡用藝術和視覺的比喻，總是在腦海中構思畫面。

能力：你擅長設計反饋、視覺概念、色彩建議、排版建議、創意發想。你能幫冒險者把抽象想法變成具體的視覺方案。

重要：用玩家使用的語言回覆。保持角色扮演，但要真正有幫助。`,
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  },
  {
    id: 'herald',
    systemPrompt: `你是「傳令使」，傳令站的外交官和溝通專家。

性格：你外交手腕高明、溫暖親切、表達清晰。你正式但不失親和力，是連結不同人的橋樑。

能力：你擅長起草訊息、翻譯、會議摘要、溝通策略。你能幫冒險者用最恰當的方式傳達訊息。

重要：用玩家使用的語言回覆。保持角色扮演，但要真正有幫助。`,
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  },
  {
    id: 'wizard',
    systemPrompt: `你是「巫師」，居住在高塔中的神秘程式法師。

性格：你神秘莫測、精確嚴謹、說話帶有謎語色彩。你把程式碼視為魔法咒語，把除錯當作破解詛咒。

能力：你擅長寫程式、除錯、自動化腳本、技術問題解答。你用魔法的比喻解釋技術概念，但技術內容絕對準確。

重要：用玩家使用的語言回覆。保持角色扮演，但要真正有幫助。`,
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  },
  {
    id: 'bartender',
    systemPrompt: `你是「酒保」，酒館的老闆。你認識鎮上的每個人，知道所有的八卦。

性格：你友善、健談、消息靈通。你說話隨意自然，像個老朋友。你對鎮上的一切瞭若指掌。

能力：你是萬事通，可以閒聊、提供建議、介紹其他 NPC 的專長。你也負責管理任務看板和隊伍組建。

重要：用玩家使用的語言回覆。保持角色扮演，但要真正有幫助。`,
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  }
]

const agentMap = new Map<string, AgentConfig>(BUILT_IN_AGENTS.map((a) => [a.id, a]))

export function getAgentConfig(agentId: string): AgentConfig | undefined {
  return agentMap.get(agentId)
}

export function getAllAgentConfigs(): AgentConfig[] {
  return BUILT_IN_AGENTS
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/main/agents/
git commit -m "feat: install Anthropic SDK and add NPC system prompt registry"
```

---

### Task 5: Chat Handler (Main Process)

**Files:**

- Create: `src/main/chat.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Create chat handler**

`src/main/chat.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { WebContents } from 'electron'
import { getApiKey } from './api-key'
import { getAgentConfig } from './agents/system-prompts'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ActiveStream {
  agentId: string
  controller: AbortController
}

const MAX_CONCURRENT_STREAMS = 3
const MAX_HISTORY_MESSAGES = 50

const conversationHistories = new Map<string, Message[]>()
const activeStreams = new Map<string, ActiveStream>()
const pendingQueue: Array<{
  agentId: string
  message: string
  locale: string
  webContents: WebContents
}> = []

function getOrCreateHistory(agentId: string): Message[] {
  if (!conversationHistories.has(agentId)) {
    conversationHistories.set(agentId, [])
  }
  return conversationHistories.get(agentId)!
}

function trimHistory(messages: Message[]): Message[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages
  // Trim from the front, ensuring we start on a 'user' message boundary
  // so the Anthropic API receives a valid alternating sequence
  let startIndex = messages.length - MAX_HISTORY_MESSAGES
  while (startIndex < messages.length && messages[startIndex].role !== 'user') {
    startIndex++
  }
  return messages.slice(startIndex)
}

function processQueue(): void {
  while (pendingQueue.length > 0 && activeStreams.size < MAX_CONCURRENT_STREAMS) {
    const next = pendingQueue.shift()!
    executeStream(next.agentId, next.message, next.locale, next.webContents)
  }
}

async function executeStream(
  agentId: string,
  message: string,
  locale: string,
  webContents: WebContents
): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) {
    webContents.send('chat:stream-error', { agentId, error: 'no-api-key' })
    return
  }

  const config = getAgentConfig(agentId)
  if (!config) {
    webContents.send('chat:stream-error', { agentId, error: `Unknown agent: ${agentId}` })
    return
  }

  const history = getOrCreateHistory(agentId)
  history.push({ role: 'user', content: message })

  const controller = new AbortController()
  activeStreams.set(agentId, { agentId, controller })

  const client = new Anthropic({ apiKey })
  const systemPrompt =
    locale === 'en'
      ? config.systemPrompt + '\n\nThe player is using English. Respond in English.'
      : config.systemPrompt

  try {
    const stream = client.messages.stream(
      {
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        system: systemPrompt,
        messages: trimHistory(history).map((m) => ({ role: m.role, content: m.content }))
      },
      { signal: controller.signal }
    )

    let fullResponse = ''

    stream.on('text', (text) => {
      fullResponse += text
      if (!webContents.isDestroyed()) {
        webContents.send('chat:stream-chunk', { agentId, chunk: text })
      }
    })

    await stream.finalMessage()

    history.push({ role: 'assistant', content: fullResponse })

    if (!webContents.isDestroyed()) {
      webContents.send('chat:stream-end', { agentId })
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    if (!webContents.isDestroyed()) {
      webContents.send('chat:stream-error', { agentId, error })
    }
  } finally {
    activeStreams.delete(agentId)
    processQueue()
  }
}

export function handleSendMessage(
  agentId: string,
  message: string,
  locale: string,
  webContents: WebContents
): void {
  if (activeStreams.size >= MAX_CONCURRENT_STREAMS) {
    pendingQueue.push({ agentId, message, locale, webContents })
  } else {
    executeStream(agentId, message, locale, webContents)
  }
}

export function cancelStream(agentId: string): void {
  const stream = activeStreams.get(agentId)
  if (stream) {
    stream.controller.abort()
    activeStreams.delete(agentId)
    processQueue()
  }
}
```

- [ ] **Step 2: Register chat IPC handlers in main process**

In `src/main/index.ts`, add after the API key handlers:

```typescript
import { handleSendMessage, cancelStream } from './chat'

ipcMain.on('chat:send-message', (event, { agentId, message, locale }) => {
  handleSendMessage(agentId, message, locale, event.sender)
})

ipcMain.on('chat:cancel-stream', (_event, { agentId }) => {
  cancelStream(agentId)
})
```

- [ ] **Step 3: Add chat methods to preload bridge**

In `src/preload/index.ts`, extend the `api` object:

```typescript
const api = {
  // API key
  setApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('apikey:set', key),
  checkApiKey: (): Promise<boolean> => ipcRenderer.invoke('apikey:check'),
  clearApiKey: (): Promise<void> => ipcRenderer.invoke('apikey:clear'),

  // Chat
  sendMessage: (agentId: string, message: string, locale: string): void =>
    ipcRenderer.send('chat:send-message', { agentId, message, locale }),
  cancelStream: (agentId: string): void => ipcRenderer.send('chat:cancel-stream', { agentId }),
  onStreamChunk: (callback: (data: { agentId: string; chunk: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { agentId: string; chunk: string }) => callback(data)
    ipcRenderer.on('chat:stream-chunk', handler)
    return () => ipcRenderer.removeListener('chat:stream-chunk', handler)
  },
  onStreamEnd: (callback: (data: { agentId: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { agentId: string }) => callback(data)
    ipcRenderer.on('chat:stream-end', handler)
    return () => ipcRenderer.removeListener('chat:stream-end', handler)
  },
  onStreamError: (callback: (data: { agentId: string; error: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { agentId: string; error: string }) => callback(data)
    ipcRenderer.on('chat:stream-error', handler)
    return () => ipcRenderer.removeListener('chat:stream-error', handler)
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/main/chat.ts src/main/index.ts src/preload/index.ts
git commit -m "feat: add streaming chat handler with concurrency queue and IPC bridge"
```

---

## Chunk 3: Renderer Conversation Layer

### Task 6: ConversationManager Service

**Files:**

- Create: `src/renderer/src/services/ConversationManager.ts`
- Modify: `src/renderer/src/game/types.ts`

- [ ] **Step 1: Add speech bubble event to GameEvents**

In `src/renderer/src/game/types.ts`, add to the `GameEvents` interface:

```typescript
'npc:speech-bubble': { agentId: string; visible: boolean }
```

- [ ] **Step 2: Create ConversationManager**

`src/renderer/src/services/ConversationManager.ts`:

```typescript
import { EventBus } from '../game/EventBus'

// TODO(phase-3): Replace InMemoryConversationRepository with SQLiteConversationRepository
export interface IConversationRepository {
  getConversation(agentId: string): Conversation | null
  getOrCreateConversation(agentId: string): Conversation
  appendMessage(agentId: string, message: Message): void
  appendStreamChunk(agentId: string, chunk: string): void
  finalizeStream(agentId: string): void
  markStreamError(agentId: string): void
  getStreamingState(agentId: string): StreamingState
}

export interface Conversation {
  agentId: string
  messages: Message[]
  streamingState: StreamingState
  hasUnread: boolean
  // TODO(phase-3): Add id, playerId, skillCategory, xpEarned, status, timestamps
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export type StreamingState = 'idle' | 'streaming' | 'error'

type Listener = () => void

class InMemoryConversationRepository implements IConversationRepository {
  private conversations = new Map<string, Conversation>()
  private listeners: Listener[] = []
  private activeDialogueAgentId: string | null = null
  private version = 0

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  /** Returns a version number that increments on every change — used by useSyncExternalStore */
  getVersion(): number {
    return this.version
  }

  private notify(): void {
    this.version++
    for (const listener of this.listeners) listener()
  }

  setActiveDialogue(agentId: string | null): void {
    this.activeDialogueAgentId = agentId
    if (agentId) {
      const conv = this.conversations.get(agentId)
      if (conv?.hasUnread) {
        conv.hasUnread = false
        EventBus.emit('npc:speech-bubble', { agentId, visible: false })
        this.notify()
      }
    }
  }

  getConversation(agentId: string): Conversation | null {
    return this.conversations.get(agentId) ?? null
  }

  getOrCreateConversation(agentId: string): Conversation {
    if (!this.conversations.has(agentId)) {
      this.conversations.set(agentId, {
        agentId,
        messages: [],
        streamingState: 'idle',
        hasUnread: false
      })
    }
    return this.conversations.get(agentId)!
  }

  appendMessage(agentId: string, message: Message): void {
    const conv = this.getOrCreateConversation(agentId)
    conv.messages.push(message)
    this.notify()
  }

  appendStreamChunk(agentId: string, chunk: string): void {
    const conv = this.getOrCreateConversation(agentId)
    const wasStreaming = conv.streamingState === 'streaming'
    conv.streamingState = 'streaming'

    // If already streaming, append to the in-progress assistant message
    // Otherwise, create a new assistant message for this stream
    if (wasStreaming) {
      const last = conv.messages[conv.messages.length - 1]
      if (last && last.role === 'assistant') {
        last.content += chunk
      }
    } else {
      conv.messages.push({ role: 'assistant', content: chunk, timestamp: Date.now() })
    }

    // Speech bubble if this NPC's dialogue isn't open
    if (this.activeDialogueAgentId !== agentId && !conv.hasUnread) {
      conv.hasUnread = true
      EventBus.emit('npc:speech-bubble', { agentId, visible: true })
    }

    this.notify()
  }

  finalizeStream(agentId: string): void {
    const conv = this.conversations.get(agentId)
    if (conv) {
      conv.streamingState = 'idle'
      this.notify()
    }
  }

  markStreamError(agentId: string): void {
    const conv = this.conversations.get(agentId)
    if (conv) {
      conv.streamingState = 'error'
      this.notify()
    }
  }

  getStreamingState(agentId: string): StreamingState {
    return this.conversations.get(agentId)?.streamingState ?? 'idle'
  }
}

// Singleton instance
// TODO(phase-3): Replace with SQLite-backed implementation
export const conversationManager = new InMemoryConversationRepository()
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/services/ConversationManager.ts src/renderer/src/game/types.ts
git commit -m "feat: add ConversationManager with IConversationRepository interface"
```

---

### Task 7: Wire IPC Listeners to ConversationManager

**Files:**

- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Set up IPC listeners in App.tsx**

In `src/renderer/src/App.tsx`, add a `useEffect` that connects the preload IPC callbacks to the ConversationManager:

```tsx
import { useEffect } from 'react'
import { conversationManager } from './services/ConversationManager'

// Inside App component:
useEffect(() => {
  const cleanupChunk = window.api.onStreamChunk(({ agentId, chunk }) => {
    conversationManager.appendStreamChunk(agentId, chunk)
  })
  const cleanupEnd = window.api.onStreamEnd(({ agentId }) => {
    conversationManager.finalizeStream(agentId)
  })
  const cleanupError = window.api.onStreamError(({ agentId }) => {
    conversationManager.markStreamError(agentId)
  })

  return () => {
    cleanupChunk()
    cleanupEnd()
    cleanupError()
  }
}, [])
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: wire IPC stream listeners to ConversationManager"
```

---

## Chunk 4: Dialogue Panel Overhaul

### Task 8: Overhaul DialoguePanel to Streaming Chat UI

**Files:**

- Modify: `src/renderer/src/components/ui/DialoguePanel.tsx`

This is the largest single task — transforming the placeholder panel into a real chat UI with message history, streaming display, and text input.

- [ ] **Step 1: Rewrite DialoguePanel**

Replace `src/renderer/src/components/ui/DialoguePanel.tsx` with the full chat UI:

```tsx
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { EventBus } from '../../game/EventBus'
import { useTranslation } from '../../i18n'
import { BUILT_IN_NPCS } from '../../game/data/npcs'
import { conversationManager } from '../../services/ConversationManager'
import type { Conversation } from '../../services/ConversationManager'

interface DialogueState {
  agentId: string
  npcName: string
}

interface DialoguePanelProps {
  onRequestApiKey: () => void
}

export function DialoguePanel({ onRequestApiKey }: DialoguePanelProps) {
  const { t, locale } = useTranslation()
  const [dialogue, setDialogue] = useState<DialogueState | null>(null)
  const [input, setInput] = useState('')
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Subscribe to ConversationManager changes — version counter ensures React detects mutations
  const _version = useSyncExternalStore(
    (cb) => conversationManager.subscribe(cb),
    () => conversationManager.getVersion()
  )
  const conversation = dialogue ? conversationManager.getConversation(dialogue.agentId) : null

  // Check API key on mount
  useEffect(() => {
    window.api.checkApiKey().then(setHasApiKey)
  }, [])

  // Open dialogue on NPC interact
  useEffect(() => {
    const handler = (data: { agentId: string }) => {
      const npc = BUILT_IN_NPCS.find((n) => n.id === data.agentId)
      const npcName = npc?.name[locale] ?? npc?.name['zh-TW'] ?? data.agentId
      setDialogue({ agentId: data.agentId, npcName })
      conversationManager.setActiveDialogue(data.agentId)
      conversationManager.getOrCreateConversation(data.agentId)
      // Re-check API key each time
      window.api.checkApiKey().then(setHasApiKey)
    }
    EventBus.on('npc:interact', handler)
    return () => {
      EventBus.off('npc:interact', handler)
    }
  }, [locale])

  // Close handler
  const close = useCallback(() => {
    if (dialogue) {
      EventBus.emit('dialogue:closed', { agentId: dialogue.agentId })
      conversationManager.setActiveDialogue(null)
      setDialogue(null)
      setInput('')
    }
  }, [dialogue])

  // Escape key
  useEffect(() => {
    if (!dialogue) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [dialogue, close])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [
    conversation?.messages.length,
    conversation?.messages[conversation.messages.length - 1]?.content
  ])

  // Send message
  const send = useCallback(() => {
    if (!dialogue || !input.trim()) return
    if (!hasApiKey) {
      onRequestApiKey()
      return
    }
    const text = input.trim()
    setInput('')
    conversationManager.appendMessage(dialogue.agentId, {
      role: 'user',
      content: text,
      timestamp: Date.now()
    })
    window.api.sendMessage(dialogue.agentId, text, locale)
  }, [dialogue, input, hasApiKey, locale, onRequestApiKey])

  if (!dialogue) return null

  const isStreaming = conversation?.streamingState === 'streaming'
  const messages = conversation?.messages ?? []

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '35%',
        background: 'rgba(10, 10, 30, 0.93)',
        border: '3px solid rgba(200, 180, 140, 0.6)',
        borderBottom: 'none',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'monospace',
        color: '#ffffff',
        pointerEvents: 'auto'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid rgba(200, 180, 140, 0.3)',
          fontWeight: 'bold',
          fontSize: 16,
          color: '#c4a46c',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}
      >
        <span>{dialogue.npcName}</span>
        <span onClick={close} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12 }}>
          {t('interaction.close')}
        </span>
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ opacity: 0.4, fontSize: 14 }}>{t('dialogue.placeholder')}</div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              textAlign: msg.role === 'user' ? 'right' : 'left'
            }}
          >
            <div
              style={{
                display: 'inline-block',
                maxWidth: '80%',
                padding: '6px 10px',
                borderRadius: 4,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                background:
                  msg.role === 'user' ? 'rgba(100, 140, 200, 0.25)' : 'rgba(200, 180, 140, 0.15)',
                border:
                  msg.role === 'user'
                    ? '1px solid rgba(100, 140, 200, 0.3)'
                    : '1px solid rgba(200, 180, 140, 0.2)'
              }}
            >
              {msg.content}
              {/* Blinking cursor for streaming */}
              {msg.role === 'assistant' && i === messages.length - 1 && isStreaming && (
                <span style={{ animation: 'blink 1s step-end infinite' }}>▌</span>
              )}
            </div>
          </div>
        ))}
        {/* Error state */}
        {conversation?.streamingState === 'error' && (
          <div style={{ padding: '6px 10px', color: '#ff6b6b', fontSize: 13 }}>
            {t('dialogue.connectionError')}{' '}
            <span
              onClick={() => {
                // Retry: re-send the last user message
                const lastUserMsg = [...(conversation?.messages ?? [])]
                  .reverse()
                  .find((m) => m.role === 'user')
                if (lastUserMsg && dialogue) {
                  conversationManager.getOrCreateConversation(dialogue.agentId).streamingState =
                    'idle'
                  window.api.sendMessage(dialogue.agentId, lastUserMsg.content, locale)
                }
              }}
              style={{ color: '#c4a46c', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {t('dialogue.retry')}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!hasApiKey ? (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(200, 180, 140, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: 13, opacity: 0.7 }}>{t('dialogue.noApiKey')}</span>
          <button
            onClick={onRequestApiKey}
            style={{
              padding: '4px 12px',
              fontFamily: 'monospace',
              fontSize: 12,
              background: 'rgba(200,180,140,0.3)',
              border: '1px solid rgba(200,180,140,0.6)',
              color: '#c4a46c',
              cursor: 'pointer'
            }}
          >
            {t('dialogue.setApiKey')}
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(200, 180, 140, 0.3)',
            display: 'flex',
            gap: 8,
            flexShrink: 0
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={t('dialogue.inputPlaceholder')}
            disabled={isStreaming}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontFamily: 'monospace',
              fontSize: 14,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(200,180,140,0.3)',
              color: '#fff',
              outline: 'none'
            }}
          />
          <button
            onClick={send}
            disabled={isStreaming || !input.trim()}
            style={{
              padding: '6px 16px',
              fontFamily: 'monospace',
              fontSize: 14,
              background: isStreaming ? 'rgba(100,100,100,0.3)' : 'rgba(200,180,140,0.3)',
              border: '1px solid rgba(200,180,140,0.6)',
              color: '#c4a46c',
              cursor: isStreaming ? 'wait' : 'pointer'
            }}
          >
            {t('dialogue.send')}
          </button>
        </div>
      )}

      {/* Blink animation */}
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx to pass onRequestApiKey prop**

In `src/renderer/src/App.tsx`, update the DialoguePanel usage:

```tsx
<DialoguePanel onRequestApiKey={() => setShowApiKeyModal(true)} />
```

Also update the `ApiKeyModal` `onSaved` callback to refresh the API key check state — the simplest approach is to just close the modal (DialoguePanel re-checks on each NPC interact).

- [ ] **Step 3: Verify the full chat flow**

```bash
npm run dev
```

1. Walk to an NPC, press Space → dialogue opens
2. If no API key → "需要 API 金鑰" message with button → opens modal
3. Set a valid API key
4. Type a message, press Enter → message appears right-aligned
5. NPC streams a response with blinking cursor
6. Press Escape → dialogue closes

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/DialoguePanel.tsx src/renderer/src/App.tsx
git commit -m "feat: overhaul DialoguePanel to streaming chat UI with parallel conversation support"
```

---

## Chunk 5: Speech Bubble Indicators

### Task 9: NPC Speech Bubble Sprites

**Files:**

- Modify: `src/renderer/src/game/entities/NPC.ts`

- [ ] **Step 1: Add speech bubble to NPC class**

Extend `src/renderer/src/game/entities/NPC.ts` to listen for `npc:speech-bubble` events and show/hide a visual indicator:

```typescript
import { EventBus } from '../EventBus'

// Inside the NPC class, add:
private speechBubble: Phaser.GameObjects.Graphics | null = null
private onSpeechBubble: (data: { agentId: string; visible: boolean }) => void

// In constructor, after the idle bob tween:
this.onSpeechBubble = (data) => {
  if (data.agentId !== this.agentDef.id) return
  if (data.visible) {
    this.showSpeechBubble()
  } else {
    this.hideSpeechBubble()
  }
}
EventBus.on('npc:speech-bubble', this.onSpeechBubble)

// Add methods:
private showSpeechBubble(): void {
  if (this.speechBubble) return
  this.speechBubble = this.scene.add.graphics()
  // Draw a small white speech bubble
  this.speechBubble.fillStyle(0xffffff, 0.9)
  this.speechBubble.fillRoundedRect(-6, -6, 12, 10, 3)
  // Small triangle pointer
  this.speechBubble.fillTriangle(-2, 4, 2, 4, 0, 8)
  // Position relative to NPC — offset above head
  this.speechBubble.setPosition(this.x, this.y - 14)
  this.speechBubble.setDepth(9999)

  // Bob animation on the speech bubble itself (independent of NPC bob)
  // Use a Phaser update event to track NPC position so bubble follows the NPC's idle bob
  this.scene.events.on('update', this.updateSpeechBubblePosition, this)
}

private updateSpeechBubblePosition(): void {
  if (this.speechBubble) {
    this.speechBubble.setPosition(this.x, this.y - 14)
  }
}

private hideSpeechBubble(): void {
  if (this.speechBubble) {
    this.scene.events.off('update', this.updateSpeechBubblePosition, this)
    this.speechBubble.destroy()
    this.speechBubble = null
  }
}

// Clean up on destroy
destroy(fromScene?: boolean): void {
  EventBus.off('npc:speech-bubble', this.onSpeechBubble)
  this.hideSpeechBubble()
  super.destroy(fromScene)
}
```

- [ ] **Step 2: Verify speech bubbles appear**

```bash
npm run dev
```

1. Talk to NPC A, send a message
2. Press Escape to close dialogue while NPC is still streaming
3. Observe: white speech bubble appears above NPC A
4. Walk back to NPC A, press Space → speech bubble disappears, dialogue shows the response

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/game/entities/NPC.ts
git commit -m "feat: add speech bubble indicators for NPCs with pending responses"
```

---

## Chunk 6: End-to-End Verification & Polish

### Task 10: TypeScript Check + Full Walkthrough

**Files:**

- Possibly minor edits across multiple files

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Full walkthrough test**

Run `npm run dev` and verify the complete Phase 2 flow:

1. **No API key flow:** Walk to NPC, press Space → dialogue shows "需要 API 金鑰" → click button → modal opens → enter key → modal closes
2. **Single conversation:** Walk to NPC, press Space → type message → Enter → NPC streams response with blinking cursor → response completes → type another message → conversation history preserved
3. **Parallel conversations:** Talk to Scholar, send message → press Escape mid-stream → speech bubble appears on Scholar → walk to Scribe, press Space → send message → Scribe starts responding → press Escape → walk back to Scholar → press Space → see Scholar's completed response → no speech bubble
4. **Context switching:** Talk to NPC A (history exists) → close → talk to NPC B → close → talk to NPC A → previous messages visible
5. **Error handling:** Set invalid API key → try to chat → error message appears
6. **i18n:** Verify all new strings appear in zh-TW. If testing English: change browser locale.

- [ ] **Step 3: Production build test**

```bash
npm run build
```

Expected: Build completes without errors.

- [ ] **Step 4: Commit any polish fixes**

```bash
git add -A
git commit -m "fix: phase 2 polish and cleanup"
```

---

## Verification

**How to test the complete Phase 2:**

```bash
npm run dev
```

1. Walk to any NPC → press Space → dialogue opens
2. First time: prompted for API key → enter key → saved
3. Type a message → NPC responds in character (streaming)
4. Walk away mid-stream → speech bubble on NPC
5. Talk to another NPC → parallel conversation
6. Return to first NPC → see completed response, bubble gone
7. All text in zh-TW, NPC speaks in character

**Build test:**

```bash
npm run build
```

Should complete without errors.

---

## Key Files Reference

| File                                               | Responsibility                                         |
| -------------------------------------------------- | ------------------------------------------------------ |
| `src/main/api-key.ts`                              | API key storage via safeStorage                        |
| `src/main/chat.ts`                                 | Streaming chat handler with concurrency queue          |
| `src/main/agents/system-prompts.ts`                | NPC system prompts and AgentConfig registry            |
| `src/main/index.ts`                                | IPC handler registration                               |
| `src/preload/index.ts`                             | contextBridge API surface                              |
| `src/preload/index.d.ts`                           | Window.api type declarations                           |
| `src/renderer/src/services/ConversationManager.ts` | In-memory conversation state (IConversationRepository) |
| `src/renderer/src/components/ui/DialoguePanel.tsx` | Streaming chat UI                                      |
| `src/renderer/src/components/ui/ApiKeyModal.tsx`   | API key entry modal                                    |
| `src/renderer/src/game/entities/NPC.ts`            | Speech bubble indicators                               |

## Notes

- **No tests for IPC/Phaser integration**: Electron IPC and Phaser rendering don't lend themselves to unit tests. Verification is manual via the walkthrough. ConversationManager could be unit-tested in a future pass.
- **System prompts are in zh-TW with a locale instruction**: Each prompt is written in Chinese but includes "用玩家使用的語言回覆" (respond in the player's language). The chat handler appends an English instruction when `locale === 'en'`.
- **TODO markers**: `TODO(phase-3)` on ConversationManager (SQLite), `TODO(phase-4)` on system prompt registry (custom agents).
