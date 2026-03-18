import Database from 'better-sqlite3'
import { SKILL_CATEGORIES, type SkillCategory } from '../../shared/types'

export interface QuestRow {
  id: string
  playerId: string
  questDefId: string
  visibility: 'hinted' | 'visible'
  status: 'active' | 'completed'
  repeatCount: number
  discoveredAt: number
  completedAt: number | null
}

export class SqliteQuestRepository {
  constructor(private db: Database.Database) {}

  upsert(quest: QuestRow): void {
    this.db
      .prepare(
        `INSERT INTO quests (id, player_id, quest_def_id, visibility, status, repeat_count, discovered_at, completed_at)
         VALUES (@id, @playerId, @questDefId, @visibility, @status, @repeatCount, @discoveredAt, @completedAt)
         ON CONFLICT(player_id, quest_def_id) DO UPDATE SET
           visibility = @visibility,
           status = @status,
           repeat_count = @repeatCount,
           completed_at = @completedAt`
      )
      .run({
        id: quest.id,
        playerId: quest.playerId,
        questDefId: quest.questDefId,
        visibility: quest.visibility,
        status: quest.status,
        repeatCount: quest.repeatCount,
        discoveredAt: quest.discoveredAt,
        completedAt: quest.completedAt
      })
  }

  getByPlayer(playerId: string): QuestRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, player_id as playerId, quest_def_id as questDefId, visibility, status,
                repeat_count as repeatCount, discovered_at as discoveredAt, completed_at as completedAt
         FROM quests WHERE player_id = ?`
      )
      .all(playerId) as QuestRow[]
    return rows
  }

  complete(questId: string, completedAt: number): void {
    this.db
      .prepare(
        `UPDATE quests SET status = 'completed', completed_at = ?, repeat_count = repeat_count + 1
         WHERE id = ?`
      )
      .run(completedAt, questId)
  }

  resetForRepeat(questId: string): void {
    this.db
      .prepare(`UPDATE quests SET status = 'active', completed_at = NULL WHERE id = ?`)
      .run(questId)
  }

  getConversationCounts(playerId: string): Record<SkillCategory, number> {
    const rows = this.db
      .prepare(
        `SELECT skill_category as category, COUNT(*) as count
         FROM xp_ledger WHERE player_id = ? GROUP BY skill_category`
      )
      .all(playerId) as { category: string; count: number }[]

    const counts = {} as Record<SkillCategory, number>
    for (const cat of SKILL_CATEGORIES) counts[cat] = 0
    for (const row of rows) counts[row.category as SkillCategory] = row.count
    return counts
  }

  getDailyConversationCount(playerId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM xp_ledger
         WHERE player_id = ?
         AND DATE(created_at / 1000, 'unixepoch', 'localtime') = DATE('now', 'localtime')`
      )
      .get(playerId) as { count: number }
    return row.count
  }

  getDistinctCategoryCount(playerId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(DISTINCT skill_category) as count FROM xp_ledger WHERE player_id = ?`)
      .get(playerId) as { count: number }
    return row.count
  }

  getMaxCategoryCount(playerId: string): number {
    const row = this.db
      .prepare(
        `SELECT MAX(cnt) as maxCount FROM (
           SELECT COUNT(*) as cnt FROM xp_ledger WHERE player_id = ? GROUP BY skill_category
         )`
      )
      .get(playerId) as { maxCount: number | null }
    return row.maxCount ?? 0
  }
}
