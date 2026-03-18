import Database from 'better-sqlite3'
import { app, dialog } from 'electron'
import { join } from 'path'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'game.db')
    try {
      db = new Database(dbPath)
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')
      runMigrations(db)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[database] Failed to initialize:', message)
      dialog.showErrorBox(
        'Database Error — 資料庫錯誤',
        `Failed to open game database.\n無法開啟遊戲資料庫。\n\nPath: ${dbPath}\nError: ${message}\n\nThe application will now quit.`
      )
      app.exit(1)
      // Unreachable, but satisfies TypeScript return type
      throw err
    }
  }
  return db
}

export function closeDatabase(): void {
  try {
    db?.close()
  } catch (err) {
    console.error('[database] Error closing database:', err)
  }
  db = null
}

/** For testing — create an in-memory database with migrations applied. */
export function createTestDatabase(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('foreign_keys = ON')
  runMigrations(testDb)
  return testDb
}
