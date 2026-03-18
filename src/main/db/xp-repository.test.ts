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
