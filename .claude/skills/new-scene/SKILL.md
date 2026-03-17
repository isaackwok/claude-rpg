---
name: new-scene
description: Scaffold a new Phaser scene with tilemap loading, EventBus integration, and proper lifecycle hooks. Use when adding a new area or screen to the game.
disable-model-invocation: true
---

# New Phaser Scene

Scaffold a new Phaser scene following the existing patterns in `src/renderer/src/game/scenes/`.

## Arguments

- **scene-name**: PascalCase scene name (e.g., `GuildHall`, `Library`)

## Steps

1. **Create the scene file** at `src/renderer/src/game/scenes/{SceneName}.ts`
2. **Register it** in `src/renderer/src/game/scenes/index.ts`
3. **Add i18n keys** for the scene name in both locale files

## Scene Template

Follow the pattern established by `Town.ts`:

```typescript
import { Scene } from 'phaser'
import { Player } from '../entities/Player'
import { NPC } from '../entities/NPC'
import { EventBus } from '../EventBus'

export class {SceneName} extends Scene {
  private player!: Player
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer
  private npcs: NPC[] = []
  private dialogueOpen = false

  constructor() {
    super('{SceneName}')
  }

  create(): void {
    // Tilemap setup — load from preloader key '{scene-name}-map'
    // Create layers: Ground, Buildings, Collision, Objects
    // Spawn player and NPCs from Objects layer
    // Set up camera follow and world bounds
    // Register EventBus listeners
  }

  update(): void {
    // Player movement
    // NPC proximity checks
  }

  shutdown(): void {
    // CRITICAL: Remove all EventBus listeners to prevent memory leaks
    EventBus.off('dialogue:closed')
    // Remove any other listeners registered in create()
  }
}
```

## Checklist

- [ ] Scene extends `Phaser.Scene` with unique key
- [ ] `shutdown()` removes all `EventBus.on()` listeners registered in `create()`
- [ ] Scene is exported from `scenes/index.ts`
- [ ] If the scene has a tilemap, its key is loaded in `Preloader.ts`
- [ ] i18n keys added to both `zh-TW.json` and `en.json`
- [ ] `dialogueOpen` guard prevents double-opening dialogue
