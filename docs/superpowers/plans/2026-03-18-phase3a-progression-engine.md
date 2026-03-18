# Phase 3A — Progression Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SQLite persistence, XP/leveling engine, and HUD expansion to create a visible progression feedback loop.

**Architecture:** SQLite (better-sqlite3) lives in the main process. Repositories + ProgressionEngine service handle all data. Renderer communicates via IPC. React hooks wrap IPC for UI components. Phaser handles floating XP text.

**Tech Stack:** better-sqlite3, Electron IPC, React hooks, Phaser bitmap text, vitest

**Spec:** `docs/superpowers/specs/2026-03-18-phase3a-progression-engine-design.md`

---

## Chunk 1: Foundation (Shared Types, SQLite Setup, Repositories)

### Task 1: Install better-sqlite3 and move shared types

**Files:**

- Modify: `package.json` (add better-sqlite3 dependency)
- Modify: `src/shared/types.ts` (add SkillCategory, progression types)
- Modify: `src/renderer/src/game/types.ts` (re-export from shared, update GameEvents)
- Modify: `src/preload/index.d.ts` (add progression + folders namespaces)

- [ ] **Step 1: Install better-sqlite3**

Run:

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

- [ ] **Step 2: Move SkillCategory and add progression types to shared**

In `src/shared/types.ts`, add after the existing types:

```typescript
/** Localized string — defined here (not imported from renderer) so main process can use it. */
export type LocalizedString = Record<string, string>

export type SkillCategory =
  | 'writing'
  | 'data'
  | 'visual'
  | 'code'
  | 'research'
  | 'organization'
  | 'communication'

export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  'writing',
  'data',
  'visual',
  'code',
  'research',
  'organization',
  'communication'
]

export interface Player {
  id: string
  name: string
  locale: string
  createdAt: number
}

export interface PlayerState {
  id: string
  name: string
  locale: string
  title: LocalizedString
  overallLevel: number
  totalXP: number
  skills: Record<SkillCategory, { xp: number; level: number }>
}

export type SkillMap = Record<SkillCategory, { xp: number; level: number }>

export interface XPAwardResult {
  awards: { category: SkillCategory; amount: number; newTotal: number }[]
  levelUps: { category: SkillCategory; newLevel: number }[]
  overallLevelUp?: { newLevel: number }
  titleChanged?: LocalizedString
}

export interface PersistedMessage {
  role: MessageRole
  content: string
  timestamp: number
}
```

`LocalizedString` is defined directly in shared types (not imported from renderer) so the main process can use it. Update `src/renderer/src/i18n/types.ts` to re-export from shared: `export type { LocalizedString } from '../../../shared/types'`. Keep `Locale` in the renderer i18n types.

- [ ] **Step 3: Update renderer game/types.ts to re-export from shared**

In `src/renderer/src/game/types.ts`, replace the `SkillCategory` definition with a re-export and update `GameEvents`:

```typescript
import type { LocalizedString } from '../i18n/types'
import type { AgentId, SkillCategory } from '../../../shared/types'

export type { AgentId, SkillCategory }

export interface AgentDef {
  readonly id: AgentId
  readonly name: LocalizedString
  readonly sprite: string
  readonly spriteFrame: number
  readonly location: { readonly map: string; readonly x: number; readonly y: number }
  readonly skills?: readonly SkillCategory[]
}

export interface GameEvents {
  'npc:interact': { agentId: AgentId; npcPosition: { x: number; y: number } }
  'npc:proximity': { agentId: AgentId; inRange: boolean }
  'player:moved': { x: number; y: number; map: string }
  'zone:entered': { zoneId: string; zoneName: string }
  'dialogue:closed': { agentId: AgentId }
  'npc:speech-bubble': { agentId: AgentId; style: 'streaming' | 'ready' | 'permission' | false }
  'npc:spawn': { agent: AgentDef }
  'npc:remove': { agentId: AgentId }
  'camera:focus': { x: number; y: number }
  'xp:gained': { category: SkillCategory; amount: number; newTotal: number; agentId: AgentId }
  'level:up': { category: SkillCategory; newLevel: number; overallLevel: number }
  'quest:completed': { questId: string; title: LocalizedString }
  'title:changed': { newTitle: LocalizedString }
  'noticeboard:interact': Record<string, never>
  'skills-panel:toggle': Record<string, never>
}
```

- [ ] **Step 4: Update preload type declarations**

In `src/preload/index.d.ts`, add imports and extend `ChatAPI`:

```typescript
import type {
  ApprovedFolder,
  ToolConfirmPayload,
  ToolExecutingPayload,
  PathApprovalPayload,
  PlayerState,
  SkillMap,
  XPAwardResult
} from '../shared/types'
import type { LocalizedString } from '../renderer/src/i18n/types'

// Add to ChatAPI interface:
  // Progression
  getPlayerState(): Promise<PlayerState>
  getSkills(): Promise<SkillMap>
  onXPAwarded(callback: (result: XPAwardResult) => void): () => void
  onTitleChanged(callback: (data: { newTitle: LocalizedString }) => void): () => void
  // Conversation history
  getConversationHistory(agentId: string): Promise<Array<{ role: string; content: string; timestamp: number }>>
```

- [ ] **Step 5: Run typecheck to verify no breakage**

Run: `npm run typecheck`

Expected: PASS (or only errors in files we haven't updated yet — note which ones to fix later).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/renderer/src/game/types.ts src/preload/index.d.ts package.json package-lock.json
git commit -m "feat(phase-3a): install better-sqlite3, move SkillCategory to shared types, update GameEvents"
```

---

### Task 2: SQLite database setup and migrations

**Files:**

- Create: `src/main/db/database.ts` (database initialization + connection)
- Create: `src/main/db/migrations.ts` (schema version management)
- Test: `src/main/db/database.test.ts`

- [ ] **Step 1: Write failing test for database initialization**

```typescript
// src/main/db/database.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

describe('database migrations', () => {
  let db: Database.Database

  afterEach(() => {
    db?.close()
  })

  it('creates all tables on fresh database', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)

    expect(tables).toContain('players')
    expect(tables).toContain('xp_ledger')
    expect(tables).toContain('conversations')
    expect(tables).toContain('messages')
    expect(tables).toContain('approved_folders')
  })

  it('sets user_version to 1 after migration', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const version = db.pragma('user_version', { simple: true })
    expect(version).toBe(1)
  })

  it('is idempotent — running twice does not error', () => {
    db = new Database(':memory:')
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/main/db/database.test.ts`

Expected: FAIL — module `./migrations` not found.

- [ ] **Step 3: Implement migrations**

```typescript
// src/main/db/migrations.ts
import type Database from 'better-sqlite3'

const migrations: Record<number, (db: Database.Database) => void> = {
  1: (db) => {
    db.exec(`
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        locale TEXT NOT NULL DEFAULT 'zh-TW',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE xp_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id TEXT NOT NULL REFERENCES players(id),
        skill_category TEXT NOT NULL,
        amount INTEGER NOT NULL,
        agent_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        player_id TEXT NOT NULL REFERENCES players(id),
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE approved_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        added_at INTEGER NOT NULL
      );

      CREATE INDEX idx_xp_ledger_player_category ON xp_ledger(player_id, skill_category);
      CREATE INDEX idx_messages_conversation ON messages(conversation_id);
    `)
  }
}

export function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number

  const versions = Object.keys(migrations)
    .map(Number)
    .filter((v) => v > currentVersion)
    .sort((a, b) => a - b)

  for (const version of versions) {
    db.transaction(() => {
      migrations[version](db)
      db.pragma(`user_version = ${version}`)
    })()
  }
}
```

```typescript
// src/main/db/database.ts
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'game.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  }
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}

/** For testing — create an in-memory database with migrations applied. */
export function createTestDatabase(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('foreign_keys = ON')
  runMigrations(testDb)
  return testDb
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/main/db/database.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/database.ts src/main/db/migrations.ts src/main/db/database.test.ts
git commit -m "feat(phase-3a): add SQLite database setup with migration system"
```

---

### Task 3: Player repository

**Files:**

- Create: `src/main/db/player-repository.ts`
- Test: `src/main/db/player-repository.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/db/player-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'
import { SqlitePlayerRepository } from './player-repository'

describe('SqlitePlayerRepository', () => {
  let db: Database.Database
  let repo: SqlitePlayerRepository

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    repo = new SqlitePlayerRepository(db)
  })

  afterEach(() => db.close())

  it('creates a new player on first getOrCreate', () => {
    const player = repo.getOrCreate('player-1')
    expect(player.id).toBe('player-1')
    expect(player.name).toBe('Isaac')
    expect(player.locale).toBe('zh-TW')
    expect(player.createdAt).toBeGreaterThan(0)
  })

  it('returns existing player on subsequent getOrCreate', () => {
    const first = repo.getOrCreate('player-1')
    const second = repo.getOrCreate('player-1')
    expect(second.createdAt).toBe(first.createdAt)
  })

  it('updates locale', () => {
    repo.getOrCreate('player-1')
    repo.updateLocale('player-1', 'en')
    const player = repo.getOrCreate('player-1')
    expect(player.locale).toBe('en')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/main/db/player-repository.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/main/db/player-repository.ts
import type Database from 'better-sqlite3'
import type { Player } from '../../shared/types'

export class SqlitePlayerRepository {
  constructor(private db: Database.Database) {}

  getOrCreate(id: string): Player {
    const existing = this.db
      .prepare('SELECT id, name, locale, created_at as createdAt FROM players WHERE id = ?')
      .get(id) as Player | undefined

    if (existing) return existing

    const now = Date.now()
    this.db
      .prepare('INSERT INTO players (id, name, locale, created_at) VALUES (?, ?, ?, ?)')
      .run(id, 'Isaac', 'zh-TW', now)

    return { id, name: 'Isaac', locale: 'zh-TW', createdAt: now }
  }

  updateLocale(id: string, locale: string): void {
    this.db.prepare('UPDATE players SET locale = ? WHERE id = ?').run(locale, id)
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/main/db/player-repository.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/player-repository.ts src/main/db/player-repository.test.ts
git commit -m "feat(phase-3a): add SqlitePlayerRepository"
```

---

### Task 4: XP repository

**Files:**

- Create: `src/main/db/xp-repository.ts`
- Test: `src/main/db/xp-repository.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/db/xp-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'
import { SqliteXPRepository } from './xp-repository'
import { SqlitePlayerRepository } from './player-repository'

describe('SqliteXPRepository', () => {
  let db: Database.Database
  let repo: SqliteXPRepository

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    new SqlitePlayerRepository(db).getOrCreate('player-1')
    repo = new SqliteXPRepository(db)
  })

  afterEach(() => db.close())

  it('awards XP and retrieves skill totals', () => {
    repo.award('player-1', 'writing', 10, 'scribe')
    repo.award('player-1', 'writing', 5, 'scribe')
    repo.award('player-1', 'research', 10, 'scholar')

    const totals = repo.getSkillTotals('player-1')
    expect(totals.writing).toBe(15)
    expect(totals.research).toBe(10)
    expect(totals.code).toBe(0)
  })

  it('returns zero for all categories when no XP awarded', () => {
    const totals = repo.getSkillTotals('player-1')
    expect(totals.writing).toBe(0)
    expect(totals.data).toBe(0)
    expect(totals.visual).toBe(0)
    expect(totals.code).toBe(0)
    expect(totals.research).toBe(0)
    expect(totals.organization).toBe(0)
    expect(totals.communication).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/main/db/xp-repository.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/main/db/xp-repository.ts
import type Database from 'better-sqlite3'
import { SKILL_CATEGORIES, type SkillCategory } from '../../shared/types'

export class SqliteXPRepository {
  constructor(private db: Database.Database) {}

  award(playerId: string, skillCategory: SkillCategory, amount: number, agentId: string): void {
    this.db
      .prepare(
        'INSERT INTO xp_ledger (player_id, skill_category, amount, agent_id, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(playerId, skillCategory, amount, agentId, Date.now())
  }

  getSkillTotals(playerId: string): Record<SkillCategory, number> {
    const rows = this.db
      .prepare(
        'SELECT skill_category, SUM(amount) as total FROM xp_ledger WHERE player_id = ? GROUP BY skill_category'
      )
      .all(playerId) as Array<{ skill_category: string; total: number }>

    const result = {} as Record<SkillCategory, number>
    for (const cat of SKILL_CATEGORIES) {
      result[cat] = 0
    }
    for (const row of rows) {
      result[row.skill_category as SkillCategory] = row.total
    }
    return result
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/main/db/xp-repository.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/xp-repository.ts src/main/db/xp-repository.test.ts
git commit -m "feat(phase-3a): add SqliteXPRepository with ledger-based XP tracking"
```

---

### Task 5: Conversation persistence

**Files:**

- Create: `src/main/db/conversation-persistence.ts`
- Test: `src/main/db/conversation-persistence.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/db/conversation-persistence.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'
import { SqliteConversationPersistence } from './conversation-persistence'
import { SqlitePlayerRepository } from './player-repository'

describe('SqliteConversationPersistence', () => {
  let db: Database.Database
  let persistence: SqliteConversationPersistence

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    new SqlitePlayerRepository(db).getOrCreate('player-1')
    persistence = new SqliteConversationPersistence(db)
  })

  afterEach(() => db.close())

  it('creates and retrieves a conversation', () => {
    persistence.getOrCreateByAgent('scribe', 'player-1')
    const convs = persistence.getConversationsByAgent('scribe', 'player-1')
    expect(convs).toHaveLength(1)
    expect(convs[0].agentId).toBe('scribe')
  })

  it('returns existing conversation on second getOrCreateByAgent', () => {
    const first = persistence.getOrCreateByAgent('scribe', 'player-1')
    const second = persistence.getOrCreateByAgent('scribe', 'player-1')
    expect(first.id).toBe(second.id)
  })

  it('stores and retrieves messages', () => {
    const conv = persistence.getOrCreateByAgent('scribe', 'player-1')
    persistence.addMessage(conv.id, 'user', 'Hello', 1000)
    persistence.addMessage(conv.id, 'assistant', 'Hi there', 1001)

    const messages = persistence.getMessages(conv.id)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('Hello')
    expect(messages[1].role).toBe('assistant')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/main/db/conversation-persistence.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/main/db/conversation-persistence.ts
import type Database from 'better-sqlite3'
import type { MessageRole } from '../../shared/types'

export interface PersistedConversation {
  id: string
  agentId: string
  playerId: string
  status: string
  createdAt: number
  updatedAt: number
}

export class SqliteConversationPersistence {
  constructor(private db: Database.Database) {}

  getOrCreateByAgent(agentId: string, playerId: string): PersistedConversation {
    const existing = this.db
      .prepare(
        `SELECT id, agent_id as agentId, player_id as playerId, status,
                created_at as createdAt, updated_at as updatedAt
         FROM conversations WHERE agent_id = ? AND player_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(agentId, playerId) as PersistedConversation | undefined

    if (existing) return existing

    const id = `conv-${agentId}-${Date.now()}`
    const now = Date.now()
    this.db
      .prepare(
        'INSERT INTO conversations (id, agent_id, player_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, agentId, playerId, 'active', now, now)

    return { id, agentId, playerId, status: 'active', createdAt: now, updatedAt: now }
  }

  getConversationsByAgent(agentId: string, playerId: string): PersistedConversation[] {
    return this.db
      .prepare(
        `SELECT id, agent_id as agentId, player_id as playerId, status,
                created_at as createdAt, updated_at as updatedAt
         FROM conversations WHERE agent_id = ? AND player_id = ? ORDER BY created_at DESC`
      )
      .all(agentId, playerId) as PersistedConversation[]
  }

  addMessage(conversationId: string, role: MessageRole, content: string, timestamp: number): void {
    this.db
      .prepare(
        'INSERT INTO messages (conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
      )
      .run(conversationId, role, content, timestamp)
    this.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(timestamp, conversationId)
  }

  getMessages(conversationId: string): Array<{ role: string; content: string; timestamp: number }> {
    return this.db
      .prepare(
        'SELECT role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC'
      )
      .all(conversationId) as Array<{ role: string; content: string; timestamp: number }>
  }

  updateStatus(conversationId: string, status: string): void {
    this.db
      .prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), conversationId)
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/main/db/conversation-persistence.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/conversation-persistence.ts src/main/db/conversation-persistence.test.ts
git commit -m "feat(phase-3a): add SqliteConversationPersistence for message history"
```

---

### Task 6: Folder repository (migrate from JSON file to SQLite)

**Files:**

- Create: `src/main/db/folder-repository.ts`
- Test: `src/main/db/folder-repository.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/db/folder-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'
import { SqliteFolderRepository } from './folder-repository'

describe('SqliteFolderRepository', () => {
  let db: Database.Database
  let repo: SqliteFolderRepository

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    repo = new SqliteFolderRepository(db)
  })

  afterEach(() => db.close())

  it('adds and retrieves folders', () => {
    repo.add('/Users/test/project', 'project')
    const folders = repo.getAll()
    expect(folders).toHaveLength(1)
    expect(folders[0].path).toBe('/Users/test/project')
    expect(folders[0].label).toBe('project')
  })

  it('deduplicates by path', () => {
    repo.add('/Users/test/project', 'project')
    repo.add('/Users/test/project', 'project')
    expect(repo.getAll()).toHaveLength(1)
  })

  it('removes folders', () => {
    repo.add('/Users/test/project', 'project')
    repo.remove('/Users/test/project')
    expect(repo.getAll()).toHaveLength(0)
  })

  it('checks folder existence', () => {
    repo.add('/Users/test/project', 'project')
    expect(repo.exists('/Users/test/project')).toBe(true)
    expect(repo.exists('/Users/test/other')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/main/db/folder-repository.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/main/db/folder-repository.ts
import type Database from 'better-sqlite3'
import type { ApprovedFolder } from '../../shared/types'

export class SqliteFolderRepository {
  constructor(private db: Database.Database) {}

  getAll(): ApprovedFolder[] {
    return this.db
      .prepare(
        'SELECT path, label, added_at as addedAt FROM approved_folders ORDER BY added_at ASC'
      )
      .all() as ApprovedFolder[]
  }

  add(path: string, label: string): ApprovedFolder {
    const existing = this.db
      .prepare('SELECT path, label, added_at as addedAt FROM approved_folders WHERE path = ?')
      .get(path) as ApprovedFolder | undefined

    if (existing) return existing

    const now = Date.now()
    this.db
      .prepare('INSERT INTO approved_folders (path, label, added_at) VALUES (?, ?, ?)')
      .run(path, label, now)

    return { path, label, addedAt: now }
  }

  remove(path: string): void {
    this.db.prepare('DELETE FROM approved_folders WHERE path = ?').run(path)
  }

  exists(path: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM approved_folders WHERE path = ?').get(path)
    return !!row
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/main/db/folder-repository.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/folder-repository.ts src/main/db/folder-repository.test.ts
git commit -m "feat(phase-3a): add SqliteFolderRepository for approved folders persistence"
```

---

## Chunk 2: ProgressionEngine and Main Process Integration

### Task 7: ProgressionEngine (pure business logic)

**Files:**

- Create: `src/main/progression-engine.ts`
- Test: `src/main/progression-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/progression-engine.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './db/migrations'
import { SqlitePlayerRepository } from './db/player-repository'
import { SqliteXPRepository } from './db/xp-repository'
import { ProgressionEngine } from './progression-engine'

describe('ProgressionEngine', () => {
  let db: Database.Database
  let engine: ProgressionEngine

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    new SqlitePlayerRepository(db).getOrCreate('player-1')
    const xpRepo = new SqliteXPRepository(db)
    const playerRepo = new SqlitePlayerRepository(db)
    engine = new ProgressionEngine(xpRepo, playerRepo, 'player-1')
  })

  afterEach(() => db.close())

  it('awards XP split across multiple categories', () => {
    const result = engine.awardXP('scribe', ['writing', 'communication'])
    expect(result.awards).toHaveLength(2)
    expect(result.awards[0]).toEqual({ category: 'writing', amount: 5, newTotal: 5 })
    expect(result.awards[1]).toEqual({ category: 'communication', amount: 5, newTotal: 5 })
  })

  it('awards 10 XP to a single category', () => {
    const result = engine.awardXP('scholar', ['research'])
    expect(result.awards).toHaveLength(1)
    expect(result.awards[0]).toEqual({ category: 'research', amount: 10, newTotal: 10 })
  })

  it('detects category level-up', () => {
    // Level 1 requires 50 XP = 5 interactions of 10 XP
    for (let i = 0; i < 4; i++) {
      engine.awardXP('scholar', ['research'])
    }
    const result = engine.awardXP('scholar', ['research']) // 50 XP total
    expect(result.levelUps).toEqual([{ category: 'research', newLevel: 1 }])
  })

  it('computes category level from XP', () => {
    expect(ProgressionEngine.computeCategoryLevel(0)).toBe(0)
    expect(ProgressionEngine.computeCategoryLevel(49)).toBe(0)
    expect(ProgressionEngine.computeCategoryLevel(50)).toBe(1)
    expect(ProgressionEngine.computeCategoryLevel(199)).toBe(1)
    expect(ProgressionEngine.computeCategoryLevel(200)).toBe(2)
    expect(ProgressionEngine.computeCategoryLevel(450)).toBe(3)
  })

  it('computes overall level from total XP', () => {
    expect(ProgressionEngine.computeOverallLevel(0)).toBe(0)
    expect(ProgressionEngine.computeOverallLevel(99)).toBe(0)
    expect(ProgressionEngine.computeOverallLevel(100)).toBe(1)
    expect(ProgressionEngine.computeOverallLevel(399)).toBe(1)
    expect(ProgressionEngine.computeOverallLevel(400)).toBe(2)
  })

  it('returns default title when fewer than 2 categories have XP', () => {
    const state = engine.getPlayerState()
    expect(state.title).toEqual({ 'zh-TW': '新手冒險者', en: 'Novice Adventurer' })
  })

  it('computes title from top 2 categories', () => {
    // Give XP to two categories
    for (let i = 0; i < 5; i++) engine.awardXP('scholar', ['research'])
    for (let i = 0; i < 3; i++) engine.awardXP('scribe', ['writing'])

    const state = engine.getPlayerState()
    // Primary = research (50 XP), secondary = writing (30 XP)
    // Title should use writing adjective + research noun
    expect(state.title['zh-TW']).toBeTruthy()
    expect(state.title['en']).toBeTruthy()
  })

  it('detects overall level-up', () => {
    // Overall level 1 requires 100 XP total = 10 interactions
    for (let i = 0; i < 9; i++) {
      engine.awardXP('scholar', ['research'])
    }
    const result = engine.awardXP('scholar', ['research']) // 100 XP total
    expect(result.overallLevelUp).toEqual({ newLevel: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/main/progression-engine.test.ts`

- [ ] **Step 3: Implement ProgressionEngine**

Create `src/main/progression-engine.ts` with:

- `awardXP(agentId, skillCategories)` — splits 10 XP evenly, writes via xpRepo, checks level-ups, computes title changes
- `getPlayerState()` — returns composite PlayerState
- `static computeCategoryLevel(xp)` — `50 * N^2` curve
- `static computeOverallLevel(totalXP)` — `100 * N^2` curve
- `static computeTitle(skills)` — top 2 categories → adjective + noun, default for <2 categories

Title adjectives and nouns:

```typescript
const titleNouns: Record<string, Record<SkillCategory, string>> = {
  'zh-TW': {
    writing: '文匠',
    data: '煉金師',
    visual: '法師',
    code: '巫師',
    research: '求知者',
    organization: '統帥',
    communication: '使者'
  },
  en: {
    writing: 'Wordsmith',
    data: 'Alchemist',
    visual: 'Mage',
    code: 'Sorcerer',
    research: 'Seeker',
    organization: 'Commander',
    communication: 'Diplomat'
  }
}

const titleAdjectives: Record<string, Record<SkillCategory, string>> = {
  'zh-TW': {
    writing: '文雅',
    data: '精算',
    visual: '幻象',
    code: '奧術',
    research: '博學',
    organization: '戰略',
    communication: '親和'
  },
  en: {
    writing: 'Eloquent',
    data: 'Analytical',
    visual: 'Arcane',
    code: 'Mystic',
    research: 'Learned',
    organization: 'Strategic',
    communication: 'Charismatic'
  }
}
```

See spec section "ProgressionEngine" for full implementation details.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/main/progression-engine.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/progression-engine.ts src/main/progression-engine.test.ts
git commit -m "feat(phase-3a): add ProgressionEngine with XP awards, leveling, and title computation"
```

---

### Task 8: Wire SQLite + ProgressionEngine into main process and IPC

**Files:**

- Modify: `src/main/index.ts` (initialize DB, register IPC handlers)
- Modify: `src/main/chat.ts` (persist messages to SQLite, trigger XP awards on stream completion)
- Modify: `src/main/folder-manager.ts` (back with SqliteFolderRepository)
- Modify: `src/main/agents/system-prompts.ts` (add `skills` field to agent configs)
- Modify: `src/preload/index.ts` (add progression + conversation IPC bridges)

- [ ] **Step 1: Add skills to agent configs in system-prompts.ts**

Check the `AgentConfig` interface in `src/main/agents/system-prompts.ts`. Add a `skills: SkillCategory[]` field to each agent config, matching the NPC definitions in `src/renderer/src/game/data/npcs.ts`:

- elder: `['research']`
- scholar: `['research']`
- scribe: `['writing']`
- merchant: `['data']`
- commander: `['organization']`
- artisan: `['visual']`
- herald: `['communication']`
- wizard: `['code']`
- guildMaster: `[]` (no skills)
- bartender: `[]` (no skills)

- [ ] **Step 2: Update main/index.ts — initialize DB and register IPC handlers**

Add imports for DB modules, ProgressionEngine, and SqliteFolderRepository. Inside `app.whenReady().then(...)`:

1. Initialize database: `const db = getDatabase()`
2. Create repositories: playerRepo, xpRepo, conversationPersistence, folderRepo
3. Create ProgressionEngine
4. Call `setChatDependencies(progressionEngine, conversationPersistence)` (new export from chat.ts)
5. Call `initFolderManager(folderRepo)` (new export from folder-manager.ts)
6. Register IPC handlers: `progression:get-player`, `progression:get-skills`, `conversations:get-history`
7. Add `app.on('before-quit', () => closeDatabase())`

- [ ] **Step 3: Update chat.ts — add dependency injection and XP award on stream completion**

Add module-level setter:

```typescript
export function setChatDependencies(engine, persistence): void
```

In `executeStream`, at the `end_turn` / `max_tokens` branch (around line 505-508), after pushing assistant message to history:

1. Persist user message and assistant response to SQLite via conversationPersistence
2. If `fullTextResponse` is non-empty, call `progressionEngine.awardXP(agentId, config.skills)`
3. Send `progression:xp-awarded` result to renderer via `webContents.send()`
4. If `result.titleChanged`, also send `progression:title-changed`

The `conversationHistories` Map in `chat.ts` stays as the in-session store for the Anthropic API (it needs `MessageParam[]` format with tool_use blocks, which SQLite doesn't store). Messages are written through to SQLite for persistence. On app restart, `chat.ts` starts with an empty Map — the Anthropic API context resets each session (this is expected). The renderer hydrates display history from SQLite separately via Task 14.

Note: `createConversation` from the spec's `IConversationPersistence` interface is intentionally merged into `getOrCreateByAgent` for simplicity — there's no use case for creating a conversation without immediately using it.

- [ ] **Step 4: Update folder-manager.ts to support SQLite backing**

Add `initFolderManager(repo: SqliteFolderRepository)` export. Modify `getApprovedFolders`, `addApprovedFolder`, `removeApprovedFolder`, `isPathApproved` to delegate to the repo when initialized. Remove the JSON file read/write logic.

- [ ] **Step 5: Update preload/index.ts — add progression IPC bridges**

Add to the `api` object:

- `getPlayerState`: invokes `progression:get-player`
- `getSkills`: invokes `progression:get-skills`
- `onXPAwarded`: listens to `progression:xp-awarded`
- `onTitleChanged`: listens to `progression:title-changed`
- `getConversationHistory`: invokes `conversations:get-history`

Note: The existing folder IPC handlers (`folders:get-all`, `folders:add`, `folders:remove`) in `index.ts` already exist and work. Task 8 Step 4 migrates the backing store from JSON to SQLite — the IPC channel names stay the same, so the existing preload bridges for folders continue to work without changes.

- [ ] **Step 6: Run typecheck and fix any issues**

Run: `npm run typecheck`

- [ ] **Step 7: Run existing tests to verify no regressions**

Run: `npm run test:unit`

- [ ] **Step 8: Commit**

```bash
git add src/main/index.ts src/main/chat.ts src/main/folder-manager.ts src/main/agents/system-prompts.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(phase-3a): wire SQLite, ProgressionEngine, and IPC into main process"
```

---

## Chunk 3: i18n, HUD, SkillsPanel, and XP Notifications

### Task 9: Add i18n locale keys for progression

**Files:**

- Modify: `src/renderer/src/i18n/locales/zh-TW.json`
- Modify: `src/renderer/src/i18n/locales/en.json`

- [ ] **Step 1: Add progression keys to zh-TW.json**

Add to the top-level object:

```json
"hud": {
  "level": "Lv.{{level}}"
},
"skills": {
  "title": "技能總覽",
  "totalXP": "總經驗值",
  "nextLevel": "下一級",
  "close": "ESC 關閉",
  "categories": {
    "writing": "寫作",
    "data": "數據",
    "visual": "視覺",
    "code": "程式",
    "research": "研究",
    "organization": "組織",
    "communication": "溝通"
  }
},
"xp": {
  "gained": "+{{amount}} XP",
  "levelUp": "升級！Lv.{{level}}",
  "overallLevelUp": "等級 {{level}}！"
},
"titles": {
  "default": "新手冒險者",
  "nouns": {
    "writing": "文匠", "data": "煉金師", "visual": "法師", "code": "巫師",
    "research": "求知者", "organization": "統帥", "communication": "使者"
  },
  "adjectives": {
    "writing": "文雅", "data": "精算", "visual": "幻象", "code": "奧術",
    "research": "博學", "organization": "戰略", "communication": "親和"
  }
}
```

- [ ] **Step 2: Add corresponding keys to en.json**

Same structure with English values.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/locales/zh-TW.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(phase-3a): add i18n locale keys for progression system"
```

---

### Task 10: useProgression hook

**Files:**

- Create: `src/renderer/src/hooks/useProgression.ts`

- [ ] **Step 1: Implement the hook**

Create `src/renderer/src/hooks/useProgression.ts`:

- Fetches `PlayerState` via `window.api.getPlayerState()` on mount
- Listens to `window.api.onXPAwarded()` and `window.api.onTitleChanged()` to refresh state
- On XP awarded, also emits EventBus events (`xp:gained`, `level:up`, `title:changed`) so Phaser can react
- Returns `{ playerState, loading, refresh }`

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/hooks/useProgression.ts
git commit -m "feat(phase-3a): add useProgression hook for renderer-side progression state"
```

---

### Task 11: Expand HUD component

**Files:**

- Modify: `src/renderer/src/components/ui/HUD.tsx`

- [ ] **Step 1: Rewrite HUD with progression info**

Replace the existing HUD with the expanded version. Layout: `📍 Location │ Name · Title │ Lv.N [XP bar] XP/threshold`

Key changes from existing:

- Import and use `useProgression()` hook
- Add click handler → `EventBus.emit('skills-panel:toggle', {})`
- Change `pointerEvents` from `'none'` to `'auto'`
- Add glow effect on XP gain: listen to `window.api.onXPAwarded()`, set `glowing` state for 1.5s
- Compute XP bar progress from `playerState.totalXP` using `100 * (level+1)^2` formula inline

- [ ] **Step 2: Run dev to visually verify**

Run: `npm run dev`

Check that the HUD shows: location | name . title | level + XP bar. Clicking should open skills panel (once Task 12 is done).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/HUD.tsx
git commit -m "feat(phase-3a): expand HUD with player name, title, and XP bar"
```

---

### Task 12: SkillsPanel overlay

**Files:**

- Create: `src/renderer/src/components/ui/SkillsPanel.tsx`
- Modify: `src/renderer/src/App.tsx` (add SkillsPanel + toggle logic)

- [ ] **Step 1: Create SkillsPanel component**

Create `src/renderer/src/components/ui/SkillsPanel.tsx`:

- Full-screen dark overlay (`rgba(0,0,0,0.85)`)
- Centered panel with RPG styling (monospace, gold borders)
- Header: player name + title + overall level
- 7 skill bars sorted by XP descending, each with: icon, localized name, level, progress bar, XP/threshold
- Footer: total XP + next overall level threshold
- Close hint: "ESC 關閉"
- Click-outside closes via `onClose` prop
- Uses `useProgression()` for data and `useTranslation()` for i18n

Define skill icon and color maps as constants in the component file.

- [ ] **Step 2: Wire SkillsPanel into App.tsx**

In `src/renderer/src/App.tsx`:

1. Import SkillsPanel
2. Add `showSkillsPanel` state
3. Add EventBus listener for `skills-panel:toggle` → toggle state
4. Add keyboard listener: `P` toggles, `ESC` closes (skip if target is input/textarea)
5. Render `{showSkillsPanel && <SkillsPanel onClose={...} />}`

- [ ] **Step 3: Run dev to visually verify**

Run: `npm run dev`

Click HUD bar or press P to open skills panel. Press ESC or click outside to close.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/SkillsPanel.tsx src/renderer/src/App.tsx
git commit -m "feat(phase-3a): add SkillsPanel full-screen overlay with skill bars"
```

---

### Task 13: Phaser floating XP text

**Files:**

- Modify: `src/renderer/src/game/scenes/Town.ts` (add XP text spawner)
- Modify: `src/renderer/src/game/entities/NPC.ts` (add getAgentId accessor if missing)

- [ ] **Step 1: Ensure NPC has getAgentId() method**

Check `src/renderer/src/game/entities/NPC.ts` — it stores the `AgentDef`. Add a public getter if not already present:

```typescript
getAgentId(): string { return this.agentDef.id }
```

- [ ] **Step 2: Add floating text logic to Town scene**

In `src/renderer/src/game/scenes/Town.ts`, add EventBus listeners in `create()`:

For `xp:gained`:

- Find NPC by `data.agentId`
- Create Phaser text `"+N XP"` with skill icon, positioned above NPC
- Tween: float up 40px, fade alpha to 0, duration 1500ms, destroy on complete
- Use skill-specific color

For `level:up`:

- Create centered text "Level Up! Lv.N" with golden color
- ScrollFactor 0 (stays in screen space)
- Tween: float up, fade, 2000ms

Add private helper methods `getSkillColor(category)` and `getSkillIcon(category)` to the Town class.

- [ ] **Step 3: Run dev and test by talking to an NPC**

Run: `npm run dev`

Talk to an NPC, close dialogue. Floating "+N XP" text should appear above the NPC and fade out.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/game/scenes/Town.ts src/renderer/src/game/entities/NPC.ts
git commit -m "feat(phase-3a): add floating XP text and level-up notifications in Phaser"
```

---

### Task 14: Conversation history hydration

**Files:**

- Modify: `src/renderer/src/services/ConversationManager.ts` (add hydration method)
- Modify: `src/renderer/src/App.tsx` (trigger hydration on dialogue open)

- [ ] **Step 1: Add hydrateFromPersistence to ConversationManager**

Add to `IConversationRepository` interface:

```typescript
hydrateFromPersistence(agentId: AgentId, messages: Message[]): void
```

Implement in `InMemoryConversationRepository`:

- Skip if conversation already has messages (don't overwrite live session data)
- Push all messages into the conversation's message array
- Call `notify()` to trigger React re-renders

- [ ] **Step 2: Add hydration trigger in App.tsx**

Track hydrated agents with a `Set<string>` ref. When `npc:interact` fires (dialogue opens), check if this agent has been hydrated. If not:

1. Call `window.api.getConversationHistory(agentId)`
2. Map results to `Message[]`
3. Call `conversationManager.hydrateFromPersistence(agentId, messages)`
4. Add agentId to hydrated set

- [ ] **Step 3: Run dev and verify messages persist across restart**

Run: `npm run dev`

Talk to an NPC, close app, reopen. Open dialogue with same NPC — previous messages should appear.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/services/ConversationManager.ts src/renderer/src/App.tsx
git commit -m "feat(phase-3a): hydrate conversation history from SQLite on dialogue open"
```

---

### Task 15: Overall level-up banner

**Files:**

- Create: `src/renderer/src/components/ui/LevelUpBanner.tsx`
- Modify: `src/renderer/src/App.tsx` (add LevelUpBanner)

- [ ] **Step 1: Create LevelUpBanner component**

Create `src/renderer/src/components/ui/LevelUpBanner.tsx`:

- Takes `level: number` and `onDone: () => void` props
- Fades in on mount (opacity 0 → 1)
- After 2 seconds, fades out (opacity → 0) then calls `onDone`
- Shows centered golden text: "Level N!"
- `pointerEvents: 'none'`, high z-index

- [ ] **Step 2: Wire into App.tsx**

Listen to `window.api.onXPAwarded()`. When `result.overallLevelUp` is present, set `levelUpBanner` state to the new level. Render `<LevelUpBanner>` when state is set. `onDone` clears the state.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/LevelUpBanner.tsx src/renderer/src/App.tsx
git commit -m "feat(phase-3a): add level-up banner celebration overlay"
```

---

### Task 16: Final integration test and cleanup

- [ ] **Step 1: Run all unit tests**

Run: `npm run test:unit`

Expected: All PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 3: Run lint and fix any issues**

Run: `npm run lint`

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

Verify:

1. HUD shows: location | name . title | level + XP bar
2. Talk to an NPC -> floating "+N XP" text appears above NPC
3. XP bar in HUD animates + border glows blue briefly
4. Press P -> SkillsPanel opens with all 7 skill bars sorted by XP
5. ESC closes SkillsPanel
6. Close and reopen app -> messages persist, XP persists
7. Approved folders persist across restart (test via Notice Board)
8. After enough XP -> category level-up golden text appears
9. After enough total XP -> center banner "Level N!" appears and fades

- [ ] **Step 5: Update CLAUDE.md**

Update the "Completed" line:

```
Completed: Phase 1 (Shell & World), Phase 2 (Agent Conversations), Phase 2.5 (NPC Tool Use), Phase 3A (Progression Engine)
Next up: Phase 3B (Quests & Skill Tree)
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(phase-3a): complete progression engine — SQLite, XP, HUD, skills panel"
```
