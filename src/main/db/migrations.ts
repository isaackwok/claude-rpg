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
  },

  3: (db) => {
    db.exec(`
      CREATE TABLE achievements (
        player_id TEXT NOT NULL REFERENCES players(id),
        achievement_def_id TEXT NOT NULL,
        unlocked_at INTEGER NOT NULL,
        PRIMARY KEY(player_id, achievement_def_id)
      );

      CREATE TABLE player_zones (
        player_id TEXT NOT NULL REFERENCES players(id),
        zone_id TEXT NOT NULL,
        first_visited_at INTEGER NOT NULL,
        UNIQUE(player_id, zone_id)
      );

      CREATE TABLE player_tool_usage (
        player_id TEXT NOT NULL REFERENCES players(id),
        tool_type TEXT NOT NULL,
        first_used_at INTEGER NOT NULL,
        UNIQUE(player_id, tool_type)
      );

      CREATE TABLE cosmetics (
        player_id TEXT NOT NULL REFERENCES players(id),
        cosmetic_def_id TEXT NOT NULL,
        unlocked_at INTEGER NOT NULL,
        equipped INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(player_id, cosmetic_def_id)
      );
      CREATE INDEX idx_cosmetics_player ON cosmetics(player_id);

      CREATE TABLE home_decorations (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id),
        cosmetic_def_id TEXT NOT NULL,
        tile_x INTEGER NOT NULL,
        tile_y INTEGER NOT NULL,
        placed_at INTEGER NOT NULL,
        UNIQUE(player_id, cosmetic_def_id),
        UNIQUE(player_id, tile_x, tile_y)
      );

      ALTER TABLE players ADD COLUMN last_scene TEXT DEFAULT 'Town';
      ALTER TABLE players ADD COLUMN last_x REAL;
      ALTER TABLE players ADD COLUMN last_y REAL;
    `)
  },

  // Add source column to xp_ledger to distinguish conversation XP from bonus XP.
  // Quest progress must only count 'conversation' rows, not quest/achievement bonus rows.
  5: (db) => {
    db.exec(`ALTER TABLE xp_ledger ADD COLUMN source TEXT NOT NULL DEFAULT 'conversation'`)
  },

  4: (db) => {
    db.exec(`
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id),
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_items_player ON items(player_id);

      CREATE TABLE book_items (
        item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
        markdown_content TEXT NOT NULL,
        source_agent_id TEXT NOT NULL,
        source_question TEXT NOT NULL,
        preview TEXT NOT NULL
      );
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
