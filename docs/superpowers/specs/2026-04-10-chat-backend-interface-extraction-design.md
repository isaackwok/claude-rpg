# IChatBackend Interface Extraction

**Date:** 2026-04-10
**Scope:** Refactor `src/main/chat.ts` into a pluggable backend architecture
**Goal:** Enable dual auth (API Key vs Claude CLI subscription) by extracting an `IChatBackend` interface. This spec covers the interface extraction only (Phase 1 prep); the `ClaudeCliChatBackend` implementation is a future task.

## Motivation

Currently all AI communication goes through the Anthropic SDK with an API key. Users pay per-token. To support Claude subscription billing (`claude -p` CLI), we need a pluggable backend architecture. This refactor extracts the interface without changing any behavior — pure structural reorganization.

## File Structure

```
src/main/chat.ts (812 lines, deleted)
  ↓ splits into
src/main/chat/
  ├── types.ts            — IChatBackend, StreamEvent, ChatOpts
  ├── api-key-backend.ts  — ApiKeyChatBackend (SDK streaming + tool loop)
  ├── orchestrator.ts     — ChatOrchestrator (side effects, queue, tool/path confirmation)
  ├── history.ts          — ConversationHistoryManager (Map, trim, orphan repair)
  ├── tool-confirm.ts     — Tool confirmation + path approval flows (UI ↔ main)
  └── index.ts            — Re-exports for backwards-compatible imports
```

## Core Interface

```typescript
// src/main/chat/types.ts

// ── Provider-agnostic types ──────────────────────────────────────────
// These decouple the interface from any specific AI SDK.
// Each backend converts to/from its provider's native types internally.

/** Provider-agnostic tool definition (JSON Schema — universal across providers) */
interface ToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** Provider-agnostic tool result */
interface ToolResult {
  toolCallId: string
  content: string
  isError?: boolean
}

// ── Stream & interface types ──���──────────────────────────────────────

/** A single tool invocation request from the AI */
interface ToolCall {
  toolCallId: string
  toolName: ToolName
  args: Record<string, unknown>
}

type StreamEvent =
  | { type: 'text'; chunk: string }
  | { type: 'tool_use'; calls: ToolCall[] }
  | { type: 'end' }
  | { type: 'error'; error: string }

interface ChatOpts {
  agentId: AgentId
  systemPrompt: string
  tools: ToolSchema[]
  model: string
  maxTokens: number
  temperature: number
}

interface IChatBackend {
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

Each backend handles the conversion internally:

- `ApiKeyChatBackend`: `ToolSchema` → `Anthropic.Messages.Tool`, `ToolResult` → `ToolResultBlockParam`
- Future `ClaudeCliChatBackend`: tools controlled via `--allowedTools` flag
- Future `GeminiBackend`: `ToolSchema` → `FunctionDeclaration`
- Future `OpenAIBackend`: `ToolSchema` → OpenAI's `tools` format

The async generator pattern allows the orchestrator to `for await` over events. When a `tool_use` event is yielded, the backend's generator suspends at an internal `await waitForToolResults()`. The orchestrator runs confirmation + execution, calls `supplyToolResults()`, and the generator resumes.

## Architecture Layers

```
IPC handlers (src/main/index.ts)
  │
  ▼
ChatOrchestrator (side effects + queue + tool confirmation)
  │
  ▼
IChatBackend (pure AI communication)
  ├── ApiKeyChatBackend (Anthropic SDK — this spec)
  └── ClaudeCliChatBackend (claude -p — future)
```

### Interaction Flow

```
Orchestrator                          Backend
    │                                    │
    ├── sendMessage() ──────────────────►│
    │◄── text chunks ◄──────────────────│
    │◄── tool_use events ◄─────────────│
    │                                    │ (generator suspended)
    ├── [confirm with user]              │
    ├── [execute tool]                   │
    ├── [track achievements]             │
    ├── supplyToolResults() ────────────►│ (generator resumes)
    │◄── more text chunks ◄────────────│
    │◄── end ◄──────────────────────────│
    ├── [award XP, check quests]         │
    done
```

## Module Responsibilities

### `types.ts`

Defines `IChatBackend`, `StreamEvent`, `ChatOpts`, `ToolSchema`, `ToolResult`, and any shared types for the chat module. Main-process-only; nothing goes into `src/shared/types.ts`. All types are provider-agnostic — no Anthropic/OpenAI/Gemini SDK types leak into the interface.

### `history.ts`

Extracted from current `chat.ts` lines 71, 116–168.

```typescript
class ConversationHistoryManager {
  private histories: Map<AgentId, MessageParam[]>

  getOrCreate(agentId: AgentId): MessageParam[]
  trim(messages: MessageParam[]): MessageParam[]
  repairOrphanedToolUse(history: MessageParam[]): void
  clear(agentId: AgentId): void
}
```

Pure mechanical extraction. `ApiKeyChatBackend` owns an instance. Future `ClaudeCliChatBackend` won't need it (Claude Code manages its own context via `--resume`).

Constant `MAX_HISTORY_MESSAGES` (50) lives here. `MAX_TOOL_ROUNDS` (20) lives in `api-key-backend.ts` since it's a backend concern.

### `tool-confirm.ts`

Extracted from current `chat.ts` lines 27–31, 178–358.

Exports:

- `requestToolConfirmation(payload, webContents)` — pending promise + timeout mechanics
- `handleToolApproved(agentId, toolCallId, addToApproved)` — resolves pending promise
- `handleToolDenied(agentId, toolCallId)` — resolves pending promise as denied
- `checkAndApproveMessagePaths(agentId, message, locale, webContents)` — path approval flow
- `handlePathApproved(agentId, path, addToApproved)` — resolves pending path approval
- `handlePathDenied(agentId, path)` — resolves pending path approval as denied
- `buildToolSummary(toolName, args)` — human-readable tool description
- `getToolTargetPath(toolName, args)` — extract target path from tool args
- `extractMessagePaths(message)` — parse backtick-wrapped paths from user message
- `streamTextWithDelay(agentId, text, webContents)` — simulated NPC typing (used by path approval UX)

Module-level state that moves here:

- `pendingToolConfirms: Map<string, PendingToolConfirm>`
- `pendingPathApprovals: Map<AgentId, PendingPathApproval>`
- `oneTimeApprovedPaths: Set<string>`
- `TOOL_CONFIRM_TIMEOUT` constant

Backend-agnostic — both backends use the same in-game confirmation UI.

### `api-key-backend.ts`

The current SDK streaming + tool loop, reshaped to implement `IChatBackend`.

```typescript
class ApiKeyChatBackend implements IChatBackend {
  private history: ConversationHistoryManager
  private activeStreams: Map<AgentId, AbortController>
  private pendingToolResults: Map<AgentId, { resolve: (results: ToolResult[]) => void }>
  private getApiKey: () => string | null
  private cachedClient: { apiKey: string; client: Anthropic } | null

  constructor(getApiKey: () => string | null)

  async *sendMessage(opts: ChatOpts, message: string): AsyncIterable<StreamEvent>
  supplyToolResults(agentId: AgentId, results: ToolResultBlock[]): void
  cancelStream(agentId: AgentId): void
  clearHistory(agentId: AgentId): void
}
```

Key implementation details:

- `sendMessage()` is an async generator. It contains the tool-use while loop but does **not** execute tools — it yields `tool_use` events and suspends via `await waitForToolResults()`.
- SDK `stream.on('text', ...)` is callback-based. An internal async queue bridges callbacks to the generator's yield.
- History trim + orphan repair happen before each API call.
- Error handling / history repair on abort stays here (it knows MessageParam structure).
- `getOrCreateClient()` is a private method on the class.

### `orchestrator.ts`

The main entry point that IPC handlers call.

```typescript
class ChatOrchestrator {
  private backend: IChatBackend
  private activeAgents: Set<AgentId>
  private pendingQueue: Array<{ agentId; message; locale; webContents }>

  // Dependencies (replaces setChatDependencies)
  private progressionEngine: ProgressionEngine | null
  private questEngine: QuestEngine | null
  private conversationPersistence: SqliteConversationPersistence | null
  private achievementEngine: AchievementEngine | null
  private achievementRepo: SqliteAchievementRepository | null
  private cosmeticRepo: SqliteCosmeticRepository | null

  constructor(backend: IChatBackend)

  setDependencies(deps: ChatDependencies): void
  setBackend(backend: IChatBackend): void

  async handleSendMessage(agentId, message, locale, webContents): Promise<void>
  cancelStream(agentId): void

  private async processStream(agentId, message, locale, webContents): Promise<void>
  private async handlePostResponse(agentId, fullText, config, webContents): Promise<void>
  private processQueue(): void
}
```

`handleSendMessage` flow:

1. Queue if at capacity (`MAX_CONCURRENT_STREAMS = 3`)
2. `checkAndApproveMessagePaths()` (from `tool-confirm.ts`)
3. Persist user message to SQLite
4. Build `ChatOpts` from `AgentConfig` (convert `getToolsForAgent()` results to `ToolSchema[]`)
5. `for await (event of backend.sendMessage(opts, message))`
   - `text` → `webContents.send('chat:stream-chunk', ...)`
   - `tool_use` → confirm via `tool-confirm.ts` → execute via `tool-executor.ts` → track achievements → `backend.supplyToolResults()`
   - `end` → call `handlePostResponse()`
   - `error` → `webContents.send('chat:stream-error', ...)`
6. `webContents.send('chat:stream-end', ...)`

`handlePostResponse` contains the current lines 628–740:

- Persist assistant message
- Award XP via `progressionEngine`
- Check quests via `questEngine`
- Award bonus XP for completed quests
- Check progression achievements via `achievementEngine`
- Unlock cosmetic rewards

### `index.ts`

Re-exports to maintain backwards compatibility for `src/main/index.ts`:

```typescript
export { ChatOrchestrator } from './orchestrator'
export { ApiKeyChatBackend } from './api-key-backend'
export type { IChatBackend, StreamEvent, ChatOpts } from './types'

// Re-export handler functions used by IPC registration in src/main/index.ts
export {
  handleToolApproved,
  handleToolDenied,
  handlePathApproved,
  handlePathDenied
} from './tool-confirm'
```

## Changes to `src/main/index.ts`

Minimal edit:

1. Import path changes from `'./chat'` to `'./chat/index'`
2. Startup wiring changes from:
   ```typescript
   setChatDependencies(progressionEngine, questEngine, ...)
   ```
   to:
   ```typescript
   const backend = new ApiKeyChatBackend(() => getApiKey())
   const orchestrator = new ChatOrchestrator(backend)
   orchestrator.setDependencies({ progressionEngine, questEngine, ... })
   ```
3. IPC handlers change from:
   ```typescript
   handleSendMessage(agentId, message, locale, event.sender)
   ```
   to:
   ```typescript
   orchestrator.handleSendMessage(agentId, message, locale, event.sender)
   ```
4. `cancelStream` similarly delegates to `orchestrator.cancelStream()`

## What Does NOT Change

- **`src/preload/index.ts`** — no IPC channels change
- **Renderer (React/Phaser)** — zero changes
- **`src/main/tools/`** — `tool-definitions.ts`, `tool-executor.ts`, `path-utils.ts` untouched
- **`src/main/agents/system-prompts.ts`** — untouched
- **`src/main/api-key.ts`** — untouched
- **`src/main/folder-manager.ts`** — untouched
- **`src/shared/types.ts`** — no changes to existing types
- **All progression/quest/achievement engines** — untouched

## Future: ClaudeCliChatBackend

Not part of this spec, but the architecture enables it. A future `claude-cli-backend.ts` would:

- Implement `IChatBackend`
- Spawn `claude -p --output-format stream-json --system-prompt "..." --resume <sessionId>`
- Parse stdout JSON events into `StreamEvent`
- Map `AgentId` → Claude Code session ID (persisted in SQLite)
- Use `process.kill()` for `cancelStream()`
- Not need `ConversationHistoryManager` (Claude Code handles its own context)

The orchestrator would swap backends at runtime via `setBackend()` based on user's auth choice.

## Testing Strategy

This is a pure refactor — no behavior changes. Verification:

1. Existing e2e tests must pass unchanged
2. Manual verification: start conversation, tool use with approval/denial, path approval, cancel stream, XP award, quest completion
3. TypeScript strict compilation with no new errors
