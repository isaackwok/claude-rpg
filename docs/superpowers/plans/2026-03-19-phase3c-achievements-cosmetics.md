# Phase 3C: Achievements, Cosmetics & Player Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an achievement system (12 definitions, 3 categories), cosmetics (sprite overlays + decorations), a decoratable player home, and a scene transition system to Claude RPG.

**Architecture:** Hybrid-check AchievementEngine (progression checked post-conversation, exploration on zone visit, tool-use after tool execution). Cosmetics unlocked directly by achievements. BaseScene extracted from Town for shared scene logic. HomeScene with decoration placement mode.

**Tech Stack:** Electron, Phaser 3.90, React 19, TypeScript, better-sqlite3, vitest

**Spec:** `docs/superpowers/specs/2026-03-19-phase3c-achievements-cosmetics-design.md`

---

## File Structure Overview

### New Files

```
src/shared/
  achievement-types.ts         — Achievement type definitions
  cosmetic-types.ts            — Cosmetic type definitions

src/main/
  achievement-engine.ts        — AchievementEngine service
  achievement-definitions.ts   — ACHIEVEMENT_DEFINITIONS static array
  cosmetic-definitions.ts      — COSMETIC_DEFINITIONS static array
  db/
    achievement-repository.ts  — AchievementRepository (DB layer)
    cosmetic-repository.ts     — CosmeticRepository (DB layer)

src/renderer/src/
  components/ui/
    AchievementsTab.tsx        — Category-grouped achievement list
    AchievementCard.tsx        — Individual achievement badge card
    CosmeticsTab.tsx           — Split panel: preview + item list
    CosmeticItem.tsx           — Individual cosmetic row
    AchievementNotification.tsx — Toast on unlock
    HomeHUD.tsx                — Decorate button + toolbar overlay
  hooks/
    useAchievements.ts
    useCosmetics.ts
    useHomePlacements.ts
  game/
    scenes/
      BaseScene.ts             — Shared scene logic extracted from Town
      Home.ts                  — Player home interior scene
    DecorationManager.ts       — Decoration placement grid logic
```

### Modified Files

```
src/shared/types.ts                              — Re-export new types
src/renderer/src/game/types.ts                   — Add new GameEvents
src/renderer/src/game/scenes/Town.ts             — Extend BaseScene instead of Scene
src/renderer/src/components/ui/BackpackPanel.tsx  — Enable achievements + cosmetics tabs
src/main/db/migrations.ts                        — Add Migration 3
src/main/chat.ts                                 — Achievement check integration
src/main/index.ts                                — New IPC handlers, engine init
src/preload/index.ts                             — New preload API surface
src/renderer/src/i18n/locales/zh-TW.json         — Achievement/cosmetic/home i18n keys
src/renderer/src/i18n/locales/en.json            — Achievement/cosmetic/home i18n keys
src/renderer/src/game/entities/Player.ts         — Overlay sprite rendering
src/renderer/src/App.tsx                         — Register Home scene, add new overlays
```

---

## Task 1: Shared Types & DB Migration

**Files:**

- Create: `src/shared/achievement-types.ts`
- Create: `src/shared/cosmetic-types.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/db/migrations.ts`

- [ ] **Step 1: Create achievement type definitions**

Create `src/shared/achievement-types.ts` with:

- `AchievementCategory` type: `'progression' | 'exploration' | 'tool_use'`
- `AchievementTrigger` discriminated union (11 trigger types from spec Section 1)
- `ToolGroup` type: `'file' | 'search' | 'command'`
- `TOOL_GROUP_MAP` constant mapping each ToolGroup to its ToolName values:
  - file: `['read_file', 'write_file', 'edit_file', 'list_files']`
  - search: `['web_search']`
  - command: `['run_command']`
- `AchievementDefinition` interface (id, title, description, icon, category, trigger, cosmeticReward?, xpReward?)
- `PlayerAchievement` interface (achievementDefId, unlocked, unlockedAt?, definition)
- `AchievementCheckResult` interface (unlocked array, achievements array)

- [ ] **Step 2: Create cosmetic type definitions**

Create `src/shared/cosmetic-types.ts` with:

- `CosmeticType`: `'overlay' | 'decoration'`
- `OverlayLayer`: `'hat' | 'cape' | 'aura'`
- `CosmeticDefinition` interface (id, title, description, icon, type, spriteSheet?, layer?, tileSprite?, tileSize?)
- `PlayerCosmetic` interface (cosmeticDefId, unlocked, unlockedAt?, equipped, definition)
- `HomePlacement` interface (cosmeticDefId, tileX, tileY)

- [ ] **Step 3: Re-export from shared types**

Add to end of `src/shared/types.ts`:

```typescript
export * from './achievement-types'
export * from './cosmetic-types'
```

- [ ] **Step 4: Add Migration 3**

Add to `src/main/db/migrations.ts` in the `MIGRATIONS` record after migration `2`. Create tables: `achievements`, `player_zones`, `player_tool_usage`, `cosmetics`, `home_decorations`. ALTER players to add `last_scene`, `last_x`, `last_y`. See spec Section 6 for exact SQL (composite primary keys, unique constraints, indexes).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/achievement-types.ts src/shared/cosmetic-types.ts src/shared/types.ts src/main/db/migrations.ts
git commit -m "feat(3c): add achievement/cosmetic types and DB migration 3"
```

---

## Task 2: Achievement Definitions & Repository

**Files:**

- Create: `src/main/achievement-definitions.ts`
- Create: `src/main/db/achievement-repository.ts`

- [ ] **Step 1: Create achievement definitions**

Create `src/main/achievement-definitions.ts` with all 12 achievement definitions following the pattern from `src/main/quest-definitions.ts`. Each definition uses the `AchievementDefinition` interface with `LocalizedString` for title/description, emoji icon, category, trigger, and optional cosmeticReward/xpReward. Reference the spec table (Section 1) for exact values. Include a `getAchievementDefinition(id)` lookup helper.

- [ ] **Step 2: Create AchievementRepository**

Create `src/main/db/achievement-repository.ts` following the pattern from `src/main/db/quest-repository.ts`. Methods:

- `unlock(playerId, achievementDefId)` — INSERT OR IGNORE into achievements
- `getUnlocked(playerId)` — returns unlocked achievement_def_id array
- `recordZoneVisit(playerId, zoneId)` — INSERT OR IGNORE into player_zones
- `getZoneVisitCount(playerId)` — COUNT distinct zones
- `getVisitedZones(playerId)` — returns zone_id array
- `recordToolUse(playerId, toolType)` — INSERT OR IGNORE into player_tool_usage
- `getUsedToolTypes(playerId)` — returns tool_type array
- `getInteractedNpcCount(playerId)` — COUNT(DISTINCT agent_id) FROM conversations
- `getDiscoveredQuestCount(playerId)` — COUNT(\*) FROM quests

- [ ] **Step 3: Write unit tests for AchievementRepository**

Create `src/main/__tests__/achievement-repository.test.ts`. Test with in-memory better-sqlite3 database. Run migrations, then test:

- `unlock()` + `getUnlocked()` — stores and retrieves
- `unlock()` is idempotent (second call doesn't throw)
- `recordZoneVisit()` + `getZoneVisitCount()` — counts distinct zones
- `recordToolUse()` + `getUsedToolTypes()` — tracks unique tools

- [ ] **Step 4: Run tests**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/achievement-definitions.ts src/main/db/achievement-repository.ts src/main/__tests__/achievement-repository.test.ts
git commit -m "feat(3c): add achievement definitions and repository"
```

---

## Task 3: AchievementEngine

**Files:**

- Create: `src/main/achievement-engine.ts`
- Create: `src/main/__tests__/achievement-engine.test.ts`

- [ ] **Step 1: Write unit tests for AchievementEngine**

Mock the repository and progression engine. Test:

- `checkProgression()` — unlocks `first-steps` when overall level >= 5
- `checkProgression()` — unlocks `skill-master` when any category level >= 10
- `checkProgression()` — doesn't re-unlock already-unlocked achievements
- `checkExploration()` — unlocks `town-explorer` when 3 zones visited
- `checkToolUse()` — unlocks `tool-initiate` when any file tool used
- `checkToolUse()` — unlocks `tech-savvy` when all 3 tool groups used
- `getAchievements()` — returns all definitions with unlock status

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL (AchievementEngine doesn't exist yet)

- [ ] **Step 3: Implement AchievementEngine**

Create `src/main/achievement-engine.ts`. Core methods:

- `checkProgression(playerId)`: Get already-unlocked IDs from repo, get player state from progressionEngine, filter ACHIEVEMENT_DEFINITIONS to `category === 'progression'`, evaluate each trigger against player state, unlock matches.
- `checkExploration(playerId)`: Similar for exploration triggers using repo zone/npc/quest counts.
- `checkToolUse(playerId)`: Similar for tool_use triggers using repo tool types and TOOL_GROUP_MAP.
- `getAchievements(playerId)`: Return all definitions merged with unlock status.

Private `evaluateTrigger()` method uses switch on `trigger.type`:

- `overall_level`: `playerState.overallLevel >= trigger.level`
- `any_category_level`: `Object.values(playerState.skills).some(s => s.level >= trigger.level)`
- `zones_visited`: `repo.getZoneVisitCount(playerId) >= trigger.count`
- `all_zones_visited`: compare visited count against total zones (pass total as constructor param)
- `all_npcs_interacted`: compare interacted count against BUILT_IN_NPCS count (7)
- `all_quests_discovered`: compare discovered count against QUEST_DEFINITIONS count (5)
- `tool_group_used`: check if any tool in `TOOL_GROUP_MAP[trigger.group]` exists in used tools
- `all_tool_groups_used`: check all 3 groups have at least one tool used

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/achievement-engine.ts src/main/__tests__/achievement-engine.test.ts
git commit -m "feat(3c): implement AchievementEngine with hybrid checks"
```

---

## Task 4: Cosmetic Definitions & Repository

**Files:**

- Create: `src/main/cosmetic-definitions.ts`
- Create: `src/main/db/cosmetic-repository.ts`
- Create: `src/main/__tests__/cosmetic-repository.test.ts`

- [ ] **Step 1: Create cosmetic definitions**

Create `src/main/cosmetic-definitions.ts` with all 7 cosmetic definitions from spec Section 2. Follow same static-array pattern. Include `getCosmeticDefinition(id)` helper.

- [ ] **Step 2: Create CosmeticRepository**

Create `src/main/db/cosmetic-repository.ts`. Methods:

- `unlock(playerId, cosmeticDefId)` — INSERT OR IGNORE into cosmetics
- `getAll(playerId)` — returns all cosmetics with unlock/equip state
- `equip(playerId, cosmeticDefId)` — auto-unequips same layer first, then sets equipped=1
- `unequip(playerId, cosmeticDefId)` — sets equipped=0
- `placeDecoration(playerId, cosmeticDefId, tileX, tileY)` — INSERT OR REPLACE into home_decorations
- `removeDecoration(playerId, cosmeticDefId)` — DELETE from home_decorations
- `getPlacements(playerId)` — returns HomePlacement array

- [ ] **Step 3: Write unit tests**

Test: unlock + getAll, equip auto-unequips same layer, unequip, placeDecoration + getPlacements, removeDecoration, tile uniqueness constraint.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/cosmetic-definitions.ts src/main/db/cosmetic-repository.ts src/main/__tests__/cosmetic-repository.test.ts
git commit -m "feat(3c): add cosmetic definitions and repository"
```

---

## Task 5: IPC Handlers & Preload API

**Files:**

- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Initialize engines and add IPC handlers in main process**

In `src/main/index.ts`, after existing quest engine initialization (~line 82-90):

1. Create `AchievementRepository` instance (passing `db`)
2. Create `CosmeticRepository` instance (passing `db`)
3. Create `AchievementEngine` instance (passing `achievementRepo`, `progressionEngine`)

Add IPC handlers after existing quest handlers (~line 119):

- `achievements:get-all` → `achievementEngine.getAchievements('player-1')`
- `cosmetics:get-all` → merge definitions with player state from repo
- `cosmetics:equip` → `cosmeticRepo.equip()`, send `cosmetics:updated`
- `cosmetics:unequip` → `cosmeticRepo.unequip()`, send `cosmetics:updated`
- `cosmetics:place` → `cosmeticRepo.placeDecoration()`
- `cosmetics:remove` → `cosmeticRepo.removeDecoration()`
- `cosmetics:get-placements` → `cosmeticRepo.getPlacements()`
- `zone:record-visit` → record visit + check exploration achievements + unlock cosmetics if any
- `player:save-position` → UPDATE players SET last_scene, last_x, last_y
- `player:get-position` → SELECT last_scene, last_x, last_y FROM players

- [ ] **Step 2: Add preload API surface**

In `src/preload/index.ts`, add after existing quest API section (~line 153):

- `getAchievements()`, `onAchievementsUnlocked()` — achievements
- `getCosmetics()`, `equipCosmetic()`, `unequipCosmetic()`, `onCosmeticsUpdated()`, `onCosmeticUnlocked()` — cosmetics
- `getHomePlacements()`, `placeDecoration()`, `removeDecoration()` — home decorations
- `recordZoneVisit()` — zone tracking
- `savePosition()`, `getPosition()` — position persistence

Update the `contextBridge.exposeInMainWorld('api', { ... })` call to include all new methods.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(3c): add IPC handlers and preload API for achievements, cosmetics, position"
```

---

## Task 6: Achievement Integration in chat.ts

**Files:**

- Modify: `src/main/chat.ts`

- [ ] **Step 1: Add achievementEngine and cosmeticRepo to chat dependencies**

Follow the existing pattern for `progressionEngine` and `questEngine` at ~line 77-91. Add `achievementEngine` and `cosmeticRepo` to the constructor/factory parameters.

- [ ] **Step 2: Add achievement check after quest check**

In the post-conversation flow (~lines 555-634), after the quest checking block, add:

- Call `achievementEngine.checkProgression('player-1')`
- For each unlocked achievement: unlock cosmetic reward if any (via cosmeticRepo), award bonus XP (via progressionEngine.awardBonusXP), send IPC events
- Wrap in try/catch for isolated error handling (same pattern as quest checking)

- [ ] **Step 3: Add tool-use tracking after tool execution**

Find the tool execution section in `chat.ts`. After each successful tool execution:

- Call `achievementRepo.recordToolUse('player-1', toolName)`
- Call `achievementEngine.checkToolUse('player-1')`
- If unlocked, handle cosmetic rewards and send IPC events
- Wrap in try/catch

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/chat.ts
git commit -m "feat(3c): integrate achievement checks in post-conversation and tool-use flows"
```

---

## Task 7: EventBus Events & i18n

**Files:**

- Modify: `src/renderer/src/game/types.ts`
- Modify: `src/renderer/src/i18n/locales/zh-TW.json`
- Modify: `src/renderer/src/i18n/locales/en.json`

- [ ] **Step 1: Add new GameEvents**

In `src/renderer/src/game/types.ts`, add 7 new events to the `GameEvents` interface after existing quest events (~line 28). See spec Section 7 for the exact event shapes: `achievement:unlocked`, `cosmetic:unlocked`, `cosmetic:equipped`, `cosmetic:unequipped`, `scene:changed`, `zone:visited`, `home:decorate-mode`.

- [ ] **Step 2: Add zh-TW i18n keys**

Add to `src/renderer/src/i18n/locales/zh-TW.json`: `achievements.*`, `cosmetics.*`, `home.*`, `scene.*` sections. See spec Section 10 for all keys and zh-TW values.

- [ ] **Step 3: Add en i18n keys**

Add equivalent English keys to `src/renderer/src/i18n/locales/en.json`. See spec Section 10.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/game/types.ts src/renderer/src/i18n/locales/zh-TW.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(3c): add GameEvents, i18n keys for achievements, cosmetics, home"
```

---

## Task 8: React Hooks

**Files:**

- Create: `src/renderer/src/hooks/useAchievements.ts`
- Create: `src/renderer/src/hooks/useCosmetics.ts`
- Create: `src/renderer/src/hooks/useHomePlacements.ts`

- [ ] **Step 1: Create useAchievements hook**

Follow the pattern from `src/renderer/src/hooks/useQuests.ts`:

- State: `achievements[]`, `loading`, `error`
- `refresh()` fetches via `window.api.getAchievements()`
- Listen to `onAchievementsUnlocked` IPC event → refresh + emit `achievement:unlocked` EventBus events
- Computed: `unlockedCount`, `totalCount`
- Cleanup: remove listeners on unmount

- [ ] **Step 2: Create useCosmetics hook**

- State: `cosmetics[]`, `loading`, `error`
- `refresh()` fetches via `window.api.getCosmetics()`
- `equip(cosmeticDefId)` → `window.api.equipCosmetic()` + refresh
- `unequip(cosmeticDefId)` → `window.api.unequipCosmetic()` + refresh
- Listen to `onCosmeticsUpdated` IPC event → refresh
- Computed: `equipped` (filtered list)

- [ ] **Step 3: Create useHomePlacements hook**

- State: `placements[]`, `loading`
- `refresh()` fetches via `window.api.getHomePlacements()`
- `place(cosmeticDefId, tileX, tileY)` → `window.api.placeDecoration()` + refresh
- `remove(cosmeticDefId)` → `window.api.removeDecoration()` + refresh

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useAchievements.ts src/renderer/src/hooks/useCosmetics.ts src/renderer/src/hooks/useHomePlacements.ts
git commit -m "feat(3c): add useAchievements, useCosmetics, useHomePlacements hooks"
```

---

## Task 9: AchievementsTab & AchievementCard Components

**Files:**

- Create: `src/renderer/src/components/ui/AchievementsTab.tsx`
- Create: `src/renderer/src/components/ui/AchievementCard.tsx`

- [ ] **Step 1: Create AchievementCard**

Compact badge-style card. Two states:

- **Unlocked:** Full color bg `rgba(200,180,140,0.12)`, border `rgba(200,180,140,0.3)`, gold checkmark, cosmetic reward indicator if present
- **Locked:** bg `rgba(200,180,140,0.05)`, greyed (`opacity: 0.5`, `filter: grayscale(1)` on icon), lock icon, description still visible

Shows: emoji icon (16px), bilingual title (via LocalizedString + locale), description (9px muted), cosmetic reward tag if present.

Props: `{ achievement: PlayerAchievement; locale: string }`

- [ ] **Step 2: Create AchievementsTab**

Category-grouped layout. Structure:

1. Header: `t('achievements.count', { unlocked, total })`
2. Three sections with category headers: "⚔️ {t('achievements.categories.progression')}", "🗺️ ...", "🔧 ..."
3. Each section: category divider line + flex-wrap row of AchievementCards
4. Unlocked achievements first within each section, then locked

Props: `{ achievements: PlayerAchievement[]; unlockedCount: number; totalCount: number }`

Follow styling from `QuestsTab.tsx` and project palette (spec Section: UI Color Palette in CLAUDE.md).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/AchievementsTab.tsx src/renderer/src/components/ui/AchievementCard.tsx
git commit -m "feat(3c): add AchievementsTab and AchievementCard components"
```

---

## Task 10: CosmeticsTab & CosmeticItem Components

**Files:**

- Create: `src/renderer/src/components/ui/CosmeticsTab.tsx`
- Create: `src/renderer/src/components/ui/CosmeticItem.tsx`

- [ ] **Step 1: Create CosmeticItem**

Row component for a single cosmetic. Shows:

- Emoji icon (20px)
- Title + layer/type tag (e.g., "帽子" for hat overlays, "家居" for decorations)
- Source achievement name
- Action button: "裝備中" (gold, active) / "裝備" (muted) / "卸下" / "放置"
- Locked state: greyed, shows which achievement unlocks it

Props: `{ cosmetic: PlayerCosmetic; onEquip; onUnequip; locale: string }`

- [ ] **Step 2: Create CosmeticsTab**

Split panel layout:

- **Left panel** (120px): Player preview area (emoji placeholder `🧙` initially, real sprite in Task 16). Below: 3 equip slot boxes (28x28 each) for hat/cape/aura — filled if equipped, dashed border if empty.
- **Right panel**: Sub-tab buttons ("穿戴" / "家居"), list of CosmeticItem rows filtered by sub-tab.

Props: `{ cosmetics: PlayerCosmetic[]; equipped: PlayerCosmetic[]; onEquip; onUnequip; locale: string }`

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/CosmeticsTab.tsx src/renderer/src/components/ui/CosmeticItem.tsx
git commit -m "feat(3c): add CosmeticsTab (split panel) and CosmeticItem components"
```

---

## Task 11: AchievementNotification & BackpackPanel Integration

**Files:**

- Create: `src/renderer/src/components/ui/AchievementNotification.tsx`
- Modify: `src/renderer/src/components/ui/BackpackPanel.tsx`
- Modify: `src/renderer/src/App.tsx` (or wherever overlays are rendered)

- [ ] **Step 1: Create AchievementNotification**

Follow `QuestNotification.tsx` pattern exactly:

- Listen to `achievement:unlocked` EventBus event
- Toast at top center, auto-dismiss 4 seconds (slightly longer than quest toasts)
- Achievement-only: "🏆 {title} — {t('achievements.unlocked')}！"
- If cosmeticReward: "🏆 {title} — {cosmeticTitle} {t('achievements.unlocked')}！" (gold highlight)
- Gold color `#ffd700`, same glow/shadow as quest completion toast

- [ ] **Step 2: Enable achievements and cosmetics tabs in BackpackPanel**

In `src/renderer/src/components/ui/BackpackPanel.tsx`:

1. In `TABS` array (~line 12-13): set `available: true` for achievements and cosmetics entries
2. Import `useAchievements` and `useCosmetics` hooks
3. Add hook calls inside the component
4. In tab content area, add conditional renders:
   - `activeTab === 'achievements'` → `<AchievementsTab achievements={...} ... />`
   - `activeTab === 'cosmetics'` → `<CosmeticsTab cosmetics={...} ... />`

- [ ] **Step 3: Add AchievementNotification to App overlay**

In `src/renderer/src/App.tsx` (or the component that renders overlays like `QuestNotification`), add `<AchievementNotification />` alongside existing notifications.

- [ ] **Step 4: Run dev and manually verify**

Run: `npm run dev`

1. Open backpack (B key) — achievements and cosmetics tabs should be clickable
2. Achievements tab shows 12 achievements grouped by category (all locked initially)
3. Cosmetics tab shows split panel with empty equip slots

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/AchievementNotification.tsx src/renderer/src/components/ui/BackpackPanel.tsx src/renderer/src/App.tsx
git commit -m "feat(3c): integrate achievement/cosmetics tabs in backpack, add notifications"
```

---

## Task 12: Zone Visit Tracking Integration

**Files:**

- Modify: `src/renderer/src/game/scenes/Town.ts`

- [ ] **Step 1: Add zone visit recording**

In `Town.ts`, zone detection happens in the update loop (~lines 272-364) where `zone:entered` EventBus events are emitted. After emitting `zone:entered`, also call IPC to record the visit:

```typescript
// After EventBus.emit('zone:entered', { zoneId, zoneName })
window.api?.recordZoneVisit(zoneId)
```

This calls the `zone:record-visit` IPC handler (from Task 5) which records the visit AND checks exploration achievements.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/game/scenes/Town.ts
git commit -m "feat(3c): record zone visits for exploration achievement tracking"
```

---

## Task 13: BaseScene Extraction & Scene Transition System

**Files:**

- Create: `src/renderer/src/game/scenes/BaseScene.ts`
- Modify: `src/renderer/src/game/scenes/Town.ts`

- [ ] **Step 1: Create BaseScene**

Extract shared logic from `Town.ts` into `BaseScene.ts`. BaseScene extends `Phaser.Scene` and provides:

- `protected player: Player` — player instance
- `protected createPlayer(x, y)` — creates player sprite at position
- `protected setupCamera(mapWidth, mapHeight)` — camera follow + bounds
- `setKeyboardEnabled(enabled)` — toggle keyboard capture for dialogue mode
- `protected setupPortals(map)` — reads `portals` object layer from tilemap, creates overlap zones that trigger `transitionToScene()`
- `protected transitionToScene(targetScene, spawnX?, spawnY?)` — fade out, save position via IPC, start target scene, emit `scene:changed` EventBus event. Guard against double-transition with `_transitioning` flag.
- `protected fadeIn()` — camera fade in on scene create
- `protected depthSort()` — sort children by y for top-down depth
- `shutdown()` — save position via IPC

- [ ] **Step 2: Refactor Town to extend BaseScene**

Modify `src/renderer/src/game/scenes/Town.ts`:

- Change `extends Scene` to `extends BaseScene`
- Remove code now in BaseScene (player creation, camera, keyboard toggle, depth sorting)
- In `create()`: call `this.createPlayer()`, `this.setupCamera()`, `this.setupPortals(map)`, `this.fadeIn()`
- Keep Town-specific logic: NPC spawning, notice board, zone detection, proximity checks, EventBus listeners for XP/level display

- [ ] **Step 3: Run dev and verify Town still works**

Run: `npm run dev`

1. Player moves normally
2. NPCs are interactive
3. Zone detection works
4. All existing functionality preserved

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/game/scenes/BaseScene.ts src/renderer/src/game/scenes/Town.ts
git commit -m "refactor(3c): extract BaseScene from Town, add portal transition system"
```

---

## Task 14: Position Persistence

**Files:**

- Modify: `src/renderer/src/game/scenes/BaseScene.ts`
- Modify: Phaser game init (in App.tsx or wherever scenes are registered)

- [ ] **Step 1: Save position on scene transition and shutdown**

BaseScene already saves in `transitionToScene()` and `shutdown()` (from Task 13). Also add a `beforeunload` listener in the renderer entry as safety net.

- [ ] **Step 2: Restore position on game start**

In `Town.create()` (or the initial scene), fetch saved position:

- Call `window.api.getPosition()`
- If saved scene is `'Town'`, use saved x/y as spawn point instead of default
- If saved scene is `'Home'`, use default Town spawn but immediately transition to Home (or start Home directly if the Phaser config supports dynamic initial scene)

Simplest approach: Town always loads first, then checks saved position and either uses saved coords or transitions to the saved scene.

- [ ] **Step 3: Run dev and verify**

Run: `npm run dev`

1. Walk to a new position
2. Close and reopen — player at saved position

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/game/scenes/BaseScene.ts src/renderer/src/game/scenes/Town.ts
git commit -m "feat(3c): persist and restore player position across sessions"
```

---

## Task 15: HomeScene & Decoration Mode

**Files:**

- Create: `src/renderer/src/game/scenes/Home.ts`
- Create: `src/renderer/src/game/DecorationManager.ts`
- Create: `src/renderer/src/components/ui/HomeHUD.tsx`
- Modify: `src/renderer/src/App.tsx`

**Prerequisites:** A Tiled tilemap JSON for the home interior must be created. 12x12 tiles with layers: `ground` (floor), `walls` (walls + furniture), `collision`, and `portals` object layer (door back to Town). Also needs a way to mark placeable tiles (either an object layer `placeable` or tile properties). Place the tilemap at the appropriate path matching the project's asset structure (check where `town.json` lives).

- [ ] **Step 1: Create Home scene**

Create `src/renderer/src/game/scenes/Home.ts` extending BaseScene:

- Constructor: `super('Home')`
- `create(data)`: Load tilemap, create layers, create player at spawn, setup camera, setup portals (door back to Town), init DecorationManager, load saved placements, fade in, D key listener toggles decoration mode
- `update()`: player.update(), depthSort(), decorationManager.update() if active

- [ ] **Step 2: Create DecorationManager**

Create `src/renderer/src/game/DecorationManager.ts`:

- `isActive` boolean
- `enter()`: Show grid overlay on placeable tiles, emit `home:decorate-mode` event
- `exit()`: Hide grid, emit event
- `loadPlacements()`: Fetch from IPC, spawn decoration sprites
- `handleClick(worldX, worldY)`: Convert to tile coords, validate placeable, place/move selected decoration
- `isTilePlaceable(tileX, tileY)`: Check against tilemap placeable markers
- `drawGrid()`: Phaser Graphics lines on placeable tiles
- `spawnDecorationSprite(cosmeticDefId, tileX, tileY)`: Create static sprite at tile position

- [ ] **Step 3: Create HomeHUD overlay**

Create `src/renderer/src/components/ui/HomeHUD.tsx`:

- Only visible when `scene:changed` indicates Home scene
- Shows "Decorate" button with D key shortcut hint
- When `home:decorate-mode` is active: bottom toolbar with unlocked decoration item icons
- Clicking a decoration icon selects it for placement
- Listen to EventBus `scene:changed` and `home:decorate-mode`

- [ ] **Step 4: Register Home scene and render HomeHUD**

In `src/renderer/src/App.tsx` (or Phaser game config):

- Import and add `Home` to the scene array
- Render `<HomeHUD />` in the overlay area

- [ ] **Step 5: Add home entrance portal to Town tilemap**

Edit the town tilemap (Tiled) to add:

- A door tile at a suitable location (near Town Square)
- A portal object in `portals` layer: `targetScene: 'Home'`, `spawnX`, `spawnY`

- [ ] **Step 6: Run dev and verify**

Run: `npm run dev`

1. Walk to home door in Town → transitions to Home
2. Home shows room interior
3. D key → decoration grid appears
4. Place decoration (if any unlocked) → persists
5. Walk to door → back to Town
6. Re-enter Home → decoration still there

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/game/scenes/Home.ts src/renderer/src/game/DecorationManager.ts src/renderer/src/components/ui/HomeHUD.tsx src/renderer/src/App.tsx
git commit -m "feat(3c): add Home scene with decoration placement mode"
```

---

## Task 16: Sprite Overlay Rendering

**Files:**

- Modify: `src/renderer/src/game/entities/Player.ts`
- Modify: `src/renderer/src/game/scenes/BaseScene.ts`

**Prerequisites:** Placeholder overlay sprite sheets (32x32, 4 frames for up/down/left/right). Simple colored rectangles are fine for initial development — real AI-generated art replaces these later.

- [ ] **Step 1: Add overlay management to Player**

In `src/renderer/src/game/entities/Player.ts`:

- New property: `overlays: Map<OverlayLayer, Phaser.GameObjects.Sprite>`
- `equipOverlay(layer, spriteSheet)`: Remove existing overlay in this layer, create new sprite, set depth (cape behind player, hat/aura above)
- `unequipOverlay(layer)`: Destroy sprite, remove from map
- `syncOverlays()` (private): Match each overlay's position and frame to player sprite. Call at end of `update()`.

- [ ] **Step 2: Load equipped cosmetics on scene create**

In `BaseScene.createPlayer()`, after creating the player:

- Fetch equipped cosmetics via IPC
- For each equipped overlay, call `this.player.equipOverlay()`
- Listen to `cosmetic:equipped` and `cosmetic:unequipped` EventBus events to update overlays in real-time

- [ ] **Step 3: Run dev and verify**

Run: `npm run dev`

1. If overlays equipped (via achievement unlock or debug), they render on player
2. Overlays follow player, match direction

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/game/entities/Player.ts src/renderer/src/game/scenes/BaseScene.ts
git commit -m "feat(3c): add sprite overlay rendering to Player entity"
```

---

## Task 17: End-to-End Verification & Cleanup

**Files:** Various (bug fixes as needed)

- [ ] **Step 1: Run full test suite**

Run: `npm run test:unit`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Fix any lint errors.

- [ ] **Step 4: Manual E2E verification**

Run: `npm run dev` and verify the complete flow:

1. Start game — player at Town (or saved position)
2. Walk around, enter zones — zone visits recorded
3. Talk to an NPC — after conversation, progression achievements checked
4. Open backpack (B) → Achievements tab: 12 achievements, category-grouped, some may be unlocked
5. Open backpack → Cosmetics tab: split panel, equip slots, overlay/decoration sub-tabs
6. Use a tool in NPC conversation — tool-use achievement notification if triggered
7. Walk to home door — scene transition with fade
8. Press D in home — decoration mode with grid
9. Place decoration → persists after leaving and re-entering
10. Walk back to Town — transition back
11. Close and reopen app — position restored
12. Equip an overlay cosmetic (if unlocked) — visible on player sprite

- [ ] **Step 5: Run i18n check**

Verify both locale files have matching key structures. Use the i18n-check skill or manually diff.

- [ ] **Step 6: Final commit if cleanup was needed**

```bash
git add -A
git commit -m "fix(3c): cleanup and fixes from E2E verification"
```
