import type Database from 'better-sqlite3'
import type { ApprovedFolder } from '../../shared/types'

export class SqliteFolderRepository {
  constructor(private db: Database.Database) {}

  getAll(): ApprovedFolder[] {
    return this.db
      .prepare(
        'SELECT path, label, added_at as addedAt FROM approved_folders ORDER BY added_at ASC'
      )
      .all() as ApprovedFolder[]
  }

  add(path: string, label: string): ApprovedFolder {
    const existing = this.db
      .prepare('SELECT path, label, added_at as addedAt FROM approved_folders WHERE path = ?')
      .get(path) as ApprovedFolder | undefined

    if (existing) return existing

    const now = Date.now()
    this.db
      .prepare('INSERT INTO approved_folders (path, label, added_at) VALUES (?, ?, ?)')
      .run(path, label, now)

    return { path, label, addedAt: now }
  }

  remove(path: string): void {
    this.db.prepare('DELETE FROM approved_folders WHERE path = ?').run(path)
  }

  exists(path: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM approved_folders WHERE path = ?').get(path)
    return !!row
  }
}
