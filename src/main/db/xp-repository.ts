import type Database from 'better-sqlite3'
import { SKILL_CATEGORIES, type SkillCategory } from '../../shared/types'

export class SqliteXPRepository {
  constructor(private db: Database.Database) {}

  award(
    playerId: string,
    skillCategory: SkillCategory,
    amount: number,
    agentId: string,
    source: 'conversation' | 'quest_bonus' | 'achievement_bonus' = 'conversation'
  ): void {
    this.db
      .prepare(
        'INSERT INTO xp_ledger (player_id, skill_category, amount, agent_id, created_at, source) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(playerId, skillCategory, amount, agentId, Date.now(), source)
  }

  getSkillTotals(playerId: string): Record<SkillCategory, number> {
    const rows = this.db
      .prepare(
        'SELECT skill_category, SUM(amount) as total FROM xp_ledger WHERE player_id = ? GROUP BY skill_category'
      )
      .all(playerId) as Array<{ skill_category: string; total: number }>

    const result = {} as Record<SkillCategory, number>
    for (const cat of SKILL_CATEGORIES) {
      result[cat] = 0
    }
    for (const row of rows) {
      result[row.skill_category as SkillCategory] = row.total
    }
    return result
  }
}
