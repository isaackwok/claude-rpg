---
name: gen-asset
description: Generate placeholder pixel-art assets (tilesets, spritesheets, tilemaps) for the RPG world using the canvas npm package. Use when new placeholder art is needed for development.
disable-model-invocation: true
---

# Generate Placeholder Assets

Generate programmatic placeholder assets for Claude RPG development. All assets are 16x16 tile-based pixel art.

## What This Skill Does

Creates placeholder PNG sprites and Tiled-compatible JSON tilemaps using Node.js scripts with the `canvas` npm package. These are colored-square placeholders meant to be swapped with real art later.

## Asset Types

### Tileset PNG
- 16x16 tiles in a horizontal strip
- Standard tiles: grass (#4a8c3f), path (#c4a46c), wall (#6b6b6b), water (#4a7ab5)
- Output: `src/renderer/src/assets/tilesets/` or equivalent static asset directory

### Spritesheet PNG
- 16x16 frames in a horizontal strip
- Player: 4 directional frames (colored shape with direction indicator)
- NPCs: 10 frames, each a distinct color matching the NPC's personality
  - elder=#c4a46c, guildMaster=#8b6914, scholar=#2e5a88, scribe=#5a3a7e
  - merchant=#8b4513, commander=#8b0000, artisan=#d4a017, herald=#2e8b57
  - wizard=#4b0082, bartender=#8b7355
- Output: `src/renderer/src/assets/sprites/` or equivalent static asset directory

### Tilemap JSON (Tiled format)
- 40x30 tiles, 16x16 tile size
- Layers: Ground, Buildings, Collision, Objects
- Objects layer contains NPC spawn points (type: "npc") and zone areas (type: "zone")
- 9 locations laid out per the spec: Town Square (center), Guild Hall (NW), Library (NE), Scribe's Workshop (E), Market (SE), Artisan's Studio (W), Messenger's Post (SW), Tavern (S), Tower (far N)
- Output: `src/renderer/src/assets/tilemaps/town.json` or equivalent

## How To Use

1. Ensure `canvas` is installed as a dev dependency: `npm install -D canvas`
2. Create or update the generation script at `scripts/generate-assets.ts`
3. Run with: `npx tsx scripts/generate-assets.ts`
4. Verify assets load in the Phaser Preloader scene

## Important Notes

- Always use the `canvas` npm package — never require external downloads or GUI tools
- Follow the asset directory pattern established by electron-vite scaffold
- Tilemap JSON must be Tiled-compatible (Phaser's `this.make.tilemap()` expects this format)
- `pixelArt: true` is set in Phaser config, so no antialiasing — simple colored shapes look fine
