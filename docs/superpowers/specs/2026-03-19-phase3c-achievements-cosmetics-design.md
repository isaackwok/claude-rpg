# Phase 3C: Achievements, Cosmetics & Player Home

## Overview

Phase 3C adds three interconnected systems to Claude RPG: an achievement engine that rewards progression/exploration/tool-use milestones, a cosmetics system with sprite overlays and home decorations, and a player home — a small personal interior map where players place unlocked decorations. It also introduces the scene transition system (foundation for future multi-scene maps) and position persistence across sessions.

**In scope:**

- Achievement system — 12 definitions across 3 categories, hybrid check engine, backpack tab UI
- Cosmetics system — 7 items (4 sprite overlays, 3 decorations), direct unlock from achievements, equip/place mechanics
- Player home — 12x12 interior tilemap, decoration placement mode, portal from town
- Scene transition system — BaseScene extraction, portal objects in Tiled, Phaser native scene switching
- Position persistence — save/restore last scene + coordinates on close/open
- Achievements tab and Cosmetics tab — fill in backpack placeholders
- i18n for all new strings (zh-TW primary, en secondary)

**Out of scope:**

- Currency/shop system (cosmetics are direct achievement rewards, no economy)
- Achievement overlap with quests (clean separation: quests = conversation milestones, achievements = everything else)
- Player-placed decorations in the town map (only in the home)
- Items tab content (remains greyed placeholder)

**Deferred to Phase 6:**

- Player name input (onboarding flow)

---

## 1. Achievement System

### Achievement Definitions

Static definitions, similar to `QUEST_DEFINITIONS`. Each achievement has a trigger condition, optional cosmetic reward, and optional XP reward.

```typescript
interface AchievementDefinition {
  id: string
  title: LocalizedString
  description: LocalizedString
  icon: string // emoji for display
  category: 'progression' | 'exploration' | 'tool_use'
  trigger: AchievementTrigger
  cosmeticReward?: string // cosmetic definition ID
  xpReward?: number
}

type AchievementTrigger =
  | { type: 'overall_level'; level: number }
  | { type: 'category_level'; category: SkillCategory; level: number }
  | { type: 'any_category_level'; level: number } // any single category reaching this level
  | { type: 'tier_unlock'; tier: string }
  | { type: 'zones_visited'; count: number }
  | { type: 'all_zones_visited' } // all zones defined in tilemap object layer
  | { type: 'all_npcs_interacted' } // all NPCs defined in BUILT_IN_NPCS
  | { type: 'all_quests_discovered' } // all quest definitions in QUEST_DEFINITIONS
  | { type: 'tool_used'; toolType: ToolName } // specific ToolName (e.g., 'read_file', 'web_search')
  | { type: 'tool_group_used'; group: 'file' | 'search' | 'command' } // any tool in group
  | { type: 'all_tool_groups_used' } // all 3 groups (file, search, command)
```

### Starter Set (12 achievements)

| ID                 | Category    | Trigger                 | Title (zh-TW / en)          | Cosmetic Reward | XP  |
| ------------------ | ----------- | ----------------------- | --------------------------- | --------------- | --- |
| `first-steps`      | progression | overall_level: 5        | 踏上旅途 / First Steps      | —               | 50  |
| `rising-star`      | progression | overall_level: 10       | 冉冉新星 / Rising Star      | apprentice-hat  | 100 |
| `veteran-path`     | progression | overall_level: 15       | 老練之路 / Veteran's Path   | veteran-cape    | 150 |
| `legendary-hero`   | progression | overall_level: 20       | 傳奇英雄 / Legendary Hero   | legendary-aura  | 200 |
| `skill-master`     | progression | any_category_level: 10  | 技藝精通 / Skill Master     | champion-hat    | 100 |
| `town-explorer`    | exploration | zones_visited: 3        | 城鎮探索者 / Town Explorer  | —               | 50  |
| `cartographer`     | exploration | all_zones_visited       | 製圖師 / Cartographer       | town-banner     | 100 |
| `social-butterfly` | exploration | all_npcs_interacted     | 交際達人 / Social Butterfly | npc-statue      | 100 |
| `quest-seeker`     | exploration | all_quests_discovered   | 任務獵人 / Quest Seeker     | —               | 75  |
| `tool-initiate`    | tool_use    | tool_group_used: file   | 工具入門 / Tool Initiate    | —               | 30  |
| `researcher`       | tool_use    | tool_group_used: search | 調查員 / Researcher         | —               | 30  |
| `tech-savvy`       | tool_use    | all_tool_groups_used    | 科技達人 / Tech Savvy       | garden-item     | 75  |

Tool groups map to `ToolName` values: **file** = `read_file`, `write_file`, `edit_file`, `list_files`; **search** = `web_search`; **command** = `run_command`. Using any tool in the group counts.

**Data sources for exploration triggers:**

- `all_npcs_interacted` — derived from distinct `agent_id` in the existing `conversations` table (no new tracking table needed)
- `all_quests_discovered` — derived from the existing `quests` table (all quest_def_ids present)
- `zones_visited` / `all_zones_visited` — tracked in the new `player_zones` table
- `all_tools_used` / `all_tool_groups_used` — tracked in the new `player_tool_usage` table

### AchievementEngine (Main Process)

Hybrid check architecture — each category is checked at the appropriate trigger point:

- **Progression achievements** → checked after XP award (post-conversation, piggybacks on existing flow)
- **Exploration achievements** → checked on `zone:visited` IPC (real-time on zone entry)
- **Tool-use achievements** → checked after tool execution (real-time after tool IPC)

```typescript
class AchievementEngine {
  constructor(
    private repo: AchievementRepository,
    private progressionEngine: ProgressionEngine
  )

  checkProgression(playerId: string): AchievementCheckResult
  checkExploration(playerId: string): AchievementCheckResult
  checkToolUse(playerId: string): AchievementCheckResult
  getAchievements(playerId: string): PlayerAchievement[]
}

interface AchievementCheckResult {
  unlocked: {
    achievementDefId: string
    title: LocalizedString
    cosmeticReward?: string
    xpReward?: number
  }[]
  achievements: PlayerAchievement[]
}
```

### Integration Points

```
1. chat.ts (post-conversation, after questEngine.checkQuests):
   → achievementEngine.checkProgression('player-1')
   → emit 'achievements:unlocked' IPC if any

2. Main process IPC handler for 'zone:record-visit':
   → repo.recordZoneVisit(playerId, zoneId)
   → achievementEngine.checkExploration(playerId)
   → emit 'achievements:unlocked' IPC if any

3. chat.ts (after tool execution):
   → repo.recordToolUse(playerId, toolType)
   → achievementEngine.checkToolUse(playerId)
   → emit 'achievements:unlocked' IPC if any
```

When an achievement with a `cosmeticReward` unlocks, the engine also calls `cosmeticRepo.unlock(playerId, cosmeticDefId)` and emits both `achievements:unlocked` and `cosmetics:unlocked` IPC events.

---

## 2. Cosmetics System

### Cosmetic Definitions

```typescript
interface CosmeticDefinition {
  id: string
  title: LocalizedString
  description: LocalizedString
  icon: string
  type: 'overlay' | 'decoration'
  // Overlay-specific
  spriteSheet?: string // path to overlay sprite sheet
  layer?: 'hat' | 'cape' | 'aura'
  // Decoration-specific
  tileSprite?: string // path to decoration tile sprite
  tileSize?: { width: number; height: number }
}
```

### Starter Set (7 cosmetics)

| ID               | Type       | Layer | Title (zh-TW / en)        | Unlocked By      |
| ---------------- | ---------- | ----- | ------------------------- | ---------------- |
| `apprentice-hat` | overlay    | hat   | 學徒帽 / Apprentice Hat   | rising-star      |
| `champion-hat`   | overlay    | hat   | 大師帽 / Champion Hat     | skill-master     |
| `veteran-cape`   | overlay    | cape  | 資深披風 / Veteran Cape   | veteran-path     |
| `legendary-aura` | overlay    | aura  | 傳奇光環 / Legendary Aura | legendary-hero   |
| `town-banner`    | decoration | —     | 城鎮旗幟 / Town Banner    | cartographer     |
| `npc-statue`     | decoration | —     | NPC雕像 / NPC Statue      | social-butterfly |
| `garden-item`    | decoration | —     | 花園裝飾 / Garden Item    | tech-savvy       |

### Equip Rules

- **Overlays:** One item per layer slot (hat, cape, aura). Equipping a new item in the same slot auto-unequips the previous one.
- **Decorations:** Placed on the home map grid. One placement per decoration item. Can be moved (update coordinates) or removed (delete row).

### Sprite Overlay Rendering

- Each overlay is a separate sprite sheet matching the player sprite's animation frames (walk up/down/left/right)
- In Phaser, overlays are child sprites added to the player container, positioned at the same origin
- Layer rendering order: player sprite → cape (behind) → hat (above) → aura (around)
- When the player animates, overlay sprites play the matching animation frame

### Cosmetic Art

AI-generated pixel art with manual cleanup. Each cosmetic needs:

- **Overlays:** 4-directional sprite sheet matching player animation frames (32x32 per frame)
- **Decorations:** Single tile sprite (32x32 or 64x64)

---

## 3. Player Home

### Map Design

- Small 12x12 tile interior map created in Tiled
- Pre-designed walls, floor, basic furniture (bed, desk, shelves) as base layer
- Floor tiles marked as placeable for decorations
- Portal object back to Town scene (door)

### Home Entrance in Town

- A door tile on the town map (location TBD, near Town Square or a residential area)
- Labeled "我的家" (My Home) — proximity hint shows when player approaches
- Walking into the door triggers portal transition → HomeScene

### Decoration Placement Mode

1. Player enters HomeScene — sees their room with any previously placed decorations
2. Press **D** key or click "Decorate" button → enters decoration mode
3. In decoration mode:
   - Grid overlay appears on floor tiles
   - Unlocked decorations show in a bottom toolbar (icon strip)
   - Click a decoration in toolbar → attaches to cursor → click valid floor tile to place
   - Click already-placed decoration → pick up (returns to toolbar) or move
4. Press **D** or **Esc** → exit decoration mode, positions saved to DB
5. Normal mode: decorations are static sprites, purely visual, no collision

### Placement Validation

- Can only place on floor tiles (not walls, base furniture tiles)
- One decoration per tile cell
- One placement per decoration item (each decoration can only exist once)

---

## 4. Scene Transition System

### Architecture

```
BaseScene (shared logic)
├── Town (existing town map + NPCs, currently src/renderer/src/game/scenes/Town.ts)
├── Home (player home + decorations)
└── Future: GuildHall, QuestLocation, etc.
```

### BaseScene

Extracted from the current `Town` scene, contains shared logic:

- Player sprite creation + overlay rendering
- Keyboard input (movement, panel hotkeys)
- Camera follow
- Collision setup from tilemap
- Portal detection and fade transitions
- Position save on scene switch / game close
- EventBus integration

### Portal Transition Flow

1. Player walks onto a portal object (Tiled object layer, type: `portal`)
2. Portal properties: `targetScene`, `spawnX`, `spawnY`
3. Overlap callback fires
4. Camera fade-out (~300ms)
5. `this.scene.start(targetScene, { spawnX, spawnY, fromScene })`
6. Target scene loads tilemap, spawns player at spawn point, fades in
7. EventBus emits `scene:changed` so React UI knows which scene is active

### Portal Definition in Tiled

- Object layer named `portals`
- Rectangle objects with custom properties: `targetScene` (string), `spawnX` (int), `spawnY` (int)
- Visual: door tile or glowing portal tile on the map

---

## 5. Position Persistence

- On scene transition or game close → save `last_scene`, `last_x`, `last_y` to `players` table
- On game start → read saved position, start the correct scene at saved coordinates
- Default (first launch): `Town` scene at the existing spawn point
- Saving triggers: `beforeunload` event, scene switch, explicit save via IPC

---

## 6. Database Schema (Migration 3)

```sql
-- Achievement tracking
CREATE TABLE achievements (
  player_id TEXT NOT NULL REFERENCES players(id),
  achievement_def_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY(player_id, achievement_def_id)
);

-- Zone visit tracking (for exploration achievements)
CREATE TABLE player_zones (
  player_id TEXT NOT NULL REFERENCES players(id),
  zone_id TEXT NOT NULL,
  first_visited_at INTEGER NOT NULL,
  UNIQUE(player_id, zone_id)
);

-- Tool usage tracking (for tool-use achievements)
CREATE TABLE player_tool_usage (
  player_id TEXT NOT NULL REFERENCES players(id),
  tool_type TEXT NOT NULL,
  first_used_at INTEGER NOT NULL,
  UNIQUE(player_id, tool_type)
);

-- Cosmetics inventory and equip state (equipped applies to overlays only; decoration placement tracked in home_decorations)
CREATE TABLE cosmetics (
  player_id TEXT NOT NULL REFERENCES players(id),
  cosmetic_def_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  equipped INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(player_id, cosmetic_def_id)
);
CREATE INDEX idx_cosmetics_player ON cosmetics(player_id);

-- Home decoration placements
CREATE TABLE home_decorations (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  cosmetic_def_id TEXT NOT NULL,
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  placed_at INTEGER NOT NULL,
  UNIQUE(player_id, cosmetic_def_id),
  UNIQUE(player_id, tile_x, tile_y)
);

-- Position persistence
ALTER TABLE players ADD COLUMN last_scene TEXT DEFAULT 'Town';
ALTER TABLE players ADD COLUMN last_x REAL;
ALTER TABLE players ADD COLUMN last_y REAL;
```

---

## 7. EventBus Events

New events added to `GameEvents`:

```typescript
'achievement:unlocked': {
  achievementDefId: string
  title: LocalizedString
  cosmeticReward?: { id: string; title: LocalizedString; type: 'overlay' | 'decoration' }
}
'cosmetic:unlocked': { cosmeticDefId: string; title: LocalizedString }
'cosmetic:equipped': { cosmeticDefId: string; layer: 'hat' | 'cape' | 'aura' }
'cosmetic:unequipped': { layer: 'hat' | 'cape' | 'aura' }
'scene:changed': { sceneName: string; fromScene?: string }
'zone:visited': { zoneId: string }
'home:decorate-mode': { active: boolean }
```

---

## 8. IPC Channels

### Main → Renderer (send)

```
'achievements:unlocked'     — after check finds new unlocks
'achievements:updated'      — full list refresh
'cosmetics:unlocked'        — new cosmetic available
'cosmetics:updated'         — full list refresh (after equip/unequip)
```

### Renderer → Main (invoke)

```
'achievements:get-all'      — fetch all player achievements
'cosmetics:get-all'         — fetch all player cosmetics
'cosmetics:equip'           — equip an overlay (cosmeticDefId)
'cosmetics:unequip'         — unequip a layer slot (layer)
'cosmetics:place'           — place decoration at (cosmeticDefId, x, y)
'cosmetics:remove'          — remove placed decoration (cosmeticDefId)
'cosmetics:get-placements'  — fetch home decoration positions
'zone:record-visit'         — record zone visit for tracking
'player:save-position'      — save last scene + coordinates
'player:get-position'       — get saved position on game start
```

---

## 9. React Components

### AchievementsTab

- Category-grouped layout with section headers (⚔️ 成長, 🗺️ 探索, 🔧 工具)
- Compact badge-style achievement cards
- Unlocked: full color, gold checkmark, cosmetic reward indicator
- Locked: greyed out, lock icon, description still visible
- Header: "🏆 成就 · N / M 已解鎖"

### CosmeticsTab

- Split panel layout: left preview + right item list
- Left panel: player sprite preview with equipped overlay sprites, 3 equip slot indicators (hat/cape/aura)
- Right panel: sub-tabs for 穿戴 (Overlays) and 家居 (Decorations)
- Overlay items: equip/unequip button, shows layer type and source achievement
- Decoration items: "place" button (opens HomeScene in decorate mode), shows source achievement
- Locked items: greyed, shows which achievement unlocks them

### AchievementNotification

- Toast popup centered at top (same pattern as QuestNotification)
- Auto-dismiss after 4 seconds (slightly longer than quest toasts — achievements are rarer)
- Achievement-only: "🏆 踏上旅途 — 已解鎖！"
- Achievement + cosmetic: "🏆 冉冉新星 — 學徒帽 已解鎖！" (gold highlight on cosmetic)

### HomeHUD

- Small overlay for HomeScene only
- "Decorate" button (D key shortcut)
- When in decoration mode: bottom toolbar showing unlocked decoration items

### React Hooks

```typescript
useAchievements()    → { achievements, loading, error, unlockedCount, totalCount }
useCosmetics()       → { cosmetics, loading, error, equip, unequip, equipped }
useHomePlacements()  → { placements, place, remove, move, loading }
```

---

## 10. i18n Keys

All new strings added to both `zh-TW.json` and `en.json`:

```
achievements.title
achievements.count           — "{{unlocked}} / {{total}} 已解鎖"
achievements.categories.progression
achievements.categories.exploration
achievements.categories.tool_use
achievements.unlocked        — "已解鎖"
achievements.locked          — "未解鎖"
achievements.notification    — "🏆 {{title}} — 已解鎖！"
achievements.notificationWithCosmetic — "🏆 {{title}} — {{cosmetic}} 已解鎖！"

cosmetics.title
cosmetics.count
cosmetics.tabs.overlays      — "穿戴"
cosmetics.tabs.decorations   — "家居"
cosmetics.equip              — "裝備"
cosmetics.equipped           — "裝備中"
cosmetics.unequip            — "卸下"
cosmetics.place              — "放置"
cosmetics.slots.hat          — "帽子"
cosmetics.slots.cape         — "披風"
cosmetics.slots.aura         — "光環"
cosmetics.preview            — "預覽"
cosmetics.equippedSlots      — "裝備中"
cosmetics.source             — "{{achievement}} 解鎖"
cosmetics.locked             — "🔒 {{achievement}} 解鎖"

home.title                   — "我的家"
home.decorate                — "裝飾模式"
home.decorateHint            — "按 D 進入裝飾模式"
home.exitDecorate            — "按 D 或 Esc 退出"
home.placementInvalid        — "無法放置於此"

scene.transitioning          — "移動中..."
```

---

## 11. File Structure

New files to create:

```
src/shared/
  achievement-types.ts         — AchievementDefinition, AchievementTrigger, PlayerAchievement types
  cosmetic-types.ts            — CosmeticDefinition, PlayerCosmetic types

src/main/
  achievement-engine.ts        — AchievementEngine service
  achievement-definitions.ts   — ACHIEVEMENT_DEFINITIONS array
  cosmetic-definitions.ts      — COSMETIC_DEFINITIONS array
  db/
    achievement-repository.ts  — AchievementRepository (DB layer)
    cosmetic-repository.ts     — CosmeticRepository (DB layer)

src/renderer/src/
  components/ui/
    AchievementsTab.tsx        — Backpack achievements tab
    AchievementCard.tsx        — Individual achievement badge
    CosmeticsTab.tsx           — Backpack cosmetics tab (split panel)
    CosmeticItem.tsx           — Individual cosmetic list item
    AchievementNotification.tsx — Toast notification on unlock
    HomeHUD.tsx                — Home scene overlay (decorate button + toolbar)
  hooks/
    useAchievements.ts
    useCosmetics.ts
    useHomePlacements.ts
  game/
    scenes/
      BaseScene.ts             — Shared scene logic extracted from Town
      HomeScene.ts             — Player home interior
    DecorationManager.ts       — Decoration placement logic for HomeScene

assets/
  maps/
    home.json                  — Tiled tilemap for player home
  sprites/
    cosmetics/                 — Overlay and decoration sprite sheets
```

Modified files:

```
src/shared/types.ts            — Add achievement/cosmetic types, export new interfaces
src/renderer/src/game/types.ts — Add new GameEvents
src/renderer/src/game/scenes/Town.ts — Extract to BaseScene, add portal support
src/renderer/src/components/ui/BackpackPanel.tsx — Enable achievements + cosmetics tabs
src/main/db/migrations.ts      — Add Migration 3
src/main/chat.ts               — Integration points for achievement checks
src/main/index.ts              — New IPC handlers
src/preload/index.ts           — New preload API surface
src/renderer/src/i18n/locales/zh-TW.json
src/renderer/src/i18n/locales/en.json
```
