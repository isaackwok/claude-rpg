---
name: npc-builder
description: Create a new NPC with sprite config, AgentDef, interaction zone, i18n strings, and EventBus wiring. Use when adding an NPC to the game world.
disable-model-invocation: true
---

# NPC Builder

Create a new NPC entity following the patterns in `src/renderer/src/game/`.

## Arguments

- **npc-id**: camelCase identifier (e.g., `guildMaster`, `librarian`)
- **npc-name-zh**: Traditional Chinese display name
- **npc-name-en**: English display name

## Steps

1. **Add AgentDef** to `src/renderer/src/game/data/npcs.ts` in the `BUILT_IN_NPCS` array
2. **Add i18n strings** for NPC name, greeting, and description in both locale files
3. **Assign a sprite frame** — check existing NPCs in `npcs.ts` for the next available frame index
4. **Add spawn point** — if a tilemap Objects layer exists, add an NPC spawn point object; otherwise document the intended x,y placement

## AgentDef Structure

Follow the existing `AgentDef` type from `src/renderer/src/game/types.ts`:

```typescript
{
  id: '{npcId}',
  name: { 'zh-TW': '{npc-name-zh}', en: '{npc-name-en}' },
  sprite: 'npc-spritesheet',  // shared spritesheet
  spriteFrame: {next available frame},
  role: '{one-line role description}',
  personality: '{personality traits for AI prompt — future Phase 2}',
  location: '{scene name where NPC lives}',
}
```

## Checklist

- [ ] AgentDef added to `BUILT_IN_NPCS` with unique `id`
- [ ] `spriteFrame` doesn't conflict with existing NPCs
- [ ] LocalizedString used for `name` with both `zh-TW` and `en`
- [ ] i18n keys added: `npc.{npcId}.greeting` and `npc.{npcId}.description` in both locales
- [ ] NPC spawn point specified (tilemap object or hardcoded coordinates)
- [ ] If NPC is in a new scene, the scene exists (use `/new-scene` first)
