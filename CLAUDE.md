# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude RPG is an Electron desktop app presenting a pixel-art RPG world where NPCs are AI agents powered by Claude. Users navigate a 2D tile-based town, interact with agent NPCs through dialogue, and accomplish productivity tasks while progressing through an RPG leveling system. Primary audience: non-technical users (designers, PMs). Primary language: Traditional Chinese (zh-TW), with English as secondary.

## Tech Stack

- **Shell:** Electron (electron-vite scaffold)
- **Game Engine:** Phaser 3.90 (2D world, tilemaps, sprites, collision)
- **UI Framework:** React 19 (overlay panels — dialogue, menus, skill trees)
- **AI:** Anthropic SDK / Agent SDK (future phases)
- **Storage:** SQLite via better-sqlite3 (future phases)
- **Language:** TypeScript throughout
- **Build:** Vite via electron-vite (3-process config: main/preload/renderer)
- **Maps:** Tiled Map Editor → JSON → Phaser

## Commands

```bash
npm run dev          # Start Electron dev server with hot reload
npm run build        # Production build (output in out/)
npm run typecheck    # TypeScript type check (node + web)
npm run test:unit    # Run unit tests (vitest)
npm run test:e2e     # Run e2e tests (Playwright + Electron)
npm run lint         # ESLint
npm run format       # Prettier
```

## Architecture

### Process Model (Electron 3-process)

- **Main process** (`src/main/`) — Window management, API key storage (safeStorage), Anthropic SDK calls, NPC tool execution, folder approval management. The renderer never sees the raw API key.
- **Preload** (`src/preload/`) — contextBridge exposing safe IPC channels
- **Renderer** (`src/renderer/`) — Phaser game + React UI overlays
- **Shared** (`src/shared/`) — Type definitions shared across all processes (AgentId, ToolName, IPC payloads)

### Renderer Architecture

Phaser and React coexist in the renderer process, communicating through a **typed EventBus** (`src/renderer/src/game/EventBus.ts`):

- **Phaser → React:** Events like `npc:interact`, `npc:proximity`, `zone:entered`
- **React → Phaser:** Events like `dialogue:closed`, `npc:spawn`, `camera:focus`
- **Core Services → Both:** Events like `xp:gained`, `level:up`, `quest:completed`

The `PhaserGame.tsx` React component hosts the Phaser canvas (pattern from `phaserjs/template-react-ts`). React UI overlays are absolutely positioned over the game canvas with `pointerEvents: 'none'` by default; only interactive overlays (e.g. DialoguePanel, menus) toggle to `'auto'` when they need keyboard/mouse input. Display-only overlays (e.g. ProximityHint, HUD) must stay `'none'` to avoid blocking Phaser canvas input.

### Data Access

All persistence uses a **repository pattern** — game logic depends on interfaces (`IAgentRepository`, `IPlayerRepository`, etc.), never SQLite directly.

## Key Conventions

- **i18n-first:** All user-facing strings go through `t()` function. zh-TW is primary locale, en is secondary. Locale files at `src/renderer/src/i18n/locales/`.
- **LocalizedString type:** `Record<string, string>` — NPC names, quest titles, achievements all use this pattern (e.g., `{ "zh-TW": "書記官", "en": "The Scribe" }`).
- **Official scaffolding only:** Use `npm create electron-vite@latest` for project structure. Never generate Electron/Vite config files from scratch.
- **Phaser config:** Always set `pixelArt: true` (disables antialiasing). Physics: arcade with zero gravity (top-down RPG).
- **Phaser chunk splitting:** Phaser is in a separate rollup chunk via `manualChunks` in `electron.vite.config.ts`.

## Implementation Phases

The project is built in 6 phases, each producing a working deliverable:

1. **Shell & World** — Electron + Phaser tilemap + player movement + NPC sprites + React overlay scaffold (no AI)
2. **Agent Conversations** — Single-agent NPC dialogue via Anthropic SDK
   2.5. **NPC Tool Use** — File operations, web search, command execution with folder approval system
3. **Progression** — XP, leveling, titles, quest board. Introduces SQLite (better-sqlite3) persistence via repository pattern.
4. **Guild Hall** — Custom agent creation
5. **Party System** — Multi-agent orchestration via Agent SDK
6. **Onboarding & Polish** — Title screen, API key wizard, character creation, i18n pass

Completed: Phase 1 (Shell & World), Phase 2 (Agent Conversations), Phase 2.5 (NPC Tool Use)
Next up: Phase 3 (Progression)
Full spec: `docs/superpowers/specs/2026-03-16-claude-rpg-design.md`
Plans & specs: `docs/superpowers/plans/` and `docs/superpowers/specs/`
