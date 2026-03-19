import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../db/migrations'
import { SqliteCosmeticRepository } from '../db/cosmetic-repository'

describe('SqliteCosmeticRepository', () => {
  let db: Database.Database
  let repo: SqliteCosmeticRepository

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
    repo = new SqliteCosmeticRepository(db)
  })

  afterEach(() => db.close())

  describe('unlock() and getAll()', () => {
    it('stores and retrieves an unlocked cosmetic', () => {
      repo.unlock('player-1', 'apprentice-hat')

      const all = repo.getAll('player-1')
      expect(all).toHaveLength(1)
      expect(all[0].cosmeticDefId).toBe('apprentice-hat')
      expect(all[0].equipped).toBe(false)
      expect(all[0].unlockedAt).toBeGreaterThan(0)
    })

    it('stores multiple unlocked cosmetics', () => {
      repo.unlock('player-1', 'apprentice-hat')
      repo.unlock('player-1', 'veteran-cape')
      repo.unlock('player-1', 'town-banner')

      const all = repo.getAll('player-1')
      expect(all).toHaveLength(3)
      const ids = all.map((c) => c.cosmeticDefId)
      expect(ids).toContain('apprentice-hat')
      expect(ids).toContain('veteran-cape')
      expect(ids).toContain('town-banner')
    })

    it('is idempotent — second unlock call does not throw', () => {
      repo.unlock('player-1', 'apprentice-hat')
      expect(() => repo.unlock('player-1', 'apprentice-hat')).not.toThrow()

      const all = repo.getAll('player-1')
      expect(all).toHaveLength(1)
    })

    it('returns empty array when no cosmetics are unlocked', () => {
      const all = repo.getAll('player-1')
      expect(all).toHaveLength(0)
    })
  })

  describe('equip()', () => {
    it('sets the equipped flag for the target cosmetic', () => {
      repo.unlock('player-1', 'apprentice-hat')
      repo.equip('player-1', 'apprentice-hat')

      const all = repo.getAll('player-1')
      const hat = all.find((c) => c.cosmeticDefId === 'apprentice-hat')
      expect(hat?.equipped).toBe(true)
    })

    it('auto-unequips other cosmetics in the same layer', () => {
      // Both are 'hat' layer
      repo.unlock('player-1', 'apprentice-hat')
      repo.unlock('player-1', 'champion-hat')

      repo.equip('player-1', 'apprentice-hat')
      repo.equip('player-1', 'champion-hat')

      const all = repo.getAll('player-1')
      const apprentice = all.find((c) => c.cosmeticDefId === 'apprentice-hat')
      const champion = all.find((c) => c.cosmeticDefId === 'champion-hat')

      expect(apprentice?.equipped).toBe(false)
      expect(champion?.equipped).toBe(true)
    })

    it('does not unequip cosmetics in different layers', () => {
      repo.unlock('player-1', 'apprentice-hat')
      repo.unlock('player-1', 'veteran-cape')

      repo.equip('player-1', 'apprentice-hat')
      repo.equip('player-1', 'veteran-cape')

      const all = repo.getAll('player-1')
      const hat = all.find((c) => c.cosmeticDefId === 'apprentice-hat')
      const cape = all.find((c) => c.cosmeticDefId === 'veteran-cape')

      // Equipping a cape should NOT unequip the hat
      expect(hat?.equipped).toBe(true)
      expect(cape?.equipped).toBe(true)
    })
  })

  describe('unequip()', () => {
    it('clears the equipped flag', () => {
      repo.unlock('player-1', 'apprentice-hat')
      repo.equip('player-1', 'apprentice-hat')
      repo.unequip('player-1', 'apprentice-hat')

      const all = repo.getAll('player-1')
      const hat = all.find((c) => c.cosmeticDefId === 'apprentice-hat')
      expect(hat?.equipped).toBe(false)
    })

    it('does not throw when unequipping an already-unequipped cosmetic', () => {
      repo.unlock('player-1', 'apprentice-hat')
      expect(() => repo.unequip('player-1', 'apprentice-hat')).not.toThrow()
    })
  })

  describe('placeDecoration() and getPlacements()', () => {
    it('stores and retrieves a decoration placement', () => {
      repo.unlock('player-1', 'town-banner')
      repo.placeDecoration('player-1', 'town-banner', 5, 10)

      const placements = repo.getPlacements('player-1')
      expect(placements).toHaveLength(1)
      expect(placements[0].cosmeticDefId).toBe('town-banner')
      expect(placements[0].tileX).toBe(5)
      expect(placements[0].tileY).toBe(10)
    })

    it('stores multiple decoration placements', () => {
      repo.unlock('player-1', 'town-banner')
      repo.unlock('player-1', 'npc-statue')
      repo.placeDecoration('player-1', 'town-banner', 3, 4)
      repo.placeDecoration('player-1', 'npc-statue', 7, 8)

      const placements = repo.getPlacements('player-1')
      expect(placements).toHaveLength(2)
    })

    it('allows moving a decoration by placing it again at a new tile', () => {
      repo.unlock('player-1', 'town-banner')
      repo.placeDecoration('player-1', 'town-banner', 5, 10)
      repo.placeDecoration('player-1', 'town-banner', 6, 11)

      const placements = repo.getPlacements('player-1')
      expect(placements).toHaveLength(1)
      expect(placements[0].tileX).toBe(6)
      expect(placements[0].tileY).toBe(11)
    })

    it('returns empty array when no decorations are placed', () => {
      expect(repo.getPlacements('player-1')).toHaveLength(0)
    })
  })

  describe('removeDecoration()', () => {
    it('removes an existing placement', () => {
      repo.unlock('player-1', 'town-banner')
      repo.placeDecoration('player-1', 'town-banner', 5, 10)
      repo.removeDecoration('player-1', 'town-banner')

      const placements = repo.getPlacements('player-1')
      expect(placements).toHaveLength(0)
    })

    it('does not throw when removing a non-existent placement', () => {
      expect(() => repo.removeDecoration('player-1', 'town-banner')).not.toThrow()
    })
  })

  describe('tile uniqueness', () => {
    it('throws when placing two different decorations on the same tile', () => {
      repo.unlock('player-1', 'town-banner')
      repo.unlock('player-1', 'npc-statue')
      repo.placeDecoration('player-1', 'town-banner', 5, 10)

      expect(() => repo.placeDecoration('player-1', 'npc-statue', 5, 10)).toThrow()
    })
  })
})
