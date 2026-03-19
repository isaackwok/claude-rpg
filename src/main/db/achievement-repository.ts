import Database from 'better-sqlite3'

export class SqliteAchievementRepository {
  constructor(private db: Database.Database) {}

  /** Record an achievement unlock. Silently ignores duplicates (INSERT OR IGNORE). */
  unlock(playerId: string, achievementDefId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO achievements (player_id, achievement_def_id, unlocked_at)
         VALUES (?, ?, ?)`
      )
      .run(playerId, achievementDefId, Date.now())
  }

  /** Returns the list of unlocked achievement_def_id strings for the player. */
  getUnlocked(playerId: string): string[] {
    const rows = this.db
      .prepare(`SELECT achievement_def_id FROM achievements WHERE player_id = ?`)
      .all(playerId) as { achievement_def_id: string }[]
    return rows.map((r) => r.achievement_def_id)
  }

  /** Record that the player first visited a zone. Silently ignores duplicates. */
  recordZoneVisit(playerId: string, zoneId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO player_zones (player_id, zone_id, first_visited_at)
         VALUES (?, ?, ?)`
      )
      .run(playerId, zoneId, Date.now())
  }

  /** Returns the number of distinct zones the player has visited. */
  getZoneVisitCount(playerId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(DISTINCT zone_id) as count FROM player_zones WHERE player_id = ?`)
      .get(playerId) as { count: number }
    return row.count
  }

  /** Returns the list of visited zone_id strings for the player. */
  getVisitedZones(playerId: string): string[] {
    const rows = this.db
      .prepare(`SELECT zone_id FROM player_zones WHERE player_id = ?`)
      .all(playerId) as { zone_id: string }[]
    return rows.map((r) => r.zone_id)
  }

  /** Record that the player used a tool type. Silently ignores duplicates. */
  recordToolUse(playerId: string, toolType: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO player_tool_usage (player_id, tool_type, first_used_at)
         VALUES (?, ?, ?)`
      )
      .run(playerId, toolType, Date.now())
  }

  /** Returns the list of distinct tool_type strings the player has used. */
  getUsedToolTypes(playerId: string): string[] {
    const rows = this.db
      .prepare(`SELECT tool_type FROM player_tool_usage WHERE player_id = ?`)
      .all(playerId) as { tool_type: string }[]
    return rows.map((r) => r.tool_type)
  }

  /** Returns the number of distinct NPCs the player has interacted with. */
  getInteractedNpcCount(playerId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(DISTINCT agent_id) as count FROM conversations WHERE player_id = ?`
      )
      .get(playerId) as { count: number }
    return row.count
  }

  /** Returns the number of quests discovered (any visibility) by the player. */
  getDiscoveredQuestCount(playerId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM quests WHERE player_id = ?`)
      .get(playerId) as { count: number }
    return row.count
  }
}
