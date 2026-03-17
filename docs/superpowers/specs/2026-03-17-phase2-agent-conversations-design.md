# Phase 2: Agent Conversations — Design Specification

## Overview

Phase 2 adds real AI-powered dialogue to Claude RPG. Players can talk to any built-in NPC and receive streaming responses from Claude. Conversations persist in memory for the session, and players can have parallel conversations with multiple NPCs simultaneously — walking away from one NPC while it's still responding and talking to another.

## Goals

- Wire up the full Electron IPC path: renderer → main process (Anthropic SDK) → streaming response back to renderer
- Give each NPC a rich RPG persona via system prompts (customizable in future phases)
- Transform the placeholder DialoguePanel into a real streaming chat UI
- Support parallel concurrent conversations with multiple NPCs
- Show visual indicators on NPCs that have pending responses
- Provide API key management (set/check via safeStorage)

## Architecture

### Process Responsibilities

**Main Process** (`src/main/`)

- Stores API key via Electron `safeStorage` API (encrypted at OS level)
- Runs Anthropic SDK calls — the renderer never sees the raw API key
- Manages multiple concurrent streaming API calls (one per active NPC conversation)
- Maintains conversation history per agent (for sending full context to Claude)
- Exposes IPC handlers: `chat:send-message`, `chat:cancel-stream`, `chat:stream-chunk` (event), `chat:stream-end` (event), `chat:stream-error` (event), `apikey:set`, `apikey:check`, `apikey:clear`
- Max 3 concurrent streams — additional requests are queued until a slot opens (prevents API rate limiting)

**Preload** (`src/preload/`)

- Exposes typed API on `window.api` via `contextBridge` (flat namespace, typed in `src/preload/index.d.ts`):
  - `sendMessage(agentId: string, message: string): void`
  - `cancelStream(agentId: string): void`
  - `onStreamChunk(callback: (data: { agentId: string; chunk: string }) => void): () => void`
  - `onStreamEnd(callback: (data: { agentId: string }) => void): () => void`
  - `onStreamError(callback: (data: { agentId: string; error: string }) => void): () => void`
  - `setApiKey(key: string): Promise<boolean>`
  - `checkApiKey(): Promise<boolean>`
  - `clearApiKey(): Promise<void>`

**Renderer** (`src/renderer/`)

- `ConversationManager` service: in-memory conversation state per NPC
- Overhauled `DialoguePanel`: scrollable chat UI with streaming typewriter effect
- NPC speech bubble indicators via Phaser sprites

### Data Flow: Sending a Message

```
Player types in DialoguePanel → submit
  → React calls window.api.chat.sendMessage(agentId, text)
    → ipcRenderer.send('chat:send-message', { agentId, message })
      → Main process handler:
        1. Look up NPC system prompt from registry
        2. Append user message to conversation history for this agentId
        3. Call Anthropic SDK: client.messages.create({ stream: true, ... })
        4. For each streamed token:
           webContents.send('chat:stream-chunk', { agentId, chunk })
        5. On stream complete:
           Append full assistant message to history
           webContents.send('chat:stream-end', { agentId })
        6. On error:
           webContents.send('chat:stream-error', { agentId, error })
    → Renderer receives chunks via preload callbacks:
      - ConversationManager appends chunk to active conversation
      - If DialoguePanel is showing this NPC → React re-renders with new token
      - If DialoguePanel is closed → emit 'npc:speech-bubble' event for Phaser
  → Stream ends:
    - ConversationManager marks response complete
    - If dialogue was closed, speech bubble persists until player views it
```

### Parallel Conversations

The main process holds a `Map<string, ActiveStream>` tracking in-flight API calls:

```typescript
interface ActiveStream {
  agentId: string
  controller: AbortController
  conversationHistory: Message[]
}
```

Multiple streams can run concurrently (max 3 — additional requests are queued). Each IPC event is tagged with `agentId` so the renderer routes chunks to the correct conversation. When the player closes the dialogue mid-stream, the stream continues in the background — the main process keeps accumulating the response.

### Dual Conversation History

Conversation history is intentionally maintained in two places:

- **Main process** — The authoritative source. Holds the full message history in Anthropic API format (`{ role, content }`). Used to build the `messages` array for SDK calls. Persists across renderer hot-reloads in dev.
- **Renderer** — A display-oriented copy with timestamps and streaming state. Used by React components for rendering. On renderer reload (dev only), the renderer state is lost; the player can still send new messages (main process history is preserved), but previous messages won't appear in the UI until SQLite persistence is added in Phase 3.

The main process is the source of truth. The renderer reconstructs its view from IPC events. This is acceptable for Phase 2 (in-memory only) — Phase 3's SQLite persistence will provide a single shared store.

## Components

### 1. System Prompt Registry

**Location:** `src/main/agents/system-prompts.ts`

Each built-in NPC gets a rich RPG persona (~1-2 paragraphs). The system prompt defines:

- Character personality and speech style
- World context (their location, role in the town)
- Skill domain and capabilities
- How they address the player (冒險者/adventurer)
- Language behavior (respond in the player's language, maintain character)

```typescript
interface AgentConfig {
  id: string
  systemPrompt: string
  model: string // default: 'claude-sonnet-4-20250514'
  maxTokens: number // default: 1024
  temperature: number // default: 0.7
}
```

For Phase 2, system prompts live exclusively in the main process registry — they don't cross IPC to the renderer. The renderer's `AgentDef` type is not modified. In Phase 4 (Guild Hall), `AgentDef` will be extended with `systemPrompt`, `personality`, `isBuiltIn`, and `createdBy` fields to support custom agents.

**Built-in NPC personas:**

| NPC                 | Personality                    | Speech Style                                         |
| ------------------- | ------------------------------ | ---------------------------------------------------- |
| 長老 (Elder)        | Wise, patient, guiding         | Speaks in proverbs, addresses player as 年輕的冒險者 |
| 會長 (Guild Master) | Authoritative, encouraging     | Direct, uses guild terminology                       |
| 學者 (Scholar)      | Curious, thorough, analytical  | Academic tone, loves citing sources                  |
| 書記官 (Scribe)     | Meticulous, poetic             | Literary flair, precise word choice                  |
| 商人 (Merchant)     | Pragmatic, sharp, witty        | Business metaphors, values efficiency                |
| 指揮官 (Commander)  | Disciplined, direct, strategic | Military precision, structured responses             |
| 匠師 (Artisan)      | Creative, expressive, visual   | Artistic metaphors, thinks in images                 |
| 傳令使 (Herald)     | Diplomatic, warm, articulate   | Formal yet approachable, bridge-builder              |
| 巫師 (Wizard)       | Mysterious, precise, enigmatic | Cryptic hints mixed with technical accuracy          |
| 酒保 (Bartender)    | Friendly, gossipy, streetwise  | Casual tone, knows everyone's business               |

### 2. Conversation Manager

**Location:** `src/renderer/src/services/ConversationManager.ts`

In-memory implementation of `IConversationRepository`. Holds all conversation state for the current session.

```typescript
// TODO(phase-3): Replace InMemoryConversationRepository with SQLiteConversationRepository
interface IConversationRepository {
  getConversation(agentId: string): Conversation | null
  getOrCreateConversation(agentId: string): Conversation
  appendMessage(agentId: string, message: Message): void
  appendStreamChunk(agentId: string, chunk: string): void
  finalizeStream(agentId: string): void
  getStreamingState(agentId: string): StreamingState
  getAllActiveConversations(): Conversation[]
}

interface Conversation {
  agentId: string
  messages: Message[]
  streamingState: StreamingState
  // TODO(phase-3): Add id, playerId, skillCategory, xpEarned, status, timestamps
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

type StreamingState = 'idle' | 'streaming' | 'error'
```

### Conversation History Limits

To prevent unbounded context growth, the main process enforces a rolling window on conversation history sent to Claude:

- **Max messages per conversation:** 50 (25 turns). Older messages are dropped from the API call but kept in local history for UI display.
- When the limit is reached, the oldest user/assistant message pairs are trimmed from the `messages` array sent to the SDK. The system prompt is always included.

### 3. Dialogue Panel (Overhauled)

**Location:** `src/renderer/src/components/ui/DialoguePanel.tsx`

Transforms from static placeholder to full chat UI:

- **Header:** NPC name (localized) + close button
- **Message list:** Scrollable area showing conversation history. User messages right-aligned, NPC messages left-aligned. Auto-scrolls to bottom on new content.
- **Streaming display:** Current streaming response appears with typewriter effect (tokens appended in real-time). A blinking cursor or "..." indicator while streaming.
- **Input area:** Text input at bottom + send button. Disabled while NPC is streaming. Submit on Enter.
- **Context switching:** When player interacts with a different NPC, the panel switches to show that NPC's conversation. Previous conversation continues streaming in background.
- **Style:** RPG dialogue box aesthetic — dark semi-transparent background, gold borders, monospace font. Consistent with Phase 1 styling.

### 4. NPC Speech Bubble Indicators

**Location:** `src/renderer/src/game/entities/NPC.ts` (extended)

When an NPC has a pending/complete response that the player hasn't seen:

- Show a small speech bubble sprite or icon above the NPC on the Phaser map
- Subtle floating animation (bob up and down)
- Cleared when the player opens the dialogue with that NPC

New EventBus event:

```typescript
'npc:speech-bubble': { agentId: string; visible: boolean }
```

The ConversationManager emits this event when:

- A stream chunk arrives for an NPC whose dialogue is not currently open → `visible: true`
- The player opens the dialogue with that NPC → `visible: false`

### 5. API Key Management

**Location:** `src/main/api-key.ts`

Simple API key storage — no onboarding wizard yet (Phase 6).

```typescript
// Main process
function storeApiKey(key: string): void // safeStorage.encryptString → store in app data
function getApiKey(): string | null // retrieve + safeStorage.decryptString
function hasApiKey(): boolean
function clearApiKey(): void
```

IPC handlers:

- `apikey:set` — validate format (starts with `sk-ant-`), store via safeStorage
- `apikey:check` — returns boolean (key exists and is non-empty)

For Phase 2, the player sets their API key via:

- A simple modal triggered from a keyboard shortcut or menu
- Or a prompt that appears when they first try to talk to an NPC and no key is set

Error handling for invalid/expired keys:

- On API error (401/403): emit `chat:stream-error` with user-friendly message "通訊中斷...請檢查你的 API 金鑰" (Connection lost... please check your API key)
- Conversation is preserved — player can retry after fixing the key

### 6. Main Process Chat Handler

**Location:** `src/main/chat.ts`

Orchestrates API calls:

```typescript
interface ChatHandler {
  activeStreams: Map<string, ActiveStream>

  handleSendMessage(agentId: string, message: string, webContents: WebContents): void
  cancelStream(agentId: string): void
  getConversationHistory(agentId: string): Message[]
}
```

- On `chat:send-message`: look up system prompt, build messages array (system + history + new user message), call Anthropic SDK with streaming. The player's locale is sent with the message so the system prompt can instruct Claude to respond in the appropriate language.
- On `chat:cancel-stream`: abort the active stream for the given agentId via AbortController, send `chat:stream-end`
- Streams tokens back via `webContents.send('chat:stream-chunk', { agentId, chunk })`
- On completion: sends `chat:stream-end`, stores full assistant response in history
- On error: sends `chat:stream-error`, preserves conversation state for retry

### New EventBus Events

Added to `GameEvents` interface in `src/renderer/src/game/types.ts`:

```typescript
'npc:speech-bubble': { agentId: string; visible: boolean }
```

### New i18n Keys

**zh-TW:**

```json
{
  "dialogue": {
    "inputPlaceholder": "輸入訊息...",
    "send": "發送",
    "connectionError": "通訊中斷...請檢查你的 API 金鑰",
    "noApiKey": "需要 API 金鑰才能與 NPC 對話",
    "setApiKey": "設定 API 金鑰",
    "apiKeySet": "API 金鑰已設定",
    "apiKeyInvalid": "API 金鑰格式不正確",
    "retry": "重試"
  },
  "apiKey": {
    "title": "API 金鑰設定",
    "prompt": "請輸入你的 Anthropic API 金鑰",
    "placeholder": "sk-ant-...",
    "save": "儲存",
    "cancel": "取消"
  }
}
```

**en:**

```json
{
  "dialogue": {
    "inputPlaceholder": "Type a message...",
    "send": "Send",
    "connectionError": "Connection lost... please check your API key",
    "noApiKey": "An API key is required to talk to NPCs",
    "setApiKey": "Set API Key",
    "apiKeySet": "API key saved",
    "apiKeyInvalid": "Invalid API key format",
    "retry": "Retry"
  },
  "apiKey": {
    "title": "API Key Settings",
    "prompt": "Enter your Anthropic API key",
    "placeholder": "sk-ant-...",
    "save": "Save",
    "cancel": "Cancel"
  }
}
```

## Scope

**In scope:**

- Anthropic SDK integration (`@anthropic-ai/sdk`) in main process
- Full IPC plumbing (main ↔ preload ↔ renderer)
- Streaming chat with typewriter display
- Rich RPG system prompts for all 10 built-in NPCs
- Parallel concurrent conversations with multiple NPCs
- NPC speech bubble indicators on the Phaser map
- API key storage via safeStorage
- Simple API key entry UI
- In-memory conversation state with `IConversationRepository` interface
- `TODO(phase-3)` markers for SQLite persistence
- `TODO(phase-4)` markers for custom system prompt editing

**Out of scope:**

- SQLite persistence (Phase 3)
- XP awards from conversations (Phase 3)
- Custom agent creation / system prompt editing (Phase 4)
- Onboarding wizard with narrative API key flow (Phase 6)
- File/image upload in conversations
- Tool use / function calling

## Dependencies

- Phase 1 complete (Electron shell, Phaser world, NPCs, DialoguePanel scaffold, EventBus)
- `@anthropic-ai/sdk` npm package (new dependency, main process only)
