# Dialogue Controls: Permission Mode, Slash Commands, @ Mentions

**Date:** 2026-04-12
**Status:** Approved
**Depends on:** PR #14 (Agent SDK backend)

## Overview

Enhance the NPC dialogue input area with three new features that leverage the Agent SDK backend introduced in PR #14:

1. **Per-conversation Permission Mode** — a toggle button next to the input to switch SDK permission modes per NPC
2. **Slash Commands** — `/` triggers an autocomplete menu of available Agent SDK skills
3. **@ Mentions** — `@` triggers a categorized autocomplete for referencing NPCs, books, and files

Primary audience: non-technical users (designers, PMs). All user-facing text is i18n-first (zh-TW primary, en secondary).

## Architecture: Hybrid (Renderer UI + Main-Process Data)

- Autocomplete UI and input parsing live in the **renderer process** for instant responsiveness
- Data sources (slash command registry, file listing, NPC list) are fetched from the **main process via IPC** and cached in the renderer
- PermissionMode is stored per-agent in the main process, toggled via a dedicated IPC channel
- Follows existing project pattern: renderer caches, main process persists

## Input Area Layout

Control order (left to right): `[textarea] [mode] [+] [▶]`

- **textarea** — existing, enhanced with `/` and `@` keystroke detection
- **mode** — new 32×32 button matching "+" button style, shows mode icon, click opens dropdown
- **+** — existing attachment button (unchanged)
- **▶** — existing send button (unchanged)

The mode button is only visible when the active backend is Agent SDK (`claude_cli` auth type). When using API Key backend, the button is hidden.

### Autocomplete Popup

Floats above the input area when triggered by `/` or `@`. Dismissed by Escape, clicking outside, or selecting an item. Supports keyboard navigation (Arrow Up/Down, Enter/Tab to select).

### Mode Button

- 32×32 square button, same style as the "+" button (`rgba(200,180,140,0.15)` bg, gold border)
- Displays an icon representing the current mode
- Hover shows a tooltip with localized mode name via `t('permissionMode.<key>')`
- Click opens a dropdown above the button listing all available modes

### Permission Mode Icons and i18n

| Icon | Key           | zh-TW    | en           |
| ---- | ------------- | -------- | ------------ |
| 📋   | `default`     | 預設模式 | Default Mode |
| ✏️   | `acceptEdits` | 接受編輯 | Accept Edits |
| ⚡   | `auto`        | 自動模式 | Auto Mode    |
| 🗺️   | `plan`        | 計畫模式 | Plan Mode    |

i18n keys: `permissionMode.default`, `permissionMode.acceptEdits`, `permissionMode.auto`, `permissionMode.plan`

## New IPC Channels

| Channel               | Direction                | Payload                             | Purpose                                         |
| --------------------- | ------------------------ | ----------------------------------- | ----------------------------------------------- |
| `chat:set-agent-mode` | renderer → main (send)   | `{ agentId, mode }`                 | Set PermissionMode for a specific NPC           |
| `chat:get-agent-mode` | renderer → main (invoke) | `agentId` → `PermissionMode`        | Get current mode for an NPC                     |
| `slash:list-commands` | renderer → main (invoke) | `void` → `SlashCommand[]`           | Fetch available SDK slash commands              |
| `at:list-sources`     | renderer → main (invoke) | `{ query, agentId }` → `AtSource[]` | Fetch @ mention candidates (NPCs, books, files) |

## Per-Agent PermissionMode

### Storage

An in-memory `Map<AgentId, PermissionMode>` in the main process (within `ChatOrchestrator` or a dedicated service). No SQLite table — per-agent modes are session-scoped and reset on app restart. The global `permission_mode` setting remains as the fallback default.

### Backend Refactor

Move `permissionMode` from `AgentSdkBackend` constructor parameter to `ChatOpts`. The backend reads it per-query instead of at instantiation time. This eliminates the need to recreate the backend when mode changes.

**Changes to `AgentSdkBackend`:**

- Remove `permissionMode` constructor parameter and instance field
- Read `opts.permissionMode` in `sendMessage()` when building SDK options

**Changes to `ChatOpts`:**

- Add `permissionMode?: PermissionMode` field

**Changes to `BackendManager`:**

- Remove `getPermissionMode` from `BackendManagerDeps`
- Remove `recreateCliBackend()` method (no longer needed)

**Changes to `ChatOrchestrator`:**

- New `agentModes: Map<AgentId, PermissionMode>`
- `setAgentMode(agentId, mode)` method
- `getAgentMode(agentId)` method — returns agent-specific mode or falls back to global setting
- Passes `permissionMode` in `ChatOpts` when calling `backend.sendMessage()`

**Changes to `main/index.ts`:**

- Remove the `permission_mode` settings change handler that recreated the CLI backend
- Add IPC handlers for `chat:set-agent-mode` and `chat:get-agent-mode`

## Slash Commands

### Data Source

The Agent SDK does not expose a `listCommands()` API — slash commands are interpreted by the underlying Claude CLI. To discover available commands, the main process spawns `claude --help` (or parses `claude /` output) once on app startup and caches the result. If the CLI is unavailable or the parse fails, fall back to a hardcoded list of common commands (`brainstorm`, `simplify`, `review`, `plan`, `compact`, `clear`).

### Flow

1. **On app startup** — main process discovers available slash commands via CLI and caches them
2. **On dialogue open** — renderer calls `slash:list-commands` via IPC invoke, main returns cached list
3. **Renderer** — caches the list for the session duration
4. **On `/` keystroke** (at position 0 in input, or after a newline) — show autocomplete popup, filter cached list as user types
5. **On selection** — insert the full command text (e.g., `/brainstorm`) into the input. User can append arguments after the command, then send as a normal message
6. **On send** — the message (including `/command`) is sent as-is to the SDK backend. The SDK interprets the slash command natively.

### Slash Command Type

```typescript
interface SlashCommand {
  name: string // e.g., "brainstorm"
  description: string // from SDK, not localized
}
```

## @ Mentions

### Data Sources (Three Categories)

1. **NPCs** — from the existing NPC registry (`npcs.ts`), already available in the renderer. Filtered by `agentId` and localized name.
2. **Books** — fetched via existing `window.api.getBookItems()` IPC. Filtered by book name.
3. **Files** — fetched via `at:list-sources` IPC. Main process reads approved folders and returns file/directory entries. Filtered by path.

### Flow

1. **On `@` keystroke** — show autocomplete popup with all three sections
2. **Filter as user types** — filter all sections locally by matching against id, label, and secondary text
3. **On selection** — resolve to the appropriate attachment type:
   - **NPC** → inject that NPC's recent conversation history as context (fetched via IPC, formatted as a context block in the message)
   - **Book** → same as existing book attachment flow (added to `attachments` array)
   - **File** → same as existing file attachment flow (added to `attachments` array)
4. **Display** — resolved @ mentions appear as attachment chips above the input (same as current attachments), and the `@mention` text in the input is replaced with a styled inline token

### @ Mention Types

```typescript
interface AtSource {
  type: 'npc' | 'book' | 'file'
  id: string
  label: string // display name (e.g., "wizard", "Meeting Notes", "src/main/index.ts")
  secondary?: string // e.g., NPC localized name, book origin NPC
}

interface AutocompleteItem {
  type: 'slash' | 'npc' | 'book' | 'file'
  id: string
  label: string
  description?: string
  icon?: string
}
```

### Relationship with "+" Button

The "+" button remains for click-based, discoverable attachment browsing (file picker dialog, book modal). The `@` command is the keyboard-driven alternative. Both produce the same attachment result — they are complementary entry points, not replacements.

## New React Components

### `SmartInput`

Replaces the raw textarea in DialoguePanel. Owns keystroke detection for `/` and `@`, manages autocomplete popup state, and delegates rendering to `AutocompletePopup`.

**Props:** `value`, `onChange`, `onSend`, `onAttach`, `disabled`, `placeholder`

**Responsibilities:**

- Textarea with existing behavior (Enter to send, Shift+Enter for newline, Backspace to remove attachment)
- Detect `/` at position 0 → trigger slash autocomplete
- Detect `@` anywhere → trigger @ autocomplete
- Keyboard navigation in autocomplete (Arrow Up/Down, Enter/Tab, Escape)
- On autocomplete selection: slash → insert text; @ → call `onAttach` with resolved item

### `AutocompletePopup`

Floating dropdown rendered above the input when active.

**Props:** `items`, `selectedIndex`, `onSelect`, `visible`

**Responsibilities:**

- Render filtered items in categorized sections (for @: NPCs, Books, Files)
- Highlight currently selected item
- Position above input, anchored to left edge

### `PermissionModeButton`

32×32 icon button between SmartInput and "+" button.

**Props:** `agentId`, `currentMode`, `onModeChange`, `disabled`

**Responsibilities:**

- Show current mode icon
- Hover tooltip with `t('permissionMode.<key>')`
- Click opens `PermissionModeDropdown`

### `PermissionModeDropdown`

Dropdown appearing above the mode button.

**Responsibilities:**

- List all available modes with icon + localized name
- Checkmark on current selection
- Dismiss on click outside or Escape
- Call `onModeChange(mode)` on selection

### Component Tree

```
DialoguePanel
├── MessageList (existing)
│   └── MessageBubble (existing)
├── AttachmentChips (existing, no change)
├── AutocompletePopup (new, conditional)
├── SmartInput (new, replaces raw textarea)
├── PermissionModeButton (new, hidden for API Key backend)
│   └── PermissionModeDropdown (new, conditional)
├── AttachmentButton "+" (existing)
└── SendButton "▶" (existing)
```

## Files to Create

| File                                                      | Purpose                             |
| --------------------------------------------------------- | ----------------------------------- |
| `src/renderer/src/components/ui/SmartInput.tsx`           | Textarea with `/` and `@` detection |
| `src/renderer/src/components/ui/AutocompletePopup.tsx`    | Floating autocomplete dropdown      |
| `src/renderer/src/components/ui/PermissionModeButton.tsx` | Mode toggle button + dropdown       |

## Files to Modify

| File                                               | Change                                                     |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `src/main/chat/agent-sdk-backend.ts`               | Read `permissionMode` from `opts` instead of constructor   |
| `src/main/chat/backend-manager.ts`                 | Remove `getPermissionMode` dep and `recreateCliBackend()`  |
| `src/main/chat/orchestrator.ts`                    | Add `agentModes` map, pass mode in `ChatOpts`              |
| `src/main/chat/types.ts`                           | Add `permissionMode` to `ChatOpts`                         |
| `src/main/index.ts`                                | New IPC handlers, remove mode-change backend recreation    |
| `src/preload/index.ts`                             | Expose new IPC channels via contextBridge                  |
| `src/shared/types.ts`                              | Add `SlashCommand`, `AtSource`, `AutocompleteItem` types   |
| `src/renderer/src/components/ui/DialoguePanel.tsx` | Replace textarea with SmartInput, add PermissionModeButton |
| `src/renderer/src/i18n/locales/zh-TW.json`         | Add `permissionMode.*` keys                                |
| `src/renderer/src/i18n/locales/en.json`            | Add `permissionMode.*` keys                                |

## Out of Scope

- `bypassPermissions` and `dontAsk` modes are not exposed in the UI (security concern for non-technical users). Only `default`, `acceptEdits`, `auto`, and `plan` are shown.
- Slash command localization — descriptions come from the SDK as-is (English). Future enhancement if needed.
- @ mention for URLs or web resources — files, NPCs, and books only.
- Persisting per-agent permission modes across app restarts — session-scoped only.
