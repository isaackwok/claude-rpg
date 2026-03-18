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
