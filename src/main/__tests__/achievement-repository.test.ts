import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../db/migrations'
import { SqliteAchievementRepository } from '../db/achievement-repository'

describe('SqliteAchievementRepository', () => {
  let db: Database.Database
  let repo: SqliteAchievementRepository

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
    repo = new SqliteAchievementRepository(db)
  })

  afterEach(() => db.close())

  describe('unlock() and getUnlocked()', () => {
    it('stores and retrieves an unlocked achievement', () => {
      repo.unlock('player-1', 'first-steps')

      const unlocked = repo.getUnlocked('player-1')
      expect(unlocked).toHaveLength(1)
      expect(unlocked).toContain('first-steps')
    })

    it('stores multiple unlocked achievements', () => {
      repo.unlock('player-1', 'first-steps')
      repo.unlock('player-1', 'rising-star')
      repo.unlock('player-1', 'town-explorer')

      const unlocked = repo.getUnlocked('player-1')
      expect(unlocked).toHaveLength(3)
      expect(unlocked).toContain('first-steps')
      expect(unlocked).toContain('rising-star')
      expect(unlocked).toContain('town-explorer')
    })

    it('is idempotent — second unlock call does not throw', () => {
      repo.unlock('player-1', 'first-steps')
      expect(() => repo.unlock('player-1', 'first-steps')).not.toThrow()

      const unlocked = repo.getUnlocked('player-1')
      expect(unlocked).toHaveLength(1)
    })

    it('returns empty array when no achievements are unlocked', () => {
      const unlocked = repo.getUnlocked('player-1')
      expect(unlocked).toHaveLength(0)
    })
  })

  describe('recordZoneVisit() and getZoneVisitCount()', () => {
    it('records a zone visit and counts it', () => {
      repo.recordZoneVisit('player-1', 'town-square')

      expect(repo.getZoneVisitCount('player-1')).toBe(1)
    })

    it('counts distinct zones visited', () => {
      repo.recordZoneVisit('player-1', 'town-square')
      repo.recordZoneVisit('player-1', 'library')
      repo.recordZoneVisit('player-1', 'market')

      expect(repo.getZoneVisitCount('player-1')).toBe(3)
    })

    it('does not double-count the same zone', () => {
      repo.recordZoneVisit('player-1', 'town-square')
      repo.recordZoneVisit('player-1', 'town-square')
      repo.recordZoneVisit('player-1', 'library')

      expect(repo.getZoneVisitCount('player-1')).toBe(2)
    })

    it('returns 0 when no zones visited', () => {
      expect(repo.getZoneVisitCount('player-1')).toBe(0)
    })

    it('returns the list of visited zone ids', () => {
      repo.recordZoneVisit('player-1', 'town-square')
      repo.recordZoneVisit('player-1', 'library')

      const zones = repo.getVisitedZones('player-1')
      expect(zones).toHaveLength(2)
      expect(zones).toContain('town-square')
      expect(zones).toContain('library')
    })
  })

  describe('recordToolUse() and getUsedToolTypes()', () => {
    it('records a tool use and retrieves it', () => {
      repo.recordToolUse('player-1', 'read_file')

      const tools = repo.getUsedToolTypes('player-1')
      expect(tools).toHaveLength(1)
      expect(tools).toContain('read_file')
    })

    it('tracks multiple unique tool types', () => {
      repo.recordToolUse('player-1', 'read_file')
      repo.recordToolUse('player-1', 'web_search')
      repo.recordToolUse('player-1', 'run_command')

      const tools = repo.getUsedToolTypes('player-1')
      expect(tools).toHaveLength(3)
      expect(tools).toContain('read_file')
      expect(tools).toContain('web_search')
      expect(tools).toContain('run_command')
    })

    it('does not double-count the same tool type', () => {
      repo.recordToolUse('player-1', 'read_file')
      repo.recordToolUse('player-1', 'read_file')
      repo.recordToolUse('player-1', 'web_search')

      const tools = repo.getUsedToolTypes('player-1')
      expect(tools).toHaveLength(2)
    })

    it('returns empty array when no tools used', () => {
      expect(repo.getUsedToolTypes('player-1')).toHaveLength(0)
    })
  })
})
