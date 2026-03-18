import type Database from 'better-sqlite3'
import type { MessageRole } from '../../shared/types'

export interface PersistedConversation {
  id: string
  agentId: string
  playerId: string
  status: string
  createdAt: number
  updatedAt: number
}

export class SqliteConversationPersistence {
  constructor(private db: Database.Database) {}

  getOrCreateByAgent(agentId: string, playerId: string): PersistedConversation {
    const existing = this.db
      .prepare(
        `SELECT id, agent_id as agentId, player_id as playerId, status,
                created_at as createdAt, updated_at as updatedAt
         FROM conversations WHERE agent_id = ? AND player_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(agentId, playerId) as PersistedConversation | undefined

    if (existing) return existing

    const id = `conv-${agentId}-${Date.now()}`
    const now = Date.now()
    this.db
      .prepare(
        'INSERT INTO conversations (id, agent_id, player_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, agentId, playerId, 'active', now, now)

    return { id, agentId, playerId, status: 'active', createdAt: now, updatedAt: now }
  }

  getConversationsByAgent(agentId: string, playerId: string): PersistedConversation[] {
    return this.db
      .prepare(
        `SELECT id, agent_id as agentId, player_id as playerId, status,
                created_at as createdAt, updated_at as updatedAt
         FROM conversations WHERE agent_id = ? AND player_id = ? ORDER BY created_at DESC`
      )
      .all(agentId, playerId) as PersistedConversation[]
  }

  addMessage(conversationId: string, role: MessageRole, content: string, timestamp: number): void {
    this.db
      .prepare(
        'INSERT INTO messages (conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
      )
      .run(conversationId, role, content, timestamp)
    this.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(timestamp, conversationId)
  }

  getMessages(conversationId: string): Array<{ role: string; content: string; timestamp: number }> {
    return this.db
      .prepare(
        'SELECT role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC'
      )
      .all(conversationId) as Array<{ role: string; content: string; timestamp: number }>
  }

  updateStatus(conversationId: string, status: string): void {
    this.db
      .prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), conversationId)
  }
}
