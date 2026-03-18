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
      .map((r) => (r as Record<string, unknown>).name)

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
