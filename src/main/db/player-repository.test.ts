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
