# Phase 1: Shell & World — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a working Electron desktop app with a Phaser 3 tile-based RPG world, player character movement, NPC sprites with interaction zones, and React overlay scaffold — no AI integration yet.

**Architecture:** Electron (main process for window management) + Phaser 3 (renderer — game world, movement, NPCs) + React (renderer — UI overlays like dialogue panels). A typed EventBus bridges Phaser ↔ React. i18n is built in from the start with zh-TW as primary locale.

**Tech Stack:** Electron, electron-vite, Phaser 3.90, React 19, TypeScript, Vite, Tiled Map Editor

---

## Chunk 1: Project Bootstrap & Electron Shell

### Task 1: Scaffold with electron-vite

**Files:**

- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`

electron-vite provides an official `npm create` scaffolding command that sets up the 3-process Electron+Vite structure (main, preload, renderer). We use this as the foundation, then add React and Phaser.

- [ ] **Step 1: Scaffold electron-vite project**

```bash
cd ..
npm create electron-vite@latest claude-rpg-scaffold -- --template react-ts
```

This scaffolds an Electron + Vite + React + TypeScript project with the correct 3-process structure. We'll copy the scaffolded files into our existing `claude-rpg` repo (which already has the spec docs and git history).

- [ ] **Step 2: Merge scaffold into existing repo**

Copy the scaffold into the existing repo, preserving `docs/` and git history:

```bash
cp -r ../claude-rpg-scaffold/{src,electron.vite.config.ts,tsconfig*.json,package.json} ./
cp -r ../claude-rpg-scaffold/resources ./ 2>/dev/null || true
npm install
rm -rf ../claude-rpg-scaffold
```

The scaffold provides:

- `electron.vite.config.ts` — 3-process Vite config
- `src/main/index.ts` — Electron main process (BrowserWindow creation)
- `src/preload/index.ts` — contextBridge
- `src/renderer/` — React app with index.html, main.tsx, App.tsx
- `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- `package.json` with dev/build/preview scripts

- [ ] **Step 3: Install Phaser**

```bash
npm install phaser
```

- [ ] **Step 4: Configure Phaser chunk splitting**

Edit `electron.vite.config.ts` — add Phaser to the renderer's `rollupOptions.output.manualChunks` so Phaser is bundled separately (better caching, faster rebuilds):

```typescript
renderer: {
  // ... existing config
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser']
        }
      }
    }
  }
}
```

Also add `pixelArt: true` consideration — this is a Phaser GameConfig option, not a Vite option, so it goes in the game config later.

- [ ] **Step 5: Configure Electron window for RPG**

Edit `src/main/index.ts`:

- Set BrowserWindow size to `1024x768`
- Set `resizable: false` (fixed game resolution for Phase 1)
- Set window title to "Claude RPG"
- Ensure `webPreferences.contextIsolation: true` and `nodeIntegration: false`

- [ ] **Step 6: Update .gitignore**

Ensure `.gitignore` includes: `node_modules/`, `out/`, `dist/`, `.superpowers/`

- [ ] **Step 7: Verify Electron launches**

```bash
npm run dev
```

Expected: An Electron window opens showing the default React scaffold page. Hot reload works.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Electron + React + Vite + TypeScript via electron-vite"
```

---

### Task 2: i18n Foundation

**Files:**

- Create: `src/renderer/src/i18n/index.ts`
- Create: `src/renderer/src/i18n/types.ts`
- Create: `src/renderer/src/i18n/locales/zh-TW.json`
- Create: `src/renderer/src/i18n/locales/en.json`

i18n is set up early so all subsequent tasks use `t()` from the start. This is a minimal custom implementation (no react-i18next dependency) — a `t()` function that works in both React and Phaser contexts.

- [ ] **Step 1: Create i18n types**

`src/renderer/src/i18n/types.ts`:

```typescript
export type Locale = 'zh-TW' | 'en'
export type LocalizedString = Record<string, string>
```

- [ ] **Step 2: Create zh-TW locale file (primary)**

`src/renderer/src/i18n/locales/zh-TW.json` with keys for:

- Game title, interaction hints ("按 Space 對話")
- All 9 location names (城鎮廣場, 公會大廳, 圖書館, 書記工坊, 市場, 匠師工坊, 傳令站, 酒館, 高塔)
- All 10 NPC names (長老, 會長, 學者, 書記官, 商人, 指揮官, 匠師, 傳令使, 巫師, 酒保)
- Dialogue placeholder text

- [ ] **Step 3: Create en locale file**

`src/renderer/src/i18n/locales/en.json` — matching English translations.

- [ ] **Step 4: Create i18n service**

`src/renderer/src/i18n/index.ts`:

- `t(key: string): string` — looks up key in current locale, falls back to zh-TW, then returns key itself
- `setLocale(locale: Locale)` / `getLocale(): Locale`
- A React context + `useTranslation()` hook for components that need to re-render on locale change
- Default locale: detect from `navigator.language`, fall back to `'zh-TW'`

- [ ] **Step 5: Verify i18n**

Import `t` in `App.tsx`, render `t('game.title')`. Confirm it shows "Claude RPG".

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/i18n/
git commit -m "feat: add i18n foundation with zh-TW and en locales"
```

---

## Chunk 2: Phaser Game World

### Task 3: Phaser Game Bootstrap

**Files:**

- Create: `src/renderer/src/game/main.ts`
- Create: `src/renderer/src/game/EventBus.ts`
- Create: `src/renderer/src/game/types.ts`
- Create: `src/renderer/src/game/scenes/Boot.ts`
- Create: `src/renderer/src/game/scenes/Preloader.ts`
- Create: `src/renderer/src/game/scenes/Town.ts`
- Create: `src/renderer/src/game/scenes/index.ts`
- Create: `src/renderer/src/components/PhaserGame.tsx`
- Modify: `src/renderer/src/App.tsx`

Reference the official `phaserjs/template-react-ts` for the `PhaserGame.tsx` bridge pattern and adapt it to our typed EventBus.

- [ ] **Step 1: Create game types**

`src/renderer/src/game/types.ts` — define `GameEvents` interface matching the spec:

```typescript
export interface GameEvents {
  'npc:interact': { agentId: string; npcPosition: { x: number; y: number } }
  'npc:proximity': { agentId: string; inRange: boolean }
  'player:moved': { x: number; y: number; map: string }
  'zone:entered': { zoneId: string; zoneName: string }
  'dialogue:closed': { agentId: string }
  'npc:spawn': { agent: AgentDef }
  'npc:remove': { agentId: string }
  'camera:focus': { x: number; y: number }
  'xp:gained': { category: SkillCategory; amount: number; newTotal: number }
  'level:up': { category: SkillCategory; newLevel: number }
  'quest:completed': { questId: string; title: LocalizedString }
  'title:changed': { newTitle: LocalizedString }
}
```

Also define `AgentDef` (Phase 1 lightweight version), `SkillCategory` type, `LocalizedString`.

- [ ] **Step 2: Create typed EventBus**

`src/renderer/src/game/EventBus.ts` — wrap `Phaser.Events.EventEmitter` with typed `emit`, `on`, `off`, `once` methods constrained to `GameEvents` keys and payloads.

- [ ] **Step 3: Create Boot scene**

`src/renderer/src/game/scenes/Boot.ts` — minimal scene that transitions to Preloader.

- [ ] **Step 4: Create Preloader scene**

`src/renderer/src/game/scenes/Preloader.ts` — loads all assets (tilemap JSON, tileset image, player spritesheet, NPC spritesheet). Shows a simple loading bar. Transitions to Town scene when complete.

- [ ] **Step 5: Create Town scene (skeleton)**

`src/renderer/src/game/scenes/Town.ts` — empty `create()` and `update()` methods for now. Will be filled in Tasks 5-7.

- [ ] **Step 6: Create game config and StartGame function**

`src/renderer/src/game/main.ts`:

- `type: Phaser.AUTO`
- `width: 1024, height: 768`
- `pixelArt: true` (disables antialiasing — critical for pixel art)
- `physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } }` (top-down RPG, no gravity)
- `scene: [Boot, Preloader, Town]`
- Export `StartGame(parent: string)` function

- [ ] **Step 7: Create PhaserGame React component**

`src/renderer/src/components/PhaserGame.tsx` — adapted from the official `phaserjs/template-react-ts`:

- Uses `useLayoutEffect` to call `StartGame('game-container')`
- Stores game instance in ref
- Cleans up (destroys game) on unmount
- Exposes game/scene refs via forwardRef or callback prop

- [ ] **Step 8: Wire into App.tsx**

Update `src/renderer/src/App.tsx`:

- Render `<PhaserGame />` inside a 1024x768 container
- Add an absolutely positioned overlay `<div>` for React UI (with `pointerEvents: 'none'`)

- [ ] **Step 9: Verify Phaser renders**

```bash
npm run dev
```

Expected: Electron window shows Phaser canvas with a colored background (no tilemap yet, just the empty Town scene). No console errors.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/game/ src/renderer/src/components/PhaserGame.tsx src/renderer/src/App.tsx
git commit -m "feat: integrate Phaser 3 with typed EventBus and scene scaffold"
```

---

### Task 4: Placeholder Assets

**Files:**

- Create: `src/renderer/src/assets/tilemaps/town.json`
- Create: `src/renderer/src/assets/tilesets/town-tileset.png`
- Create: `src/renderer/src/assets/sprites/player.png`
- Create: `src/renderer/src/assets/sprites/npcs.png`

Note: Asset paths may be in `public/assets/` or `src/renderer/src/assets/` depending on electron-vite's static asset handling. Follow whatever pattern the scaffold uses for static files.

- [ ] **Step 1: Generate placeholder tileset PNG**

Write a Node.js script (`scripts/generate-assets.ts`) that uses the `canvas` npm package (or raw PNG buffer writing) to generate a minimal 64x16 tileset PNG with 4 colored 16x16 tiles:

- Tile 0: green (#4a8c3f) — grass
- Tile 1: beige (#c4a46c) — path
- Tile 2: gray (#6b6b6b) — wall
- Tile 3: blue (#4a7ab5) — water

Save to the static assets directory. This avoids requiring external downloads.

```bash
npm install -D canvas
npx tsx scripts/generate-assets.ts
```

- [ ] **Step 2: Generate town tilemap JSON programmatically**

In the same `scripts/generate-assets.ts` script (or a separate `scripts/generate-tilemap.ts`), write the Tiled-compatible JSON tilemap directly. The Tiled JSON format is straightforward:

Map spec: 40x30 tiles, 16x16 tile size, with 4 layers:

- `Ground` (tile layer) — fill with grass, paths between locations
- `Buildings` (tile layer) — wall tiles forming buildings for each location
- `Collision` (tile layer) — wall tiles matching building walls (invisible in-game)
- `Objects` (object layer) — JSON array of rectangles:
  - 10 NPC spawns: `{ type: "npc", properties: [{ name: "npcId", value: "elder" }], x, y, width: 16, height: 16 }`
  - 9 zone areas: `{ type: "zone", properties: [{ name: "zoneId", value: "townSquare" }, { name: "zoneName", value: "城鎮廣場" }], x, y, width, height }`

Layout the 9 locations from the spec as distinct rectangular areas on the map:

- Town Square: center (roughly 10x8 tiles)
- Guild Hall: north-west
- Library: north-east
- Scribe's Workshop: east
- Market: south-east
- Artisan's Studio: west
- Messenger's Post: south-west
- Tavern: south
- Tower: far north (small, behind a path)

Save to `town.json` in the static assets directory.

- [ ] **Step 3: Generate placeholder sprite PNGs**

In the same script, generate:

- `player.png`: 64x16 spritesheet (4 frames of 16x16) — a colored character shape (e.g., blue square with a dot for head) in 4 directions
- `npcs.png`: 160x16 spritesheet (10 frames of 16x16) — each NPC as a distinct colored square with a letter or symbol:
  - elder=#c4a46c, guildMaster=#8b6914, scholar=#2e5a88, scribe=#5a3a7e, merchant=#8b4513, commander=#8b0000, artisan=#d4a017, herald=#2e8b57, wizard=#4b0082, bartender=#8b7355

This avoids requiring external asset downloads or GUI tools.

- [ ] **Step 4: Verify assets load in Preloader**

Update `Preloader.ts` to load all assets. Run `npm run dev`. Check browser console for any 404 errors on asset URLs.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/assets/  # or public/assets/
git commit -m "feat: add placeholder tileset, tilemap, and sprite assets"
```

---

## Chunk 3: Player, NPCs & Interaction

### Task 5: Player Character

**Files:**

- Create: `src/renderer/src/game/entities/Player.ts`
- Modify: `src/renderer/src/game/scenes/Town.ts`

- [ ] **Step 1: Create Player class**

`src/renderer/src/game/entities/Player.ts`:

- Extends `Phaser.Physics.Arcade.Sprite`
- Constructor: add to scene, enable physics, set body size, set depth
- `update()`: read cursor keys + WASD, set velocity (e.g., 160px/sec), normalize diagonal, flip sprite for direction
- Movement speed: `160` pixels/sec
- Emits `player:moved` on EventBus when position changes

- [ ] **Step 2: Add player to Town scene**

Update `Town.ts` `create()`:

- Create tilemap from loaded JSON: `this.make.tilemap({ key: 'town-map' })`
- Add tileset image: `map.addTilesetImage(...)`
- Create layers: Ground, Buildings, Collision (setVisible false on Collision)
- Set collision on Collision layer: `collisionLayer.setCollisionByExclusion([-1])`
- Read player spawn point from Objects layer (or hardcode center for now)
- Instantiate `Player` at spawn point
- Add collider: `this.physics.add.collider(this.player, collisionLayer)`
- Camera follow: `this.cameras.main.startFollow(this.player, true, 0.1, 0.1)`
- Camera bounds: `this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)`

Update `Town.ts` `update()`:

- Call `this.player.update()`

- [ ] **Step 3: Verify movement**

```bash
npm run dev
```

Expected: Tilemap renders. Player sprite appears. WASD/arrows move the player. Camera follows. Player stops at collision tiles.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/game/entities/Player.ts src/renderer/src/game/scenes/Town.ts
git commit -m "feat: add player character with WASD movement and collision"
```

---

### Task 6: NPC Sprites & Interaction Zones

**Files:**

- Create: `src/renderer/src/game/entities/NPC.ts`
- Create: `src/renderer/src/game/data/npcs.ts`
- Modify: `src/renderer/src/game/scenes/Town.ts`

- [ ] **Step 1: Create NPC data definitions**

`src/renderer/src/game/data/npcs.ts`:

- Export `BUILT_IN_NPCS: AgentDef[]` — array of all 9 built-in NPCs (+ bartender = 10) with:
  - `id`, `name` (LocalizedString with zh-TW and en), `sprite` frame index, `location`
  - Locations should match the Tiled map Object layer NPC spawn points

- [ ] **Step 2: Create NPC class**

`src/renderer/src/game/entities/NPC.ts`:

- Extends `Phaser.Physics.Arcade.Sprite`
- Constructor: takes scene, x, y, `AgentDef`
- Physics body: `setImmovable(true)` — player can't push NPCs
- Interaction zone: create a `Phaser.GameObjects.Zone` (48x48) centered on NPC, added to physics
- Idle animation: `scene.tweens.add({ targets: this, y: y - 2, duration: 1000, yoyo: true, repeat: -1 })` (gentle bob)
- Store `agentDef` for event payloads
- Track `playerInRange: boolean` to avoid re-emitting proximity events every frame

- [ ] **Step 3: Spawn NPCs in Town scene**

Update `Town.ts` `create()`:

- Import `BUILT_IN_NPCS`
- For each NPC: instantiate `NPC` at their location
- Store NPCs in an array/group
- Add collider between player and each NPC: `this.physics.add.collider(this.player, npc)`
- Add overlap between player and each NPC's interaction zone
- On overlap: if `!npc.playerInRange`, set `true`, emit `EventBus.emit('npc:proximity', { agentId, inRange: true })`
- Track overlap exit: in `update()`, check if player is still overlapping. If not, emit `inRange: false` and reset flag.

- [ ] **Step 4: Add Space key interaction**

In `Town.ts`:

- Listen for Space key press
- On Space: find which NPC the player is in range of (if any)
- If found and dialogue is not already open: emit `EventBus.emit('npc:interact', { agentId, npcPosition })`
- Set `this.dialogueOpen = true` to disable player movement
- Listen for `EventBus.on('dialogue:closed', ...)` → set `this.dialogueOpen = false`
- In `update()`: skip `this.player.update()` if `this.dialogueOpen`

- [ ] **Step 5: Verify NPC interaction**

```bash
npm run dev
```

Expected: NPCs visible on map with idle bob animation. Walking near an NPC logs `npc:proximity` to console. Pressing Space near an NPC logs `npc:interact`. Player stops moving after interact event.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/game/entities/NPC.ts src/renderer/src/game/data/npcs.ts src/renderer/src/game/scenes/Town.ts
git commit -m "feat: add NPC sprites with interaction zones and proximity detection"
```

---

### Task 7: Zone Detection

**Files:**

- Modify: `src/renderer/src/game/scenes/Town.ts`

- [ ] **Step 1: Parse zone objects from tilemap**

In `Town.ts` `create()`:

- Get the Objects layer: `map.getObjectLayer('Objects')`
- Filter for objects with type `zone`
- For each zone object: create a `Phaser.GameObjects.Zone` with the object's position/size
- Add to physics as static body
- Add overlap between player and zone

- [ ] **Step 2: Emit zone events**

On overlap with a zone: emit `EventBus.emit('zone:entered', { zoneId, zoneName })`.
Use a `currentZone` tracker to avoid re-emitting every frame — only emit on zone change.

- [ ] **Step 3: Verify**

Walk between map areas, confirm `zone:entered` events fire with correct zone IDs in console.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/game/scenes/Town.ts
git commit -m "feat: add zone detection from tilemap object layer"
```

---

## Chunk 4: React UI Overlays

### Task 8: Proximity Hint

**Files:**

- Create: `src/renderer/src/components/ui/ProximityHint.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create ProximityHint component**

`src/renderer/src/components/ui/ProximityHint.tsx`:

- Subscribe to `EventBus.on('npc:proximity', ...)` in `useEffect`
- When `inRange: true`: show a styled hint at bottom-center of screen: `t('interaction.hint')` ("按 Space 對話")
- When `inRange: false`: hide the hint
- Style: pixel-art themed box with semi-transparent dark background, white text
- ~~Set `pointerEvents: 'auto'` only when visible~~ → Updated: use `pointerEvents: 'none'` always — ProximityHint is display-only and must not block Phaser canvas input

- [ ] **Step 2: Add to App.tsx overlay layer**

- [ ] **Step 3: Verify**

Walk near an NPC → hint appears. Walk away → hint disappears.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/ProximityHint.tsx src/renderer/src/App.tsx
git commit -m "feat: add proximity hint UI overlay"
```

---

### Task 9: Dialogue Panel

**Files:**

- Create: `src/renderer/src/components/ui/DialoguePanel.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create DialoguePanel component**

`src/renderer/src/components/ui/DialoguePanel.tsx`:

- Subscribe to `EventBus.on('npc:interact', ...)` → open panel with NPC info
- Display: NPC name (localized via `t()` or from `AgentDef.name`), placeholder dialogue text "......"
- Style: classic RPG dialogue box — bottom 1/4 of screen, dark semi-transparent background, bordered, NPC name in header
- Close on Escape key or close button → emit `EventBus.emit('dialogue:closed', { agentId })`
- Set `pointerEvents: 'auto'` when open to capture keyboard/mouse in the panel
- Clean up EventBus listeners on unmount

- [ ] **Step 2: Look up NPC data for display**

Import `BUILT_IN_NPCS` from `game/data/npcs.ts`. On `npc:interact`, look up the NPC by `agentId` to get localized name.

- [ ] **Step 3: Add to App.tsx overlay layer**

- [ ] **Step 4: Verify**

Walk to NPC, press Space → dialogue panel opens with NPC name in zh-TW. Press Escape → panel closes, player can move again.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/DialoguePanel.tsx src/renderer/src/App.tsx
git commit -m "feat: add RPG-style dialogue panel overlay"
```

---

### Task 10: HUD (Location Display)

**Files:**

- Create: `src/renderer/src/components/ui/HUD.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create HUD component**

`src/renderer/src/components/ui/HUD.tsx`:

- Subscribe to `EventBus.on('zone:entered', ...)`
- Display current location name in top-left corner
- Look up localized zone name via `t('locations.' + zoneId)` or use the `zoneName` from the event
- Style: semi-transparent dark badge with location name, pixel-art font

- [ ] **Step 2: Add to App.tsx overlay layer**

- [ ] **Step 3: Verify**

Walk between zones → location name updates in HUD.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/HUD.tsx src/renderer/src/App.tsx
git commit -m "feat: add HUD with location name display"
```

---

### Task 11: End-to-End Verification & Polish

**Files:**

- Possibly minor edits across multiple files

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Full walkthrough test**

Run `npm run dev` and verify:

1. Electron window opens at 1024x768 with "Claude RPG" title
2. Tilemap renders with distinct location areas
3. Player spawns in Town Square
4. WASD/arrow keys move the player smoothly
5. Camera follows player, bounded to map edges
6. Player collides with walls and buildings
7. NPCs are visible with idle animation
8. Walking near an NPC shows "按 Space 對話" hint
9. Pressing Space opens dialogue panel with NPC's Chinese name
10. Pressing Escape closes dialogue, player can move again
11. Walking between zones updates HUD location name
12. No console errors

- [ ] **Step 3: Production build test**

```bash
npm run build
```

Expected: Build completes without errors, output in `out/` directory.

- [ ] **Step 4: Commit any polish fixes**

```bash
git add -A
git commit -m "fix: phase 1 polish and cleanup"
```

---

## Verification

**How to test the complete Phase 1:**

```bash
npm run dev
```

1. Electron window opens → pixel-art town map visible
2. Walk around with WASD → smooth movement, camera follows, collision works
3. Approach any NPC → "按 Space 對話" appears
4. Press Space → dialogue panel opens with NPC name (e.g., "學者")
5. Press Escape → dialogue closes, movement resumes
6. Walk to different areas → HUD shows location name (e.g., "圖書館")
7. All text is in Traditional Chinese

**Build test:**

```bash
npm run build
```

Should complete without errors (produces distributable in `out/`).

---

## Key Files Reference

| File                                               | Responsibility                                                  |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `electron.vite.config.ts`                          | 3-process Vite config (main/preload/renderer)                   |
| `src/main/index.ts`                                | Electron BrowserWindow creation                                 |
| `src/renderer/src/game/EventBus.ts`                | Typed event bus (Phaser ↔ React bridge)                         |
| `src/renderer/src/game/types.ts`                   | GameEvents, AgentDef, SkillCategory types                       |
| `src/renderer/src/game/scenes/Town.ts`             | Main gameplay scene — tilemap, player, NPCs, zones              |
| `src/renderer/src/game/entities/Player.ts`         | Player sprite, movement, camera follow                          |
| `src/renderer/src/game/entities/NPC.ts`            | NPC sprite, idle animation, interaction zone                    |
| `src/renderer/src/game/data/npcs.ts`               | Built-in NPC definitions                                        |
| `src/renderer/src/components/PhaserGame.tsx`       | React component hosting Phaser (from official template pattern) |
| `src/renderer/src/components/ui/DialoguePanel.tsx` | RPG dialogue box overlay                                        |
| `src/renderer/src/i18n/index.ts`                   | t() function, locale management                                 |

## Notes

- **Official scaffolding**: electron-vite's `npm create electron-vite@latest` for project structure; reference `phaserjs/template-react-ts` for the PhaserGame.tsx bridge pattern
- **Placeholder art**: Use free CC0 tilesets (kenney.nl) or simple colored squares. Art can be swapped later without code changes.
- **No AI in Phase 1**: Anthropic SDK and better-sqlite3 are NOT installed yet. The dialogue panel shows placeholder text only.
- **Phaser 3.90**: Final v3 release. Stable and well-documented.
