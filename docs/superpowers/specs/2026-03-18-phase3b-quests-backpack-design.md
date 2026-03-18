# Phase 3B — Quests, Backpack & Title Tiers Design

## Overview

Phase 3B adds the gameplay loop on top of Phase 3A's XP/leveling engine. Players gain a backpack inventory panel, an organic quest system with discovery mechanics, a Tavern quest board for directional guidance, and title tier upgrades that reward long-term progression.

## Scope

**In scope (3B):**

- Backpack (背包) overlay panel with tab system
- Organic quest system with D+B hybrid visibility model
- 5 v1 quest definitions with counter-based triggers
- Quest completion celebrations and discovery notifications
- Tavern quest board (directional suggestions via Bartender)
- Title fragment tier unlocks (every 5 overall levels)
- New `quests` DB table and QuestEngine service
- HUD backpack icon with active quest badge count
- i18n for all new strings (zh-TW primary, en secondary)

**Deferred to Phase 3C:**

- Achievement system
- Cosmetics / equip system
- 📦 物品 (Items) tab content
- 🏆 成就 (Achievements) tab content
- 👘 裝飾 (Cosmetics) tab content

**Deferred to Phase 6:**

- Player name input (onboarding flow)

## 1. Backpack System (背包)

### Concept

A unified RPG inventory panel — one overlay, one hotkey, one extensible container. Opened via **B key** or clicking the 🎒 HUD icon. Uses the same full-screen overlay pattern as SkillsPanel.

### Tab Structure

Left sidebar with icon tabs, ordered:

1. 📦 **物品 (Items)** — greyed placeholder, future phase
2. 📜 **任務 (Quests)** — active in Phase 3B
3. 🏆 **成就 (Achievements)** — greyed placeholder, Phase 3C
4. 👘 **裝飾 (Cosmetics)** — greyed placeholder, Phase 3C

When a tab is unavailable, it renders as dimmed and non-interactive. The first available tab is auto-selected (Quests in Phase 3B).

### HUD Integration

Small 🎒 icon added to the HUD. Badge count shows number of active (in-progress) quests. Press B to toggle the backpack open/closed. ESC also closes it.

### Color System

Matches the existing game palette:

| Element            | Color                                           | Source                |
| ------------------ | ----------------------------------------------- | --------------------- |
| Panel background   | `rgba(10, 10, 30, 0.96)`                        | DialoguePanel         |
| Panel border       | `3px solid rgba(200, 180, 140, 0.6)`            | DialoguePanel         |
| Card background    | `rgba(200, 180, 140, 0.08)`                     | SkillsPanel variant   |
| Card border        | `1px solid rgba(200, 180, 140, 0.25)`           | SkillsPanel           |
| Headings           | `#e8d5a8`                                       | SkillsPanel title     |
| Primary text       | `#c4a46c`                                       | HUD                   |
| Muted text         | `#a89060`                                       | SkillsPanel subtitles |
| Progress bar track | `rgba(200, 180, 140, 0.15)`                     | SkillsPanel/HUD       |
| Progress bar fill  | Per-skill color                                 | SkillsPanel           |
| XP reward text     | `#ffd700`                                       | LevelUpBanner         |
| Active tab border  | `2px solid #c4a46c`                             | —                     |
| Inactive tab       | `rgba(200, 180, 140, 0.15)` border, 35% opacity | —                     |

### Quests Tab Layout

- Header: "📜 任務" with count summary ("進行中 2 · 已完成 1")
- Filter sub-tabs: 全部 / 進行中 / 已完成
- Quest cards list (scrollable)
- ESC close hint

### Quest Card Variants

**Visible/Active card:**

- Bilingual quest name (zh-TW primary, en secondary below)
- Description text
- Progress bar (for count-based) or category chips (for multi-category)
- Skill category tag (using skill color)
- XP reward amount in gold (#ffd700)
- Status badge ("進行中")

**Hinted/Mystery card:**

- "??? 未知任務" as title, dimmed style
- Hint text (vague directional clue)
- No progress bar, no XP amount shown
- Slightly more transparent than active cards

**Completed card:**

- Faded (60% opacity)
- Checkmark on title
- "已獲得 +N XP ✓" instead of reward amount
- Status badge ("已完成")

## 2. Quest System (任務系統)

### Quest Lifecycle

```
hidden → hinted/visible → active → completed
```

- **hidden:** No DB row exists. Precondition not yet met. QuestEngine derives this state from absence.
- **hinted:** Mystery card shown. DB row created when precondition is met. Quest designed for discovery.
- **visible:** Full card shown. DB row created at player init (for starter quests) or when precondition is met.
- **active:** Same as visible, but progress > 0. Status transitions from initial to active automatically.
- **completed:** Faded card. XP awarded. For repeatable quests, status resets to `visible` (see Repeatable Quests).

### Visibility Model (D+B Hybrid)

Each quest definition declares:

- `initialVisibility`: `'visible'` or `'hidden'`
- `precondition`: condition to transition from hidden → hinted or visible
- `hintText`: `LocalizedString` shown on mystery cards (only for hinted quests)

3 starter quests are `visible` from the start (immediate direction). 2 quests start `hidden` and become `hinted` when preconditions are met (discovery moments). The quest list stays short and focused.

### Trigger Engine

After each conversation completion:

1. ProgressionEngine awards XP (existing flow)
2. QuestEngine.checkQuests() runs in the same call chain
3. For each quest definition:
   - If hidden: check precondition → promote to hinted/visible if met
   - If hinted/visible/active: check completion trigger → complete if met
4. Results sent to renderer via IPC

### Counter Data Source

Quest triggers query the `xp_ledger` table — each row represents one XP award from one conversation. `COUNT(*)` grouped by `skill_category` gives conversation counts per category. `COUNT(DISTINCT DATE(created_at))` gives daily counts. No new tracking tables needed.

### v1 Quest Definitions

| Quest                            | Initial   | Precondition                     | Trigger                                 | Reward |
| -------------------------------- | --------- | -------------------------------- | --------------------------------------- | ------ |
| 初次接觸 (First Contact)         | `visible` | None                             | 1 conversation in any category          | 20 XP  |
| 知識收集者 (Knowledge Collector) | `visible` | None                             | 3 conversations in Research             | 50 XP  |
| 日常冒險者 (Daily Adventurer)    | `visible` | None                             | 3 conversations in one day (repeatable) | 30 XP  |
| 勤奮學徒 (Diligent Apprentice)   | `hidden`  | 3+ convos in any single category | 10 convos in any single category        | 80 XP  |
| 多才多藝 (Renaissance)           | `hidden`  | 2+ different categories used     | 1 convo in each of 5 categories         | 100 XP |

### Quest Definition Interface

```typescript
interface QuestDefinition {
  id: string
  name: LocalizedString
  description: LocalizedString
  hintText?: LocalizedString // shown on mystery cards
  icon: string // emoji
  initialVisibility: 'visible' | 'hidden'
  precondition?: QuestPrecondition // when to reveal hidden quests
  trigger: QuestTrigger // when to complete
  xpReward: number
  skillCategories: SkillCategory[] // for display tagging
  repeatable: boolean
}

interface QuestTrigger {
  type:
    | 'conversation_count'
    | 'category_count'
    | 'max_category_count'
    | 'daily_count'
    | 'category_coverage'
  skillCategory?: SkillCategory // for category-specific triggers (e.g., 'research' for Knowledge Collector)
  threshold: number // semantics vary by type:
  //   conversation_count: total conversations across all categories
  //   category_count: conversations in a specific skillCategory
  //   max_category_count: highest conversation count in any single category
  //   daily_count: conversations within a single calendar day
  //   category_coverage: number of distinct categories with >= 1 conversation
}

interface QuestPrecondition {
  type: 'max_category_count' | 'category_coverage'
  threshold: number // max_category_count: highest convo count in any single category
  // category_coverage: min distinct categories with >= 1 convo
}
```

Quest definitions are static code constants, not DB rows.

### Repeatable Quests

When a repeatable quest (e.g., Daily Adventurer) completes:

1. XP is awarded and completion notification shown
2. The existing DB row's `status` resets to `'active'` and `progress` resets
3. The `completed_at` timestamp is cleared
4. A `repeat_count` column tracks how many times the quest has been completed (for display: "已完成 3 次")

The quest reappears in the active list immediately, ready to be completed again. For daily quests, the trigger checks only conversations from the current calendar day.

### Notifications

**Quest completed:** Toast banner similar to LevelUpBanner — "🎉 任務完成：初次接觸 +20 XP". Auto-dismisses after 2.5 seconds.

**Quest discovered (hidden → hinted/visible):** Subtle notification — "📜 新任務發現！打開背包查看" (New quest discovered! Open backpack to see). Smaller and less celebratory than completion.

## 3. Quest Board (酒館任務板)

### Concept

The Tavern quest board suggests activities based on the player's weakest skill category. These are **directional hints, not trackable quests**. No state tracking, no completion, no XP from the board itself.

### How It Works

1. Player interacts with quest board at Tavern (or talks to Bartender)
2. System finds the player's lowest-XP skill category
3. Displays a suggestion mapping the weak skill to the relevant NPC
4. One suggestion at a time, refreshes after each conversation

### Suggestion Format

The Bartender delivers suggestions in-character through the existing DialoguePanel:

> "你的**視覺**技能看起來還有很大的成長空間——試著找工匠艾瑞絲聊聊，讓她幫你做個設計任務吧！"
>
> (Your **Visual** skill has lots of room to grow — try talking to Artisan Iris and ask her for a design task!)

### Skill-to-NPC Mapping

| Weakest Skill | Suggested NPC               | Agent     |
| ------------- | --------------------------- | --------- |
| writing       | 書記官雷文 (Scribe Raven)   | scribe    |
| research      | 學者索菲亞 (Scholar Sofia)  | scholar   |
| code          | 法師瑪琳 (Wizard Merlin)    | wizard    |
| data          | 商人馬可 (Merchant Marco)   | merchant  |
| communication | 傳令官娜歐蜜 (Herald Naomi) | herald    |
| organization  | 指揮官乃歐 (Commander Neo)  | commander |
| visual        | 工匠艾瑞絲 (Artisan Iris)   | artisan   |

### UI & Integration

The quest board is **not** part of the Bartender's AI conversation. It's a separate interaction triggered by a quest board object in the Tavern zone (or a dedicated "查看任務板" button when near the Bartender). When activated, it opens a simple styled panel (reusing DialoguePanel's visual style) showing the current suggestion. This is a static display, not a chat — no AI call needed.

The suggestion refreshes each time the panel is opened (re-queries `getQuestBoardSuggestion()`). The Bartender's normal AI conversation remains separate.

## 4. Title Fragment Tiers (稱號階段)

### Current System

Dynamic title from `computeTitle()` — combines adjective from secondary skill + noun from primary skill. Example: "博學的寫手" (Scholarly Writer).

### Tier Upgrades

A prefix is added based on overall level, upgrading every 5 levels:

| Level Range | Tier Prefix (zh-TW) | Tier Prefix (en) | Example (zh-TW)  | Example (en)                |
| ----------- | ------------------- | ---------------- | ---------------- | --------------------------- |
| 1–4         | (none)              | (none)           | 博學的寫手       | Scholarly Writer            |
| 5–9         | 見習                | Apprentice       | 見習・博學的寫手 | Apprentice Scholarly Writer |
| 10–14       | 熟練                | Skilled          | 熟練・博學的寫手 | Skilled Scholarly Writer    |
| 15–19       | 資深                | Veteran          | 資深・博學的寫手 | Veteran Scholarly Writer    |
| 20+         | 傳奇                | Legendary        | 傳奇・博學的寫手 | Legendary Scholarly Writer  |

### Implementation

Extends `computeTitle()` in ProgressionEngine. The tier prefix is derived from overall level — no new data model needed. The `・` (middle dot) separator keeps it readable.

### Celebration

When crossing a 5-level boundary, the `title:changed` event fires. A toast notification announces the tier upgrade: "稱號晉升：見習・博學的寫手" (Title promoted: Apprentice Scholarly Writer).

## 5. Database Schema

### New Table: `quests`

```sql
CREATE TABLE quests (
  id TEXT PRIMARY KEY,               -- UUID
  player_id TEXT NOT NULL REFERENCES players(id),
  quest_def_id TEXT NOT NULL,
  visibility TEXT NOT NULL,          -- 'hinted' | 'visible' (hidden quests have no row)
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'completed'
  repeat_count INTEGER NOT NULL DEFAULT 0, -- times completed (for repeatable quests)
  discovered_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE(player_id, quest_def_id)    -- one row per player per quest
);
CREATE INDEX idx_quests_player ON quests(player_id);
```

Hidden quests have no DB row — their state is derived from absence. A row is created when a quest transitions to `hinted` or `visible`. For starter quests (`initialVisibility: 'visible'`), rows are seeded on first player creation.

The `progress` field was removed — quest progress is computed live from `xp_ledger` queries, avoiding stale cache issues. Quest definitions are static code constants. The `quests` table tracks per-player state only.

### Migration

Added as migration 2 in the existing migration system (`src/main/db/migrations.ts`).

## 6. Architecture

### New Service: QuestEngine

Lives in main process alongside ProgressionEngine.

```
┌─ MAIN PROCESS ──────────────────────────────────┐
│  ProgressionEngine (existing)                    │
│    └── awardXP() → triggers quest check          │
│                                                  │
│  QuestEngine (new)                               │
│    ├── checkQuests(playerId)                      │
│    ├── getPlayerQuests(playerId)                  │
│    ├── getQuestBoardSuggestion(playerId)          │
│    └── QUEST_DEFINITIONS (static)                │
│                                                  │
│  SqliteQuestRepository (new)                     │
│    ├── upsert(quest)                             │
│    ├── getByPlayer(playerId)                     │
│    └── complete(questId)                         │
└──────────────────────────────────────────────────┘
        ↕ IPC
┌─ RENDERER ───────────────────────────────────────┐
│  BackpackPanel (new)                             │
│    └── QuestsTab (new)                           │
│                                                  │
│  useQuests hook (new)                            │
│    ├── listens: quests:updated, quests:discovered │
│    └── invokes: quests:get-all                   │
│                                                  │
│  QuestNotification (new)                         │
│    ├── quest completion toast                    │
│    └── quest discovery toast                     │
│                                                  │
│  HUD (extended)                                  │
│    └── 🎒 icon with badge count                  │
└──────────────────────────────────────────────────┘
```

### New IPC Channels

| Channel                       | Type   | Payload                                                        |
| ----------------------------- | ------ | -------------------------------------------------------------- |
| `quests:get-all`              | invoke | → `PlayerQuest[]`                                              |
| `quests:updated`              | send   | `{ quests: PlayerQuest[], completed?: QuestCompletionResult }` |
| `quests:discovered`           | send   | `{ questDefId: string, visibility: 'hinted' \| 'visible' }`    |
| `quests:get-board-suggestion` | invoke | → `QuestBoardSuggestion`                                       |

### EventBus Events

The existing `'quest:completed'` event type (defined in `src/renderer/src/game/types.ts`) must be extended to include `xpReward`:

```typescript
// Modified (existing event, add xpReward):
'quest:completed': { questId: string; title: LocalizedString; xpReward: number }

// New events:
'quest:discovered': { questDefId: string; visibility: 'hinted' | 'visible' }
'backpack:toggle': void
```

### Flow: Conversation → Quest Check

1. User completes conversation with NPC
2. `chat.ts` calls `progressionEngine.awardXP()` (existing)
3. `chat.ts` calls `questEngine.checkQuests(playerId)` (new)
4. QuestEngine queries xp_ledger for counters, evaluates all triggers
5. Returns: `{ discovered: QuestDiscovery[], completed: QuestCompletion[] }`
6. Main process sends IPC: `quests:updated` and/or `quests:discovered`
7. Renderer `useQuests` hook updates state, emits EventBus events
8. BackpackPanel and QuestNotification react

## 7. i18n Keys

New keys added to both `zh-TW.json` and `en.json`:

```
backpack.title
backpack.tabs.items
backpack.tabs.quests
backpack.tabs.achievements
backpack.tabs.cosmetics
backpack.tabs.unavailable

quests.title
quests.filters.all
quests.filters.active
quests.filters.completed
quests.count (進行中 {{active}} · 已完成 {{completed}})
quests.progress
quests.reward
quests.earned
quests.mystery (??? 未知任務)
quests.discovered (新任務發現！)
quests.completed (任務完成！)

questBoard.suggestion (template with NPC name and skill)

titles.tiers.apprentice
titles.tiers.skilled
titles.tiers.veteran
titles.tiers.legendary
titles.tierUp (稱號晉升)
```

Plus individual quest names, descriptions, and hints for all 5 v1 quests.
