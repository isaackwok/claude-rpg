import Database from 'better-sqlite3'
import type { HomePlacement } from '../../shared/cosmetic-types'
import { COSMETIC_DEFINITIONS } from '../cosmetic-definitions'

export interface UnlockedCosmetic {
  cosmeticDefId: string
  unlockedAt: number
  equipped: boolean
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export class SqliteCosmeticRepository {
  constructor(private db: Database.Database) {}

  /** Unlock a cosmetic for a player. Silently ignores duplicates (INSERT OR IGNORE). */
  unlock(playerId: string, cosmeticDefId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO cosmetics (player_id, cosmetic_def_id, unlocked_at, equipped)
         VALUES (?, ?, ?, 0)`
      )
      .run(playerId, cosmeticDefId, Date.now())
  }

  /** Returns all unlocked cosmetics for the player. */
  getAll(playerId: string): UnlockedCosmetic[] {
    const rows = this.db
      .prepare(
        `SELECT cosmetic_def_id, unlocked_at, equipped FROM cosmetics WHERE player_id = ?`
      )
      .all(playerId) as { cosmetic_def_id: string; unlocked_at: number; equipped: number }[]
    return rows.map((r) => ({
      cosmeticDefId: r.cosmetic_def_id,
      unlockedAt: r.unlocked_at,
      equipped: r.equipped === 1
    }))
  }

  /**
   * Equip a cosmetic. Auto-unequips all other cosmetics in the same layer.
   * Decorations have no layer — equipping them has no layer conflict.
   */
  equip(playerId: string, cosmeticDefId: string): void {
    const def = COSMETIC_DEFINITIONS.find((c) => c.id === cosmeticDefId)
    if (!def) return

    // If the cosmetic has a layer, unequip all cosmetics sharing that layer
    if (def.layer) {
      const sameLayerIds = COSMETIC_DEFINITIONS.filter((c) => c.layer === def.layer).map(
        (c) => c.id
      )
      const placeholders = sameLayerIds.map(() => '?').join(', ')
      this.db
        .prepare(
          `UPDATE cosmetics SET equipped = 0
           WHERE player_id = ? AND cosmetic_def_id IN (${placeholders})`
        )
        .run(playerId, ...sameLayerIds)
    }

    this.db
      .prepare(`UPDATE cosmetics SET equipped = 1 WHERE player_id = ? AND cosmetic_def_id = ?`)
      .run(playerId, cosmeticDefId)
  }

  /** Unequip a cosmetic. */
  unequip(playerId: string, cosmeticDefId: string): void {
    this.db
      .prepare(`UPDATE cosmetics SET equipped = 0 WHERE player_id = ? AND cosmetic_def_id = ?`)
      .run(playerId, cosmeticDefId)
  }

  /**
   * Place a decoration at a tile position.
   * Uses INSERT OR REPLACE so re-placing the same cosmetic moves it.
   * Placing on an occupied tile will fail with a UNIQUE constraint error
   * (UNIQUE(player_id, tile_x, tile_y)).
   */
  placeDecoration(playerId: string, cosmeticDefId: string, tileX: number, tileY: number): void {
    // Remove any existing placement for this cosmetic first (to allow moving it)
    this.db
      .prepare(`DELETE FROM home_decorations WHERE player_id = ? AND cosmetic_def_id = ?`)
      .run(playerId, cosmeticDefId)

    this.db
      .prepare(
        `INSERT INTO home_decorations (id, player_id, cosmetic_def_id, tile_x, tile_y, placed_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(generateId(), playerId, cosmeticDefId, tileX, tileY, Date.now())
  }

  /** Remove a decoration placement. */
  removeDecoration(playerId: string, cosmeticDefId: string): void {
    this.db
      .prepare(`DELETE FROM home_decorations WHERE player_id = ? AND cosmetic_def_id = ?`)
      .run(playerId, cosmeticDefId)
  }

  /** Returns all home decoration placements for the player. */
  getPlacements(playerId: string): HomePlacement[] {
    const rows = this.db
      .prepare(
        `SELECT cosmetic_def_id, tile_x, tile_y FROM home_decorations WHERE player_id = ?`
      )
      .all(playerId) as { cosmetic_def_id: string; tile_x: number; tile_y: number }[]
    return rows.map((r) => ({
      cosmeticDefId: r.cosmetic_def_id,
      tileX: r.tile_x,
      tileY: r.tile_y
    }))
  }
}
