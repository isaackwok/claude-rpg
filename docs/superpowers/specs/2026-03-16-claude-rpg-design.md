# Claude RPG — Design Specification

## Overview

Claude RPG is an Electron desktop application that presents a pixel-art RPG world where NPCs are AI agents powered by Claude. Instead of a traditional chat interface or terminal, users navigate a 2D game world, interact with agent NPCs through dialogue, and accomplish real productivity tasks — all while progressing through an RPG-style leveling system.

The primary audience is non-technical users (designers, PMs) who want to leverage AI for productivity but find terminals intimidating. Engineers can use it too — the RPG layer adds engagement without limiting capability.

## Core Philosophy

- **The world IS the UI** — agents live in a spatial world, not a sidebar or chat list
- **Freeform sandbox** — no forced tutorials; usage drives progression organically
- **Emergent identity** — your character class/title emerges from how you actually use the tool
- **Local-first** — all data on the user's machine, no backend for v1
- **i18n-first** — Traditional Chinese (zh-TW) as primary language, English second

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Shell | Electron | Desktop app container, OS integration, secure key storage |
| Game Engine | Phaser 3 | 2D world rendering, tilemaps, sprites, movement, collision |
| UI Framework | React | Overlay panels — dialogue, menus, forms, skill trees |
| AI Integration | Anthropic SDK / Agent SDK | Agent conversations, multi-agent orchestration |
| Data Storage | SQLite (better-sqlite3) | Local persistence, behind repository interfaces |
| Map Editor | Tiled | Tilemap creation, exported as JSON for Phaser |
| i18n | JSON locale files | `locales/zh-TW.json`, `locales/en.json` |
| Language | TypeScript | Throughout the entire codebase |

## Implementation Phases

The spec describes the full v1 vision. Implementation is split into phases, each producing a working deliverable:

| Phase | Deliverable | Dependencies |
|---|---|---|
| **Phase 1: Shell & World** | Electron app with Phaser tilemap, character movement, NPC sprites with collision zones. React overlay scaffold. No AI yet. | None |
| **Phase 2: Agent Conversations** | Single-agent NPC dialogue via Anthropic SDK. Talk to any built-in NPC, get responses. Conversation persistence. | Phase 1 |
| **Phase 3: Progression** | XP tracking, leveling, title computation, quest board. Organic quest detection. Skill tree UI. | Phase 2 |
| **Phase 4: Guild Hall** | Custom agent creation flow via Guild Master NPC. Sprite selection, personality, placement. | Phase 2 |
| **Phase 5: Party System** | Multi-agent party formation and orchestrated quests via Agent SDK. | Phase 2, Phase 4 |
| **Phase 6: Onboarding & Polish** | Title screen, API key wizard, character creation, tutorial, i18n pass, sound/animation polish. | All above |

Each phase can be planned and implemented independently.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Electron Main Process             │
│  • API key storage (safeStorage)                 │
│  • IPC bridge to renderer                        │
│  • Anthropic SDK calls (keeps key in main proc)  │
└──────────────────────┬──────────────────────────┘
                       │ IPC (contextBridge)
┌──────────────────────▼──────────────────────────┐
│              Electron Renderer Process            │
│  ┌─────────────────────────────────────────────┐ │
│  │              React App Layer                 │ │
│  │  ┌───────────────┐  ┌────────────────────┐  │ │
│  │  │  Phaser Game   │  │   React UI Panels  │  │ │
│  │  │  ─────────────│  │  ──────────────────│  │ │
│  │  │  • World map   │  │  • Chat/dialogue   │  │ │
│  │  │  • Character   │  │  • Inventory       │  │ │
│  │  │  • NPCs/Agents │  │  • Guild Hall UI   │  │ │
│  │  │  • Collision   │  │  • Skill tree      │  │ │
│  │  │  • Animation   │  │  • Settings/Auth   │  │ │
│  │  └───────────────┘  └────────────────────┘  │ │
│  │              ↕ Event Bus (typed EventEmitter) │ │
│  │  ┌─────────────────────────────────────────┐ │ │
│  │  │           Core Services                  │ │ │
│  │  │  • Agent Manager (via IPC to main proc)  │ │ │
│  │  │  • Progression Engine (XP/levels)        │ │ │
│  │  │  • i18n Service (zh-TW primary)          │ │ │
│  │  │  • Persistence (SQLite, repositories)    │ │ │
│  │  └─────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Event Bus Contract

The event bus is a typed `EventEmitter` shared between Phaser and React within the renderer process. All events have typed payloads.

```typescript
interface GameEvents {
  // Phaser → React
  "npc:interact": { agentId: string; npcPosition: { x: number; y: number } }
  "npc:proximity": { agentId: string; inRange: boolean }
  "player:moved": { x: number; y: number; map: string }
  "zone:entered": { zoneId: string; zoneName: string }

  // React → Phaser
  "dialogue:closed": { agentId: string }
  "npc:spawn": { agent: Agent }
  "npc:remove": { agentId: string }
  "camera:focus": { x: number; y: number }

  // Core Services → Both
  "xp:gained": { category: SkillCategory; amount: number; newTotal: number }
  "level:up": { category: SkillCategory; newLevel: number }
  "quest:completed": { questId: string; title: LocalizedString }
  "title:changed": { newTitle: LocalizedString }
}
```

### Communication Flow

- **Phaser → React**: Phaser emits typed events (e.g., `npc:interact`). React listens and opens the appropriate UI panel.
- **React → Phaser**: React dispatches typed commands (e.g., `npc:spawn`). Phaser executes them.
- **Core Services**: Framework-agnostic. Both Phaser and React access them through a shared service container. Services emit events for state changes (XP gained, level up).
- **Renderer → Main (IPC)**: All Anthropic API calls go through Electron IPC to the main process, which holds the API key and makes SDK calls. The renderer never sees the raw API key.

## The RPG World

### World Structure

The world is a tile-based map built with Tiled Map Editor, exported as JSON, and loaded by Phaser.

**v1 Town Map — Key Locations:**

| Location | Purpose | Built-in NPC |
|---|---|---|
| Town Square | Spawn point, tutorial area | 長老 (The Elder) — tutorial guide |
| Guild Hall | Create/manage custom agents | 會長 (Guild Master) — agent creation guide |
| Library | Research tasks | 學者 (The Scholar) |
| Scribe's Workshop | Writing tasks | 書記官 (The Scribe) |
| Market | Data & organization tasks | 商人 (The Merchant), 指揮官 (The Commander) |
| Artisan's Studio | Visual/design tasks | 匠師 (The Artisan) |
| Messenger's Post | Communication tasks | 傳令使 (The Herald) |
| Tavern | Party management, quest board | 酒保 (Bartender) — party/quest UI |
| Tower (unlockable) | Code/automation tasks | 巫師 (The Wizard) |

### Character Movement & Interaction

- Arrow keys / WASD for movement on the tilemap
- Walk into NPC interaction zone → press Space/Enter → dialogue UI opens
- NPCs have idle sprite animations and speech bubbles when the player is nearby
- Character sprite is customizable (chosen during onboarding)

## Agent System

### Agent Schema

A single `Agent` type is used for both built-in and custom NPCs:

```typescript
interface Agent {
  id: string
  name: LocalizedString        // { "zh-TW": "書記官", "en": "The Scribe" }
  personality: string           // Free-form personality description
  systemPrompt: string          // Claude system prompt
  skills: SkillCategory[]       // Which categories this agent covers
  sprite: string                // Sprite asset key
  location: { map: string; x: number; y: number }
  isBuiltIn: boolean
  createdBy?: string            // Player ID, for custom agents
}

type SkillCategory =
  | "writing"
  | "data"
  | "visual"
  | "code"
  | "research"
  | "organization"
  | "communication"

type LocalizedString = Record<string, string>
```

### Built-in NPCs

| NPC | Skill Category | Personality | Capabilities |
|---|---|---|---|
| 書記官 (The Scribe) | Writing | Meticulous, poetic | Draft, edit, translate text |
| 學者 (The Scholar) | Research | Curious, thorough | Web search, summarize docs, compare |
| 商人 (The Merchant) | Data | Pragmatic, sharp | Analyze CSVs, charts, calculations |
| 指揮官 (The Commander) | Organization | Disciplined, direct | Task planning, scheduling, lists |
| 匠師 (The Artisan) | Visual | Creative, expressive | Image generation, design feedback |
| 傳令使 (The Herald) | Communication | Diplomatic, warm | Draft messages, translate, summarize meetings |
| 巫師 (The Wizard) | Code | Mysterious, precise | Write scripts, debug, automate |

### Custom Agent Creation (Guild Hall)

The player walks into the Guild Hall and interacts with the Guild Master NPC, who guides creation through in-game dialogue:

1. **Name your agent** — provide a name, pick a sprite from available options
2. **Define personality** — choose traits or write a free-form description
3. **Set capabilities** — pick skill categories, optionally write a system prompt
4. **Place in world** — choose where they appear on the map (or they wander)
5. Agent is saved locally and appears as an interactable NPC

### Agent Party System

#### Formation

At the Tavern, the player talks to the Bartender to form a party:
- Select up to 4 agents (built-in or custom) from a list
- Name the party
- Party is saved and can be reused

#### Orchestration Architecture

Party quests use a **sequential pipeline with a coordinator**:

```
Player gives quest to party
        ↓
  Coordinator (main process)
  ├── 1. Analyzes the quest and creates a plan
  │      (Which agents handle which sub-tasks, in what order)
  ├── 2. Executes sub-tasks sequentially:
  │      Agent A works → output passed to Agent B → output passed to Agent C
  ├── 3. Each agent receives:
  │      - Their personality/system prompt
  │      - The quest context
  │      - Outputs from previous agents in the chain
  └── 4. Final output assembled and presented to player
```

- **Orchestration runs in Electron main process** via the Agent SDK
- Each agent call is an independent Anthropic API call with the agent's system prompt + quest context + prior outputs
- The coordinator is not an LLM — it's deterministic logic that routes based on agent skill tags matching quest requirements

#### Progress & Failure Handling

- Player sees a dialogue UI showing which agent is currently working (with their sprite and a "thinking" animation)
- If an agent call fails (API error, timeout), the coordinator:
  1. Retries once
  2. If still failing, reports to the player: "商人 encountered a problem. Retry or skip?"
  3. Player can retry, skip that agent's step, or cancel the quest
- Partial results are preserved — if 2 of 3 agents complete before a failure, those results are shown

#### Example Flow

Quest: "幫我用這份數據做一份簡報" (Make a presentation from this data)

1. Coordinator plan: Merchant (analyze data) → Scribe (write narrative) → Artisan (design layout)
2. Merchant receives: raw data + quest prompt → outputs: data summary + key insights
3. Scribe receives: data summary + key insights + quest prompt → outputs: presentation narrative
4. Artisan receives: narrative + data summary + quest prompt → outputs: presentation structure with visual suggestions
5. Player receives assembled result in dialogue UI

## Progression System

### Skill Categories (7)

| Category | Example Actions | Emergent Title |
|---|---|---|
| Writing | Draft emails, blog posts, copy | 文匠 (Wordsmith) |
| Data | Analyze CSVs, summarize spreadsheets | 數據煉金師 (Data Alchemist) |
| Visual | Generate images, edit assets, design feedback | 幻象法師 (Visual Mage) |
| Code | Write scripts, debug, automate | 程式巫師 (Code Sorcerer) |
| Research | Web search, summarize docs, compare options | 求知者 (Knowledge Seeker) |
| Organization | Manage tasks, create plans, schedule | 戰略統帥 (Strategic Commander) |
| Communication | Translate, summarize meetings, draft messages | 外交使者 (Diplomat) |

### XP & Leveling

#### XP Award Rules

- XP is awarded when a conversation with an NPC reaches a natural completion (player closes dialogue after receiving a substantive response)
- Base XP per completed interaction: **10 XP**
- XP is distributed across the agent's skill categories equally (e.g., an agent with `["writing", "communication"]` awards 5 XP to each)
- Party quest bonus: **+50% XP** for each agent in the party (encourages party usage)

#### Level Thresholds

Leveling uses a standard quadratic curve per skill category:

```
XP required for level N = 50 * N^2

Level 1:   50 XP  (5 interactions)
Level 2:  200 XP  (15 more interactions)
Level 3:  450 XP
Level 5: 1250 XP
Level 10: 5000 XP
```

#### Title Computation

The player's title is computed from their top 2 skill categories:

```typescript
function computeTitle(skills: Record<SkillCategory, number>): LocalizedString {
  const sorted = Object.entries(skills)
    .sort(([, a], [, b]) => b - a)
  const [primary] = sorted[0]
  const [secondary] = sorted[1]
  // Title = secondary adjective + primary noun
  // e.g., Research (博學) + Writing (文匠) = "博學文匠"
  return {
    "zh-TW": titleAdjectives["zh-TW"][secondary] + titleNouns["zh-TW"][primary],
    "en": titleAdjectives["en"][secondary] + " " + titleNouns["en"][primary]
  }
}
```

Each category has both an adjective form (used as secondary) and a noun form (used as primary), stored in locale files.

#### Title Fragment Unlocks

Every 5 levels in a category unlocks a new tier of that category's title word:

| Level | Writing Title (zh-TW) | Writing Title (en) |
|---|---|---|
| 5 | 抄寫員 | Scribbler |
| 10 | 文匠 | Wordsmith |
| 15 | 文豪 | Literary Master |
| 20 | 傳奇作家 | Legendary Author |

### Quest System

#### Organic Quest Detection

Organic quests are triggered by **counters on conversation metadata**, not by analyzing message content:

```typescript
interface QuestTrigger {
  id: string
  name: LocalizedString
  condition: {
    type: "conversation_count"     // Count completed conversations
    skillCategory: SkillCategory   // In this category
    threshold: number              // Reaching this count
    period?: "all_time" | "daily"  // Timeframe (default: all_time)
  }
  xpReward: number
  repeatable: boolean              // Can trigger again after reset?
}
```

**v1 organic quests (examples):**

| Quest | Trigger | Reward |
|---|---|---|
| 初次接觸 (First Contact) | 1 conversation in any category | 20 XP |
| 知識收集者 (Knowledge Collector) | 3 conversations in Research | 50 XP |
| 多才多藝 (Renaissance) | 1 conversation in each of 5 different categories | 100 XP |
| 勤奮學徒 (Diligent Apprentice) | 10 conversations in any single category | 80 XP |
| 日常冒險者 (Daily Adventurer) | 3 conversations in one day (daily, repeatable) | 30 XP |

The Progression Engine checks triggers after each conversation completion. When a trigger fires, the quest is created with `status: "completed"` and the player sees a celebration notification.

#### Quest Board

The Tavern quest board suggests tasks based on the player's weakest skill category:
- "Your Visual skill is your lowest — try asking the Artisan to help you with a design task"
- These are suggestions, not mandatory — no penalty for ignoring them

### Rewards

- Milestones unlock cosmetic rewards: character outfits, world decorations, NPC dialogue variants
- Achievements for specific accomplishments
- Title evolution as skills grow

## Authentication & Onboarding

### First Launch Flow

1. Pixel-art title screen with "Claude RPG" logo
2. "開始冒險" (Start Adventure) button
3. **API Key Setup** — framed as an in-game narrative scroll:
   - "勇者，歡迎來到這個世界。在開始冒險之前，你需要一把鑰匙..." (Hero, welcome to this world. Before you begin your adventure, you need a key...)
   - Step-by-step visual guide showing how to get an API key from console.anthropic.com
   - Input field + "驗證鑰匙" (Verify Key) button
   - Key validated immediately; friendly in-game error if invalid
4. **Character Creation**:
   - Pick sprite appearance from options
   - Enter character name
   - Personality quiz deferred — v1 starts all skills at 0 (quiz can be added in a polish phase)
5. Opening cutscene → wake up in Town Square
6. Tutorial NPC (長老 / The Elder) gives gentle introduction

### API Key Security

- API key is stored exclusively in the **Electron main process** via `safeStorage` API (encrypted at OS level)
- The key **never enters the renderer process** — all API calls go through IPC to main
- The key is **not stored in SQLite** or any user-accessible file
- User can update/remove key via Settings (which sends an IPC call to main)

### Mid-Session Key Errors

If the API key becomes invalid during gameplay (revoked, rate-limited, expired):
- The agent conversation shows an in-game error: "通訊中斷..." (Connection lost...)
- Player is prompted to check/update their key in Settings
- No data is lost — the conversation is preserved and can be resumed after key is fixed

## Data Model

### Repository Pattern

All data access goes through repository interfaces. The game logic never touches SQLite directly.

```
Game Logic / Services
        ↓ depends on
   Repositories (interfaces)
   ├── IPlayerRepository
   ├── IAgentRepository
   ├── IConversationRepository
   ├── IQuestRepository
   └── IPartyRepository
        ↓ implemented by
   Storage Adapters
   ├── SQLiteAdapter (v1)
   ├── PostgresAdapter (future — multiplayer)
   └── CloudSyncAdapter (future — cloud save)
```

```typescript
interface IAgentRepository {
  findById(id: string): Agent | null
  findByLocation(map: string, x: number, y: number): Agent[]
  findByPlayer(playerId: string): Agent[]
  findBuiltIn(): Agent[]
  save(agent: Agent): void
  delete(id: string): void
}

// Other repositories follow the same pattern with domain-specific queries
```

### Core Entities

```typescript
interface Player {
  id: string
  name: string
  sprite: string
  locale: "zh-TW" | "en"
  skills: Record<SkillCategory, number>  // XP per category
  level: number                // Overall level
  title: LocalizedString       // Computed from top skills
  createdAt: Date
  totalPlayTime: number        // Seconds
  // Note: API key is NOT stored here — it lives in Electron main process via safeStorage
}

interface Conversation {
  id: string
  agentId: string
  playerId: string
  messages: { role: "user" | "assistant" | "system"; content: string; timestamp: Date }[]
  skillCategory: SkillCategory
  xpEarned: number
  status: "active" | "completed"
}

interface Quest {
  id: string
  title: LocalizedString
  description: LocalizedString
  type: "organic" | "board" | "party"
  skillCategories: SkillCategory[]
  xpReward: number
  status: "discovered" | "active" | "completed"
  agents: string[]             // Agent IDs for party quests
}

interface Party {
  id: string
  name: string
  agents: string[]             // Max 4 agent IDs
  activeQuest: string | null
}

interface Progression {
  playerId: string
  level: number
  title: LocalizedString
  achievements: { id: string; unlockedAt: Date }[]
  cosmetics: { id: string; type: string; equipped: boolean }[]
}
```

## i18n Strategy

- All user-facing strings externalized to JSON locale files
- `locales/zh-TW.json` (primary), `locales/en.json` (secondary)
- Shared `t()` function used by both React components and Phaser dialogue system
- NPC names, quest titles, achievement descriptions — all localized via `LocalizedString` type
- Language defaults to system locale, toggleable in settings
- CJK typography: use a CJK-compatible pixel/bitmap font; line-break handling deferred to the rendering layer (Phaser's bitmap text + React's CSS `word-break: break-all` for CJK)

## v1 Scope

**Included:**
- Electron app with Phaser game world + React UI overlays
- Single town map with all key locations
- 7 built-in NPC agents with full dialogue/conversation capability
- Custom agent creation via Guild Hall
- Agent party system (up to 4 agents, sequential pipeline orchestration)
- Progression system: 7 skill categories, XP (10 base per interaction, quadratic leveling), emergent titles
- Organic quest detection (counter-based triggers) + quest board
- API key authentication with in-game onboarding
- Local SQLite persistence with repository pattern
- i18n: zh-TW and en

**Deferred to future versions:**
- Multiplayer / co-op parties with real users
- Additional world maps (dungeons, forests, etc.)
- Cloud save / sync
- Leaderboards
- Mobile version
- OAuth / managed API key service
- Voice interaction with NPCs
- Plugin system for community-created NPCs/maps
- Onboarding personality quiz
