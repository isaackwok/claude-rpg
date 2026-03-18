import type Database from 'better-sqlite3'

const migrations: Record<number, (db: Database.Database) => void> = {
  1: (db) => {
    db.exec(`
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        locale TEXT NOT NULL DEFAULT 'zh-TW',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE xp_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id TEXT NOT NULL REFERENCES players(id),
        skill_category TEXT NOT NULL,
        amount INTEGER NOT NULL,
        agent_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        player_id TEXT NOT NULL REFERENCES players(id),
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE approved_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        added_at INTEGER NOT NULL
      );

      CREATE INDEX idx_xp_ledger_player_category ON xp_ledger(player_id, skill_category);
      CREATE INDEX idx_messages_conversation ON messages(conversation_id);
    `)
  },

  2: (db) => {
    db.exec(`
      CREATE TABLE quests (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id),
        quest_def_id TEXT NOT NULL,
        visibility TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        repeat_count INTEGER NOT NULL DEFAULT 0,
        discovered_at INTEGER NOT NULL,
        completed_at INTEGER,
        UNIQUE(player_id, quest_def_id)
      );
      CREATE INDEX idx_quests_player ON quests(player_id);
    `)
  }
}

export function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number

  const versions = Object.keys(migrations)
    .map(Number)
    .filter((v) => v > currentVersion)
    .sort((a, b) => a - b)

  for (const version of versions) {
    db.transaction(() => {
      migrations[version](db)
      db.pragma(`user_version = ${version}`)
    })()
  }
}
