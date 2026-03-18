# Phase 3A — Progression Engine Design

## Overview

Phase 3A introduces SQLite persistence, the XP/leveling engine, and HUD expansion to create a visible "play and see numbers go up" feedback loop. This is the first half of Phase 3 (Progression); Phase 3B will add organic quests, quest board, title fragment unlocks, and skill tree panel.

## Scope

**In scope (3A):**

- SQLite persistence via better-sqlite3 in the main process
- Player profile (hardcoded name "Isaac" for now)
- Conversation history persistence (messages survive restarts)
- XP ledger and skill tracking
- Approved folders persistence (通行令)
- ProgressionEngine service (XP awards, leveling, title computation)
- HUD expansion (location + name/title + XP bar)
- Full-screen SkillsPanel overlay
- Floating XP text + HUD animation on XP gain
- Level-up celebrations

**Deferred to 3B:**

- Organic quest system (counter-based triggers)
- Quest board (Tavern NPC suggestions)
- Title fragment tier unlocks (every 5 levels)
- Achievement system
- Cosmetics

**Deferred to Phase 6:**

- Player name input (onboarding flow)

## Architecture

### Process Model

SQLite lives in the **main process**. The renderer communicates via IPC — consistent with the existing pattern (API key storage, Anthropic SDK calls, tool execution all live in main).

```
┌─ MAIN PROCESS ──────────────────────────────┐
│  SQLite (better-sqlite3)                     │
│    ├── SqlitePlayerRepository                │
│    ├── SqliteXPRepository                    │
│    ├── SqliteConversationRepository          │
│    └── SqliteFolderRepository                │
│                                              │
│  ProgressionEngine                           │
│    ├── awardXP(agentId, skillCategories)      │
│    ├── getPlayerState()                       │
│    ├── computeTitle(skills)                   │
│    ├── computeCategoryLevel(xp)               │
│    └── computeOverallLevel(totalXP)           │
└──────────────┬───────────────────────────────┘
               │ IPC
┌──────────────▼───────────────────────────────┐
│  RENDERER PROCESS                            │
│    React: HUD, SkillsPanel, XPNotification   │
│    Phaser: Floating XP text over NPCs        │
│    Hooks: useProgression(), useXPNotification │
└──────────────────────────────────────────────┘
```

### Approach: Thin IPC Layer

- Repositories live entirely in main process
- Renderer gets React hooks that wrap IPC calls
- XP award happens in main when chat response finalizes → main pushes events to renderer via IPC
- No renderer-side cache — reads go through IPC, writes go through IPC

### Shared Types

`SkillCategory` currently lives in `src/renderer/src/game/types.ts`. It must move to `src/shared/types.ts` so the main process `ProgressionEngine` can import it.

## SQLite Schema

```sql
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'zh-TW',
  created_at INTEGER NOT NULL
);

CREATE TABLE xp_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id),
  skill_category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE TABLE approved_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  added_at INTEGER NOT NULL
);

CREATE INDEX idx_xp_ledger_player_category ON xp_ledger(player_id, skill_category);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
```

### Design Choices

- **XP as a ledger** — individual awards stored, totals derived via `SUM(amount) GROUP BY skill_category`. Enables auditing, debugging tuning, and future "recent XP" UI.
- **Conversations + messages as separate tables** — enables future queries across conversations. Not stored as JSON blob.
- **Approved folders** in their own table — mirrors existing in-memory `Set<string>` in `folder-manager.ts`.

## Repositories

All repositories are interfaces with SQLite implementations. Located in `src/main/db/`.

### IPlayerRepository

```typescript
interface IPlayerRepository {
  getOrCreate(id: string): Player
  updateLocale(id: string, locale: string): void
}

interface Player {
  id: string
  name: string
  locale: string
  createdAt: number
}

/** Composite type returned via IPC — combines Player row with computed progression data. */
interface PlayerState {
  id: string
  name: string
  locale: string
  title: LocalizedString
  overallLevel: number
  totalXP: number
  skills: Record<SkillCategory, { xp: number; level: number }>
}

/** Alias used in preload bridge for skill data. */
type SkillMap = Record<SkillCategory, { xp: number; level: number }>
```

### IXPRepository

```typescript
interface IXPRepository {
  award(playerId: string, skillCategory: SkillCategory, amount: number, agentId: string): void
  getSkillTotals(playerId: string): Record<SkillCategory, number>
}
```

### IConversationPersistence (main process, SQLite layer)

```typescript
interface IConversationPersistence {
  createConversation(id: string, agentId: string, playerId: string): void
  addMessage(conversationId: string, role: MessageRole, content: string, timestamp: number): void
  getMessages(conversationId: string): PersistedMessage[]
  getConversationsByAgent(agentId: string, playerId: string): PersistedConversation[]
  getOrCreateByAgent(agentId: string, playerId: string): PersistedConversation
  updateStatus(conversationId: string, status: string): void
}
```

**Dual-storage synchronization strategy:**

The existing `InMemoryConversationRepository` (renderer) stays for hot state (streaming status, tool-confirm, unread markers). The `IConversationPersistence` in main handles durable message storage.

- **Writes to SQLite:** The main process writes messages to SQLite at the same points it already tracks them — when `chat.ts` receives user messages and when assistant responses are finalized (stream complete). This happens in the main process, not via IPC from the renderer.
- **Hydration on app start:** A new IPC channel `conversations:get-history` returns persisted messages for a given agent. The renderer's `InMemoryConversationRepository` calls this on first dialogue open (lazy hydration) to populate message history. Messages loaded this way are inserted before any live messages.
- **Single source of truth:** Main process is authoritative for message content. The renderer's in-memory store is authoritative for transient UI state (streaming, tool-confirm). The existing `conversationHistories` Map in `chat.ts` is replaced by SQLite reads — no triple store.

### IFolderRepository

```typescript
interface IFolderRepository {
  getAll(): ApprovedFolder[]
  add(path: string, label: string): ApprovedFolder
  remove(path: string): void
  exists(path: string): boolean
}
```

## ProgressionEngine

Pure business logic service in the main process. No IPC awareness.

### awardXP(agentId, skillCategories)

1. Splits 10 XP evenly across the agent's skill categories (e.g., agent with `["writing", "communication"]` awards 5 XP each)
2. Writes ledger entries to SQLite via `IXPRepository`
3. Reads new skill totals
4. Computes category levels — checks for level-ups
5. Recomputes title if top 2 skills changed
6. Computes overall level — checks for overall level-up
7. Returns result:

```typescript
interface XPAwardResult {
  awards: { category: SkillCategory; amount: number; newTotal: number }[]
  levelUps: { category: SkillCategory; newLevel: number }[]
  overallLevelUp?: { newLevel: number }
  titleChanged?: LocalizedString
}
```

### Leveling Curves

**Per-category level:**

```
XP required for level N = 50 * N^2

Level 1:   50 XP   (5 interactions)
Level 2:  200 XP
Level 3:  450 XP
Level 5: 1250 XP
Level 10: 5000 XP
```

**Overall level (total XP across all categories):**

```
XP required for level N = 100 * N^2

Level 1:    100 XP  (10 interactions)
Level 2:    400 XP
Level 3:    900 XP
Level 5:   2500 XP
Level 10: 10000 XP
```

Note: These curves are initial values, subject to tuning after playtesting.

### Title Computation

Title = secondary adjective + primary noun, based on top 2 skill categories by XP.

**Edge case:** If fewer than 2 categories have XP (e.g., first interaction), use a default title: `{ 'zh-TW': '新手冒險者', en: 'Novice Adventurer' }`. Title computation only runs when at least 2 categories have non-zero XP.

```typescript
function computeTitle(skills: Record<SkillCategory, number>): LocalizedString {
  const withXP = Object.entries(skills)
    .filter(([, xp]) => xp > 0)
    .sort(([, a], [, b]) => b - a)
  if (withXP.length < 2) {
    return { 'zh-TW': '新手冒險者', en: 'Novice Adventurer' }
  }
  const [primary] = withXP[0]
  const [secondary] = withXP[1]
  return {
    'zh-TW': titleAdjectives['zh-TW'][secondary] + titleNouns['zh-TW'][primary],
    en: titleAdjectives['en'][secondary] + ' ' + titleNouns['en'][primary]
  }
}
```

Title adjectives and nouns stored in locale files.

## IPC Channels

### Request/Response (renderer → main → renderer)

| Channel                  | Request           | Response                                               |
| ------------------------ | ----------------- | ------------------------------------------------------ |
| `progression:get-player` | `void`            | `PlayerState`                                          |
| `progression:get-skills` | `void`            | `Record<SkillCategory, { xp: number; level: number }>` |
| `folders:get-all`        | `void`            | `ApprovedFolder[]`                                     |
| `folders:add`            | `{ path, label }` | `ApprovedFolder`                                       |
| `folders:remove`         | `{ path }`        | `void`                                                 |

| `conversations:get-history` | `{ agentId }` | `PersistedMessage[]` |

### Push Events (main → renderer)

The `progression:xp-awarded` event carries the full `XPAwardResult` which already contains `levelUps[]` and `overallLevelUp`. No separate `progression:level-up` IPC event is needed — the renderer extracts level-up info from `XPAwardResult` and emits the appropriate EventBus events.

| Channel                     | Payload                         |
| --------------------------- | ------------------------------- |
| `progression:xp-awarded`    | `XPAwardResult`                 |
| `progression:title-changed` | `{ newTitle: LocalizedString }` |

### Preload Bridge

`contextBridge` gets two new namespaces:

```typescript
progression: {
  getPlayer: () => Promise<PlayerState>
  getSkills: () => Promise<SkillMap>
  onXPAwarded: (callback: (result: XPAwardResult) => void) => () => void
  onTitleChanged: (callback: (data: { newTitle: LocalizedString }) => void) => () => void
}

folders: {
  getAll: () => Promise<ApprovedFolder[]>
  add: (path, label) => Promise<ApprovedFolder>
  remove: (path) => Promise<void>
}
```

## UI Components

### HUD (expanded)

Layout: `📍 Location │ Name · Title │ Lv.N ▓▓░░ XP/threshold`

- Left: location name (existing functionality)
- Middle: player name + title (e.g., "Isaac · 博學文匠")
- Right: overall level + XP progress bar + numbers
- Entire bar is clickable → emits `skills-panel:toggle`
- `pointerEvents: 'auto'` (interactive)
- XP bar animates smoothly on `progression:xp-awarded` with brief blue glow on the border

### XPNotification (Phaser floating text)

On `xp:gained` EventBus event:

- Phaser spawns bitmap text "+10 XP" above the NPC sprite (using `agentId` to find position)
- Text floats upward ~40px and fades out over 1.5 seconds
- Color matches the skill category
- If agent has multiple skill categories, show stacked (one per category)

### SkillsPanel (full-screen overlay)

Full-screen RPG menu overlay. Opened by clicking HUD bar or pressing `P` key. Closed by ESC, clicking outside, or pressing `P` again.

```
┌──────────────────────────────────────────┐
│              ⚔️ Isaac                     │
│           博學文匠 · Lv.3                 │
│                                          │
│  ✍️ Writing       Lv.4  ▓▓▓▓▓▓░░ 320/450│
│  🔍 Research      Lv.3  ▓▓▓▓▓░░░ 280/450│
│  💻 Code          Lv.1  ▓▓░░░░░░  60/200│
│  📊 Data          Lv.1  ▓░░░░░░░  30/200│
│  💬 Communication Lv.1  ▓░░░░░░░  40/200│
│  📋 Organization  Lv.0  ░░░░░░░░  10/50 │
│  🎨 Visual        Lv.0  ░░░░░░░░   0/50 │
│                                          │
│         Total XP: 740 · Next: 900        │
│                [ESC 關閉]                 │
└──────────────────────────────────────────┘
```

- Categories sorted by XP descending
- Each bar: icon, localized category name, level, visual bar, XP/threshold for next level
- Bottom: total XP + threshold for next overall level
- All text via `t()` for i18n
- Dark semi-transparent background over game world

### Level-up Celebration

- **Category level-up:** Floating text changes to "✍️ Level Up! Lv.4" with larger golden style
- **Overall level-up:** Center-screen banner "Level 3!" fades after 2 seconds
- **If SkillsPanel is open:** Relevant bar pulses

## GameEvents Changes

```typescript
// Modified (add agentId, overallLevel):
'xp:gained': {
  category: SkillCategory
  amount: number
  newTotal: number
  agentId: AgentId
}
'level:up': {
  category: SkillCategory
  newLevel: number
  overallLevel: number
}

// New:
'skills-panel:toggle': Record<string, never>

// Unchanged:
'quest:completed': { questId: string; title: LocalizedString }
'title:changed': { newTitle: LocalizedString }
```

## XP Award Flow

1. Main process `chat.ts` finalizes an assistant response (stream complete, at least one substantive message). This is where XP is triggered — entirely in the main process, no IPC needed to initiate it.
2. Main calls `ProgressionEngine.awardXP(agentId, agent.skills)`
3. Engine splits 10 XP across skill categories, writes to SQLite
4. Engine checks for level-ups, recomputes title if needed
5. Main sends `progression:xp-awarded` to renderer via IPC
6. Renderer: EventBus emits `xp:gained` for each category
7. Phaser: spawns floating "+N XP" text above the NPC
8. React HUD: animates XP bar, border glows briefly

## Migration Strategy

### ConversationManager

The existing `InMemoryConversationRepository` stays for hot state (streaming, tool-confirm, unread markers). A new `SqliteConversationPersistence` in main handles durable storage. On app start, renderer hydrates message history from main via IPC.

### FolderManager

`folder-manager.ts` currently uses an in-memory `Set`. It will be backed by `SqliteFolderRepository` — same API surface, reads from SQLite on startup, write-through on changes.

### Database Location

SQLite database file stored at Electron's `app.getPath('userData')` — e.g., `~/Library/Application Support/claude-rpg/game.db`.

### Schema Migrations

Use SQLite's `PRAGMA user_version` to track schema version. On app start, `src/main/db/migrations.ts` reads the current `user_version` and applies any unapplied migrations in order. Phase 3A is version 1 (initial schema). Future phases increment the version and add migration functions.

```typescript
const migrations: Record<number, (db: Database) => void> = {
  1: (db) => {
    /* CREATE TABLE players, xp_ledger, conversations, messages, approved_folders */
  }
}
```

## Divergences from Parent Spec

- **XP storage:** Parent spec puts `skills: Record<SkillCategory, number>` directly on the `Player` entity. This spec uses an XP ledger table with derived totals — better for auditing and tuning. Same computed result.
- **Conversation entity:** Parent spec includes `skillCategory` and `xpEarned` on `Conversation`. This spec tracks XP in a separate ledger keyed by `agent_id` + `skill_category` rather than per-conversation. This is more flexible since agents have multiple skill categories.
- **Overall level:** The parent spec only defines per-category leveling (`50 * N^2`). This spec adds an overall level with its own curve (`100 * N^2`) based on total XP — a decision made during brainstorming.
- **`IAgentRepository`:** Not introduced in 3A. Agents remain hardcoded config objects in `src/renderer/src/game/data/npcs.ts` and `src/main/agents/`. Agent persistence is deferred to Phase 4 (Guild Hall / custom agents).
- **`approved_folders` has no `player_id`:** Intentionally simplified for the hardcoded single-player model in 3A.

## i18n

New locale keys needed:

```
hud.level: "Lv.{level}"
skills.title: "技能"
skills.totalXP: "總經驗值"
skills.nextLevel: "下一級"
skills.close: "ESC 關閉"
skills.categories.writing: "寫作"
skills.categories.data: "數據"
skills.categories.visual: "視覺"
skills.categories.code: "程式"
skills.categories.research: "研究"
skills.categories.organization: "組織"
skills.categories.communication: "溝通"
xp.gained: "+{amount} XP"
xp.levelUp: "升級！Lv.{level}"
xp.overallLevelUp: "等級 {level}！"
titles.adjectives.*: (7 adjective forms for each category)
titles.nouns.*: (7 noun forms for each category)
```
