import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './db/migrations'
import { SqliteFolderRepository } from './db/folder-repository'
import {
  getApprovedFolders,
  addApprovedFolder,
  removeApprovedFolder,
  isPathApproved,
  initFolderManager
} from './folder-manager'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/mock/userData') },
  dialog: { showOpenDialog: vi.fn() }
}))

describe('folder-manager (SQLite-backed)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    const repo = new SqliteFolderRepository(db)
    initFolderManager(repo)
  })

  afterEach(() => db.close())

  describe('getApprovedFolders', () => {
    it('returns empty array when no folders added', () => {
      expect(getApprovedFolders()).toEqual([])
    })
  })

  describe('addApprovedFolder', () => {
    it('adds a new folder', () => {
      const result = addApprovedFolder('/home/user/project')
      expect(result.path).toBe('/home/user/project')
      expect(result.label).toBe('project')
      expect(result.addedAt).toBeGreaterThan(0)
    })

    it('returns existing folder without duplicating', () => {
      const first = addApprovedFolder('/home/user/project')
      const second = addApprovedFolder('/home/user/project')
      expect(second.addedAt).toBe(first.addedAt)
      expect(getApprovedFolders()).toHaveLength(1)
    })

    it('normalizes the path before adding', () => {
      const result = addApprovedFolder('/home/user/../user/project/')
      expect(result.path).toBe('/home/user/project')
    })
  })

  describe('removeApprovedFolder', () => {
    it('removes the specified folder', () => {
      addApprovedFolder('/home/user/project')
      addApprovedFolder('/tmp/workspace')
      removeApprovedFolder('/home/user/project')
      const folders = getApprovedFolders()
      expect(folders).toHaveLength(1)
      expect(folders[0].path).toBe('/tmp/workspace')
    })
  })

  describe('isPathApproved', () => {
    beforeEach(() => {
      addApprovedFolder('/home/user/project')
    })

    it('returns true for a path inside an approved folder', () => {
      expect(isPathApproved('/home/user/project/src/index.ts')).toBe(true)
    })

    it('returns true for the approved folder itself', () => {
      expect(isPathApproved('/home/user/project')).toBe(true)
    })

    it('returns false for a path outside approved folders', () => {
      expect(isPathApproved('/etc/passwd')).toBe(false)
    })

    it('returns false for a sibling path sharing a prefix', () => {
      expect(isPathApproved('/home/user/project2/file.ts')).toBe(false)
    })

    it('returns false when no folders are approved', () => {
      removeApprovedFolder('/home/user/project')
      expect(isPathApproved('/home/user/project/file.ts')).toBe(false)
    })
  })
})
