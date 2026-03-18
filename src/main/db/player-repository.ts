import type Database from 'better-sqlite3'
import type { Player } from '../../shared/types'

export class SqlitePlayerRepository {
  constructor(private db: Database.Database) {}

  getOrCreate(id: string): Player {
    const existing = this.db
      .prepare('SELECT id, name, locale, created_at as createdAt FROM players WHERE id = ?')
      .get(id) as Player | undefined

    if (existing) return existing

    const now = Date.now()
    this.db
      .prepare('INSERT INTO players (id, name, locale, created_at) VALUES (?, ?, ?, ?)')
      .run(id, 'Isaac', 'zh-TW', now)

    return { id, name: 'Isaac', locale: 'zh-TW', createdAt: now }
  }

  updateLocale(id: string, locale: string): void {
    this.db.prepare('UPDATE players SET locale = ? WHERE id = ?').run(locale, id)
  }
}
