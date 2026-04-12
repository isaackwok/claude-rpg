# Dialogue Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-conversation permission mode toggle, slash command autocomplete, and @ mention autocomplete to the NPC dialogue input area.

**Architecture:** Hybrid approach — autocomplete UI and parsing live in the renderer for instant responsiveness. Data sources (slash commands, file listings, NPC list) are fetched from the main process via IPC and cached. PermissionMode is stored per-agent in the main process orchestrator (session-scoped, in-memory).

**Tech Stack:** TypeScript, React 19, Electron IPC (contextBridge), Vitest, Agent SDK

**Worktree:** `/Users/isaackwok/dev/claude-rpg/.worktrees/dialogue-controls` (branch `feature/dialogue-controls`)

---

## File Structure

### New Files

| File                                                                     | Responsibility                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `src/shared/dialogue-control-types.ts`                                   | `SlashCommand`, `AtSource`, `AutocompleteItem` types                |
| `src/main/chat/slash-command-registry.ts`                                | Discover slash commands from CLI, cache, serve via IPC              |
| `src/renderer/src/components/ui/AutocompletePopup.tsx`                   | Floating categorized dropdown rendered above input                  |
| `src/renderer/src/components/ui/PermissionModeButton.tsx`                | 32×32 mode icon button + dropdown                                   |
| `src/renderer/src/components/ui/SmartInput.tsx`                          | Textarea with `/` and `@` detection, delegates to AutocompletePopup |
| `src/main/__tests__/slash-command-registry.test.ts`                      | Tests for CLI parsing + fallback                                    |
| `src/main/__tests__/orchestrator-agent-mode.test.ts`                     | Tests for per-agent mode in orchestrator                            |
| `src/renderer/src/components/ui/__tests__/AutocompletePopup.test.tsx`    | Tests for autocomplete rendering and selection                      |
| `src/renderer/src/components/ui/__tests__/PermissionModeButton.test.tsx` | Tests for mode button + dropdown                                    |
| `src/renderer/src/components/ui/__tests__/SmartInput.test.tsx`           | Tests for `/` and `@` trigger detection                             |

### Modified Files

| File                                                                 | Change                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/shared/types.ts`                                                | Re-export from `dialogue-control-types.ts`                               |
| `src/main/chat/types.ts:35-46`                                       | Add `permissionMode?: PermissionMode` to `ChatOpts`                      |
| `src/main/chat/agent-sdk-backend.ts:18,30-33`                        | Remove constructor param, read mode from `opts`                          |
| `src/main/chat/backend-manager.ts:10-13,26-33,49-54`                 | Remove `getPermissionMode`, remove `recreateCliBackend()`                |
| `src/main/chat/orchestrator.ts:48-89,177-192`                        | Add `agentModes` map, pass mode in `ChatOpts`                            |
| `src/main/index.ts:118-121,501-506`                                  | Update BackendManager init, add new IPC handlers, remove mode recreation |
| `src/preload/index.ts:233-246`                                       | Add new IPC bridges for mode/commands/sources                            |
| `src/renderer/src/components/ui/DialoguePanel.tsx:315-592,1096-1111` | Replace `InputArea` with `SmartInput`, add `PermissionModeButton`        |
| `src/renderer/src/i18n/locales/zh-TW.json:289`                       | Add `permissionMode.*` keys                                              |
| `src/renderer/src/i18n/locales/en.json`                              | Add `permissionMode.*` keys                                              |
| `src/main/__tests__/agent-sdk-backend.test.ts:13-24,48`              | Update tests for constructor change                                      |

---

## Task 1: Shared Types

**Files:**

- Create: `src/shared/dialogue-control-types.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/shared/dialogue-control-types.ts

/** A slash command discovered from the Agent SDK / Claude CLI */
export interface SlashCommand {
  name: string // e.g., "brainstorm"
  description: string // from SDK, not localized
}

/** An @ mention source (NPC, book, or file) */
export interface AtSource {
  type: 'npc' | 'book' | 'file'
  id: string
  label: string // display name
  secondary?: string // e.g., NPC localized name, book origin NPC
}

/** Unified autocomplete item for both / and @ */
export interface AutocompleteItem {
  type: 'slash' | 'npc' | 'book' | 'file'
  id: string
  label: string
  description?: string
  icon?: string
}

/** Permission modes exposed in the UI (subset of full PermissionMode) */
export const UI_PERMISSION_MODES = ['default', 'acceptEdits', 'auto', 'plan'] as const
export type UIPermissionMode = (typeof UI_PERMISSION_MODES)[number]

/** Icon for each UI permission mode */
export const PERMISSION_MODE_ICONS: Record<UIPermissionMode, string> = {
  default: '📋',
  acceptEdits: '✏️',
  auto: '⚡',
  plan: '🗺️'
}
```

- [ ] **Step 2: Re-export from shared/types.ts**

Add at the bottom of `src/shared/types.ts` (after the existing `export * from './item-types'` line):

```typescript
export * from './dialogue-control-types'
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -v history.test.ts`
Expected: No new errors (the pre-existing `history.test.ts` error is unrelated)

- [ ] **Step 4: Commit**

```bash
git add src/shared/dialogue-control-types.ts src/shared/types.ts
git commit -m "feat: add shared types for dialogue controls (SlashCommand, AtSource, AutocompleteItem)"
```

---

## Task 2: Refactor AgentSdkBackend — Move PermissionMode to ChatOpts

**Files:**

- Modify: `src/main/chat/types.ts:35-46`
- Modify: `src/main/chat/agent-sdk-backend.ts:18,30-33`
- Modify: `src/main/__tests__/agent-sdk-backend.test.ts`

- [ ] **Step 1: Write the failing test**

Update `src/main/__tests__/agent-sdk-backend.test.ts`. Replace the `makeChatOpts` helper and the constructor test:

```typescript
// Update makeChatOpts to include permissionMode
function makeChatOpts(overrides: Partial<ChatOpts> = {}): ChatOpts {
  return {
    agentId: 'wizard',
    systemPrompt: 'You are a wizard.',
    tools: [],
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 1024,
    temperature: 0.7,
    allowedToolNames: ['Read', 'Write', 'Edit'],
    permissionMode: 'acceptEdits',
    ...overrides
  }
}
```

Add a new test:

```typescript
it('passes permissionMode from ChatOpts to SDK query', async () => {
  mockQuery.mockReturnValue(
    makeFakeQuery([
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      { type: 'result', subtype: 'success', session_id: 'sess-1' }
    ])
  )
  const backend = new AgentSdkBackend()
  const opts = makeChatOpts({ permissionMode: 'plan' })
  const events: StreamEvent[] = []
  for await (const e of backend.sendMessage(opts, 'hello')) {
    events.push(e)
  }
  expect(mockQuery).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({ permissionMode: 'plan' })
    })
  )
})
```

Update the existing constructor test:

```typescript
it('has managesTools set to true', () => {
  const backend = new AgentSdkBackend()
  expect(backend.managesTools).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/agent-sdk-backend.test.ts 2>&1 | tail -20`
Expected: FAIL — `AgentSdkBackend` still requires a constructor argument

- [ ] **Step 3: Add `permissionMode` to `ChatOpts`**

In `src/main/chat/types.ts`, add to the `ChatOpts` interface (after line 45, before the closing `}`):

```typescript
  /** Permission mode for Agent SDK backends (per-query) */
  permissionMode?: import('../../shared/types').PermissionMode
```

- [ ] **Step 4: Refactor AgentSdkBackend**

Replace the entire `src/main/chat/agent-sdk-backend.ts`:

```typescript
import type { AgentId } from '../../shared/types'
import type { PermissionMode as SdkPermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { IChatBackend, ChatOpts, StreamEvent, ToolResult } from './types'

/**
 * IChatBackend powered by the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`).
 * Replaces the old ClaudeCliChatBackend that spawned `claude --print`.
 *
 * The SDK handles tool execution internally — supplyToolResults() is a no-op.
 * Session continuity is managed via the SDK's `resume` option with per-NPC session IDs.
 */
export class AgentSdkBackend implements IChatBackend {
  readonly managesTools = true

  private sessionIds = new Map<AgentId, string>()
  private activeAborts = new Map<AgentId, AbortController>()

  async *sendMessage(opts: ChatOpts, message: string): AsyncIterable<StreamEvent> {
    // Dynamic import — the SDK is ESM-only and spawns a child process,
    // so we import lazily to avoid issues with electron-vite's CJS bundling.
    const { query } = await import('@anthropic-ai/claude-agent-sdk')

    const abortController = new AbortController()
    this.activeAborts.set(opts.agentId, abortController)

    let hasSeenPartialMessages = false

    const sdkOptions = {
      systemPrompt: opts.systemPrompt,
      model: opts.model,
      permissionMode: (opts.permissionMode ?? 'acceptEdits') as SdkPermissionMode,
      allowedTools: opts.allowedToolNames ?? [],
      includePartialMessages: true,
      abortController,
      persistSession: true,
      ...(this.sessionIds.has(opts.agentId) ? { resume: this.sessionIds.get(opts.agentId)! } : {})
    }

    try {
      for await (const msg of query({ prompt: message, options: sdkOptions })) {
        // Capture session ID from init message
        if (msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init') {
          this.sessionIds.set(opts.agentId, msg.session_id)
          continue
        }

        // Streaming text deltas (partial messages)
        if (msg.type === 'stream_event') {
          hasSeenPartialMessages = true
          const event = msg.event
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', chunk: event.delta.text }
          }
          continue
        }

        // Full assistant message — only emit text if we didn't get partials
        if (msg.type === 'assistant' && !hasSeenPartialMessages) {
          const content = msg.message?.content
          if (Array.isArray(content)) {
            const textParts: string[] = []
            for (const block of content) {
              if (block.type === 'text') {
                textParts.push(block.text)
              }
            }
            const text = textParts.join('')
            if (text) yield { type: 'text', chunk: text }
          }
          continue
        }

        // Tool progress → informational callback
        if (msg.type === 'tool_progress') {
          opts.onToolProgress?.(msg.tool_name)
          continue
        }

        // Result — end or error
        if (msg.type === 'result') {
          this.sessionIds.set(opts.agentId, msg.session_id)
          if (msg.subtype === 'success') {
            yield { type: 'end' }
          } else {
            const errorMsg =
              'errors' in msg && Array.isArray(msg.errors)
                ? (msg.errors as string[]).join('; ')
                : msg.subtype
            yield { type: 'error', error: errorMsg }
          }
          continue
        }
      }
    } catch (err) {
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'))
      if (isAbort) {
        yield { type: 'end' }
      } else {
        const error = err instanceof Error ? err.message : String(err)
        console.error(`[AgentSdkBackend] Error for agent ${opts.agentId}:`, err)
        yield { type: 'error', error }
      }
    } finally {
      this.activeAborts.delete(opts.agentId)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  supplyToolResults(_agentId: AgentId, _results: ToolResult[]): void {
    // No-op: the Agent SDK executes tools internally
  }

  cancelStream(agentId: AgentId): void {
    this.activeAborts.get(agentId)?.abort()
  }

  clearHistory(agentId: AgentId): void {
    this.sessionIds.delete(agentId)
  }
}
```

Key change: constructor takes no arguments. `permissionMode` is read from `opts.permissionMode` in `sendMessage()` with `'acceptEdits'` as fallback.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/agent-sdk-backend.test.ts 2>&1 | tail -10`
Expected: All tests pass. Update any other tests that call `new AgentSdkBackend('acceptEdits')` to `new AgentSdkBackend()`.

- [ ] **Step 6: Commit**

```bash
git add src/main/chat/types.ts src/main/chat/agent-sdk-backend.ts src/main/__tests__/agent-sdk-backend.test.ts
git commit -m "refactor: move permissionMode from AgentSdkBackend constructor to ChatOpts"
```

---

## Task 3: Refactor BackendManager — Remove PermissionMode Dependency

**Files:**

- Modify: `src/main/chat/backend-manager.ts`
- Modify: `src/main/index.ts:118-121`

- [ ] **Step 1: Simplify BackendManager**

In `src/main/chat/backend-manager.ts`:

Remove `getPermissionMode` from `BackendManagerDeps`:

```typescript
export interface BackendManagerDeps {
  getApiKey: () => string | null
}
```

Update `createBackend` — `AgentSdkBackend` no longer takes an argument:

```typescript
private createBackend(authType: AuthType): IChatBackend {
  switch (authType) {
    case 'api_key':
      return new ApiKeyChatBackend(this.deps.getApiKey)
    case 'claude_cli':
      return new AgentSdkBackend()
  }
}
```

Remove the `recreateCliBackend()` method entirely (lines 49-54).

- [ ] **Step 2: Update main/index.ts — BackendManager init**

In `src/main/index.ts`, update the BackendManager constructor call (around line 118):

```typescript
const backendManager = new BackendManager(settingsRepo.getAuthType(), {
  getApiKey: () => getApiKey()
})
```

Remove the `permission_mode` case from the settings change handler (lines 501-506). Replace with:

```typescript
case 'permission_mode':
  settingsRepo.setPermissionMode(value as PermissionMode)
  break
```

The global setting is still persisted (for fallback default) but no longer recreates the backend.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -v history.test.ts`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/main/chat/backend-manager.ts src/main/index.ts
git commit -m "refactor: remove permissionMode from BackendManager, simplify backend creation"
```

---

## Task 4: Per-Agent Mode in ChatOrchestrator + IPC Handlers

**Files:**

- Modify: `src/main/chat/orchestrator.ts:48-89,177-192`
- Modify: `src/main/index.ts`
- Create: `src/main/__tests__/orchestrator-agent-mode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/orchestrator-agent-mode.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ChatOrchestrator } from '../chat/orchestrator'
import type { IChatBackend, ChatOpts, StreamEvent, ToolResult } from '../chat/types'

// Minimal mock backend that records ChatOpts
class MockBackend implements IChatBackend {
  lastOpts: ChatOpts | null = null
  async *sendMessage(opts: ChatOpts, _message: string): AsyncIterable<StreamEvent> {
    this.lastOpts = opts
    yield { type: 'end' }
  }
  supplyToolResults(_agentId: string, _results: ToolResult[]): void {}
  cancelStream(): void {}
  clearHistory(): void {}
}

describe('ChatOrchestrator per-agent mode', () => {
  it('returns default mode when no agent mode is set', () => {
    const orchestrator = new ChatOrchestrator(new MockBackend())
    expect(orchestrator.getAgentMode('wizard')).toBe('default')
  })

  it('stores and retrieves per-agent mode', () => {
    const orchestrator = new ChatOrchestrator(new MockBackend())
    orchestrator.setAgentMode('wizard', 'plan')
    expect(orchestrator.getAgentMode('wizard')).toBe('plan')
    expect(orchestrator.getAgentMode('scribe')).toBe('default')
  })

  it('uses global fallback when provided', () => {
    const orchestrator = new ChatOrchestrator(new MockBackend())
    orchestrator.setGlobalModeFallback(() => 'auto')
    expect(orchestrator.getAgentMode('wizard')).toBe('auto')
    orchestrator.setAgentMode('wizard', 'plan')
    expect(orchestrator.getAgentMode('wizard')).toBe('plan')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/orchestrator-agent-mode.test.ts 2>&1 | tail -10`
Expected: FAIL — `setAgentMode`, `getAgentMode`, `setGlobalModeFallback` don't exist

- [ ] **Step 3: Add per-agent mode to ChatOrchestrator**

In `src/main/chat/orchestrator.ts`, add after line 65 (`private getModelOverride`):

```typescript
  private agentModes = new Map<AgentId, import('../../shared/types').PermissionMode>()
  private globalModeFallback: (() => import('../../shared/types').PermissionMode) | null = null

  setAgentMode(agentId: AgentId, mode: import('../../shared/types').PermissionMode): void {
    this.agentModes.set(agentId, mode)
  }

  getAgentMode(agentId: AgentId): import('../../shared/types').PermissionMode {
    return this.agentModes.get(agentId) ?? this.globalModeFallback?.() ?? 'default'
  }

  setGlobalModeFallback(fn: () => import('../../shared/types').PermissionMode): void {
    this.globalModeFallback = fn
  }
```

Then in `processStream()`, add `permissionMode` to the `ChatOpts` construction (after the `temperature` line, around line 191):

```typescript
      model: this.getModelOverride?.(config.model) ?? config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      permissionMode: this.backend.managesTools ? this.getAgentMode(agentId) : undefined
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/orchestrator-agent-mode.test.ts 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Wire IPC handlers in main/index.ts**

Add after the existing settings IPC handlers (around line 513):

```typescript
// Per-agent permission mode
ipcMain.on('chat:set-agent-mode', (_event, data: { agentId: string; mode: string }) => {
  chatOrchestrator.setAgentMode(data.agentId, data.mode as PermissionMode)
})

ipcMain.handle('chat:get-agent-mode', (_e, agentId: string) => {
  return chatOrchestrator.getAgentMode(agentId)
})
```

Also wire the global fallback after `chatOrchestrator.setModelResolver(...)` (around line 127):

```typescript
chatOrchestrator.setGlobalModeFallback(() => settingsRepo.getPermissionMode())
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -v history.test.ts`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add src/main/chat/orchestrator.ts src/main/index.ts src/main/__tests__/orchestrator-agent-mode.test.ts
git commit -m "feat: add per-agent permission mode to ChatOrchestrator with IPC handlers"
```

---

## Task 5: Slash Command Registry

**Files:**

- Create: `src/main/chat/slash-command-registry.ts`
- Create: `src/main/__tests__/slash-command-registry.test.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/slash-command-registry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SlashCommandRegistry } from '../chat/slash-command-registry'

vi.mock('child_process', () => ({
  execFile: vi.fn()
}))

import { execFile } from 'child_process'

const mockExecFile = vi.mocked(execFile)

beforeEach(() => {
  mockExecFile.mockReset()
})

describe('SlashCommandRegistry', () => {
  it('returns fallback commands when CLI is unavailable', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = (typeof _opts === 'function' ? _opts : cb) as Function
      callback(new Error('command not found'), '', '')
      return {} as any
    })
    const registry = new SlashCommandRegistry()
    const commands = await registry.getCommands()
    expect(commands.length).toBeGreaterThan(0)
    expect(commands.some((c) => c.name === 'brainstorm')).toBe(true)
  })

  it('caches result after first call', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = (typeof _opts === 'function' ? _opts : cb) as Function
      callback(new Error('nope'), '', '')
      return {} as any
    })
    const registry = new SlashCommandRegistry()
    await registry.getCommands()
    await registry.getCommands()
    // execFile called only once (for the first getCommands call)
    expect(mockExecFile).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/slash-command-registry.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SlashCommandRegistry**

Create `src/main/chat/slash-command-registry.ts`:

```typescript
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SlashCommand } from '../../shared/dialogue-control-types'

const execFileAsync = promisify(execFile)

const FALLBACK_COMMANDS: SlashCommand[] = [
  { name: 'brainstorm', description: 'Brainstorm ideas collaboratively' },
  { name: 'simplify', description: 'Simplify and refine code' },
  { name: 'review', description: 'Review code changes' },
  { name: 'plan', description: 'Create an implementation plan' },
  { name: 'compact', description: 'Compact conversation history' },
  { name: 'clear', description: 'Clear conversation' }
]

export class SlashCommandRegistry {
  private cachedCommands: SlashCommand[] | null = null

  async getCommands(): Promise<SlashCommand[]> {
    if (this.cachedCommands) return this.cachedCommands

    try {
      const { stdout } = await execFileAsync('claude', ['--help'], { timeout: 5_000 })
      const commands = this.parseHelpOutput(stdout)
      this.cachedCommands = commands.length > 0 ? commands : FALLBACK_COMMANDS
    } catch {
      this.cachedCommands = FALLBACK_COMMANDS
    }

    return this.cachedCommands
  }

  private parseHelpOutput(output: string): SlashCommand[] {
    // Parse lines matching "  /command  Description text"
    const commands: SlashCommand[] = []
    const lines = output.split('\n')
    for (const line of lines) {
      const match = line.match(/^\s+\/(\w[\w-]*)\s{2,}(.+)$/)
      if (match) {
        commands.push({ name: match[1], description: match[2].trim() })
      }
    }
    return commands
  }

  clearCache(): void {
    this.cachedCommands = null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/slash-command-registry.test.ts 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Wire IPC handler in main/index.ts**

Import at top of `src/main/index.ts`:

```typescript
import { SlashCommandRegistry } from './chat/slash-command-registry'
```

After `const chatOrchestrator = ...` (around line 122):

```typescript
const slashCommandRegistry = new SlashCommandRegistry()
```

Add IPC handler (near the other new handlers):

```typescript
ipcMain.handle('slash:list-commands', async () => {
  return slashCommandRegistry.getCommands()
})
```

- [ ] **Step 6: Commit**

```bash
git add src/main/chat/slash-command-registry.ts src/main/__tests__/slash-command-registry.test.ts src/main/index.ts
git commit -m "feat: add SlashCommandRegistry with CLI discovery and fallback"
```

---

## Task 6: @ Mention Sources IPC Handler

**Files:**

- Modify: `src/main/index.ts`

- [ ] **Step 1: Add `at:list-sources` IPC handler**

This handler aggregates NPC list, book items, and file entries from approved folders.

Add in `src/main/index.ts` near the other new IPC handlers:

```typescript
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
    const sources: import('../shared/types').AtSource[] = []

    // NPCs — use known agent IDs with getAgentConfig
    for (const id of KNOWN_AGENT_IDS) {
      const config = getAgentConfig(id)
      if (config) {
        sources.push({ type: 'npc', id, label: id })
      }
    }

    // Books — from items repo
    try {
      const items = itemRepo.getAll('player-1')
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

    // Files — from approved folders (shallow listing)
    try {
      const { readdirSync } = await import('fs')
      const folders = getApprovedFolders()
      for (const folder of folders) {
        try {
          const entries = readdirSync(folder.path, { withFileTypes: true }).slice(0, 50)
          for (const entry of entries) {
            sources.push({
              type: 'file',
              id: `${folder.path}/${entry.name}`,
              label: entry.name,
              secondary: folder.path
            })
          }
        } catch {
          /* folder not accessible */
        }
      }
    } catch {
      /* fs error */
    }

    return sources
  }
)
```

Note: `getAgentConfig` is already imported at the top of `index.ts` from `'./agents/system-prompts'`. The `KNOWN_AGENT_IDS` array should be defined as a module-level const near the IPC handlers.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -v history.test.ts`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add at:list-sources IPC handler for @ mention autocomplete"
```

---

## Task 7: Preload Bridge — Expose New IPC Channels

**Files:**

- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add new API methods**

In `src/preload/index.ts`, add to the `api` object (after the Settings section, before the closing `}`):

```typescript
  // Dialogue controls
  setAgentMode: (agentId: string, mode: string): void =>
    ipcRenderer.send('chat:set-agent-mode', { agentId, mode }),
  getAgentMode: (agentId: string): Promise<string> =>
    ipcRenderer.invoke('chat:get-agent-mode', agentId),
  listSlashCommands: (): Promise<import('../shared/dialogue-control-types').SlashCommand[]> =>
    ipcRenderer.invoke('slash:list-commands'),
  listAtSources: (
    query: string,
    agentId: string
  ): Promise<import('../shared/dialogue-control-types').AtSource[]> =>
    ipcRenderer.invoke('at:list-sources', { query, agentId }),
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck 2>&1 | grep -v history.test.ts`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose dialogue control IPC channels in preload bridge"
```

---

## Task 8: i18n — Permission Mode Keys

**Files:**

- Modify: `src/renderer/src/i18n/locales/zh-TW.json`
- Modify: `src/renderer/src/i18n/locales/en.json`

- [ ] **Step 1: Add zh-TW keys**

Add before the closing `}` in `src/renderer/src/i18n/locales/zh-TW.json` (inside the existing structure, after the `"npcs"` section):

```json
  "permissionMode": {
    "default": "預設模式",
    "acceptEdits": "接受編輯",
    "auto": "自動模式",
    "plan": "計畫模式"
  }
```

- [ ] **Step 2: Add en keys**

Add the same section in `src/renderer/src/i18n/locales/en.json`:

```json
  "permissionMode": {
    "default": "Default Mode",
    "acceptEdits": "Accept Edits",
    "auto": "Auto Mode",
    "plan": "Plan Mode"
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/locales/zh-TW.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(i18n): add permission mode labels in zh-TW and en"
```

---

## Task 9: AutocompletePopup Component

**Files:**

- Create: `src/renderer/src/components/ui/AutocompletePopup.tsx`
- Create: `src/renderer/src/components/ui/__tests__/AutocompletePopup.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ui/__tests__/AutocompletePopup.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AutocompletePopup } from '../AutocompletePopup'
import type { AutocompleteItem } from '../../../../shared/dialogue-control-types'

const items: AutocompleteItem[] = [
  { type: 'slash', id: 'brainstorm', label: '/brainstorm', description: 'Brainstorm ideas' },
  { type: 'slash', id: 'simplify', label: '/simplify', description: 'Simplify code' }
]

describe('AutocompletePopup', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <AutocompletePopup items={items} selectedIndex={0} onSelect={vi.fn()} visible={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders items when visible', () => {
    render(<AutocompletePopup items={items} selectedIndex={0} onSelect={vi.fn()} visible={true} />)
    expect(screen.getByText('/brainstorm')).toBeTruthy()
    expect(screen.getByText('/simplify')).toBeTruthy()
  })

  it('highlights the selected index', () => {
    render(<AutocompletePopup items={items} selectedIndex={1} onSelect={vi.fn()} visible={true} />)
    const selected = screen.getByText('/simplify').closest('[data-selected]')
    expect(selected?.getAttribute('data-selected')).toBe('true')
  })

  it('calls onSelect when item is clicked', () => {
    const onSelect = vi.fn()
    render(<AutocompletePopup items={items} selectedIndex={0} onSelect={onSelect} visible={true} />)
    screen.getByText('/simplify').click()
    expect(onSelect).toHaveBeenCalledWith(items[1])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/ui/__tests__/AutocompletePopup.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AutocompletePopup**

Create `src/renderer/src/components/ui/AutocompletePopup.tsx`:

```tsx
import type { CSSProperties } from 'react'
import type { AutocompleteItem } from '../../../../shared/dialogue-control-types'

interface AutocompletePopupProps {
  items: AutocompleteItem[]
  selectedIndex: number
  onSelect: (item: AutocompleteItem) => void
  visible: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  slash: 'Slash Commands',
  npc: 'NPCs',
  book: 'Books',
  file: 'Files'
}

const containerStyle: CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: 0,
  right: 0,
  marginBottom: 4,
  background: 'rgba(20, 20, 40, 0.98)',
  border: '1px solid rgba(200, 180, 140, 0.3)',
  borderRadius: 4,
  padding: '4px 0',
  maxHeight: 200,
  overflowY: 'auto',
  zIndex: 20,
  boxShadow: '0 -4px 16px rgba(0,0,0,0.4)'
}

const categoryLabelStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  color: 'rgba(200, 180, 140, 0.6)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontFamily: 'monospace'
}

function itemStyle(isSelected: boolean): CSSProperties {
  return {
    padding: '6px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: isSelected ? 'rgba(200, 180, 140, 0.12)' : 'transparent',
    fontFamily: 'monospace',
    fontSize: 13
  }
}

export function AutocompletePopup({
  items,
  selectedIndex,
  onSelect,
  visible
}: AutocompletePopupProps) {
  if (!visible || items.length === 0) return null

  // Group items by type for categorized display
  const groups = new Map<string, AutocompleteItem[]>()
  for (const item of items) {
    const list = groups.get(item.type) ?? []
    list.push(item)
    groups.set(item.type, list)
  }

  let flatIndex = 0

  return (
    <div style={containerStyle}>
      {Array.from(groups.entries()).map(([type, groupItems]) => (
        <div key={type}>
          {groups.size > 1 && <div style={categoryLabelStyle}>{CATEGORY_LABELS[type] ?? type}</div>}
          {groupItems.map((item) => {
            const idx = flatIndex++
            const isSelected = idx === selectedIndex
            return (
              <div
                key={item.id}
                data-selected={isSelected ? 'true' : 'false'}
                style={itemStyle(isSelected)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(item)
                }}
              >
                {item.icon && <span style={{ fontSize: 14 }}>{item.icon}</span>}
                <span style={{ color: '#e8d5a8' }}>{item.label}</span>
                {item.description && (
                  <span style={{ color: 'rgba(200, 180, 140, 0.5)', fontSize: 12 }}>
                    {item.description}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/components/ui/__tests__/AutocompletePopup.test.tsx 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/AutocompletePopup.tsx src/renderer/src/components/ui/__tests__/AutocompletePopup.test.tsx
git commit -m "feat: add AutocompletePopup component with categorized sections"
```

---

## Task 10: PermissionModeButton Component

**Files:**

- Create: `src/renderer/src/components/ui/PermissionModeButton.tsx`
- Create: `src/renderer/src/components/ui/__tests__/PermissionModeButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ui/__tests__/PermissionModeButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PermissionModeButton } from '../PermissionModeButton'

// Mock useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'permissionMode.default': 'Default Mode',
        'permissionMode.acceptEdits': 'Accept Edits',
        'permissionMode.auto': 'Auto Mode',
        'permissionMode.plan': 'Plan Mode'
      }
      return map[key] ?? key
    }
  })
}))

describe('PermissionModeButton', () => {
  it('renders the current mode icon', () => {
    render(<PermissionModeButton currentMode="auto" onModeChange={vi.fn()} disabled={false} />)
    expect(screen.getByTitle('Auto Mode')).toBeTruthy()
  })

  it('opens dropdown on click and shows all modes', () => {
    render(<PermissionModeButton currentMode="default" onModeChange={vi.fn()} disabled={false} />)
    fireEvent.click(screen.getByTitle('Default Mode'))
    expect(screen.getByText('Accept Edits')).toBeTruthy()
    expect(screen.getByText('Auto Mode')).toBeTruthy()
    expect(screen.getByText('Plan Mode')).toBeTruthy()
  })

  it('calls onModeChange when a mode is selected', () => {
    const onModeChange = vi.fn()
    render(
      <PermissionModeButton currentMode="default" onModeChange={onModeChange} disabled={false} />
    )
    fireEvent.click(screen.getByTitle('Default Mode'))
    fireEvent.click(screen.getByText('Auto Mode'))
    expect(onModeChange).toHaveBeenCalledWith('auto')
  })

  it('does not open dropdown when disabled', () => {
    render(<PermissionModeButton currentMode="default" onModeChange={vi.fn()} disabled={true} />)
    fireEvent.click(screen.getByTitle('Default Mode'))
    expect(screen.queryByText('Auto Mode')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/ui/__tests__/PermissionModeButton.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PermissionModeButton**

Create `src/renderer/src/components/ui/PermissionModeButton.tsx`:

```tsx
import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  UI_PERMISSION_MODES,
  PERMISSION_MODE_ICONS,
  type UIPermissionMode
} from '../../../../shared/dialogue-control-types'

interface PermissionModeButtonProps {
  currentMode: UIPermissionMode
  onModeChange: (mode: UIPermissionMode) => void
  disabled: boolean
}

const btnSize = 30

export function PermissionModeButton({
  currentMode,
  onModeChange,
  disabled
}: PermissionModeButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const buttonStyle: CSSProperties = {
    width: btnSize,
    height: btnSize,
    boxSizing: 'border-box',
    padding: 0,
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: `${btnSize - 2}px`,
    textAlign: 'center',
    background: open ? 'rgba(200,180,140,0.35)' : 'rgba(200,180,140,0.15)',
    border: '1px solid rgba(200,180,140,0.4)',
    color: '#c4a46c',
    cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 3,
    flexShrink: 0,
    transition: 'background 0.15s'
  }

  const dropdownStyle: CSSProperties = {
    position: 'absolute',
    bottom: btnSize + 4,
    right: 0,
    minWidth: 150,
    background: 'rgba(20, 20, 40, 0.98)',
    border: '1px solid rgba(200, 180, 140, 0.4)',
    borderRadius: 4,
    padding: '4px 0',
    zIndex: 20,
    boxShadow: '0 -4px 12px rgba(0,0,0,0.4)'
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      {open && (
        <div style={dropdownStyle}>
          <div
            style={{
              padding: '4px 10px',
              fontSize: 11,
              color: 'rgba(200, 180, 140, 0.6)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontFamily: 'monospace'
            }}
          >
            Permission Mode
          </div>
          {UI_PERMISSION_MODES.map((mode) => (
            <div
              key={mode}
              onMouseDown={(e) => {
                e.preventDefault()
                onModeChange(mode)
                setOpen(false)
              }}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: mode === currentMode ? 'rgba(200, 180, 140, 0.12)' : 'transparent',
                fontFamily: 'monospace',
                fontSize: 13
              }}
            >
              <span style={{ fontSize: 14 }}>{PERMISSION_MODE_ICONS[mode]}</span>
              <span style={{ color: '#e8d5a8' }}>{t(`permissionMode.${mode}`)}</span>
              {mode === currentMode && (
                <span style={{ marginLeft: 'auto', color: '#c4a46c', fontSize: 11 }}>✓</span>
              )}
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={buttonStyle}
        title={t(`permissionMode.${currentMode}`)}
      >
        {PERMISSION_MODE_ICONS[currentMode]}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/components/ui/__tests__/PermissionModeButton.test.tsx 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/PermissionModeButton.tsx src/renderer/src/components/ui/__tests__/PermissionModeButton.test.tsx
git commit -m "feat: add PermissionModeButton with dropdown and i18n tooltip"
```

---

## Task 11: SmartInput Component

**Files:**

- Create: `src/renderer/src/components/ui/SmartInput.tsx`
- Create: `src/renderer/src/components/ui/__tests__/SmartInput.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ui/__tests__/SmartInput.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SmartInput } from '../SmartInput'

describe('SmartInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onAttach: vi.fn(),
    disabled: false,
    placeholder: 'Type...',
    slashCommands: [
      { name: 'brainstorm', description: 'Brainstorm ideas' },
      { name: 'simplify', description: 'Simplify code' }
    ],
    atSources: [{ type: 'npc' as const, id: 'wizard', label: 'wizard', secondary: '巫師 瑪琳' }]
  }

  it('renders a textarea', () => {
    render(<SmartInput {...defaultProps} />)
    expect(screen.getByPlaceholderText('Type...')).toBeTruthy()
  })

  it('shows slash autocomplete when "/" is typed at position 0', () => {
    render(<SmartInput {...defaultProps} value="/" />)
    const textarea = screen.getByPlaceholderText('Type...')
    fireEvent.change(textarea, { target: { value: '/' } })
    // AutocompletePopup should be visible with slash commands
    expect(screen.getByText('/brainstorm')).toBeTruthy()
  })

  it('does not show slash autocomplete for "/" mid-text', () => {
    render(<SmartInput {...defaultProps} value="hello /" />)
    expect(screen.queryByText('/brainstorm')).toBeNull()
  })

  it('calls onSend on Enter without Shift', () => {
    const onSend = vi.fn()
    render(<SmartInput {...defaultProps} onSend={onSend} value="hello" />)
    const textarea = screen.getByPlaceholderText('Type...')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/ui/__tests__/SmartInput.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SmartInput**

Create `src/renderer/src/components/ui/SmartInput.tsx`:

```tsx
import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react'
import { AutocompletePopup } from './AutocompletePopup'
import type {
  AutocompleteItem,
  SlashCommand,
  AtSource
} from '../../../../shared/dialogue-control-types'

interface SmartInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAttach: (item: AutocompleteItem) => void
  disabled: boolean
  placeholder: string
  slashCommands: SlashCommand[]
  atSources: AtSource[]
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  onBackspaceEmpty?: () => void
}

const inputHeight = 30
const maxTextareaHeight = 120

function buildSlashItems(commands: SlashCommand[], filter: string): AutocompleteItem[] {
  const query = filter.toLowerCase()
  return commands
    .filter((c) => c.name.toLowerCase().includes(query))
    .map((c) => ({
      type: 'slash' as const,
      id: c.name,
      label: `/${c.name}`,
      description: c.description
    }))
}

function buildAtItems(sources: AtSource[], filter: string): AutocompleteItem[] {
  const query = filter.toLowerCase()
  return sources
    .filter(
      (s) =>
        s.label.toLowerCase().includes(query) ||
        (s.secondary?.toLowerCase().includes(query) ?? false)
    )
    .map((s) => ({
      type: s.type,
      id: s.id,
      label: s.type === 'npc' ? `@${s.label}` : s.label,
      description: s.secondary,
      icon: s.type === 'npc' ? '🧙' : s.type === 'book' ? '📖' : '📄'
    }))
}

export function SmartInput({
  value,
  onChange,
  onSend,
  onAttach,
  disabled,
  placeholder,
  slashCommands,
  atSources,
  inputRef: externalRef,
  onBackspaceEmpty
}: SmartInputProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalRef ?? internalRef
  const [autocomplete, setAutocomplete] = useState<{
    mode: 'slash' | 'at'
    items: AutocompleteItem[]
    selectedIndex: number
    anchorPos: number // cursor position where trigger started
  } | null>(null)

  // Derive autocomplete state from value
  useEffect(() => {
    // Check for slash command: "/" at position 0
    if (value.startsWith('/')) {
      const filter = value.slice(1).split(/\s/)[0] // text after "/" until first space
      if (!value.includes(' ')) {
        // Still typing the command name
        const items = buildSlashItems(slashCommands, filter)
        setAutocomplete((prev) => ({
          mode: 'slash',
          items,
          selectedIndex: Math.min(prev?.selectedIndex ?? 0, Math.max(items.length - 1, 0)),
          anchorPos: 0
        }))
        return
      }
    }

    // Check for @ mention: find last unresolved "@" before cursor
    const cursorPos = textareaRef.current?.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursorPos)
    const lastAtIdx = textBeforeCursor.lastIndexOf('@')
    if (lastAtIdx >= 0) {
      // Ensure @ is at start or preceded by whitespace
      const charBefore = lastAtIdx > 0 ? textBeforeCursor[lastAtIdx - 1] : ' '
      if (charBefore === ' ' || charBefore === '\n' || lastAtIdx === 0) {
        const filter = textBeforeCursor.slice(lastAtIdx + 1)
        if (!filter.includes(' ')) {
          const items = buildAtItems(atSources, filter)
          setAutocomplete((prev) => ({
            mode: 'at',
            items,
            selectedIndex: Math.min(prev?.selectedIndex ?? 0, Math.max(items.length - 1, 0)),
            anchorPos: lastAtIdx
          }))
          return
        }
      }
    }

    setAutocomplete(null)
  }, [value, slashCommands, atSources, textareaRef])

  const handleSelect = useCallback(
    (item: AutocompleteItem) => {
      if (!autocomplete) return

      if (autocomplete.mode === 'slash') {
        // Replace the /partial with /command + space
        onChange(item.label + ' ')
      } else {
        // Replace @partial with the resolved text
        const before = value.slice(0, autocomplete.anchorPos)
        const after = value.slice(textareaRef.current?.selectionStart ?? autocomplete.anchorPos)
        onChange(before + after)
        onAttach(item)
      }
      setAutocomplete(null)
      setTimeout(() => textareaRef.current?.focus(), 0)
    },
    [autocomplete, value, onChange, onAttach, textareaRef]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Autocomplete navigation
      if (autocomplete && autocomplete.items.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setAutocomplete((prev) =>
            prev ? { ...prev, selectedIndex: (prev.selectedIndex + 1) % prev.items.length } : null
          )
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setAutocomplete((prev) =>
            prev
              ? {
                  ...prev,
                  selectedIndex: (prev.selectedIndex - 1 + prev.items.length) % prev.items.length
                }
              : null
          )
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          handleSelect(autocomplete.items[autocomplete.selectedIndex])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setAutocomplete(null)
          return
        }
      }

      // Normal Enter = send
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSend()
        if (textareaRef.current) textareaRef.current.style.height = `${inputHeight}px`
        return
      }

      // Backspace at position 0 removes last attachment
      if (
        e.key === 'Backspace' &&
        textareaRef.current?.selectionStart === 0 &&
        textareaRef.current?.selectionEnd === 0
      ) {
        onBackspaceEmpty?.()
      }
    },
    [autocomplete, handleSelect, onSend, onBackspaceEmpty, textareaRef]
  )

  const textareaStyle: CSSProperties = {
    minHeight: inputHeight,
    maxHeight: maxTextareaHeight,
    boxSizing: 'border-box',
    padding: '4px 8px',
    fontFamily: 'monospace',
    fontSize: 14,
    background: 'transparent',
    border: 'none',
    color: '#fff',
    outline: 'none',
    resize: 'none',
    overflow: 'auto',
    lineHeight: '22px',
    width: '100%'
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <AutocompletePopup
        items={autocomplete?.items ?? []}
        selectedIndex={autocomplete?.selectedIndex ?? 0}
        onSelect={handleSelect}
        visible={autocomplete !== null && autocomplete.items.length > 0}
      />
      <div
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(200,180,140,0.3)',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, maxTextareaHeight) + 'px'
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          style={textareaStyle}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/components/ui/__tests__/SmartInput.test.tsx 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/SmartInput.tsx src/renderer/src/components/ui/__tests__/SmartInput.test.tsx
git commit -m "feat: add SmartInput component with slash and @ autocomplete"
```

---

## Task 12: Integrate into DialoguePanel

**Files:**

- Modify: `src/renderer/src/components/ui/DialoguePanel.tsx`

This is the integration task. Replace the existing `InputArea` component's inline textarea with `SmartInput` and add `PermissionModeButton`.

- [ ] **Step 1: Add imports at the top of DialoguePanel.tsx**

Add these imports alongside existing ones:

```typescript
import { SmartInput } from './SmartInput'
import { PermissionModeButton } from './PermissionModeButton'
import type {
  UIPermissionMode,
  SlashCommand,
  AtSource,
  AutocompleteItem
} from '../../../../shared/dialogue-control-types'
```

- [ ] **Step 2: Add state and data fetching in the main DialoguePanel component**

Inside the `DialoguePanel` function (before the `return`), add state for permission mode, slash commands, and @ sources:

```typescript
// Permission mode per-agent
const [agentMode, setAgentMode] = useState<UIPermissionMode>('default')
const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([])
const [atSources, setAtSources] = useState<AtSource[]>([])
const [isAgentSdk, setIsAgentSdk] = useState(false)

// Fetch permission mode, slash commands, and backend type on dialogue open
useEffect(() => {
  if (!dialogue) return
  window.api.getAgentMode(dialogue.agentId).then((mode) => {
    setAgentMode(mode as UIPermissionMode)
  })
  window.api.getSettings().then((settings) => {
    setIsAgentSdk(settings.auth_type === 'claude_cli')
  })
  window.api.listSlashCommands().then(setSlashCommands)
  window.api.listAtSources('', dialogue.agentId).then(setAtSources)
}, [dialogue?.agentId])

const handleModeChange = useCallback(
  (mode: UIPermissionMode) => {
    if (!dialogue) return
    setAgentMode(mode)
    window.api.setAgentMode(dialogue.agentId, mode)
  },
  [dialogue]
)

const handleAutocompleteAttach = useCallback(
  (item: AutocompleteItem) => {
    if (item.type === 'book') {
      // Same as existing book attachment — get the book from items
      window.api.getItems().then((items) => {
        const book = items.find((i) => i.id === item.id)
        if (book && book.type === 'book') {
          setAttachments((prev) => [...prev, { type: 'book', id: book.id, book }])
        }
      })
    } else if (item.type === 'file') {
      setAttachments((prev) => [...prev, { type: 'file', id: `file-${Date.now()}`, path: item.id }])
    } else if (item.type === 'npc') {
      // NPC context injection — fetch recent conversation and attach as context
      window.api.getConversationHistory(item.id).then((history) => {
        const recentMessages = history.slice(-5)
        const contextText = recentMessages.map((m) => `[${m.role}] ${m.content}`).join('\n')
        if (contextText) {
          setAttachments((prev) => [
            ...prev,
            {
              type: 'file',
              id: `npc-${item.id}-${Date.now()}`,
              path: `@${item.id} context`
            }
          ])
          // Prepend NPC context to next message via a ref or state
          setInput((prev) => prev)
        }
      })
    }
  },
  [dialogue]
)
```

- [ ] **Step 3: Update InputArea to accept new props and use SmartInput**

Replace the textarea section inside `InputArea` (the `<div>` containing attachment chips + textarea, lines 430-511) with:

```tsx
{
  /* SmartInput with attachment chips */
}
;<SmartInput
  value={input}
  onChange={(v) => setInput(v)}
  onSend={send}
  onAttach={onAutocompleteAttach}
  disabled={isBusy}
  placeholder={t('dialogue.inputPlaceholder')}
  slashCommands={slashCommands}
  atSources={atSources}
  inputRef={inputRef}
  onBackspaceEmpty={() => {
    if (attachments.length > 0) {
      onRemoveAttachment(attachments[attachments.length - 1].id)
    }
  }}
/>
```

Move attachment chips rendering into SmartInput or keep them above it (keep them above — they're part of the InputArea wrapper, not SmartInput).

- [ ] **Step 4: Add PermissionModeButton between SmartInput and the "+" button**

In the `InputArea` JSX, insert after the SmartInput and before the attach menu `<div ref={containerRef}>`:

```tsx
{
  /* Permission mode toggle — only for Agent SDK backend */
}
{
  isAgentSdk && (
    <PermissionModeButton currentMode={agentMode} onModeChange={onModeChange} disabled={isBusy} />
  )
}
```

Pass `isAgentSdk`, `agentMode`, and `onModeChange` as additional props to `InputArea`.

- [ ] **Step 5: Thread new props through InputArea**

Update the `InputArea` function signature to accept the new props:

```typescript
function InputArea({
  input,
  setInput,
  inputRef,
  isBusy,
  send,
  t,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  // New props
  slashCommands,
  atSources,
  isAgentSdk,
  agentMode,
  onModeChange,
  onAutocompleteAttach
}: {
  // ... existing types ...
  slashCommands: SlashCommand[]
  atSources: AtSource[]
  isAgentSdk: boolean
  agentMode: UIPermissionMode
  onModeChange: (mode: UIPermissionMode) => void
  onAutocompleteAttach: (item: AutocompleteItem) => void
})
```

And update the `<InputArea>` call site (around line 1096) to pass the new props.

- [ ] **Step 6: Test manually in the dev server**

Run: `npm run dev`

Verify:

1. Open any NPC dialogue — the mode button appears between textarea and "+" (only when `claude_cli` auth type is active)
2. Hover the mode button — tooltip shows localized mode name
3. Click mode button — dropdown appears with 4 modes, current mode has ✓
4. Type `/` in empty input — slash command autocomplete appears above
5. Type `@` in input — @ mention autocomplete shows NPCs, Books, Files sections
6. Arrow Up/Down navigates the list, Enter/Tab selects, Escape dismisses
7. Selecting a slash command inserts the text
8. Selecting an @ mention adds it as an attachment chip
9. Mode button is hidden when using API Key backend
10. Everything still works in zh-TW locale

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ui/DialoguePanel.tsx
git commit -m "feat: integrate SmartInput and PermissionModeButton into DialoguePanel"
```

---

## Task 13: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Chat module description**

The Chat module description should mention the per-agent PermissionMode and slash command registry. Update the line in CLAUDE.md:

Find the chat module line and append:
`ChatOrchestrator also manages per-agent permission modes (session-scoped) and a SlashCommandRegistry for CLI-discovered slash commands.`

- [ ] **Step 2: Update completion status**

No phase change needed — this is part of Phase 4A enhancements (or marks the start of further dialogue improvements).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with dialogue controls architecture notes"
```
