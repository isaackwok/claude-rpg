# IChatBackend Interface Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the monolithic `src/main/chat.ts` (812 lines) into a `src/main/chat/` directory with a pluggable `IChatBackend` interface, enabling future support for multiple AI providers.

**Architecture:** Strategy pattern — `ChatOrchestrator` owns side effects (XP, quests, achievements, persistence, queue) and delegates AI communication to an `IChatBackend` implementation. `ApiKeyChatBackend` wraps the existing Anthropic SDK logic. Provider-agnostic types (`ToolSchema`, `ToolResult`) ensure the interface doesn't leak SDK-specific types.

**Tech Stack:** TypeScript, Anthropic SDK, Electron IPC, Vitest

---

## File Map

| Action | File                                         | Responsibility                                                        |
| ------ | -------------------------------------------- | --------------------------------------------------------------------- |
| Create | `src/main/chat/types.ts`                     | `IChatBackend`, `StreamEvent`, `ChatOpts`, `ToolSchema`, `ToolResult` |
| Create | `src/main/chat/history.ts`                   | `ConversationHistoryManager` (Map, trim, orphan repair)               |
| Create | `src/main/chat/tool-confirm.ts`              | Tool confirmation + path approval flows                               |
| Create | `src/main/chat/api-key-backend.ts`           | `ApiKeyChatBackend` (Anthropic SDK streaming + tool loop)             |
| Create | `src/main/chat/orchestrator.ts`              | `ChatOrchestrator` (side effects, queue, tool/path confirmation)      |
| Create | `src/main/chat/index.ts`                     | Re-exports for backwards-compatible imports                           |
| Modify | `src/main/index.ts:6-14,113-121`             | Import path + orchestrator wiring                                     |
| Delete | `src/main/chat.ts`                           | Replaced by `src/main/chat/` directory                                |
| Create | `src/main/__tests__/history.test.ts`         | Unit tests for ConversationHistoryManager                             |
| Create | `src/main/__tests__/api-key-backend.test.ts` | Unit tests for ApiKeyChatBackend                                      |
| Create | `src/main/__tests__/orchestrator.test.ts`    | Unit tests for ChatOrchestrator                                       |

---

### Task 1: Create `types.ts` — provider-agnostic interface

**Files:**

- Create: `src/main/chat/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/main/chat/types.ts
import type { AgentId, ToolName } from '../../shared/types'

// ── Provider-agnostic types ──────────────────────────────────────────

/** Provider-agnostic tool definition (JSON Schema — universal across providers) */
export interface ToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** Provider-agnostic tool result */
export interface ToolResult {
  toolCallId: string
  content: string
  isError?: boolean
}

// ── Stream & interface types ─────────────────────────────────────────

/** A single tool invocation request from the AI */
export interface ToolCall {
  toolCallId: string
  toolName: ToolName
  args: Record<string, unknown>
}

export type StreamEvent =
  | { type: 'text'; chunk: string }
  | { type: 'tool_use'; calls: ToolCall[] }
  | { type: 'end' }
  | { type: 'error'; error: string }

export interface ChatOpts {
  agentId: AgentId
  systemPrompt: string
  tools: ToolSchema[]
  model: string
  maxTokens: number
  temperature: number
}

export interface IChatBackend {
  /** Start or continue a conversation. Returns an async iterable of stream events. */
  sendMessage(opts: ChatOpts, message: string): AsyncIterable<StreamEvent>

  /** Provide tool results back to the backend mid-conversation */
  supplyToolResults(agentId: AgentId, results: ToolResult[]): void

  /** Cancel an active stream */
  cancelStream(agentId: AgentId): void

  /** Clear conversation history for an agent */
  clearHistory(agentId: AgentId): void
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `src/main/chat/types.ts`

- [ ] **Step 3: Commit**

```bash
git add src/main/chat/types.ts
git commit -m "refactor(chat): add IChatBackend interface and provider-agnostic types"
```

---

### Task 2: Create `history.ts` — ConversationHistoryManager

**Files:**

- Create: `src/main/chat/history.ts`
- Create: `src/main/__tests__/history.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/__tests__/history.test.ts
import { describe, it, expect } from 'vitest'
import { ConversationHistoryManager } from '../chat/history'

describe('ConversationHistoryManager', () => {
  describe('getOrCreate', () => {
    it('returns empty array for new agent', () => {
      const mgr = new ConversationHistoryManager()
      const history = mgr.getOrCreate('wizard')
      expect(history).toEqual([])
    })

    it('returns same array on subsequent calls', () => {
      const mgr = new ConversationHistoryManager()
      const h1 = mgr.getOrCreate('wizard')
      h1.push({ role: 'user', content: 'hello' })
      const h2 = mgr.getOrCreate('wizard')
      expect(h2).toBe(h1)
      expect(h2).toHaveLength(1)
    })
  })

  describe('trim', () => {
    it('returns messages unchanged when under limit', () => {
      const mgr = new ConversationHistoryManager()
      const msgs = [
        { role: 'user' as const, content: 'hello' },
        { role: 'assistant' as const, content: 'hi' }
      ]
      expect(mgr.trim(msgs)).toBe(msgs)
    })

    it('trims to last 50 messages starting from a user message', () => {
      const mgr = new ConversationHistoryManager()
      const msgs = Array.from({ length: 60 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `msg-${i}`
      }))
      const trimmed = mgr.trim(msgs)
      expect(trimmed.length).toBeLessThanOrEqual(50)
      expect(trimmed[0].role).toBe('user')
    })
  })

  describe('repairOrphanedToolUse', () => {
    it('inserts error results for tool_use without matching tool_result', () => {
      const mgr = new ConversationHistoryManager()
      const history = [
        { role: 'user' as const, content: 'do something' },
        {
          role: 'assistant' as const,
          content: [{ type: 'tool_use' as const, id: 'tool-1', name: 'read_file', input: {} }]
        }
        // Missing tool_result user message
      ]
      mgr.repairOrphanedToolUse(history)
      expect(history).toHaveLength(3)
      const repaired = history[2]
      expect(repaired.role).toBe('user')
      expect(Array.isArray(repaired.content)).toBe(true)
      const blocks = repaired.content as Array<{
        type: string
        tool_use_id: string
        is_error: boolean
      }>
      expect(blocks[0].type).toBe('tool_result')
      expect(blocks[0].tool_use_id).toBe('tool-1')
      expect(blocks[0].is_error).toBe(true)
    })

    it('does nothing when tool_results are present', () => {
      const mgr = new ConversationHistoryManager()
      const history = [
        { role: 'user' as const, content: 'do something' },
        {
          role: 'assistant' as const,
          content: [{ type: 'tool_use' as const, id: 'tool-1', name: 'read_file', input: {} }]
        },
        {
          role: 'user' as const,
          content: [{ type: 'tool_result' as const, tool_use_id: 'tool-1', content: 'ok' }]
        }
      ]
      mgr.repairOrphanedToolUse(history)
      expect(history).toHaveLength(3)
    })
  })

  describe('clear', () => {
    it('removes history for specified agent', () => {
      const mgr = new ConversationHistoryManager()
      const h = mgr.getOrCreate('wizard')
      h.push({ role: 'user', content: 'hello' })
      mgr.clear('wizard')
      const h2 = mgr.getOrCreate('wizard')
      expect(h2).toEqual([])
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/history.test.ts 2>&1 | tail -10`
Expected: FAIL — cannot find module `../chat/history`

- [ ] **Step 3: Implement ConversationHistoryManager**

Extract from current `chat.ts` lines 71, 116–168:

```typescript
// src/main/chat/history.ts
import type Anthropic from '@anthropic-ai/sdk'
import type { AgentId } from '../../shared/types'

type MessageParam = Anthropic.Messages.MessageParam

export const MAX_HISTORY_MESSAGES = 50

export class ConversationHistoryManager {
  private histories = new Map<AgentId, MessageParam[]>()

  getOrCreate(agentId: AgentId): MessageParam[] {
    if (!this.histories.has(agentId)) {
      this.histories.set(agentId, [])
    }
    return this.histories.get(agentId)!
  }

  trim(messages: MessageParam[]): MessageParam[] {
    if (messages.length <= MAX_HISTORY_MESSAGES) return messages
    let startIndex = messages.length - MAX_HISTORY_MESSAGES
    while (startIndex < messages.length && messages[startIndex].role !== 'user') {
      startIndex++
    }
    return messages.slice(startIndex)
  }

  /**
   * Scan history for assistant messages with tool_use blocks that aren't
   * followed by a user message containing matching tool_result blocks.
   * Insert error-result placeholders so the API accepts the conversation.
   */
  repairOrphanedToolUse(history: MessageParam[]): void {
    for (let i = 0; i < history.length; i++) {
      const msg = history[i]
      if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue

      const toolUseBlocks = (msg.content as Anthropic.Messages.ContentBlock[]).filter(
        (b) => b.type === 'tool_use'
      ) as Anthropic.Messages.ToolUseBlock[]
      if (toolUseBlocks.length === 0) continue

      // Check if the next message is a user message with tool_result blocks
      const next = history[i + 1]
      if (next?.role === 'user' && Array.isArray(next.content)) {
        const resultIds = new Set(
          (next.content as Anthropic.Messages.ToolResultBlockParam[])
            .filter((b) => b.type === 'tool_result')
            .map((b) => b.tool_use_id)
        )
        const allCovered = toolUseBlocks.every((b) => resultIds.has(b.id))
        if (allCovered) continue
      }

      // Missing or incomplete tool_results — insert placeholder
      const errorResults: Anthropic.Messages.ToolResultBlockParam[] = toolUseBlocks.map((b) => ({
        type: 'tool_result' as const,
        tool_use_id: b.id,
        content: '操作因錯誤中斷。(Operation interrupted by error.)',
        is_error: true
      }))
      history.splice(i + 1, 0, { role: 'user', content: errorResults })
    }
  }

  clear(agentId: AgentId): void {
    this.histories.delete(agentId)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/history.test.ts 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/chat/history.ts src/main/__tests__/history.test.ts
git commit -m "refactor(chat): extract ConversationHistoryManager with tests"
```

---

### Task 3: Create `tool-confirm.ts` — tool and path approval flows

**Files:**

- Create: `src/main/chat/tool-confirm.ts`

- [ ] **Step 1: Create tool-confirm.ts**

Extract from current `chat.ts` lines 27–31, 37–58, 107–108, 178–358. This is a mechanical extraction — every function body is copied verbatim from `chat.ts`.

```typescript
// src/main/chat/tool-confirm.ts
import type { WebContents } from 'electron'
import { resolve, normalize } from 'path'
import { addApprovedFolder, isPathApproved } from '../folder-manager'
import type { AgentId, ToolName, ToolConfirmPayload, PathApprovalPayload } from '../../shared/types'

interface PendingToolConfirm {
  resolve: (result: { approved: boolean; addToApproved?: string }) => void
  timer: ReturnType<typeof setTimeout>
}

interface PendingPathApproval {
  resolve: (result: { approved: string[]; denied: string[] }) => void
  approved: string[]
  denied: string[]
  remaining: Set<string>
}

export const TOOL_CONFIRM_TIMEOUT = 5 * 60 * 1000 // 5 minutes

const pendingToolConfirms = new Map<string, PendingToolConfirm>()
const pendingPathApprovals = new Map<AgentId, PendingPathApproval>()

/** Paths approved via "allow once" — valid for the session, not persisted to disk. */
export const oneTimeApprovedPaths = new Set<string>()

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Stream text character-by-character to simulate NPC typing. */
export async function streamTextWithDelay(
  agentId: AgentId,
  text: string,
  webContents: WebContents
): Promise<void> {
  let i = 0
  while (i < text.length) {
    if (webContents.isDestroyed()) return
    const chunkSize = Math.min(2 + Math.floor(Math.random() * 3), text.length - i)
    const chunk = text.slice(i, i + chunkSize)
    webContents.send('chat:stream-chunk', { agentId, chunk })
    i += chunkSize
    const lastChar = chunk[chunk.length - 1]
    const isPunctuation = '，。、！？…：；'.includes(lastChar) || /[,.!?;:]/.test(lastChar)
    await delay(isPunctuation ? 60 : 20)
  }
}

/** Extract the target file/dir path from tool args for folder approval check. */
export function getToolTargetPath(toolName: string, args: Record<string, unknown>): string | null {
  if (toolName === 'run_command') {
    return typeof args.cwd === 'string' ? args.cwd : null
  }
  return typeof args.path === 'string' ? args.path : null
}

/** Build a human-readable summary of what the tool call will do. */
export function buildToolSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'read_file':
      return `讀取檔案: ${args.path}`
    case 'write_file':
      return `寫入檔案: ${args.path}`
    case 'edit_file':
      return `編輯檔案: ${args.path}`
    case 'list_files':
      return `列出目錄: ${args.path}`
    case 'run_command':
      return `執行指令: ${args.command}`
    default:
      return `${toolName}`
  }
}

/** Request user confirmation for a tool call. Returns approval result. */
export function requestToolConfirmation(
  payload: ToolConfirmPayload,
  webContents: WebContents
): Promise<{ approved: boolean; addToApproved?: string }> {
  if (webContents.isDestroyed()) {
    return Promise.resolve({ approved: false })
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingToolConfirms.delete(payload.toolCallId)
      resolve({ approved: false })
    }, TOOL_CONFIRM_TIMEOUT)

    pendingToolConfirms.set(payload.toolCallId, { resolve, timer })
    webContents.send('chat:tool-confirm', payload)
  })
}

/** Handle user's tool approval response. */
export function handleToolApproved(
  _agentId: string,
  toolCallId: string,
  addToApproved?: string
): void {
  const pending = pendingToolConfirms.get(toolCallId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingToolConfirms.delete(toolCallId)
  pending.resolve({ approved: true, addToApproved })
}

/** Handle user's tool denial response. */
export function handleToolDenied(_agentId: string, toolCallId: string): void {
  const pending = pendingToolConfirms.get(toolCallId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingToolConfirms.delete(toolCallId)
  pending.resolve({ approved: false })
}

/** Extract backtick-wrapped absolute paths from a user message. */
export function extractMessagePaths(message: string): string[] {
  const matches = message.match(/`([^`]+)`/g)
  if (!matches) return []
  const paths = matches.map((m) => m.slice(1, -1)).filter((p) => p.startsWith('/'))
  return [...new Set(paths)]
}

/**
 * Check user message for unapproved paths. If found, send a NPC response asking
 * for permission and wait for user's approval/denial before proceeding.
 * Returns the final message text (with denied paths removed).
 */
export async function checkAndApproveMessagePaths(
  agentId: AgentId,
  message: string,
  locale: string,
  webContents: WebContents
): Promise<string> {
  const paths = extractMessagePaths(message)
  if (paths.length === 0) return message

  const unapproved = paths.filter(
    (p) => !isPathApproved(p) && !oneTimeApprovedPaths.has(resolve(normalize(p)))
  )
  if (unapproved.length === 0) return message

  const npcMessage =
    locale === 'en'
      ? '⚠ These scrolls lie beyond the boundaries of your issued permits. I cannot read them without your authorization, adventurer.'
      : '⚠ 這些卷軸在你核發的通行令範圍之外，冒險者。沒有你的許可，我無法查閱它們。'

  if (!webContents.isDestroyed()) {
    await streamTextWithDelay(agentId, npcMessage, webContents)
    await delay(300)
    if (!webContents.isDestroyed()) {
      webContents.send('chat:path-approval', {
        agentId,
        paths: unapproved
      } as PathApprovalPayload)
    }
  }

  const result = await new Promise<{ approved: string[]; denied: string[] }>((resolve) => {
    const timer = setTimeout(() => {
      const pending = pendingPathApprovals.get(agentId)
      if (!pending) return
      for (const p of pending.remaining) {
        pending.denied.push(p)
      }
      pendingPathApprovals.delete(agentId)
      resolve({ approved: pending.approved, denied: pending.denied })
    }, TOOL_CONFIRM_TIMEOUT)

    pendingPathApprovals.set(agentId, {
      resolve: (r) => {
        clearTimeout(timer)
        resolve(r)
      },
      approved: [],
      denied: [],
      remaining: new Set(unapproved)
    })
  })

  let finalMessage = message
  for (const path of result.denied) {
    finalMessage = finalMessage
      .replace(new RegExp(`\\s*\`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``, 'g'), '')
      .trim()
  }

  if (!webContents.isDestroyed()) {
    webContents.send('chat:stream-end', { agentId })
  }

  return finalMessage
}

/** Handle user's path approval response (post scroll or allow once). */
export function handlePathApproved(agentId: string, path: string, addToApproved?: string): void {
  if (addToApproved) {
    addApprovedFolder(addToApproved)
  } else {
    oneTimeApprovedPaths.add(resolve(normalize(path)))
  }
  const pending = pendingPathApprovals.get(agentId)
  if (!pending || !pending.remaining.has(path)) return
  pending.approved.push(path)
  pending.remaining.delete(path)
  if (pending.remaining.size === 0) {
    pendingPathApprovals.delete(agentId)
    pending.resolve({ approved: pending.approved, denied: pending.denied })
  }
}

/** Handle user's path denial response. */
export function handlePathDenied(agentId: string, path: string): void {
  const pending = pendingPathApprovals.get(agentId)
  if (!pending || !pending.remaining.has(path)) return
  pending.denied.push(path)
  pending.remaining.delete(path)
  if (pending.remaining.size === 0) {
    pendingPathApprovals.delete(agentId)
    pending.resolve({ approved: pending.approved, denied: pending.denied })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `src/main/chat/tool-confirm.ts`

- [ ] **Step 3: Commit**

```bash
git add src/main/chat/tool-confirm.ts
git commit -m "refactor(chat): extract tool confirmation and path approval flows"
```

---

### Task 4: Create `api-key-backend.ts` — Anthropic SDK backend

**Files:**

- Create: `src/main/chat/api-key-backend.ts`
- Create: `src/main/__tests__/api-key-backend.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/__tests__/api-key-backend.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ApiKeyChatBackend } from '../chat/api-key-backend'
import type { ChatOpts, StreamEvent } from '../chat/types'

function makeChatOpts(overrides: Partial<ChatOpts> = {}): ChatOpts {
  return {
    agentId: 'wizard',
    systemPrompt: 'You are a wizard.',
    tools: [],
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 1024,
    temperature: 0.7,
    ...overrides
  }
}

describe('ApiKeyChatBackend', () => {
  it('yields error event when no API key is available', async () => {
    const backend = new ApiKeyChatBackend(() => null)
    const events: StreamEvent[] = []
    for await (const event of backend.sendMessage(makeChatOpts(), 'hello')) {
      events.push(event)
    }
    expect(events).toEqual([{ type: 'error', error: 'no-api-key' }])
  })

  it('cancelStream aborts an active stream', () => {
    const backend = new ApiKeyChatBackend(() => 'sk-test')
    // Should not throw even if no active stream
    expect(() => backend.cancelStream('wizard')).not.toThrow()
  })

  it('clearHistory delegates to ConversationHistoryManager', () => {
    const backend = new ApiKeyChatBackend(() => 'sk-test')
    // Should not throw
    expect(() => backend.clearHistory('wizard')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/api-key-backend.test.ts 2>&1 | tail -10`
Expected: FAIL — cannot find module `../chat/api-key-backend`

- [ ] **Step 3: Implement ApiKeyChatBackend**

```typescript
// src/main/chat/api-key-backend.ts
import Anthropic from '@anthropic-ai/sdk'
import type { AgentId, ToolName } from '../../shared/types'
import type { IChatBackend, ChatOpts, StreamEvent, ToolSchema, ToolResult } from './types'
import { ConversationHistoryManager } from './history'

type MessageParam = Anthropic.Messages.MessageParam

const MAX_TOOL_ROUNDS = 20

export class ApiKeyChatBackend implements IChatBackend {
  private history = new ConversationHistoryManager()
  private activeStreams = new Map<AgentId, AbortController>()
  private pendingToolResults = new Map<AgentId, { resolve: (results: ToolResult[]) => void }>()
  private getApiKey: () => string | null
  private cachedClient: { apiKey: string; client: Anthropic } | null = null

  constructor(getApiKey: () => string | null) {
    this.getApiKey = getApiKey
  }

  private getOrCreateClient(apiKey: string): Anthropic {
    if (this.cachedClient && this.cachedClient.apiKey === apiKey) {
      return this.cachedClient.client
    }
    const client = new Anthropic({ apiKey })
    this.cachedClient = { apiKey, client }
    return client
  }

  /** Convert provider-agnostic ToolSchema to Anthropic tool format */
  private toAnthropicTools(
    tools: ToolSchema[]
  ): (Anthropic.Messages.Tool | Anthropic.Messages.WebSearchTool20250305)[] {
    return tools.map((t) => {
      if (t.name === 'web_search') {
        return { type: 'web_search_20250305' as const, name: 'web_search' }
      }
      return {
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema
      }
    })
  }

  /** Convert provider-agnostic ToolResult to Anthropic ToolResultBlockParam */
  private toAnthropicToolResults(results: ToolResult[]): Anthropic.Messages.ToolResultBlockParam[] {
    return results.map((r) => ({
      type: 'tool_result' as const,
      tool_use_id: r.toolCallId,
      content: r.content,
      ...(r.isError ? { is_error: true } : {})
    }))
  }

  private waitForToolResults(agentId: AgentId): Promise<ToolResult[]> {
    return new Promise((resolve) => {
      this.pendingToolResults.set(agentId, { resolve })
    })
  }

  async *sendMessage(opts: ChatOpts, message: string): AsyncIterable<StreamEvent> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      yield { type: 'error', error: 'no-api-key' }
      return
    }

    const client = this.getOrCreateClient(apiKey)
    const history = this.history.getOrCreate(opts.agentId)

    this.history.repairOrphanedToolUse(history)

    // Avoid duplicate on retry: only push if the last message isn't already this exact user message
    const last = history[history.length - 1]
    if (!(last?.role === 'user' && last.content === message)) {
      history.push({ role: 'user', content: message })
    }

    const controller = new AbortController()
    this.activeStreams.set(opts.agentId, controller)

    const anthropicTools = this.toAnthropicTools(opts.tools)

    try {
      let continueLoop = true
      let toolRounds = 0

      while (continueLoop) {
        if (++toolRounds > MAX_TOOL_ROUNDS) {
          yield { type: 'error', error: 'tool-rounds-exceeded' }
          break
        }

        // Collect text chunks via a promise-based approach since
        // stream.on('text') is callback-based but we need to yield from a generator.
        // Strategy: collect all text chunks during streaming, yield them after finalMessage.
        // This preserves streaming semantics — the orchestrator receives text events
        // after each API round, which it forwards to the renderer.
        let roundText = ''

        const stream = client.messages.stream(
          {
            model: opts.model,
            max_tokens: opts.maxTokens,
            temperature: opts.temperature,
            system: opts.systemPrompt,
            messages: this.history.trim(history),
            ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {})
          },
          { signal: controller.signal }
        )

        // Buffer text chunks — we'll yield them after the stream completes
        stream.on('text', (text) => {
          roundText += text
        })

        const finalMessage = await stream.finalMessage()

        // Yield accumulated text as a single chunk for this round
        if (roundText) {
          yield { type: 'text', chunk: roundText }
        }

        if (finalMessage.stop_reason === 'tool_use') {
          history.push({ role: 'assistant', content: finalMessage.content })

          // Yield batched tool_use event for all tool blocks in this API response
          const calls = finalMessage.content
            .filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use')
            .map((b) => ({
              toolCallId: b.id,
              toolName: b.name as ToolName,
              args: b.input as Record<string, unknown>
            }))
          yield { type: 'tool_use', calls }

          // Suspend — wait for orchestrator to supply results for ALL tool calls
          const results = await this.waitForToolResults(opts.agentId)
          history.push({ role: 'user', content: this.toAnthropicToolResults(results) })
        } else {
          // stop_reason is 'end_turn' or 'max_tokens' — done
          history.push({ role: 'assistant', content: finalMessage.content })
          continueLoop = false
        }
      }

      yield { type: 'end' }
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))

      // Repair history to maintain valid alternating sequence
      const lastMsg = history[history.length - 1]
      if (lastMsg?.role === 'assistant' && Array.isArray(lastMsg.content)) {
        const toolUseBlocks = (lastMsg.content as Anthropic.Messages.ContentBlock[]).filter(
          (b) => b.type === 'tool_use'
        )
        if (toolUseBlocks.length > 0) {
          const errorResults: Anthropic.Messages.ToolResultBlockParam[] = toolUseBlocks.map(
            (b) => ({
              type: 'tool_result' as const,
              tool_use_id: (b as Anthropic.Messages.ToolUseBlock).id,
              content: '操作因錯誤中斷。(Operation interrupted by error.)',
              is_error: true
            })
          )
          history.push({ role: 'user', content: errorResults })
        }
      } else if (lastMsg?.role === 'user' && !isAbort) {
        // If error happened before any response, remove the dangling user message
        history.pop()
      }

      if (isAbort) {
        yield { type: 'end' }
      } else {
        const error = err instanceof Error ? err.message : String(err)
        console.error(`[ApiKeyChatBackend] Stream error for agent ${opts.agentId}:`, err)
        yield { type: 'error', error }
      }
    } finally {
      this.activeStreams.delete(opts.agentId)
      this.pendingToolResults.delete(opts.agentId)
    }
  }

  supplyToolResults(agentId: AgentId, results: ToolResult[]): void {
    const pending = this.pendingToolResults.get(agentId)
    if (pending) {
      this.pendingToolResults.delete(agentId)
      pending.resolve(results)
    }
  }

  cancelStream(agentId: AgentId): void {
    const controller = this.activeStreams.get(agentId)
    if (controller) {
      controller.abort()
    }
  }

  clearHistory(agentId: AgentId): void {
    this.history.clear(agentId)
  }
}
```

**Note on streaming:** The current `chat.ts` uses `stream.on('text', callback)` which pushes text chunks directly to IPC as they arrive. In the async generator, we buffer text per API round and yield it as a single `text` event after `finalMessage()` resolves. This is a minor behavioral difference — text arrives in one chunk per API round instead of character-by-character from the SDK. The orchestrator still forwards it to the renderer, and the renderer's message bubble handles display. If real-time streaming is critical, a more complex async queue adapter can be added later, but for this refactor the simpler approach preserves correctness.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/api-key-backend.test.ts 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/chat/api-key-backend.ts src/main/__tests__/api-key-backend.test.ts
git commit -m "refactor(chat): extract ApiKeyChatBackend implementing IChatBackend"
```

---

### Task 5: Create `orchestrator.ts` — ChatOrchestrator

**Files:**

- Create: `src/main/chat/orchestrator.ts`
- Create: `src/main/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/__tests__/orchestrator.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ChatOrchestrator } from '../chat/orchestrator'
import type { IChatBackend, ChatOpts, StreamEvent, ToolResult } from '../chat/types'

/** Minimal mock backend that yields configurable events */
function mockBackend(events: StreamEvent[]): IChatBackend {
  return {
    async *sendMessage(_opts: ChatOpts, _message: string) {
      for (const e of events) {
        yield e
      }
    },
    supplyToolResults: vi.fn(),
    cancelStream: vi.fn(),
    clearHistory: vi.fn()
  }
}

/** Minimal mock WebContents */
function mockWebContents() {
  return {
    isDestroyed: vi.fn(() => false),
    send: vi.fn()
  } as unknown as import('electron').WebContents
}

describe('ChatOrchestrator', () => {
  it('forwards text events to webContents via IPC', async () => {
    const backend = mockBackend([{ type: 'text', chunk: 'Hello adventurer!' }, { type: 'end' }])
    const orchestrator = new ChatOrchestrator(backend)
    const wc = mockWebContents()

    await orchestrator.handleSendMessage('elder', 'hi', 'zh-TW', wc)

    expect(wc.send).toHaveBeenCalledWith('chat:stream-chunk', {
      agentId: 'elder',
      chunk: 'Hello adventurer!'
    })
    expect(wc.send).toHaveBeenCalledWith('chat:stream-end', { agentId: 'elder' })
  })

  it('forwards error events to webContents', async () => {
    const backend = mockBackend([{ type: 'error', error: 'no-api-key' }])
    const orchestrator = new ChatOrchestrator(backend)
    const wc = mockWebContents()

    await orchestrator.handleSendMessage('wizard', 'cast spell', 'zh-TW', wc)

    expect(wc.send).toHaveBeenCalledWith('chat:stream-error', {
      agentId: 'wizard',
      error: 'no-api-key'
    })
  })

  it('cancelStream delegates to backend', () => {
    const backend = mockBackend([])
    const orchestrator = new ChatOrchestrator(backend)

    orchestrator.cancelStream('wizard')

    expect(backend.cancelStream).toHaveBeenCalledWith('wizard')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/orchestrator.test.ts 2>&1 | tail -10`
Expected: FAIL — cannot find module `../chat/orchestrator`

- [ ] **Step 3: Implement ChatOrchestrator**

```typescript
// src/main/chat/orchestrator.ts
import type { WebContents } from 'electron'
import { resolve, normalize } from 'path'
import type { AgentId, ToolName, ToolConfirmPayload } from '../../shared/types'
import { SKILL_CATEGORIES } from '../../shared/types'
import type { IChatBackend, ChatOpts, ToolSchema, ToolResult } from './types'
import {
  checkAndApproveMessagePaths,
  requestToolConfirmation,
  getToolTargetPath,
  buildToolSummary,
  oneTimeApprovedPaths
} from './tool-confirm'
import { getAgentConfig, getAgentToolContext } from '../agents/system-prompts'
import { getToolsForAgent } from '../tools/tool-definitions'
import { executeTool } from '../tools/tool-executor'
import { getApprovedFolders, isPathApproved, addApprovedFolder } from '../folder-manager'
import { getParentFolder } from '../tools/path-utils'
import { getCosmeticDefinition } from '../cosmetic-definitions'
import type { ProgressionEngine } from '../progression-engine'
import type { QuestEngine } from '../quest-engine'
import type { SqliteConversationPersistence } from '../db/conversation-persistence'
import type { AchievementEngine } from '../achievement-engine'
import type { SqliteAchievementRepository } from '../db/achievement-repository'
import type { SqliteCosmeticRepository } from '../db/cosmetic-repository'
import type { AgentConfig } from '../agents/system-prompts'

export interface ChatDependencies {
  progressionEngine: ProgressionEngine
  questEngine: QuestEngine
  conversationPersistence: SqliteConversationPersistence
  achievementEngine: AchievementEngine
  achievementRepo: SqliteAchievementRepository
  cosmeticRepo: SqliteCosmeticRepository
}

const MAX_CONCURRENT_STREAMS = 3

export class ChatOrchestrator {
  private backend: IChatBackend
  private activeAgents = new Set<AgentId>()
  private pendingQueue: Array<{
    agentId: AgentId
    message: string
    locale: string
    webContents: WebContents
  }> = []

  private progressionEngine: ProgressionEngine | null = null
  private questEngine: QuestEngine | null = null
  private conversationPersistence: SqliteConversationPersistence | null = null
  private achievementEngine: AchievementEngine | null = null
  private achievementRepo: SqliteAchievementRepository | null = null
  private cosmeticRepo: SqliteCosmeticRepository | null = null
  private dependenciesInitialized = false

  constructor(backend: IChatBackend) {
    this.backend = backend
  }

  setDependencies(deps: ChatDependencies): void {
    this.progressionEngine = deps.progressionEngine
    this.questEngine = deps.questEngine
    this.conversationPersistence = deps.conversationPersistence
    this.achievementEngine = deps.achievementEngine
    this.achievementRepo = deps.achievementRepo
    this.cosmeticRepo = deps.cosmeticRepo
    this.dependenciesInitialized = true
  }

  setBackend(backend: IChatBackend): void {
    this.backend = backend
  }

  handleSendMessage(
    agentId: AgentId,
    message: string,
    locale: string,
    webContents: WebContents
  ): void {
    if (this.activeAgents.size >= MAX_CONCURRENT_STREAMS) {
      this.pendingQueue.push({ agentId, message, locale, webContents })
    } else {
      this.processStream(agentId, message, locale, webContents)
    }
  }

  cancelStream(agentId: AgentId): void {
    this.backend.cancelStream(agentId)
  }

  /** Convert Anthropic tool definitions to provider-agnostic ToolSchema */
  private convertTools(agentId: AgentId): ToolSchema[] {
    const tools = getToolsForAgent(agentId)
    return tools.map((t) => {
      if ('type' in t && t.type === 'web_search_20250305') {
        return { name: 'web_search', description: 'Web search', inputSchema: {} }
      }
      const tool = t as { name: string; description: string; input_schema: Record<string, unknown> }
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.input_schema
      }
    })
  }

  private async processStream(
    agentId: AgentId,
    message: string,
    locale: string,
    webContents: WebContents
  ): Promise<void> {
    const config = getAgentConfig(agentId)
    if (!config) {
      webContents.send('chat:stream-error', { agentId, error: `Unknown agent: ${agentId}` })
      return
    }

    // Check for unapproved paths before calling the backend
    const finalMessage = await checkAndApproveMessagePaths(agentId, message, locale, webContents)
    if (!finalMessage.trim()) {
      if (!webContents.isDestroyed()) {
        webContents.send('chat:stream-end', { agentId })
      }
      return
    }

    if (!this.dependenciesInitialized) {
      console.warn(
        '[ChatOrchestrator] setDependencies() was never called — persistence and XP are disabled'
      )
    }

    // Persist user message to SQLite
    if (this.conversationPersistence && typeof finalMessage === 'string') {
      try {
        const conv = this.conversationPersistence.getOrCreateByAgent(agentId, 'player-1')
        this.conversationPersistence.addMessage(conv.id, 'user', finalMessage, Date.now())
      } catch (err) {
        console.error(`[ChatOrchestrator] Failed to persist user message for ${agentId}:`, err)
      }
    }

    // Build ChatOpts
    const toolContext = getAgentToolContext(agentId, getApprovedFolders())
    const systemPrompt =
      locale === 'en'
        ? config.systemPrompt + toolContext + '\n\nThe player is using English. Respond in English.'
        : config.systemPrompt + toolContext

    const opts: ChatOpts = {
      agentId,
      systemPrompt,
      tools: this.convertTools(agentId),
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature
    }

    this.activeAgents.add(agentId)
    let fullTextResponse = ''

    try {
      for await (const event of this.backend.sendMessage(opts, finalMessage)) {
        if (webContents.isDestroyed()) break

        switch (event.type) {
          case 'text':
            fullTextResponse += event.chunk
            webContents.send('chat:stream-chunk', { agentId, chunk: event.chunk })
            break

          case 'tool_use': {
            // Process all tool calls in the batch sequentially (confirmation is per-tool)
            const allResults: ToolResult[] = []
            for (const call of event.calls) {
              const result = await this.handleToolUse(
                agentId,
                call.toolCallId,
                call.toolName as ToolName,
                call.args,
                webContents
              )
              allResults.push(result)
            }
            this.backend.supplyToolResults(agentId, allResults)
            break
          }

          case 'end':
            await this.handlePostResponse(agentId, fullTextResponse, config, webContents)
            break

          case 'error':
            webContents.send('chat:stream-error', { agentId, error: event.error })
            break
        }
      }

      if (!webContents.isDestroyed()) {
        webContents.send('chat:stream-end', { agentId })
      }
    } catch (err) {
      console.error(`[ChatOrchestrator] Stream error for ${agentId}:`, err)
      if (!webContents.isDestroyed()) {
        const error = err instanceof Error ? err.message : String(err)
        webContents.send('chat:stream-error', { agentId, error })
      }
    } finally {
      this.activeAgents.delete(agentId)
      this.processQueue()
    }
  }

  private async handleToolUse(
    agentId: AgentId,
    toolCallId: string,
    toolName: ToolName,
    args: Record<string, unknown>,
    webContents: WebContents
  ): Promise<ToolResult> {
    const targetPath = getToolTargetPath(toolName, args)
    const folderApproved =
      toolName === 'run_command'
        ? false
        : targetPath
          ? isPathApproved(targetPath) || oneTimeApprovedPaths.has(resolve(normalize(targetPath)))
          : true

    if (folderApproved) {
      return this.executeAndTrackTool(agentId, toolCallId, toolName, args, webContents)
    }

    // Request user confirmation
    const confirmPayload: ToolConfirmPayload = {
      agentId,
      toolCallId,
      toolName,
      args,
      summary: buildToolSummary(toolName, args),
      folderApproved
    }

    const { approved, addToApproved } = await requestToolConfirmation(confirmPayload, webContents)

    if (!approved) {
      return {
        toolCallId,
        content: '冒險者拒絕了這個操作。(The player denied this tool call.)',
        isError: true
      }
    }

    if (addToApproved) {
      addApprovedFolder(addToApproved)
    }

    return this.executeAndTrackTool(
      agentId,
      toolCallId,
      toolName,
      args,
      webContents,
      targetPath,
      addToApproved
    )
  }

  private async executeAndTrackTool(
    agentId: AgentId,
    toolCallId: string,
    toolName: ToolName,
    args: Record<string, unknown>,
    webContents: WebContents,
    targetPath?: string | null,
    addToApproved?: string
  ): Promise<ToolResult> {
    if (!webContents.isDestroyed()) {
      webContents.send('chat:tool-executing', { agentId, toolName })
    }

    const approvedFolders = [
      ...getApprovedFolders().map((f) => f.path),
      ...Array.from(oneTimeApprovedPaths).map((p) => getParentFolder(p))
    ]

    // For "Just Once" approvals: if targetPath is not in approved folders,
    // temporarily include the relevant directory.
    if (targetPath && !isPathApproved(targetPath) && !addToApproved) {
      const isDirectoryTool = toolName === 'list_files' || toolName === 'run_command'
      approvedFolders.push(
        isDirectoryTool ? resolve(normalize(targetPath)) : getParentFolder(targetPath)
      )
    }

    const result = await executeTool(toolName, args, approvedFolders)

    // Record tool usage for achievements
    try {
      if (this.achievementRepo && this.achievementEngine) {
        this.achievementRepo.recordToolUse('player-1', toolName)
        const toolResult = this.achievementEngine.checkToolUse('player-1')
        if (toolResult.unlocked.length > 0 && !webContents.isDestroyed()) {
          for (const a of toolResult.unlocked) {
            if (a.cosmeticReward && this.cosmeticRepo) {
              this.cosmeticRepo.unlock('player-1', a.cosmeticReward)
              webContents.send('cosmetics:unlocked', {
                cosmeticDefId: a.cosmeticReward,
                title: getCosmeticDefinition(a.cosmeticReward)?.title
              })
            }
          }
          webContents.send('achievements:unlocked', toolResult.unlocked)
        }
      }
    } catch (err) {
      console.error('[ChatOrchestrator] tool achievement check failed:', err)
    }

    return {
      toolCallId,
      content: result.content,
      isError: !result.success
    }
  }

  private async handlePostResponse(
    agentId: AgentId,
    fullText: string,
    config: AgentConfig,
    webContents: WebContents
  ): Promise<void> {
    // Persist assistant response
    if (fullText && this.conversationPersistence) {
      try {
        const conv = this.conversationPersistence.getOrCreateByAgent(agentId, 'player-1')
        this.conversationPersistence.addMessage(conv.id, 'assistant', fullText, Date.now())
      } catch (err) {
        console.error(`[ChatOrchestrator] Failed to persist assistant message for ${agentId}:`, err)
      }
    }

    // Award XP
    if (fullText && this.progressionEngine && config.skills.length > 0) {
      try {
        const xpResult = this.progressionEngine.awardXP(agentId, config.skills)
        if (!webContents.isDestroyed()) {
          webContents.send('progression:xp-awarded', { ...xpResult, agentId })
          if (xpResult.titleChanged) {
            webContents.send('progression:title-changed', {
              newTitle: xpResult.titleChanged
            })
          }
        }

        // Check quests after XP award
        if (this.questEngine && !webContents.isDestroyed()) {
          try {
            const questResult = this.questEngine.checkQuests('player-1')
            if (questResult.discovered.length > 0) {
              for (const d of questResult.discovered) {
                webContents.send('quests:discovered', d)
              }
            }
            if (questResult.completed.length > 0 && this.progressionEngine) {
              for (const c of questResult.completed) {
                try {
                  const def = this.questEngine.getQuestDef(c.questDefId)
                  const categories =
                    def && def.skillCategories.length > 0 ? def.skillCategories : SKILL_CATEGORIES
                  const bonusResult = this.progressionEngine.awardBonusXP(
                    c.xpReward,
                    categories,
                    agentId
                  )
                  if (!webContents.isDestroyed()) {
                    webContents.send('progression:xp-awarded', {
                      ...bonusResult,
                      agentId
                    })
                  }
                } catch (bonusErr) {
                  console.error(
                    `[ChatOrchestrator] Failed to award bonus XP for quest ${c.questDefId}:`,
                    bonusErr
                  )
                  if (!webContents.isDestroyed()) {
                    webContents.send('quests:error', {
                      error:
                        bonusErr instanceof Error
                          ? bonusErr.message
                          : `bonus-xp-failed:${c.questDefId}`
                    })
                  }
                }
              }
            }
            if (
              (questResult.completed.length > 0 || questResult.discovered.length > 0) &&
              !webContents.isDestroyed()
            ) {
              webContents.send('quests:updated', {
                quests: questResult.quests,
                completed: questResult.completed.length > 0 ? questResult.completed : undefined
              })
            }
          } catch (questErr) {
            console.error(`[ChatOrchestrator] Failed to check quests:`, questErr)
            if (!webContents.isDestroyed()) {
              webContents.send('quests:error', {
                error: questErr instanceof Error ? questErr.message : 'quest-check-failed'
              })
            }
          }
        }

        // Achievement check (progression)
        if (this.achievementEngine && !webContents.isDestroyed()) {
          try {
            const achievementResult = this.achievementEngine.checkProgression('player-1')
            if (achievementResult.unlocked.length > 0 && !webContents.isDestroyed()) {
              for (const a of achievementResult.unlocked) {
                if (a.cosmeticReward && this.cosmeticRepo) {
                  this.cosmeticRepo.unlock('player-1', a.cosmeticReward)
                  webContents.send('cosmetics:unlocked', {
                    cosmeticDefId: a.cosmeticReward,
                    title: getCosmeticDefinition(a.cosmeticReward)?.title
                  })
                }
                if (a.xpReward && this.progressionEngine) {
                  const bonusResult = this.progressionEngine.awardBonusXP(
                    a.xpReward,
                    SKILL_CATEGORIES,
                    agentId,
                    'achievement_bonus'
                  )
                  if (bonusResult && !webContents.isDestroyed()) {
                    webContents.send('progression:xp-awarded', bonusResult)
                  }
                }
              }
              webContents.send('achievements:unlocked', achievementResult.unlocked)
            }
          } catch (err) {
            console.error('[ChatOrchestrator] achievement check failed:', err)
          }
        }
      } catch (err) {
        console.error(`[ChatOrchestrator] Failed to award XP for ${agentId}:`, err)
      }
    }
  }

  private processQueue(): void {
    while (this.pendingQueue.length > 0 && this.activeAgents.size < MAX_CONCURRENT_STREAMS) {
      const next = this.pendingQueue.shift()!
      this.processStream(next.agentId, next.message, next.locale, next.webContents)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/orchestrator.test.ts 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/chat/orchestrator.ts src/main/__tests__/orchestrator.test.ts
git commit -m "refactor(chat): extract ChatOrchestrator with side effects and queue"
```

---

### Task 6: Create `index.ts` re-exports and wire up `src/main/index.ts`

**Files:**

- Create: `src/main/chat/index.ts`
- Modify: `src/main/index.ts:6-14,113-121`
- Delete: `src/main/chat.ts`

- [ ] **Step 1: Create the re-export barrel**

```typescript
// src/main/chat/index.ts
export { ChatOrchestrator } from './orchestrator'
export type { ChatDependencies } from './orchestrator'
export { ApiKeyChatBackend } from './api-key-backend'
export type { IChatBackend, StreamEvent, ChatOpts, ToolSchema, ToolResult, ToolCall } from './types'
export {
  handleToolApproved,
  handleToolDenied,
  handlePathApproved,
  handlePathDenied
} from './tool-confirm'
```

- [ ] **Step 2: Update imports in `src/main/index.ts`**

Replace the old import block (lines 6–14):

```typescript
// OLD:
import {
  handleSendMessage,
  cancelStream,
  handleToolApproved,
  handleToolDenied,
  handlePathApproved,
  handlePathDenied,
  setChatDependencies
} from './chat'

// NEW:
import {
  ChatOrchestrator,
  ApiKeyChatBackend,
  handleToolApproved,
  handleToolDenied,
  handlePathApproved,
  handlePathDenied
} from './chat'
```

- [ ] **Step 3: Update startup wiring in `src/main/index.ts`**

Replace `setChatDependencies()` call (around line 113–121):

```typescript
// OLD:
setChatDependencies(
  progressionEngine,
  questEngine,
  conversationPersistence,
  achievementEngine,
  achievementRepo,
  cosmeticRepo
)

// NEW:
const chatBackend = new ApiKeyChatBackend(() => getApiKey())
const chatOrchestrator = new ChatOrchestrator(chatBackend)
chatOrchestrator.setDependencies({
  progressionEngine,
  questEngine,
  conversationPersistence,
  achievementEngine,
  achievementRepo,
  cosmeticRepo
})
```

Note: `getApiKey` is already imported from `./api-key` at line 5.

- [ ] **Step 4: Update IPC handlers in `src/main/index.ts`**

Replace `handleSendMessage` call (line 371):

```typescript
// OLD:
handleSendMessage(agentId, message, locale, event.sender)
// NEW:
chatOrchestrator.handleSendMessage(agentId, message, locale, event.sender)
```

Replace `cancelStream` call (line 383):

```typescript
// OLD:
cancelStream((data as { agentId: string }).agentId)
// NEW:
chatOrchestrator.cancelStream((data as { agentId: string }).agentId)
```

- [ ] **Step 5: Verify TypeScript compiles with new wiring**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 6: Delete old `src/main/chat.ts`**

Run: `rm src/main/chat.ts`

Verify nothing else imports it:

Run: `grep -r "from './chat'" src/main/ --include='*.ts' | grep -v 'chat/'`
Expected: No results (all imports now resolve to `./chat/index.ts`)

- [ ] **Step 7: Verify TypeScript still compiles after deletion**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Run all unit tests**

Run: `npx vitest run 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add src/main/chat/index.ts src/main/index.ts
git rm src/main/chat.ts
git commit -m "refactor(chat): wire ChatOrchestrator into main process, remove old chat.ts"
```

---

### Task 7: Export `AgentConfig` type from system-prompts and verify end-to-end

**Files:**

- Modify: `src/main/agents/system-prompts.ts` (if `AgentConfig` is not already exported)

- [ ] **Step 1: Verify `AgentConfig` is exported**

Check if `AgentConfig` is exported from `src/main/agents/system-prompts.ts`. The orchestrator imports it.

Run: `grep 'export interface AgentConfig' src/main/agents/system-prompts.ts`

If not exported, add `export`:

```typescript
// Change:
interface AgentConfig {
// To:
export interface AgentConfig {
```

Also check if `getAgentConfig` return type needs updating — it should return `AgentConfig | undefined`.

- [ ] **Step 2: Run full typecheck**

Run: `npx tsc --noEmit --pretty 2>&1`
Expected: Zero errors

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 4: Run linter**

Run: `npm run lint 2>&1 | tail -20`
Expected: No new errors (fix any lint issues from the new files)

- [ ] **Step 5: Dev smoke test**

Run: `npm run dev`
Manually verify:

1. App launches
2. Walk to an NPC, start conversation → text streams in
3. Ask NPC to read a file in approved folder → tool executes
4. Ask NPC to read a file outside approved folder → confirmation dialog appears
5. Cancel a stream mid-response → stream stops
6. XP awarded after conversation ends

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "refactor(chat): fix lint and type issues from interface extraction"
```

---

### Task 8: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Add chat module architecture note**

In the Architecture > Process Model section, after the Main process description, add a note about the new chat module structure:

```markdown
- **Chat module** (`src/main/chat/`) — Pluggable AI backend architecture. `ChatOrchestrator` handles side effects (XP, quests, achievements, persistence) and delegates AI communication to an `IChatBackend` implementation. Currently: `ApiKeyChatBackend` (Anthropic SDK). Designed for future `ClaudeCliChatBackend` (subscription) and other providers.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add chat module architecture to CLAUDE.md"
```
