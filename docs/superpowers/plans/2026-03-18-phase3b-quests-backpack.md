# Phase 3B — Quests, Backpack & Title Tiers Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add organic quest system, backpack inventory panel, Tavern quest board, and title tier upgrades to create a visible gameplay loop on top of Phase 3A's XP/leveling engine.

**Architecture:** New QuestEngine service in main process alongside ProgressionEngine, triggered after each conversation's XP award. New BackpackPanel React overlay with tab system. All quest state in SQLite (new `quests` table), quest definitions as static code constants, progress computed live from `xp_ledger` queries.

**Tech Stack:** TypeScript, Electron IPC, SQLite (better-sqlite3), React 19, Phaser EventBus, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-phase3b-quests-backpack-design.md`

---

## File Structure

### New Files (Main Process)

- `src/main/quest-engine.ts` — QuestEngine service: trigger evaluation, quest state management, board suggestions
- `src/main/quest-definitions.ts` — Static v1 quest definitions (5 quests) and types
- `src/main/db/quest-repository.ts` — SqliteQuestRepository: quest CRUD, counter queries on xp_ledger
- `src/main/quest-engine.test.ts` — Unit tests for QuestEngine
- `src/main/db/quest-repository.test.ts` — Unit tests for SqliteQuestRepository

### New Files (Renderer)

- `src/renderer/src/components/ui/BackpackPanel.tsx` — Backpack overlay with tab system
- `src/renderer/src/components/ui/QuestsTab.tsx` — Quest list with filter sub-tabs and card variants
- `src/renderer/src/components/ui/QuestCard.tsx` — Individual quest card (visible, hinted, completed variants)
- `src/renderer/src/components/ui/QuestNotification.tsx` — Toast notifications for quest completion/discovery
- `src/renderer/src/components/ui/QuestBoardPanel.tsx` — Tavern quest board suggestion panel
- `src/renderer/src/hooks/useQuests.ts` — Quest IPC listener + EventBus emitter (mirrors useProgression pattern)

### Modified Files

- `src/main/db/migrations.ts` — Add migration 2 (quests table)
- `src/main/chat.ts` — Add questEngine.checkQuests() call after XP award (~line 555)
- `src/main/index.ts` — Register quest IPC handlers
- `src/main/progression-engine.ts` — Extend computeTitle() to accept overallLevel, add tier prefix
- `src/shared/types.ts` — Add quest types (QuestDefinition, QuestTrigger, PlayerQuest, etc.)
- `src/preload/index.ts` — Expose quest IPC channels
- `src/renderer/src/game/types.ts` — Extend quest:completed event, add quest:discovered and backpack:toggle
- `src/renderer/src/components/ui/HUD.tsx` — Add backpack icon with badge count
- `src/renderer/src/App.tsx` (or `src/renderer/src/components/GameUI.tsx` if it exists) — Mount BackpackPanel, QuestNotification, QuestBoardPanel
- `src/renderer/src/i18n/locales/zh-TW.json` — Add backpack/quest/title tier i18n keys
- `src/renderer/src/i18n/locales/en.json` — Add backpack/quest/title tier i18n keys
- `src/main/progression-engine.test.ts` — Add title tier tests

---

## Chunk 1: Shared Types, DB Schema & Quest Repository

### Task 1: Add Quest Types to Shared Types

**Files:**

- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add quest-related types**

Add to `src/shared/types.ts`:

```typescript
// Quest visibility in the backpack
type QuestVisibility = 'hinted' | 'visible'

// Quest status
type QuestStatus = 'active' | 'completed'

// Quest trigger types
interface QuestTrigger {
  type:
    | 'conversation_count'
    | 'category_count'
    | 'max_category_count'
    | 'daily_count'
    | 'category_coverage'
  skillCategory?: SkillCategory
  threshold: number
  // conversation_count: total conversations across all categories
  // category_count: conversations in a specific skillCategory
  // max_category_count: highest conversation count in any single category
  // daily_count: conversations within a single calendar day
  // category_coverage: number of distinct categories with >= 1 conversation
}

// Quest precondition for hidden->visible/hinted transition
interface QuestPrecondition {
  type: 'max_category_count' | 'category_coverage'
  threshold: number
}

// Static quest definition (code constant)
interface QuestDefinition {
  id: string
  name: LocalizedString
  description: LocalizedString
  hintText?: LocalizedString
  icon: string
  initialVisibility: 'visible' | 'hidden'
  precondition?: QuestPrecondition
  trigger: QuestTrigger
  xpReward: number
  skillCategories: SkillCategory[]
  repeatable: boolean
}

// Player's quest state (DB row + computed progress)
interface PlayerQuest {
  id: string
  questDefId: string
  visibility: QuestVisibility
  status: QuestStatus
  repeatCount: number
  discoveredAt: number
  completedAt: number | null
  // Computed from definition + xp_ledger:
  definition: QuestDefinition
  progress: number // current count toward trigger
  target: number // trigger threshold
}

// Quest check result from QuestEngine
interface QuestCheckResult {
  discovered: { questDefId: string; visibility: QuestVisibility }[]
  completed: { questDefId: string; title: LocalizedString; xpReward: number }[]
  quests: PlayerQuest[]
}

// Quest board suggestion
interface QuestBoardSuggestion {
  weakestSkill: SkillCategory
  npcName: LocalizedString
  agentId: string
  message: LocalizedString
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (new types are additive only)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add quest system types for Phase 3B"
```

---

### Task 2: Add Quests DB Migration

**Files:**

- Modify: `src/main/db/migrations.ts`

- [ ] **Step 1: Add migration 2**

Add migration key `2` to the migrations object in `src/main/db/migrations.ts`:

```typescript
2: (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE quests (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id),
      quest_def_id TEXT NOT NULL,
      visibility TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      repeat_count INTEGER NOT NULL DEFAULT 0,
      discovered_at INTEGER NOT NULL,
      completed_at INTEGER,
      UNIQUE(player_id, quest_def_id)
    );
    CREATE INDEX idx_quests_player ON quests(player_id);
  `)
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/db/migrations.ts
git commit -m "feat(db): add migration 2 — quests table"
```

---

### Task 3: Implement SqliteQuestRepository

**Files:**

- Create: `src/main/db/quest-repository.ts`
- Create: `src/main/db/quest-repository.test.ts`

- [ ] **Step 1: Write failing tests for quest repository**

Create `src/main/db/quest-repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'
import { SqliteQuestRepository } from './quest-repository'

describe('SqliteQuestRepository', () => {
  let db: Database.Database
  let repo: SqliteQuestRepository

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    // Seed a player
    db.prepare('INSERT INTO players (id, name, locale, created_at) VALUES (?, ?, ?, ?)').run(
      'player-1',
      'Isaac',
      'zh-TW',
      Date.now()
    )
    repo = new SqliteQuestRepository(db)
  })

  afterEach(() => db.close())

  it('creates a quest row and retrieves it', () => {
    repo.upsert({
      id: 'q1',
      playerId: 'player-1',
      questDefId: 'first-contact',
      visibility: 'visible',
      status: 'active',
      repeatCount: 0,
      discoveredAt: Date.now(),
      completedAt: null
    })

    const quests = repo.getByPlayer('player-1')
    expect(quests).toHaveLength(1)
    expect(quests[0].questDefId).toBe('first-contact')
    expect(quests[0].visibility).toBe('visible')
    expect(quests[0].status).toBe('active')
  })

  it('upserts existing quest (same player + questDefId)', () => {
    const now = Date.now()
    repo.upsert({
      id: 'q1',
      playerId: 'player-1',
      questDefId: 'first-contact',
      visibility: 'visible',
      status: 'active',
      repeatCount: 0,
      discoveredAt: now,
      completedAt: null
    })

    repo.upsert({
      id: 'q1',
      playerId: 'player-1',
      questDefId: 'first-contact',
      visibility: 'visible',
      status: 'completed',
      repeatCount: 0,
      discoveredAt: now,
      completedAt: Date.now()
    })

    const quests = repo.getByPlayer('player-1')
    expect(quests).toHaveLength(1)
    expect(quests[0].status).toBe('completed')
  })

  it('completes a quest and increments repeat_count', () => {
    repo.upsert({
      id: 'q1',
      playerId: 'player-1',
      questDefId: 'daily-adventurer',
      visibility: 'visible',
      status: 'active',
      repeatCount: 0,
      discoveredAt: Date.now(),
      completedAt: null
    })

    repo.complete('q1', Date.now())
    const quests = repo.getByPlayer('player-1')
    expect(quests[0].status).toBe('completed')
    expect(quests[0].repeatCount).toBe(1)
  })

  it('resets a repeatable quest', () => {
    repo.upsert({
      id: 'q1',
      playerId: 'player-1',
      questDefId: 'daily-adventurer',
      visibility: 'visible',
      status: 'completed',
      repeatCount: 1,
      discoveredAt: Date.now(),
      completedAt: Date.now()
    })

    repo.resetForRepeat('q1')
    const quests = repo.getByPlayer('player-1')
    expect(quests[0].status).toBe('active')
    expect(quests[0].completedAt).toBeNull()
    expect(quests[0].repeatCount).toBe(1) // count preserved
  })

  it('counts conversations per category from xp_ledger', () => {
    // Seed XP entries
    const stmt = db.prepare(
      'INSERT INTO xp_ledger (player_id, skill_category, amount, agent_id, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run('player-1', 'research', 5, 'scholar', Date.now())
    stmt.run('player-1', 'research', 5, 'scholar', Date.now())
    stmt.run('player-1', 'writing', 10, 'scribe', Date.now())

    const counts = repo.getConversationCounts('player-1')
    expect(counts.research).toBe(2)
    expect(counts.writing).toBe(1)
    expect(counts.code).toBe(0)
  })

  it('counts daily conversations', () => {
    const now = Date.now()
    const stmt = db.prepare(
      'INSERT INTO xp_ledger (player_id, skill_category, amount, agent_id, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run('player-1', 'research', 5, 'scholar', now)
    stmt.run('player-1', 'writing', 10, 'scribe', now)
    // Yesterday
    stmt.run('player-1', 'code', 10, 'wizard', now - 86400000)

    const todayCount = repo.getDailyConversationCount('player-1')
    expect(todayCount).toBe(2) // only today's
  })

  it('counts distinct categories used', () => {
    const stmt = db.prepare(
      'INSERT INTO xp_ledger (player_id, skill_category, amount, agent_id, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run('player-1', 'research', 5, 'scholar', Date.now())
    stmt.run('player-1', 'writing', 10, 'scribe', Date.now())
    stmt.run('player-1', 'research', 5, 'scholar', Date.now())

    const count = repo.getDistinctCategoryCount('player-1')
    expect(count).toBe(2) // research + writing
  })

  it('gets max conversation count in any single category', () => {
    const stmt = db.prepare(
      'INSERT INTO xp_ledger (player_id, skill_category, amount, agent_id, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run('player-1', 'research', 5, 'scholar', Date.now())
    stmt.run('player-1', 'research', 5, 'scholar', Date.now())
    stmt.run('player-1', 'research', 5, 'scholar', Date.now())
    stmt.run('player-1', 'writing', 10, 'scribe', Date.now())

    const max = repo.getMaxCategoryCount('player-1')
    expect(max).toBe(3) // research has 3
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm run test:unit -- src/main/db/quest-repository.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement SqliteQuestRepository**

Create `src/main/db/quest-repository.ts`:

```typescript
import Database from 'better-sqlite3'
import type { SkillCategory } from '../../shared/types'

const SKILL_CATEGORIES: SkillCategory[] = [
  'writing',
  'data',
  'visual',
  'code',
  'research',
  'organization',
  'communication'
]

export interface QuestRow {
  id: string
  playerId: string
  questDefId: string
  visibility: 'hinted' | 'visible'
  status: 'active' | 'completed'
  repeatCount: number
  discoveredAt: number
  completedAt: number | null
}

export class SqliteQuestRepository {
  constructor(private db: Database.Database) {}

  upsert(quest: QuestRow): void {
    this.db
      .prepare(
        `INSERT INTO quests (id, player_id, quest_def_id, visibility, status, repeat_count, discovered_at, completed_at)
         VALUES (@id, @playerId, @questDefId, @visibility, @status, @repeatCount, @discoveredAt, @completedAt)
         ON CONFLICT(player_id, quest_def_id) DO UPDATE SET
           visibility = @visibility,
           status = @status,
           repeat_count = @repeatCount,
           completed_at = @completedAt`
      )
      .run({
        id: quest.id,
        playerId: quest.playerId,
        questDefId: quest.questDefId,
        visibility: quest.visibility,
        status: quest.status,
        repeatCount: quest.repeatCount,
        discoveredAt: quest.discoveredAt,
        completedAt: quest.completedAt
      })
  }

  getByPlayer(playerId: string): QuestRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, player_id as playerId, quest_def_id as questDefId, visibility, status,
                repeat_count as repeatCount, discovered_at as discoveredAt, completed_at as completedAt
         FROM quests WHERE player_id = ?`
      )
      .all(playerId) as QuestRow[]
    return rows
  }

  complete(questId: string, completedAt: number): void {
    this.db
      .prepare(
        `UPDATE quests SET status = 'completed', completed_at = ?, repeat_count = repeat_count + 1
         WHERE id = ?`
      )
      .run(completedAt, questId)
  }

  resetForRepeat(questId: string): void {
    this.db
      .prepare(`UPDATE quests SET status = 'active', completed_at = NULL WHERE id = ?`)
      .run(questId)
  }

  getConversationCounts(playerId: string): Record<SkillCategory, number> {
    const rows = this.db
      .prepare(
        `SELECT skill_category as category, COUNT(*) as count
         FROM xp_ledger WHERE player_id = ? GROUP BY skill_category`
      )
      .all(playerId) as { category: string; count: number }[]

    const counts = {} as Record<SkillCategory, number>
    for (const cat of SKILL_CATEGORIES) counts[cat] = 0
    for (const row of rows) counts[row.category as SkillCategory] = row.count
    return counts
  }

  getDailyConversationCount(playerId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM xp_ledger
         WHERE player_id = ?
         AND DATE(created_at / 1000, 'unixepoch', 'localtime') = DATE('now', 'localtime')`
      )
      .get(playerId) as { count: number }
    return row.count
  }

  getDistinctCategoryCount(playerId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(DISTINCT skill_category) as count FROM xp_ledger WHERE player_id = ?`)
      .get(playerId) as { count: number }
    return row.count
  }

  getMaxCategoryCount(playerId: string): number {
    const row = this.db
      .prepare(
        `SELECT MAX(cnt) as maxCount FROM (
           SELECT COUNT(*) as cnt FROM xp_ledger WHERE player_id = ? GROUP BY skill_category
         )`
      )
      .get(playerId) as { maxCount: number | null }
    return row.maxCount ?? 0
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm run test:unit -- src/main/db/quest-repository.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/quest-repository.ts src/main/db/quest-repository.test.ts
git commit -m "feat(db): add SqliteQuestRepository with counter queries"
```

---

## Chunk 2: Quest Definitions, QuestEngine & Title Tiers

### Task 4: Create Quest Definitions

**Files:**

- Create: `src/main/quest-definitions.ts`

- [ ] **Step 1: Write v1 quest definitions**

Create `src/main/quest-definitions.ts`:

```typescript
import type { QuestDefinition } from '../shared/types'

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: 'first-contact',
    name: { 'zh-TW': '初次接觸', en: 'First Contact' },
    description: {
      'zh-TW': '在任何分類中完成 1 次對話',
      en: 'Complete 1 conversation in any category'
    },
    icon: '👋',
    initialVisibility: 'visible',
    trigger: { type: 'conversation_count', threshold: 1 },
    xpReward: 20,
    skillCategories: [],
    repeatable: false
  },
  {
    id: 'knowledge-collector',
    name: { 'zh-TW': '知識收集者', en: 'Knowledge Collector' },
    description: {
      'zh-TW': '在研究分類中完成 3 次對話',
      en: 'Complete 3 conversations in Research'
    },
    icon: '🔍',
    initialVisibility: 'visible',
    trigger: { type: 'category_count', skillCategory: 'research', threshold: 3 },
    xpReward: 50,
    skillCategories: ['research'],
    repeatable: false
  },
  {
    id: 'daily-adventurer',
    name: { 'zh-TW': '日常冒險者', en: 'Daily Adventurer' },
    description: {
      'zh-TW': '在一天內完成 3 次對話',
      en: 'Complete 3 conversations in one day'
    },
    icon: '☀️',
    initialVisibility: 'visible',
    trigger: { type: 'daily_count', threshold: 3 },
    xpReward: 30,
    skillCategories: [],
    repeatable: true
  },
  {
    id: 'diligent-apprentice',
    name: { 'zh-TW': '勤奮學徒', en: 'Diligent Apprentice' },
    description: {
      'zh-TW': '在任一分類中完成 10 次對話',
      en: 'Complete 10 conversations in any single category'
    },
    hintText: {
      'zh-TW': '持續磨練同一項技能...',
      en: 'Keep honing the same skill...'
    },
    icon: '📚',
    initialVisibility: 'hidden',
    precondition: { type: 'max_category_count', threshold: 3 },
    trigger: { type: 'max_category_count', threshold: 10 },
    xpReward: 80,
    skillCategories: [],
    repeatable: false
  },
  {
    id: 'renaissance',
    name: { 'zh-TW': '多才多藝', en: 'Renaissance' },
    description: {
      'zh-TW': '在 5 個不同的分類中各完成 1 次對話',
      en: 'Complete 1 conversation in each of 5 different categories'
    },
    hintText: {
      'zh-TW': '嘗試不同領域的冒險...',
      en: 'Try adventuring in different fields...'
    },
    icon: '🌟',
    initialVisibility: 'hidden',
    precondition: { type: 'category_coverage', threshold: 2 },
    trigger: { type: 'category_coverage', threshold: 5 },
    xpReward: 100,
    skillCategories: [],
    repeatable: false
  }
] as const

export function getQuestDefinition(id: string): QuestDefinition | undefined {
  return QUEST_DEFINITIONS.find((q) => q.id === id)
}
```

Note: `diligent-apprentice` uses `max_category_count` — this checks the highest conversation count in any single category (uses `getMaxCategoryCount`). This is distinct from `conversation_count` (total across all categories) and `category_count` (a specific named category).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/quest-definitions.ts
git commit -m "feat: add v1 quest definitions (5 quests)"
```

---

### Task 5: Implement QuestEngine

**Files:**

- Create: `src/main/quest-engine.ts`
- Create: `src/main/quest-engine.test.ts`

- [ ] **Step 1: Write failing tests for QuestEngine**

Create `src/main/quest-engine.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './db/migrations'
import { SqliteQuestRepository } from './db/quest-repository'
import { SqliteXPRepository } from './db/xp-repository'
import { QuestEngine } from './quest-engine'

describe('QuestEngine', () => {
  let db: Database.Database
  let questRepo: SqliteQuestRepository
  let xpRepo: SqliteXPRepository
  let engine: QuestEngine
  const PLAYER_ID = 'player-1'

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    db.prepare('INSERT INTO players (id, name, locale, created_at) VALUES (?, ?, ?, ?)').run(
      PLAYER_ID,
      'Isaac',
      'zh-TW',
      Date.now()
    )
    questRepo = new SqliteQuestRepository(db)
    xpRepo = new SqliteXPRepository(db)
    engine = new QuestEngine(questRepo, xpRepo)
  })

  afterEach(() => db.close())

  it('seeds visible starter quests for new player', () => {
    engine.seedStarterQuests(PLAYER_ID)
    const quests = engine.getPlayerQuests(PLAYER_ID)
    const visible = quests.filter((q) => q.visibility === 'visible')
    expect(visible).toHaveLength(3) // first-contact, knowledge-collector, daily-adventurer
  })

  it('does not duplicate starter quests on re-seed', () => {
    engine.seedStarterQuests(PLAYER_ID)
    engine.seedStarterQuests(PLAYER_ID)
    const quests = engine.getPlayerQuests(PLAYER_ID)
    expect(quests.filter((q) => q.visibility === 'visible')).toHaveLength(3)
  })

  it('completes first-contact after 1 conversation', () => {
    engine.seedStarterQuests(PLAYER_ID)
    // Simulate 1 conversation (1 XP entry)
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')

    const result = engine.checkQuests(PLAYER_ID)
    expect(result.completed).toHaveLength(1)
    expect(result.completed[0].questDefId).toBe('first-contact')
    expect(result.completed[0].xpReward).toBe(20)
  })

  it('discovers hidden quest when precondition met', () => {
    engine.seedStarterQuests(PLAYER_ID)
    // 3 conversations in research — triggers diligent-apprentice precondition
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')

    const result = engine.checkQuests(PLAYER_ID)
    expect(result.discovered.some((d) => d.questDefId === 'diligent-apprentice')).toBe(true)
  })

  it('discovers renaissance quest when 2 categories used', () => {
    engine.seedStarterQuests(PLAYER_ID)
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
    xpRepo.award(PLAYER_ID, 'writing', 10, 'scribe')

    const result = engine.checkQuests(PLAYER_ID)
    expect(result.discovered.some((d) => d.questDefId === 'renaissance')).toBe(true)
  })

  it('does not re-discover already discovered quests', () => {
    engine.seedStarterQuests(PLAYER_ID)
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
    xpRepo.award(PLAYER_ID, 'writing', 10, 'scribe')

    engine.checkQuests(PLAYER_ID) // first check — discovers
    const result = engine.checkQuests(PLAYER_ID) // second check
    expect(result.discovered).toHaveLength(0)
  })

  it('does not re-complete already completed non-repeatable quests', () => {
    engine.seedStarterQuests(PLAYER_ID)
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')

    engine.checkQuests(PLAYER_ID) // completes first-contact
    xpRepo.award(PLAYER_ID, 'writing', 10, 'scribe')
    const result = engine.checkQuests(PLAYER_ID)
    expect(result.completed.find((c) => c.questDefId === 'first-contact')).toBeUndefined()
  })

  it('computes progress for visible quests', () => {
    engine.seedStarterQuests(PLAYER_ID)
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')

    const quests = engine.getPlayerQuests(PLAYER_ID)
    const kc = quests.find((q) => q.questDefId === 'knowledge-collector')!
    expect(kc.progress).toBe(2)
    expect(kc.target).toBe(3)
  })

  it('returns quest board suggestion for weakest skill', () => {
    xpRepo.award(PLAYER_ID, 'research', 50, 'scholar')
    xpRepo.award(PLAYER_ID, 'writing', 30, 'scribe')
    // All other skills at 0 — picks one of the zero-XP skills

    const suggestion = engine.getQuestBoardSuggestion(PLAYER_ID)
    expect(suggestion).not.toBeNull()
    expect(suggestion!.weakestSkill).toBeDefined()
    expect(suggestion!.agentId).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm run test:unit -- src/main/quest-engine.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement QuestEngine**

Create `src/main/quest-engine.ts`:

```typescript
import type {
  QuestCheckResult,
  PlayerQuest,
  QuestBoardSuggestion,
  QuestVisibility,
  SkillCategory,
  LocalizedString
} from '../shared/types'
import { QUEST_DEFINITIONS, getQuestDefinition } from './quest-definitions'
import type { SqliteQuestRepository } from './db/quest-repository'
import type { SqliteXPRepository } from './db/xp-repository'

const SKILL_TO_NPC: Record<SkillCategory, { name: LocalizedString; agentId: string }> = {
  writing: { name: { 'zh-TW': '書記官雷文', en: 'Scribe Raven' }, agentId: 'scribe' },
  research: { name: { 'zh-TW': '學者索菲亞', en: 'Scholar Sofia' }, agentId: 'scholar' },
  code: { name: { 'zh-TW': '法師瑪琳', en: 'Wizard Merlin' }, agentId: 'wizard' },
  data: { name: { 'zh-TW': '商人馬可', en: 'Merchant Marco' }, agentId: 'merchant' },
  communication: {
    name: { 'zh-TW': '傳令官娜歐蜜', en: 'Herald Naomi' },
    agentId: 'herald'
  },
  organization: {
    name: { 'zh-TW': '指揮官乃歐', en: 'Commander Neo' },
    agentId: 'commander'
  },
  visual: { name: { 'zh-TW': '工匠艾瑞絲', en: 'Artisan Iris' }, agentId: 'artisan' }
}

const SKILL_CATEGORIES: SkillCategory[] = [
  'writing',
  'data',
  'visual',
  'code',
  'research',
  'organization',
  'communication'
]

const SKILL_NAMES: Record<SkillCategory, Record<string, string>> = {
  writing: { 'zh-TW': '寫作', en: 'Writing' },
  data: { 'zh-TW': '數據', en: 'Data' },
  visual: { 'zh-TW': '視覺', en: 'Visual' },
  code: { 'zh-TW': '程式', en: 'Code' },
  research: { 'zh-TW': '研究', en: 'Research' },
  organization: { 'zh-TW': '組織', en: 'Organization' },
  communication: { 'zh-TW': '溝通', en: 'Communication' }
}

export class QuestEngine {
  constructor(
    private questRepo: SqliteQuestRepository,
    private xpRepo: SqliteXPRepository
  ) {}

  /** Seed visible starter quests for a new player. Idempotent. */
  seedStarterQuests(playerId: string): void {
    const existing = this.questRepo.getByPlayer(playerId)
    const existingDefIds = new Set(existing.map((q) => q.questDefId))

    for (const def of QUEST_DEFINITIONS) {
      if (def.initialVisibility === 'visible' && !existingDefIds.has(def.id)) {
        this.questRepo.upsert({
          id: crypto.randomUUID(),
          playerId,
          questDefId: def.id,
          visibility: 'visible',
          status: 'active',
          repeatCount: 0,
          discoveredAt: Date.now(),
          completedAt: null
        })
      }
    }
  }

  /** Check all quests after a conversation. Returns discoveries and completions. */
  checkQuests(playerId: string): QuestCheckResult {
    const existing = this.questRepo.getByPlayer(playerId)

    // Gather counter data once
    const counts = this.questRepo.getConversationCounts(playerId)
    const dailyCount = this.questRepo.getDailyConversationCount(playerId)
    const distinctCategories = this.questRepo.getDistinctCategoryCount(playerId)
    const maxCategoryCount = this.questRepo.getMaxCategoryCount(playerId)
    const totalConversations = Object.values(counts).reduce((a, b) => a + b, 0)

    const discovered: QuestCheckResult['discovered'] = []
    const completed: QuestCheckResult['completed'] = []

    for (const def of QUEST_DEFINITIONS) {
      const row = existing.find((q) => q.questDefId === def.id)

      // Check hidden -> hinted/visible promotion
      if (!row && def.initialVisibility === 'hidden' && def.precondition) {
        if (this.checkPrecondition(def.precondition, maxCategoryCount, distinctCategories)) {
          const visibility: QuestVisibility = def.hintText ? 'hinted' : 'visible'
          this.questRepo.upsert({
            id: crypto.randomUUID(),
            playerId,
            questDefId: def.id,
            visibility,
            status: 'active',
            repeatCount: 0,
            discoveredAt: Date.now(),
            completedAt: null
          })
          discovered.push({ questDefId: def.id, visibility })
        }
        continue
      }

      // Check completion for active quests
      if (row && row.status === 'active') {
        const triggerMet = this.checkTrigger(
          def.trigger,
          counts,
          dailyCount,
          distinctCategories,
          maxCategoryCount,
          totalConversations
        )
        if (triggerMet) {
          this.questRepo.complete(row.id, Date.now())
          completed.push({
            questDefId: def.id,
            title: def.name,
            xpReward: def.xpReward
          })

          // Reset repeatable quests
          if (def.repeatable) {
            this.questRepo.resetForRepeat(row.id)
          }
        }
      }
    }

    return {
      discovered,
      completed,
      quests: this.getPlayerQuests(playerId)
    }
  }

  /** Get all player quests with computed progress. */
  getPlayerQuests(playerId: string): PlayerQuest[] {
    const rows = this.questRepo.getByPlayer(playerId)
    const counts = this.questRepo.getConversationCounts(playerId)
    const dailyCount = this.questRepo.getDailyConversationCount(playerId)
    const distinctCategories = this.questRepo.getDistinctCategoryCount(playerId)
    const maxCategoryCount = this.questRepo.getMaxCategoryCount(playerId)
    const totalConversations = Object.values(counts).reduce((a, b) => a + b, 0)

    return rows.map((row) => {
      const def = getQuestDefinition(row.questDefId)!
      return {
        id: row.id,
        questDefId: row.questDefId,
        visibility: row.visibility,
        status: row.status,
        repeatCount: row.repeatCount,
        discoveredAt: row.discoveredAt,
        completedAt: row.completedAt,
        definition: def,
        progress: this.computeProgress(
          def.trigger,
          counts,
          dailyCount,
          distinctCategories,
          maxCategoryCount,
          totalConversations
        ),
        target: def.trigger.threshold
      }
    })
  }

  /** Get quest board suggestion based on weakest skill. */
  getQuestBoardSuggestion(playerId: string): QuestBoardSuggestion | null {
    const counts = this.questRepo.getConversationCounts(playerId)
    let weakest: SkillCategory = SKILL_CATEGORIES[0]
    let minCount = Infinity

    for (const cat of SKILL_CATEGORIES) {
      const count = counts[cat] ?? 0
      if (count < minCount) {
        minCount = count
        weakest = cat
      }
    }

    const npc = SKILL_TO_NPC[weakest]
    return {
      weakestSkill: weakest,
      npcName: npc.name,
      agentId: npc.agentId,
      message: {
        'zh-TW': `你的${SKILL_NAMES[weakest]['zh-TW']}技能看起來還有很大的成長空間——試著找${npc.name['zh-TW']}聊聊吧！`,
        en: `Your ${SKILL_NAMES[weakest].en} skill has room to grow — try talking to ${npc.name.en}!`
      }
    }
  }

  private checkPrecondition(
    pre: { type: string; threshold: number },
    maxCategoryCount: number,
    distinctCategories: number
  ): boolean {
    switch (pre.type) {
      case 'max_category_count':
        return maxCategoryCount >= pre.threshold
      case 'category_coverage':
        return distinctCategories >= pre.threshold
      default:
        return false
    }
  }

  private checkTrigger(
    trigger: { type: string; skillCategory?: string; threshold: number },
    counts: Record<string, number>,
    dailyCount: number,
    distinctCategories: number,
    maxCategoryCount: number,
    totalConversations: number
  ): boolean {
    switch (trigger.type) {
      case 'conversation_count':
        return totalConversations >= trigger.threshold
      case 'category_count':
        return (counts[trigger.skillCategory!] ?? 0) >= trigger.threshold
      case 'max_category_count':
        return maxCategoryCount >= trigger.threshold
      case 'daily_count':
        return dailyCount >= trigger.threshold
      case 'category_coverage':
        return distinctCategories >= trigger.threshold
      default:
        return false
    }
  }

  private computeProgress(
    trigger: { type: string; skillCategory?: string; threshold: number },
    counts: Record<string, number>,
    dailyCount: number,
    distinctCategories: number,
    maxCategoryCount: number,
    totalConversations: number
  ): number {
    switch (trigger.type) {
      case 'conversation_count':
        return Math.min(totalConversations, trigger.threshold)
      case 'category_count':
        return Math.min(counts[trigger.skillCategory!] ?? 0, trigger.threshold)
      case 'max_category_count':
        return Math.min(maxCategoryCount, trigger.threshold)
      case 'daily_count':
        return Math.min(dailyCount, trigger.threshold)
      case 'category_coverage':
        return Math.min(distinctCategories, trigger.threshold)
      default:
        return 0
    }
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm run test:unit -- src/main/quest-engine.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/quest-engine.ts src/main/quest-engine.test.ts
git commit -m "feat: implement QuestEngine with trigger evaluation and board suggestions"
```

---

### Task 6: Add Title Tier Prefix to ProgressionEngine

**Files:**

- Modify: `src/main/progression-engine.ts`
- Modify: `src/main/progression-engine.test.ts`

- [ ] **Step 1: Write failing tests for title tiers**

Add to `src/main/progression-engine.test.ts`:

```typescript
describe('title tiers', () => {
  it('returns no prefix for levels 1-4', () => {
    const title = ProgressionEngine.computeTitle(
      {
        writing: 100,
        research: 50,
        code: 0,
        data: 0,
        visual: 0,
        organization: 0,
        communication: 0
      },
      3 // overall level
    )
    expect(title['zh-TW']).not.toContain('見習')
    expect(title.en).not.toContain('Apprentice')
  })

  it('returns Apprentice prefix for levels 5-9', () => {
    const title = ProgressionEngine.computeTitle(
      {
        writing: 100,
        research: 50,
        code: 0,
        data: 0,
        visual: 0,
        organization: 0,
        communication: 0
      },
      5
    )
    expect(title['zh-TW']).toMatch(/^見習・/)
    expect(title.en).toMatch(/^Apprentice /)
  })

  it('returns Skilled prefix for levels 10-14', () => {
    const title = ProgressionEngine.computeTitle(
      {
        writing: 100,
        research: 50,
        code: 0,
        data: 0,
        visual: 0,
        organization: 0,
        communication: 0
      },
      12
    )
    expect(title['zh-TW']).toMatch(/^熟練・/)
    expect(title.en).toMatch(/^Skilled /)
  })

  it('returns Veteran prefix for levels 15-19', () => {
    const title = ProgressionEngine.computeTitle(
      {
        writing: 100,
        research: 50,
        code: 0,
        data: 0,
        visual: 0,
        organization: 0,
        communication: 0
      },
      17
    )
    expect(title['zh-TW']).toMatch(/^資深・/)
    expect(title.en).toMatch(/^Veteran /)
  })

  it('returns Legendary prefix for level 20+', () => {
    const title = ProgressionEngine.computeTitle(
      {
        writing: 100,
        research: 50,
        code: 0,
        data: 0,
        visual: 0,
        organization: 0,
        communication: 0
      },
      20
    )
    expect(title['zh-TW']).toMatch(/^傳奇・/)
    expect(title.en).toMatch(/^Legendary /)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm run test:unit -- src/main/progression-engine.test.ts`
Expected: FAIL (computeTitle takes 1 arg, not 2)

- [ ] **Step 3: Update computeTitle to accept overallLevel**

Modify `src/main/progression-engine.ts` — change `computeTitle` signature from:

```typescript
static computeTitle(skills: Record<SkillCategory, number>): LocalizedString
```

To:

```typescript
static computeTitle(
  skills: Record<SkillCategory, number>,
  overallLevel: number = 0
): LocalizedString
```

At the end of the method, before returning the base title, add tier prefix logic:

```typescript
const tierPrefix = ProgressionEngine.getTierPrefix(overallLevel)
if (tierPrefix) {
  return {
    'zh-TW': `${tierPrefix['zh-TW']}・${baseTitle['zh-TW']}`,
    en: `${tierPrefix.en} ${baseTitle.en}`
  }
}
return baseTitle
```

Add private static method:

```typescript
private static getTierPrefix(level: number): LocalizedString | null {
  if (level >= 20) return { 'zh-TW': '傳奇', en: 'Legendary' }
  if (level >= 15) return { 'zh-TW': '資深', en: 'Veteran' }
  if (level >= 10) return { 'zh-TW': '熟練', en: 'Skilled' }
  if (level >= 5) return { 'zh-TW': '見習', en: 'Apprentice' }
  return null
}
```

Also update the internal callsite in `awardXP()` where `computeTitle` is called — pass `overallLevel` from the computed state. Look for the line that calls `ProgressionEngine.computeTitle(skillXPs)` and change to `ProgressionEngine.computeTitle(skillXPs, overallLevel)`.

Additionally, in `awardXP()`, detect tier boundary crossings. Before the title computation, compute old tier prefix with the previous overall level. After computing the new title, compare tiers. If the tier changed, include a `tierChanged: true` flag in the `XPAwardResult`. The renderer's `useProgression` hook will check this flag and show a tier-up toast via the existing `title:changed` EventBus event — the QuestNotification component will also listen for `title:changed` events that include a tier upgrade and render: "稱號晉升：{new title}" using the `titles.tierUp` i18n key.

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm run test:unit -- src/main/progression-engine.test.ts`
Expected: ALL PASS (existing + new tier tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/progression-engine.ts src/main/progression-engine.test.ts
git commit -m "feat: add title tier prefixes every 5 levels"
```

---

## Chunk 3: IPC Wiring & Integration

### Task 7: Wire Quest IPC Channels

**Files:**

- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/chat.ts`
- Modify: `src/renderer/src/game/types.ts`

- [ ] **Step 1: Add quest channels to preload**

Add to the `api` object in `src/preload/index.ts`:

```typescript
// Quest IPC channels
getQuests: (): Promise<import('../shared/types').PlayerQuest[]> =>
  ipcRenderer.invoke('quests:get-all'),

getQuestBoardSuggestion: (): Promise<import('../shared/types').QuestBoardSuggestion | null> =>
  ipcRenderer.invoke('quests:get-board-suggestion'),

onQuestsUpdated: (
  callback: (result: import('../shared/types').QuestCheckResult) => void
): (() => void) => {
  const handler = (_event: unknown, result: import('../shared/types').QuestCheckResult): void =>
    callback(result)
  ipcRenderer.on('quests:updated', handler)
  return () => ipcRenderer.removeListener('quests:updated', handler)
},

onQuestDiscovered: (
  callback: (data: { questDefId: string; visibility: 'hinted' | 'visible' }) => void
): (() => void) => {
  const handler = (
    _event: unknown,
    data: { questDefId: string; visibility: 'hinted' | 'visible' }
  ): void => callback(data)
  ipcRenderer.on('quests:discovered', handler)
  return () => ipcRenderer.removeListener('quests:discovered', handler)
},
```

- [ ] **Step 2: Register IPC handlers in main**

Add to `src/main/index.ts` (after progression handlers). First, instantiate QuestEngine:

```typescript
import { QuestEngine } from './quest-engine'
import { SqliteQuestRepository } from './db/quest-repository'

const questRepo = new SqliteQuestRepository(db)
const questEngine = new QuestEngine(questRepo, xpRepo)

// Seed starter quests on player creation
questEngine.seedStarterQuests('player-1')
```

Then register handlers:

```typescript
ipcMain.handle('quests:get-all', () => {
  try {
    return questEngine.getPlayerQuests('player-1')
  } catch (err) {
    console.error('[ipc] quests:get-all failed:', err)
    return []
  }
})

ipcMain.handle('quests:get-board-suggestion', () => {
  try {
    return questEngine.getQuestBoardSuggestion('player-1')
  } catch (err) {
    console.error('[ipc] quests:get-board-suggestion failed:', err)
    return null
  }
})
```

- [ ] **Step 3: Add quest check to chat.ts after XP award**

Add after the existing XP award block in `src/main/chat.ts` (~line 565), inside the same `if (fullTextResponse && progressionEngine ...)` block:

```typescript
// Check quests (non-critical)
if (questEngine) {
  try {
    const questResult = questEngine.checkQuests('player-1')
    if (!webContents.isDestroyed()) {
      if (questResult.completed.length > 0 || questResult.discovered.length > 0) {
        webContents.send('quests:updated', questResult)
      }
    }
  } catch (err) {
    console.error(`[chat] Failed to check quests:`, err)
  }
}
```

Note: `questEngine` must be accessible in `chat.ts`. Follow the same pattern used for `progressionEngine` — passed as parameter or imported from the module that creates it.

- [ ] **Step 4: Extend EventBus types**

Modify `src/renderer/src/game/types.ts` — update existing `quest:completed` event and add new events to `GameEvents`:

```typescript
// Existing — modify to add xpReward:
'quest:completed': { questId: string; title: LocalizedString; xpReward: number }

// New events:
'quest:discovered': { questDefId: string; visibility: 'hinted' | 'visible' }
'backpack:toggle': void
'questboard:toggle': void
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts src/main/index.ts src/main/chat.ts src/renderer/src/game/types.ts
git commit -m "feat: wire quest IPC channels and integrate QuestEngine into chat flow"
```

---

### Task 8: Create useQuests Hook

**Files:**

- Create: `src/renderer/src/hooks/useQuests.ts`

- [ ] **Step 1: Implement useQuests hook**

Create `src/renderer/src/hooks/useQuests.ts` (mirrors useProgression pattern):

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { PlayerQuest, QuestCheckResult } from '../../../shared/types'
import { EventBus } from '../game/EventBus'

export function useQuests() {
  const [quests, setQuests] = useState<PlayerQuest[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await window.api.getQuests()
      setQuests(result)
    } catch (err) {
      console.error('[useQuests] Failed to fetch quests:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    const cleanupUpdated = window.api.onQuestsUpdated((result: QuestCheckResult) => {
      setQuests(result.quests)

      // Emit EventBus events for UI reactions
      for (const c of result.completed) {
        EventBus.emit('quest:completed', {
          questId: c.questDefId,
          title: c.title,
          xpReward: c.xpReward
        })
      }

      for (const d of result.discovered) {
        EventBus.emit('quest:discovered', d)
      }
    })

    const cleanupDiscovered = window.api.onQuestDiscovered(() => {
      refresh()
    })

    return () => {
      cleanupUpdated()
      cleanupDiscovered()
    }
  }, [refresh])

  const activeCount = quests.filter(
    (q) => q.status === 'active' && q.visibility === 'visible'
  ).length

  return { quests, loading, activeCount, refresh }
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useQuests.ts
git commit -m "feat: add useQuests hook with IPC listener and EventBus integration"
```

---

## Chunk 4: UI Components

### Task 9: Add i18n Keys

**Files:**

- Modify: `src/renderer/src/i18n/locales/zh-TW.json`
- Modify: `src/renderer/src/i18n/locales/en.json`

- [ ] **Step 1: Add backpack, quest, and title tier keys to zh-TW**

Add these nested keys to `src/renderer/src/i18n/locales/zh-TW.json`:

```json
"backpack": {
  "title": "背包",
  "tabs": {
    "items": "物品",
    "quests": "任務",
    "achievements": "成就",
    "cosmetics": "裝飾"
  },
  "unavailable": "即將推出"
},
"quests": {
  "title": "任務",
  "filters": {
    "all": "全部",
    "active": "進行中",
    "completed": "已完成"
  },
  "count": "進行中 {{active}} · 已完成 {{completed}}",
  "progress": "進度",
  "reward": "+{{amount}} XP",
  "earned": "已獲得 +{{amount}} XP ✓",
  "mystery": "??? 未知任務",
  "discovered": "新任務發現！打開背包查看",
  "completed": "任務完成！",
  "repeatCount": "已完成 {{count}} 次"
},
"questBoard": {
  "title": "任務板",
  "suggestion": "你的{{skill}}技能看起來還有很大的成長空間——試著找{{npc}}聊聊吧！"
}
```

Also add title tier keys under the existing `"titles"` object:

```json
"tiers": {
  "apprentice": "見習",
  "skilled": "熟練",
  "veteran": "資深",
  "legendary": "傳奇"
},
"tierUp": "稱號晉升"
```

- [ ] **Step 2: Add matching keys to en.json**

Add equivalent keys to `src/renderer/src/i18n/locales/en.json`:

```json
"backpack": {
  "title": "Backpack",
  "tabs": {
    "items": "Items",
    "quests": "Quests",
    "achievements": "Achievements",
    "cosmetics": "Cosmetics"
  },
  "unavailable": "Coming Soon"
},
"quests": {
  "title": "Quests",
  "filters": {
    "all": "All",
    "active": "Active",
    "completed": "Completed"
  },
  "count": "Active {{active}} · Completed {{completed}}",
  "progress": "Progress",
  "reward": "+{{amount}} XP",
  "earned": "Earned +{{amount}} XP ✓",
  "mystery": "??? Unknown Quest",
  "discovered": "New quest discovered! Open backpack to see",
  "completed": "Quest Complete!",
  "repeatCount": "Completed {{count}} times"
},
"questBoard": {
  "title": "Quest Board",
  "suggestion": "Your {{skill}} skill has room to grow — try talking to {{npc}}!"
}
```

Title tier keys under `"titles"`:

```json
"tiers": {
  "apprentice": "Apprentice",
  "skilled": "Skilled",
  "veteran": "Veteran",
  "legendary": "Legendary"
},
"tierUp": "Title Promoted"
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/zh-TW.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(i18n): add backpack, quest, and title tier keys for zh-TW and en"
```

---

### Task 10: Build QuestCard Component

**Files:**

- Create: `src/renderer/src/components/ui/QuestCard.tsx`

- [ ] **Step 1: Implement QuestCard with three variants**

Create `src/renderer/src/components/ui/QuestCard.tsx`:

The component renders three variants based on quest state:

- **Visible/Active:** Full card with name, description, progress bar (or category chips for `category_coverage`), skill tag, XP reward
- **Hinted:** Mystery card with "??? 未知任務" and hint text, dimmed style
- **Completed:** Faded card (60% opacity) with checkmark and earned XP

Props: `{ quest: PlayerQuest; locale: string }`

Use the color system from the spec:

- Card bg: `rgba(200, 180, 140, 0.08)`, border: `1px solid rgba(200, 180, 140, 0.25)`
- Headings: `#e8d5a8`, muted: `#a89060`
- Progress track: `rgba(200, 180, 140, 0.15)`, fill: per-skill color from `SKILL_COLORS`
- XP reward: `#ffd700`
- Completed: 60% opacity, muted colors

The `SKILL_COLORS` map (already in SkillsPanel.tsx lines 17-23):

```typescript
const SKILL_COLORS: Record<SkillCategory, string> = {
  writing: '#e8b44c',
  research: '#5bb5e8',
  code: '#a78bfa',
  data: '#4ade80',
  communication: '#f472b6',
  organization: '#fb923c',
  visual: '#c084fc'
}
```

Duplicate this map in QuestCard (it's 7 entries — shared constant extraction is optional).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/QuestCard.tsx
git commit -m "feat(ui): add QuestCard component with visible/hinted/completed variants"
```

---

### Task 11: Build QuestsTab Component

**Files:**

- Create: `src/renderer/src/components/ui/QuestsTab.tsx`

- [ ] **Step 1: Implement QuestsTab with filter sub-tabs**

Create `src/renderer/src/components/ui/QuestsTab.tsx`:

Props: `{ quests: PlayerQuest[]; locale: string }`

Layout:

- Header: "📜 任務" + count summary using `t('quests.count', { active, completed })`
- Filter sub-tabs: 全部 / 進行中 / 已完成 (state: `'all' | 'active' | 'completed'`)
- Filtered quest card list using QuestCard
- Active tab highlighted with `border-bottom: 2px solid #c4a46c`

Filter logic:

- `all`: show all quests
- `active`: show quests where `status === 'active'`
- `completed`: show quests where `status === 'completed'`

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/QuestsTab.tsx
git commit -m "feat(ui): add QuestsTab component with filter sub-tabs"
```

---

### Task 12: Build BackpackPanel Component

**Files:**

- Create: `src/renderer/src/components/ui/BackpackPanel.tsx`

- [ ] **Step 1: Implement BackpackPanel with tab system**

Create `src/renderer/src/components/ui/BackpackPanel.tsx`:

Props: `{ visible: boolean; onClose: () => void; quests: PlayerQuest[]; locale: string }`

Layout (matches mockup from brainstorming):

- Full-screen overlay: `rgba(0, 0, 0, 0.85)` backdrop
- Panel: `rgba(10, 10, 30, 0.96)` bg, `3px solid rgba(200, 180, 140, 0.6)` border
- Left sidebar (60px): icon tabs — 📦物品, 📜任務, 🏆成就, 👘裝飾
- Active tab: `2px solid #c4a46c` border, `rgba(200, 180, 140, 0.15)` bg
- Inactive tabs: dimmed (35% opacity), `cursor: not-allowed`
- Content area: renders QuestsTab (only active tab in Phase 3B)
- ESC key listener calls `onClose()`
- Keyboard: Listen for `B` key to toggle (handled by parent, not this component)

Tab state: `useState<'items' | 'quests' | 'achievements' | 'cosmetics'>('quests')`
Only `quests` is enabled. Others show `t('backpack.unavailable')` placeholder.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/BackpackPanel.tsx
git commit -m "feat(ui): add BackpackPanel overlay with tab system"
```

---

### Task 13: Build QuestNotification Component

**Files:**

- Create: `src/renderer/src/components/ui/QuestNotification.tsx`

- [ ] **Step 1: Implement QuestNotification**

Create `src/renderer/src/components/ui/QuestNotification.tsx`:

Listens to EventBus events:

- `quest:completed` -> Large toast: "🎉 任務完成：{name} +{xp} XP", auto-dismiss 2.5s
- `quest:discovered` -> Small toast: "📜 新任務發現！打開背包查看", auto-dismiss 2s

Pattern: Similar to LevelUpBanner — fade in/out animation, positioned top-center, `pointerEvents: 'none'`.

Queue multiple notifications (show one at a time, shift after dismiss).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/QuestNotification.tsx
git commit -m "feat(ui): add QuestNotification toast for completions and discoveries"
```

---

### Task 14: Build QuestBoardPanel Component

**Files:**

- Create: `src/renderer/src/components/ui/QuestBoardPanel.tsx`

- [ ] **Step 1: Implement QuestBoardPanel**

Create `src/renderer/src/components/ui/QuestBoardPanel.tsx`:

Props: `{ visible: boolean; onClose: () => void; locale: string }`

Fetches suggestion via `window.api.getQuestBoardSuggestion()` when `visible` becomes true (use `useEffect` with `visible` dependency).

Layout: Reuses DialoguePanel visual style (same bg, border, fonts). Shows:

- Header: "📋 任務板" using `t('questBoard.title')`
- Suggestion message (localized from the QuestBoardSuggestion)
- Close button or ESC key listener

This is a static display panel, not a chat. No AI call.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/QuestBoardPanel.tsx
git commit -m "feat(ui): add QuestBoardPanel for Tavern skill suggestions"
```

---

## Chunk 5: HUD Integration & Final Wiring

### Task 15: Add Backpack Icon to HUD

**Files:**

- Modify: `src/renderer/src/components/ui/HUD.tsx`

- [ ] **Step 1: Add backpack icon with badge count**

Add a backpack button to the HUD (before the level/XP section, around line 97). Shows:

- 🎒 icon
- Badge count overlay (small circle with `activeCount` number, hidden when 0)
- `onClick`: emit `EventBus.emit('backpack:toggle')`

The `activeCount` prop comes from the parent (which calls `useQuests`).

Style: same as existing HUD elements — `color: '#c4a46c'`, subtle hover effect.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/HUD.tsx
git commit -m "feat(hud): add backpack icon with active quest badge count"
```

---

### Task 16: Mount All New Components in GameUI

**Files:**

- Modify: `src/renderer/src/App.tsx` (the main overlay mount point — verify this is where HUD, SkillsPanel, DialoguePanel are rendered)

- [ ] **Step 1: Add state and mount BackpackPanel, QuestNotification, QuestBoardPanel**

In the main game UI component:

- Add `useQuests()` hook call
- Add `backpackOpen` state, toggled by `B` key and EventBus `backpack:toggle`
- Add `questBoardOpen` state, toggled by EventBus `questboard:toggle` event (emitted from Phaser when player interacts with the quest board object in the Tavern zone, or via a dedicated NPC proximity interaction)
- Mount `<BackpackPanel>`, `<QuestNotification>`, `<QuestBoardPanel>`
- Pass `quests` and `activeCount` to HUD and BackpackPanel

Key event handling:

- Listen for `B` key globally (only when no dialogue is open and no other overlay is active)
- Toggle backpack open/close
- ESC closes backpack (handled inside BackpackPanel)

- [ ] **Step 2: Run dev server and verify**

Run: `npm run dev`
Expected:

- Press B -> backpack opens with quest tab showing 3 starter quests
- Press ESC -> backpack closes
- HUD shows 🎒 icon with badge "3"

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: mount BackpackPanel, QuestNotification, QuestBoardPanel in game UI"
```

---

### Task 17: Final Integration Test

- [ ] **Step 1: Run full test suite**

Run: `npm run test:unit`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS (fix any issues)

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

Verify:

1. Press B -> backpack opens, shows 3 visible starter quests (First Contact, Knowledge Collector, Daily Adventurer)
2. Quest cards show correct bilingual names, descriptions, progress (0/N), XP rewards
3. Press ESC -> backpack closes
4. HUD shows 🎒 with badge count "3"
5. Have a conversation with Scholar -> First Contact completes, toast appears
6. Open backpack -> First Contact shows as completed, Knowledge Collector shows 1/3 progress
7. Have 2 more Research conversations -> Knowledge Collector completes
8. After 3+ conversations in one category -> Diligent Apprentice appears as mystery quest
9. After 2+ different categories -> Renaissance appears as mystery quest
10. Visit Tavern -> quest board shows suggestion for weakest skill
11. Level up past 5 -> title gains "見習・" prefix

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 3B complete — quests, backpack, quest board, title tiers"
```
