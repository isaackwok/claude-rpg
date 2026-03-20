import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../db/migrations'
import { SqliteItemRepository } from '../db/item-repository'

describe('SqliteItemRepository', () => {
  let db: Database.Database
  let repo: SqliteItemRepository

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    db.prepare('INSERT INTO players (id, name, locale, created_at) VALUES (?, ?, ?, ?)').run(
      'player-1',
      'Isaac',
      'zh-TW',
      Date.now()
    )
    repo = new SqliteItemRepository(db)
  })

  afterEach(() => db.close())

  describe('addBookItem() and getItems()', () => {
    it('inserts and retrieves a book item with all fields', () => {
      const book = repo.addBookItem({
        playerId: 'player-1',
        type: 'book',
        name: '研究之書：測試',
        icon: '📖',
        category: 'research',
        markdownContent: '# Test\nSome content here.',
        sourceAgentId: 'archivist',
        sourceQuestion: 'What is testing?',
        preview: 'Test Some content here.'
      })

      expect(book.id).toBeTruthy()
      expect(book.name).toBe('研究之書：測試')
      expect(book.type).toBe('book')
      expect(book.markdownContent).toBe('# Test\nSome content here.')
      expect(book.createdAt).toBeGreaterThan(0)

      const items = repo.getItems('player-1')
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        type: 'book',
        name: '研究之書：測試',
        sourceAgentId: 'archivist'
      })
    })

    it('returns empty array for player with no items', () => {
      expect(repo.getItems('player-1')).toEqual([])
    })

    it('returns multiple items', () => {
      repo.addBookItem({
        playerId: 'player-1',
        type: 'book',
        name: 'First',
        icon: '📖',
        category: 'writing',
        markdownContent: 'a',
        sourceAgentId: 'scribe',
        sourceQuestion: 'q',
        preview: 'a'
      })
      repo.addBookItem({
        playerId: 'player-1',
        type: 'book',
        name: 'Second',
        icon: '📖',
        category: 'code',
        markdownContent: 'b',
        sourceAgentId: 'sage',
        sourceQuestion: 'q',
        preview: 'b'
      })

      const items = repo.getItems('player-1')
      expect(items).toHaveLength(2)
      const names = items.map((i) => i.name)
      expect(names).toContain('First')
      expect(names).toContain('Second')
    })
  })

  describe('updateItemName()', () => {
    it('updates the name of an existing item', () => {
      const book = repo.addBookItem({
        playerId: 'player-1',
        type: 'book',
        name: 'Old Name',
        icon: '📖',
        category: 'writing',
        markdownContent: 'content',
        sourceAgentId: 'scribe',
        sourceQuestion: 'q',
        preview: 'content'
      })

      repo.updateItemName(book.id, 'New Name')
      const items = repo.getItems('player-1')
      expect(items[0].name).toBe('New Name')
    })
  })

  describe('deleteItem()', () => {
    it('deletes item and its book_items row (CASCADE)', () => {
      const book = repo.addBookItem({
        playerId: 'player-1',
        type: 'book',
        name: 'To Delete',
        icon: '📖',
        category: 'code',
        markdownContent: 'content',
        sourceAgentId: 'sage',
        sourceQuestion: 'q',
        preview: 'content'
      })

      repo.deleteItem(book.id)
      expect(repo.getItems('player-1')).toEqual([])
    })
  })

  describe('getItemCount()', () => {
    it('counts all items for a player', () => {
      repo.addBookItem({
        playerId: 'player-1',
        type: 'book',
        name: 'A',
        icon: '📖',
        category: 'writing',
        markdownContent: 'c',
        sourceAgentId: 'scribe',
        sourceQuestion: 'q',
        preview: 'c'
      })
      repo.addBookItem({
        playerId: 'player-1',
        type: 'book',
        name: 'B',
        icon: '📖',
        category: 'code',
        markdownContent: 'c',
        sourceAgentId: 'sage',
        sourceQuestion: 'q',
        preview: 'c'
      })

      expect(repo.getItemCount('player-1')).toBe(2)
    })

    it('counts items filtered by sourceAgentId', () => {
      repo.addBookItem({
        playerId: 'player-1',
        type: 'book',
        name: 'A',
        icon: '📖',
        category: 'writing',
        markdownContent: 'c',
        sourceAgentId: 'scribe',
        sourceQuestion: 'q',
        preview: 'c'
      })
      repo.addBookItem({
        playerId: 'player-1',
        type: 'book',
        name: 'B',
        icon: '📖',
        category: 'code',
        markdownContent: 'c',
        sourceAgentId: 'sage',
        sourceQuestion: 'q',
        preview: 'c'
      })

      expect(repo.getItemCount('player-1', 'scribe')).toBe(1)
    })
  })
})
