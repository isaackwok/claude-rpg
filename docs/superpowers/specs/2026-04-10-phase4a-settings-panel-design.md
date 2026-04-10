# Phase 4A — Settings Panel Design

## Overview

Add a settings panel to Claude RPG that allows users to configure authentication method, default AI model, and language. This is the first sub-phase of Phase 4, laying groundwork for Guild Hall (Phase 4B) and later phases.

## Goals

- Surface auth type selection (API Key vs Claude CLI subscription)
- Provide global model default (architecture supports per-agent override later)
- Unify language setting (UI + NPC response language) in one place
- Two entry points: HUD gear icon + ESC key
- Follow existing project patterns (repository, IPC, React overlays)

## Non-Goals

- Per-agent model override (Phase 4B)
- API key setup wizard UX (Phase 6)
- Additional settings categories beyond auth/model/language

---

## 1. Data & Storage Layer

### New Migration: `settings` table

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Simple key-value store. Values are JSON-serialized strings.

### Initial Settings Keys

| Key         | Type                        | Default               | Notes                           |
| ----------- | --------------------------- | --------------------- | ------------------------------- |
| `auth_type` | `"api_key" \| "claude_cli"` | `"api_key"`           | Which `IChatBackend` to use     |
| `model`     | `string`                    | `"claude-sonnet-4-6"` | Global default model            |
| `locale`    | `"zh-TW" \| "en"`           | `"zh-TW"`             | Migrated out of `players` table |

API key remains in Electron's `safeStorage` — never stored in SQLite.

### ISettingsRepository Interface

```typescript
interface ISettingsRepository {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  getAll(): Record<string, unknown>
}
```

`SettingsRepository` implements this with typed convenience methods:

- `getAuthType(): AuthType`
- `getModel(): string`
- `getLocale(): Locale`
- Corresponding setters for each

### Locale Migration

Currently `locale` lives on the `players` table. Since the app is single-player, locale is a global setting. The migration moves the value from `players.locale` to `settings.locale` and the `players.locale` column can be left in place (no destructive migration) but is no longer read.

---

## 2. Backend Architecture

### ClaudeCliChatBackend

New `IChatBackend` implementation that delegates to the Claude CLI instead of the Anthropic SDK.

- Spawns `claude` as a child process via `child_process.spawn`
- Uses `claude --print` for request/response or streaming flags for streamed output
- Passes system prompt via `--system-prompt` flag
- Parses CLI stdout line-by-line into the same `StreamEvent` types that `ApiKeyChatBackend` produces (`text_delta`, `message_start`, `message_stop`, etc.)
- Tool use requests from CLI are parsed and surfaced through `StreamEvent.tool_use`; tool results are fed back by resuming the conversation with a new `claude` invocation that includes the tool result in the message history

**Limitations:**

- Claude CLI must be installed and authenticated separately by the user
- Some Anthropic SDK features (prompt caching, etc.) may not be available
- Streaming behavior may differ slightly from the SDK

### BackendManager

New service in `src/main/chat/` that owns `IChatBackend` lifecycle.

Responsibilities:

- On startup, reads `auth_type` from `SettingsRepository` and instantiates the correct backend
- Exposes `switchBackend(authType: AuthType): void` — tears down old backend, creates new one
- `ChatOrchestrator` receives its backend from `BackendManager` instead of constructing it directly
- Validates backend availability before switching (checks `claude` in PATH, auth status, etc.)

### Model Selection Flow

- `SettingsRepository.getModel()` is read by `ChatOrchestrator` when constructing `ChatOpts`
- If `AgentConfig.model` is set to `"default"` or is unset, falls back to the global setting
- This gives Phase 4B a hook for per-agent model overrides while built-in NPCs use the global default

```
Settings change → IPC → BackendManager.switchBackend()
                       → SettingsRepository.set('model', ...)
                       → ChatOrchestrator picks up new model on next message
```

---

## 3. IPC Layer

### New IPC Channels

| Channel                     | Direction       | Payload           | Purpose                                            |
| --------------------------- | --------------- | ----------------- | -------------------------------------------------- |
| `settings:get-all`          | Renderer → Main | —                 | Load all settings on panel open                    |
| `settings:set`              | Renderer → Main | `{ key, value }`  | Update a single setting                            |
| `settings:on-changed`       | Main → Renderer | `{ key, value }`  | Broadcast setting change to renderer               |
| `settings:validate-api-key` | Renderer → Main | `{ key: string }` | Test API key before saving                         |
| `settings:check-cli`        | Renderer → Main | —                 | Check if `claude` CLI is installed + authenticated |

### Preload Bridge Additions

```typescript
settings: {
  getAll(): Promise<SettingsMap>
  set(key: string, value: unknown): Promise<void>
  onChanged(cb: (key: string, value: unknown) => void): void
  validateApiKey(key: string): Promise<{ valid: boolean; error?: string }>
  checkCli(): Promise<{ installed: boolean; authenticated: boolean }>
}
```

The renderer never touches the API key directly or spawns processes — all validation happens in the main process.

---

## 4. UI Layout & Entry Points

### Settings Panel

Sidebar tabs layout:

- Left sidebar with category tabs (認證 / 模型 / 語言)
- Content area on the right showing the active tab's controls
- RPG-themed styling using the project color palette (dark bg `rgba(10,10,30,0.96)`, gold accents `#c4a46c`)

### Entry Points

Both entry points open the same `SettingsPanel` directly — no intermediate pause menu.

1. **Gear icon in HUD** — top-right corner of the game viewport, same z-layer as other HUD elements. `pointerEvents: 'none'` on container, `'auto'` on the button itself.
2. **ESC key** — toggles the settings panel open/close.

Dismissal: ESC again, close button, or clicking outside the panel.

**Priority rule:** If an NPC dialogue is active, ESC closes the dialogue first. Settings panel does not open during active conversations.

---

## 5. React Components

| Component            | Purpose                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `SettingsPanel`      | Root overlay. Sidebar tabs + content area. Manages open/close state via EventBus.                                                |
| `AuthTab`            | Auth type radio selection. Shows API key input (masked) when `api_key` selected, or CLI status check when `claude_cli` selected. |
| `ModelTab`           | Model dropdown selector. Lists available models. Greys out models unavailable for current auth type.                             |
| `LanguageTab`        | Language toggle between 繁體中文 and English.                                                                                    |
| `SettingsGearButton` | HUD gear icon button. Emits EventBus event to toggle settings panel.                                                             |

### State Management

- `SettingsPanel` fetches all settings on mount via `api.settings.getAll()`
- Each tab calls `api.settings.set(key, value)` on change
- `api.settings.onChanged()` listener keeps UI in sync
- Language change triggers `i18n.changeLanguage()` in the renderer immediately

### Overlay Behavior

Same pattern as existing overlays (DialoguePanel, etc.):

- Absolutely positioned over Phaser canvas
- `pointerEvents: 'auto'` when open, blocks game input
- Dark backdrop overlay to dim the game world

---

## 6. Integration & Edge Cases

### Startup Flow

1. App launches → `SettingsRepository` reads from SQLite
2. `BackendManager` instantiates the correct `IChatBackend` based on `auth_type`
3. If API Key mode but no key in `safeStorage` → settings panel auto-opens with auth tab focused
4. If CLI mode but `claude` not found → settings panel auto-opens with error message

### Mid-Conversation Behavior

Changes take effect on the **next message**, not mid-stream:

- Active streams continue on the old backend until completion
- `BackendManager` swaps the backend reference; `ChatOrchestrator` picks it up on next `sendMessage`

### Language Switch

- Immediate: React UI re-renders via `i18n.changeLanguage()`
- NPC responses: next message uses new locale instruction in system prompt
- Existing conversation history stays in the original language (no re-translation)

### Model Switch

- Takes effect on next message
- No validation needed — model list is hardcoded to known-good values

### Error States

| Scenario                        | Behavior                                                         |
| ------------------------------- | ---------------------------------------------------------------- |
| Invalid API key                 | Validation returns error, key not saved, inline error in AuthTab |
| CLI not installed               | "Claude CLI not found" with install link                         |
| CLI not authenticated           | "Not logged in" with instructions to run `claude login`          |
| Model unavailable for auth type | Grey out unavailable models in ModelTab                          |

---

## 7. File Structure (New & Modified)

### New Files

```
src/main/db/settings-repository.ts       — ISettingsRepository + SettingsRepository
src/main/chat/backend-manager.ts          — BackendManager service
src/main/chat/claude-cli-backend.ts       — ClaudeCliChatBackend implementation
src/renderer/src/components/SettingsPanel.tsx    — Root settings overlay
src/renderer/src/components/settings/AuthTab.tsx
src/renderer/src/components/settings/ModelTab.tsx
src/renderer/src/components/settings/LanguageTab.tsx
src/renderer/src/components/SettingsGearButton.tsx
```

### Modified Files

```
src/main/db/migrations.ts                — Add settings table migration
src/main/chat/orchestrator.ts             — Receive backend from BackendManager, read model from settings
src/main/index.ts                         — Register settings IPC handlers, init BackendManager
src/preload/index.ts                      — Expose settings API bridge
src/renderer/src/game/EventBus.ts         — Add settings:toggle event
src/renderer/src/game/scenes/Town.ts      — Listen for ESC key to toggle settings
src/renderer/src/App.tsx (or equivalent)  — Mount SettingsPanel + SettingsGearButton
src/renderer/src/i18n/locales/zh-TW.json  — Settings panel strings
src/renderer/src/i18n/locales/en.json     — Settings panel strings
src/shared/types.ts                       — AuthType, SettingsMap types
```
