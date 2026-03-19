import Database from 'better-sqlite3'
import type { BookItem, IItemRepository, Item } from '../../shared/item-types'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export class SqliteItemRepository implements IItemRepository {
  constructor(private db: Database.Database) {}

  getItems(playerId: string): Item[] {
    const rows = this.db
      .prepare(
        `SELECT i.id, i.player_id, i.type, i.name, i.icon, i.category, i.created_at,
                b.markdown_content, b.source_agent_id, b.source_question, b.preview
         FROM items i
         JOIN book_items b ON b.item_id = i.id
         WHERE i.player_id = ?
         ORDER BY i.created_at DESC`
      )
      .all(playerId) as Array<{
      id: string
      player_id: string
      type: string
      name: string
      icon: string
      category: string
      created_at: number
      markdown_content: string
      source_agent_id: string
      source_question: string
      preview: string
    }>

    return rows.map((r) => ({
      id: r.id,
      playerId: r.player_id,
      type: r.type as 'book',
      name: r.name,
      icon: r.icon,
      category: r.category,
      createdAt: r.created_at,
      markdownContent: r.markdown_content,
      sourceAgentId: r.source_agent_id,
      sourceQuestion: r.source_question,
      preview: r.preview
    }))
  }

  addBookItem(item: Omit<BookItem, 'id' | 'createdAt'>): BookItem {
    const id = generateId()
    const createdAt = Date.now()

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO items (id, player_id, type, name, icon, category, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, item.playerId, item.type, item.name, item.icon, item.category, createdAt)

      this.db
        .prepare(
          `INSERT INTO book_items (item_id, markdown_content, source_agent_id, source_question, preview)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(id, item.markdownContent, item.sourceAgentId, item.sourceQuestion, item.preview)
    })()

    return { ...item, id, createdAt }
  }

  updateItemName(itemId: string, name: string): void {
    this.db.prepare(`UPDATE items SET name = ? WHERE id = ?`).run(name, itemId)
  }

  deleteItem(itemId: string): void {
    this.db.prepare(`DELETE FROM items WHERE id = ?`).run(itemId)
  }

  getItemCount(playerId: string, sourceAgentId?: string): number {
    if (sourceAgentId) {
      const row = this.db
        .prepare(
          `SELECT COUNT(*) as count FROM items i
           JOIN book_items b ON b.item_id = i.id
           WHERE i.player_id = ? AND b.source_agent_id = ?`
        )
        .get(playerId, sourceAgentId) as { count: number }
      return row.count
    }
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM items WHERE player_id = ?`)
      .get(playerId) as { count: number }
    return row.count
  }
}
