# Claude RPG

A pixel-art RPG desktop app where every NPC is an AI agent powered by Claude. Navigate a 2D tile-based town, talk to agent NPCs through dialogue, and accomplish real productivity tasks — all wrapped in an RPG leveling system.

Built as a spatial interface for non-technical users (designers, PMs) to interact with AI naturally. Primary language: Traditional Chinese (zh-TW).

## Tech Stack

| Layer        | Technology                                       |
| ------------ | ------------------------------------------------ |
| Shell        | Electron 39 (electron-vite)                      |
| Game Engine  | Phaser 3.90 (tilemaps, sprites, arcade physics)  |
| UI Framework | React 19 (overlay panels — dialogue, menus, HUD) |
| AI           | Anthropic SDK (Claude conversations + tool use)  |
| Language     | TypeScript                                       |
| Build        | Vite via electron-vite (3-process config)        |
| Maps         | Tiled Map Editor → JSON → Phaser                 |
| Testing      | Vitest (unit) + Playwright (e2e)                 |

## Project Structure

```
src/
├── main/                  # Electron main process
│   ├── index.ts           # Window management, IPC handlers
│   ├── api-key.ts         # API key storage (safeStorage)
│   ├── chat.ts            # Anthropic SDK conversation logic
│   ├── folder-manager.ts  # Approved folder management
│   ├── agents/            # NPC system prompts
│   └── tools/             # NPC tool definitions & executor
├── preload/               # contextBridge (safe IPC channels)
├── renderer/src/
│   ├── game/
│   │   ├── scenes/        # Boot, Preloader, Town
│   │   ├── entities/      # Player, NPC
│   │   ├── data/          # NPC registry
│   │   └── EventBus.ts    # Typed Phaser ↔ React event bus
│   ├── components/ui/     # DialoguePanel, HUD, ProximityHint, etc.
│   ├── services/          # ConversationManager
│   ├── i18n/              # zh-TW + en locale files
│   └── App.tsx            # Root component
├── shared/                # Cross-process types (AgentId, ToolName, IPC payloads)
docs/superpowers/
├── specs/                 # Design specifications
└── plans/                 # Implementation plans
```

## Getting Started

### Prerequisites

- **Node.js** 24+ (see `.nvmrc`)
- **npm**

### Setup

```bash
git clone <repo-url>
cd claude-rpg
npm install
```

### Development

```bash
npm run dev       # Start Electron dev server with hot reload
```

On first launch, the app will prompt for your Anthropic API key (stored securely via Electron safeStorage).

### Other Commands

```bash
npm run build         # Production build (output in out/)
npm run typecheck     # TypeScript type check
npm run test:unit     # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright + Electron)
npm run lint          # ESLint
npm run format        # Prettier
```

### Platform Builds

```bash
npm run build:mac     # macOS
npm run build:win     # Windows
npm run build:linux   # Linux
```

## Architecture

Electron's 3-process model keeps the AI layer secure:

- **Main process** — Holds the API key (never exposed to renderer), runs Anthropic SDK calls, executes NPC tools with user approval.
- **Preload** — Bridges main ↔ renderer via typed IPC channels.
- **Renderer** — Phaser game canvas + React UI overlays, communicating through a typed EventBus.

NPCs can use tools (read/write files, search the web, run commands) with an approval system: users grant folder access via a "Notice Board" UI, and each tool invocation shows a confirmation dialog.

## Implementation Phases

1. **Shell & World** — Electron + Phaser tilemap + player movement + NPC sprites + React overlay scaffold
2. **Agent Conversations** — Single-agent NPC dialogue via Anthropic SDK
3. **NPC Tool Use** (2.5) — File operations, web search, command execution with folder approval system
4. **Progression** — XP, leveling, titles, quest board
5. **Guild Hall** — Custom agent creation
6. **Party System** — Multi-agent orchestration via Agent SDK
7. **Onboarding & Polish** — Title screen, API key wizard, character creation, i18n pass

Phases 1–2.5 are complete. Next up: Phase 3 (Progression).

## License

Private — not yet licensed for distribution.
