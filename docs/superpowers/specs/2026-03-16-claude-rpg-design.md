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

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Electron Shell                 │
│  ┌─────────────────────────────────────────────┐│
│  │              React App Layer                 ││
│  │  ┌───────────────┐  ┌────────────────────┐  ││
│  │  │  Phaser Game   │  │   React UI Panels  │  ││
│  │  │  ─────────────│  │  ──────────────────│  ││
│  │  │  • World map   │  │  • Chat/dialogue   │  ││
│  │  │  • Character   │  │  • Inventory       │  ││
│  │  │  • NPCs/Agents │  │  • Guild Hall UI   │  ││
│  │  │  • Collision   │  │  • Skill tree      │  ││
│  │  │  • Animation   │  │  • Settings/Auth   │  ││
│  │  └───────────────┘  └────────────────────┘  ││
│  │              ↕ Event Bus (shared state)       ││
│  │  ┌─────────────────────────────────────────┐ ││
│  │  │           Core Services                  │ ││
│  │  │  • Agent Manager (Anthropic SDK)         │ ││
│  │  │  • Progression Engine (XP/levels)        │ ││
│  │  │  • i18n Service (zh-TW primary)          │ ││
│  │  │  • Persistence (SQLite, repository pattern)│││
│  │  └─────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### Communication Between Layers

- **Phaser → React**: Phaser emits events (e.g., `npc:interact`) on a shared event bus. React listens and opens the appropriate UI panel.
- **React → Phaser**: React dispatches commands (e.g., `player:moveTo`, `npc:spawn`) that Phaser executes.
- **Core Services**: Framework-agnostic. Both Phaser and React access them through a shared service layer, not directly.

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
| Town Square | Communication tasks | 傳令使 (The Herald) |
| Tavern | Party management, quest board | 酒保 (Bartender) — party/quest UI |
| Tower (unlockable) | Code/automation tasks | 巫師 (The Wizard) |

### Character Movement & Interaction

- Arrow keys / WASD for movement on the tilemap
- Walk into NPC interaction zone → press Space/Enter → dialogue UI opens
- NPCs have idle sprite animations and speech bubbles when the player is nearby
- Character sprite is customizable (chosen during onboarding)

## Agent System

### Agent Definition Schema

```typescript
interface AgentDefinition {
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

- At the Tavern, players form a party (up to 4 agents)
- Give the party a quest — a complex task requiring multiple skills
- The system orchestrates a multi-agent workflow via Claude Agent SDK with tool handoffs
- Example: "幫我用這份數據做一份簡報" (Help me make a presentation from this data)
  - 商人 analyzes the data
  - 書記官 writes the narrative
  - 匠師 designs the visuals
  - Results assembled and presented in the dialogue UI

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

- Every agent interaction earns XP in the agent's skill categories
- XP is awarded per conversation completion, categorized by the agent's skill tags
- XP thresholds trigger level-ups with pixel-art celebration animation + sound
- Every 5 levels in a category → unlock a new title fragment
- Overall title is composed from top 2 categories (e.g., Lv12 Writing + Lv8 Research = "博學文匠" / Scholarly Wordsmith)

### Quest System

- **Organic quests**: System detects completed patterns and frames them as quests retroactively ("You summarized 3 documents — Quest Complete: 知識收集者!")
- **Quest board** (Tavern): Suggested tasks based on weakest skills to encourage exploration
- **Party quests**: Multi-agent collaborative tasks assigned at the Tavern

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
   - Brief personality quiz (3 questions) to seed initial skill weights
5. Opening cutscene → wake up in Town Square
6. Tutorial NPC (長老 / The Elder) gives gentle introduction

### API Key Security

- Stored via Electron's `safeStorage` API (encrypted at OS level)
- Never exposed in logs, UI, or sent anywhere except Anthropic's API
- User can update/remove key in Settings

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

### Core Entities

```typescript
interface Player {
  id: string
  name: string
  sprite: string
  apiKey: string               // Encrypted via safeStorage
  locale: "zh-TW" | "en"
  skills: Record<SkillCategory, number>  // XP per category
  level: number                // Overall level
  title: LocalizedString       // Computed from top skills
  createdAt: Date
  totalPlayTime: number        // Seconds
}

interface Agent {
  id: string
  name: LocalizedString
  personality: string
  systemPrompt: string
  skills: SkillCategory[]
  sprite: string
  location: { map: string; x: number; y: number }
  isBuiltIn: boolean
  createdBy?: string
}

interface Conversation {
  id: string
  agentId: string
  playerId: string
  messages: { role: string; content: string; timestamp: Date }[]
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
- CJK typography considerations: line-break rules, font sizing, text wrapping

## v1 Scope

**Included:**
- Electron app with Phaser game world + React UI overlays
- Single town map with all key locations
- 7 built-in NPC agents with full dialogue/conversation capability
- Custom agent creation via Guild Hall
- Agent party system (up to 4 agents, multi-agent workflows)
- Full progression system: 7 skill categories, XP, levels, emergent titles
- Organic quest detection + quest board
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
