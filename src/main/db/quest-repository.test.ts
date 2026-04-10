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

  it('excludes bonus XP from conversation counts', () => {
    const stmt = db.prepare(
      'INSERT INTO xp_ledger (player_id, skill_category, amount, agent_id, created_at, source) VALUES (?, ?, ?, ?, ?, ?)'
    )
    stmt.run('player-1', 'research', 5, 'scholar', Date.now(), 'conversation')
    stmt.run('player-1', 'research', 30, 'quest', Date.now(), 'quest_bonus')
    stmt.run('player-1', 'writing', 20, 'achievement', Date.now(), 'achievement_bonus')
    stmt.run('player-1', 'writing', 5, 'scribe', Date.now(), 'conversation')

    const counts = repo.getConversationCounts('player-1')
    expect(counts.research).toBe(1)
    expect(counts.writing).toBe(1)

    const daily = repo.getDailyConversationCount('player-1')
    expect(daily).toBe(2)

    const distinct = repo.getDistinctCategoryCount('player-1')
    expect(distinct).toBe(2)

    const max = repo.getMaxCategoryCount('player-1')
    expect(max).toBe(1)
  })
})
