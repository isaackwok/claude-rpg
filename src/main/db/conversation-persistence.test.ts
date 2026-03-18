import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'
import { SqliteConversationPersistence } from './conversation-persistence'
import { SqlitePlayerRepository } from './player-repository'

describe('SqliteConversationPersistence', () => {
  let db: Database.Database
  let persistence: SqliteConversationPersistence

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    new SqlitePlayerRepository(db).getOrCreate('player-1')
    persistence = new SqliteConversationPersistence(db)
  })

  afterEach(() => db.close())

  it('creates and retrieves a conversation', () => {
    persistence.getOrCreateByAgent('scribe', 'player-1')
    const convs = persistence.getConversationsByAgent('scribe', 'player-1')
    expect(convs).toHaveLength(1)
    expect(convs[0].agentId).toBe('scribe')
  })

  it('returns existing conversation on second getOrCreateByAgent', () => {
    const first = persistence.getOrCreateByAgent('scribe', 'player-1')
    const second = persistence.getOrCreateByAgent('scribe', 'player-1')
    expect(first.id).toBe(second.id)
  })

  it('stores and retrieves messages', () => {
    const conv = persistence.getOrCreateByAgent('scribe', 'player-1')
    persistence.addMessage(conv.id, 'user', 'Hello', 1000)
    persistence.addMessage(conv.id, 'assistant', 'Hi there', 1001)

    const messages = persistence.getMessages(conv.id)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('Hello')
    expect(messages[1].role).toBe('assistant')
  })
})
