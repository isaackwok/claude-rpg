# Phase 3D: Inventory & Books Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable saving NPC responses as collectible "books" in the backpack inventory, with cross-NPC context injection via the dialogue "+" menu.

**Architecture:** Normalized data model (base `items` table + type-specific `book_items` table) following existing repository pattern. Main process handles CRUD + Haiku name generation. Renderer gets a new `useItems()` hook, `ItemsTab` component, `BookDetailModal`, `BookPickerModal`, and `ItemNotification`. Dialogue panel gets a save button and book attachment pills.

**Tech Stack:** TypeScript, SQLite (better-sqlite3), Electron IPC, React 19, Anthropic SDK (Haiku for name gen), Vitest

**Spec:** `docs/superpowers/specs/2026-03-19-phase3d-inventory-books-design.md`

---

## File Map

### New Files

| File                                                  | Purpose                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/shared/item-types.ts`                            | `ItemType`, `ItemBase`, `BookItem`, `Item` discriminated union                              |
| `src/main/db/item-repository.ts`                      | `SqliteItemRepository` — CRUD for items + book_items with JOIN queries                      |
| `src/main/__tests__/item-repository.test.ts`          | Repository unit tests                                                                       |
| `src/main/book-name-generator.ts`                     | Haiku name generation + template fallback                                                   |
| `src/main/__tests__/book-name-generator.test.ts`      | Name generator tests                                                                        |
| `src/renderer/src/hooks/useItems.ts`                  | Fetch items on mount, listen for `items:updated` push, expose refresh/updateName/deleteItem |
| `src/renderer/src/components/ui/ItemsTab.tsx`         | Inventory list with category filter chips                                                   |
| `src/renderer/src/components/ui/BookDetailModal.tsx`  | Full-content reader with editable name, metadata, delete                                    |
| `src/renderer/src/components/ui/BookPickerModal.tsx`  | Multi-select book picker for context injection                                              |
| `src/renderer/src/components/ui/ItemNotification.tsx` | Toast notification for book saves (follows `QuestNotification` pattern)                     |

### Modified Files

| File                                               | Change                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/types.ts`                              | Re-export `item-types.ts`                                                                                                |
| `src/main/db/migrations.ts`                        | Add migration 4: `items` + `book_items` tables                                                                           |
| `src/main/index.ts`                                | Add IPC handlers: `items:get-all`, `items:add-book`, `items:update-name`, `items:delete`                                 |
| `src/preload/index.ts`                             | Expose item IPC channels on `window.api`                                                                                 |
| `src/renderer/src/game/types.ts`                   | Add `'item:added'` and `'item:deleted'` EventBus events                                                                  |
| `src/renderer/src/components/ui/BackpackPanel.tsx` | Enable items tab, render `ItemsTab`                                                                                      |
| `src/renderer/src/components/ui/DialoguePanel.tsx` | Add save button to `MessageBubble`, add "Reference Books" to "+" menu, attached book pills, prepend book context on send |
| `src/renderer/src/App.tsx`                         | Mount `ItemNotification`                                                                                                 |
| `src/renderer/src/i18n/locales/zh-TW.json`         | Add item-related strings                                                                                                 |
| `src/renderer/src/i18n/locales/en.json`            | Add item-related strings                                                                                                 |

---

## Task 1: Shared Types & DB Migration

**Files:**

- Create: `src/shared/item-types.ts`
- Modify: `src/shared/types.ts` (add re-export at bottom)
- Modify: `src/main/db/migrations.ts` (add migration 4)
- Modify: `src/renderer/src/game/types.ts` (add EventBus events)

- [ ] **Step 1: Create item type definitions**

Create `src/shared/item-types.ts`:

```typescript
export type ItemType = 'book'

export interface ItemBase {
  id: string
  playerId: string
  type: ItemType
  name: string
  icon: string
  category: string
  createdAt: number
}

export interface BookItem extends ItemBase {
  type: 'book'
  markdownContent: string
  sourceAgentId: string
  sourceQuestion: string
  preview: string
}

export type Item = BookItem

export interface IItemRepository {
  getItems(playerId: string): Item[]
  addBookItem(item: Omit<BookItem, 'id' | 'createdAt'>): BookItem
  updateItemName(itemId: string, name: string): void
  deleteItem(itemId: string): void
  getItemCount(playerId: string, sourceAgentId?: string): number
}
```

- [ ] **Step 2: Re-export from shared/types.ts**

Add at the bottom of `src/shared/types.ts`:

```typescript
export * from './item-types'
```

- [ ] **Step 3: Add EventBus event types**

In `src/renderer/src/game/types.ts`, import `BookItem`:

```typescript
import type { BookItem } from '../../../shared/item-types'
```

Add to the `GameEvents` interface:

```typescript
'item:added': { item: BookItem }
'item:deleted': { itemId: string }
```

- [ ] **Step 4: Add migration 4**

In `src/main/db/migrations.ts`, add migration 4 after migration 3:

```typescript
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
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors)

- [ ] **Step 6: Commit**

```bash
git add src/shared/item-types.ts src/shared/types.ts src/main/db/migrations.ts src/renderer/src/game/types.ts
git commit -m "feat(3d): add item types, EventBus events, and migration 4"
```

---

## Task 2: Item Repository

**Files:**

- Create: `src/main/db/item-repository.ts`
- Create: `src/main/__tests__/item-repository.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/main/__tests__/item-repository.test.ts`. Follow the pattern in `src/main/__tests__/cosmetic-repository.test.ts` — in-memory SQLite, `runMigrations`, seed a player. Tests:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/main/__tests__/item-repository.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement SqliteItemRepository**

Create `src/main/db/item-repository.ts`. Follow pattern of `cosmetic-repository.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/main/__tests__/item-repository.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add src/main/db/item-repository.ts src/main/__tests__/item-repository.test.ts
git commit -m "feat(3d): add SqliteItemRepository with CRUD + tests"
```

---

## Task 3: Book Name Generator

**Files:**

- Create: `src/main/book-name-generator.ts`
- Create: `src/main/__tests__/book-name-generator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/main/__tests__/book-name-generator.test.ts`. Test the fallback path and stripMarkdown utility:

```typescript
import { describe, it, expect } from 'vitest'
import { generateFallbackName, stripMarkdown } from '../book-name-generator'

describe('book-name-generator', () => {
  describe('generateFallbackName()', () => {
    it('generates zh-TW fallback name with NPC name and count', () => {
      const name = generateFallbackName('書記官', 3, 'zh-TW')
      expect(name).toBe('書記官的筆記 #3')
    })

    it('generates en fallback name with NPC name and count', () => {
      const name = generateFallbackName('The Scribe', 1, 'en')
      expect(name).toBe("The Scribe's Notes #1")
    })

    it('defaults to zh-TW format for unknown locales', () => {
      const name = generateFallbackName('書記官', 1, 'ja')
      expect(name).toBe('書記官的筆記 #1')
    })
  })

  describe('stripMarkdown()', () => {
    it('strips headers, bold, italic, links, and code', () => {
      const result = stripMarkdown('# Title\n**bold** and *italic* with `code`')
      expect(result).toBe('Title bold and italic with code')
    })

    it('truncates to maxLength', () => {
      const long = 'A'.repeat(200)
      const result = stripMarkdown(long, 100)
      expect(result).toHaveLength(100)
    })

    it('handles empty string', () => {
      expect(stripMarkdown('')).toBe('')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- src/main/__tests__/book-name-generator.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement book name generator**

Create `src/main/book-name-generator.ts`:

````typescript
import Anthropic from '@anthropic-ai/sdk'
import { getApiKey } from './api-key'

/** Strip markdown formatting and truncate for preview text. */
export function stripMarkdown(text: string, maxLength = 100): string {
  const stripped = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  return stripped.slice(0, maxLength)
}

/** Generate a template-based fallback name. */
export function generateFallbackName(npcName: string, count: number, locale: string): string {
  if (locale === 'en') {
    return `${npcName}'s Notes #${count}`
  }
  return `${npcName}的筆記 #${count}`
}

/** Generate an RPG-style book name using Haiku, with template fallback. */
export async function generateBookName(
  content: string,
  locale: string,
  npcName: string,
  itemCount: number
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return generateFallbackName(npcName, itemCount + 1, locale)
  }

  try {
    const client = new Anthropic({ apiKey })
    const snippet = content.slice(0, 500)

    const formatExample =
      locale === 'en'
        ? 'Format: "Tome of [Genre]: [Short Topic]" — e.g., "Tome of Research: Web Performance"'
        : '格式：「[類別]之書：[簡短主題]」— 例如：「研究之書：網頁效能優化」'

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [
        {
          role: 'user',
          content: `Generate a short RPG-style book name in ${locale} for this content. ${formatExample}\n\nContent:\n${snippet}`
        }
      ]
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

    if (text) return text
    return generateFallbackName(npcName, itemCount + 1, locale)
  } catch {
    return generateFallbackName(npcName, itemCount + 1, locale)
  }
}
````

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/main/__tests__/book-name-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/book-name-generator.ts src/main/__tests__/book-name-generator.test.ts
git commit -m "feat(3d): add book name generator with Haiku + fallback"
```

---

## Task 4: IPC Channels & Preload

**Files:**

- Modify: `src/main/index.ts` (add IPC handlers + instantiate repo)
- Modify: `src/preload/index.ts` (expose channels on `window.api`)

- [ ] **Step 1: Add item IPC handlers to main process**

In `src/main/index.ts`:

1. Import at top:

```typescript
import { SqliteItemRepository } from './db/item-repository'
import { generateBookName, stripMarkdown } from './book-name-generator'
```

2. After existing repo instantiation (near `cosmeticRepo`), add:

```typescript
const itemRepo = new SqliteItemRepository(db)
```

3. Add IPC handlers after existing cosmetics handlers. Reference `src/main/index.ts:142-202` for the cosmetics pattern. Note that `items:add-book` is `async` because it calls `generateBookName`:

```typescript
ipcMain.handle('items:get-all', () => {
  return itemRepo.getItems('player-1')
})

ipcMain.handle(
  'items:add-book',
  async (
    _e,
    payload: {
      markdownContent: string
      sourceAgentId: string
      sourceQuestion: string
      category: string
      locale: string
      npcName: string
    }
  ) => {
    const preview = stripMarkdown(payload.markdownContent)
    const itemCount = itemRepo.getItemCount('player-1', payload.sourceAgentId)
    const name = await generateBookName(
      payload.markdownContent,
      payload.locale,
      payload.npcName,
      itemCount
    )
    const book = itemRepo.addBookItem({
      playerId: 'player-1',
      type: 'book',
      name,
      icon: '📖',
      category: payload.category,
      markdownContent: payload.markdownContent,
      sourceAgentId: payload.sourceAgentId,
      sourceQuestion: payload.sourceQuestion,
      preview
    })
    BrowserWindow.getAllWindows()[0]?.webContents.send('items:updated')
    return book
  }
)

ipcMain.handle('items:update-name', (_e, itemId: string, name: string) => {
  itemRepo.updateItemName(itemId, name)
  BrowserWindow.getAllWindows()[0]?.webContents.send('items:updated')
})

ipcMain.handle('items:delete', (_e, itemId: string) => {
  itemRepo.deleteItem(itemId)
  BrowserWindow.getAllWindows()[0]?.webContents.send('items:updated')
})
```

This follows the existing pattern used by cosmetics handlers (e.g., line 172, 189). `BrowserWindow` is already imported.

- [ ] **Step 2: Add item channels to preload**

In `src/preload/index.ts`, add after the cosmetics/home decorations section (before "Zone tracking" comment around line 203):

```typescript
// Items
getItems: (): Promise<import('../shared/item-types').Item[]> =>
  ipcRenderer.invoke('items:get-all'),
addBookItem: (payload: {
  markdownContent: string; sourceAgentId: string; sourceQuestion: string
  category: string; locale: string; npcName: string
}): Promise<import('../shared/item-types').BookItem> =>
  ipcRenderer.invoke('items:add-book', payload),
updateItemName: (itemId: string, name: string): Promise<void> =>
  ipcRenderer.invoke('items:update-name', itemId, name),
deleteItem: (itemId: string): Promise<void> =>
  ipcRenderer.invoke('items:delete', itemId),
onItemsUpdated: (callback: () => void): (() => void) => {
  const handler = (): void => callback()
  ipcRenderer.on('items:updated', handler)
  return () => ipcRenderer.removeListener('items:updated', handler)
},
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(3d): add items IPC handlers and preload channels"
```

---

## Task 5: i18n Strings

**Files:**

- Modify: `src/renderer/src/i18n/locales/zh-TW.json`
- Modify: `src/renderer/src/i18n/locales/en.json`

- [ ] **Step 1: Add zh-TW strings**

Add to `zh-TW.json` inside the `"dialogue"` object (after `"pendingApproval"`):

```json
"addToBackpack": "加入背包",
"addedToBackpack": "已加入背包：{{name}}",
"addingToBackpack": "儲存中...",
"referenceBooks": "參考書籍",
"referenceLabel": "參考資料"
```

Add a new top-level `"items"` object (after `"backpack"`):

```json
"items": {
  "title": "物品",
  "empty": "還沒有收藏任何物品",
  "emptyHint": "在對話中點擊 🎒 收藏 NPC 的回覆",
  "filterAll": "全部",
  "categoryGeneral": "一般",
  "source": "來源",
  "question": "原始問題",
  "delete": "刪除",
  "deleteConfirm": "確定要刪除「{{name}}」嗎？",
  "deleteYes": "刪除",
  "deleteNo": "取消",
  "close": "關閉",
  "editName": "點擊編輯名稱",
  "attach": "附加",
  "attachCount": "已選 {{count}} 本",
  "noBooks": "還沒有任何書籍可以參考",
  "pickBooks": "選擇參考書籍"
}
```

- [ ] **Step 2: Add en strings**

Add matching strings to `en.json`.

In `"dialogue"`:

```json
"addToBackpack": "Add to Backpack",
"addedToBackpack": "Added to backpack: {{name}}",
"addingToBackpack": "Saving...",
"referenceBooks": "Reference Books",
"referenceLabel": "Reference"
```

New `"items"` object:

```json
"items": {
  "title": "Items",
  "empty": "No items collected yet",
  "emptyHint": "Click 🎒 in a conversation to save NPC responses",
  "filterAll": "All",
  "categoryGeneral": "General",
  "source": "Source",
  "question": "Original Question",
  "delete": "Delete",
  "deleteConfirm": "Delete \"{{name}}\"?",
  "deleteYes": "Delete",
  "deleteNo": "Cancel",
  "close": "Close",
  "editName": "Click to edit name",
  "attach": "Attach",
  "attachCount": "{{count}} selected",
  "noBooks": "No books to reference yet",
  "pickBooks": "Select Reference Books"
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/locales/zh-TW.json src/renderer/src/i18n/locales/en.json
git commit -m "feat(3d): add i18n strings for items, books, and context injection"
```

---

## Task 6: useItems Hook

**Files:**

- Create: `src/renderer/src/hooks/useItems.ts`

- [ ] **Step 1: Implement useItems hook**

Create `src/renderer/src/hooks/useItems.ts`. Follow `src/renderer/src/hooks/useCosmetics.ts` pattern:

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { Item } from '../../../shared/item-types'

export function useItems(): {
  items: Item[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  updateName: (itemId: string, name: string) => Promise<void>
  deleteItem: (itemId: string) => Promise<void>
} {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const result = await window.api.getItems()
      setItems(result)
    } catch (err) {
      console.error('[useItems] Failed to fetch items:', err)
      setError(err instanceof Error ? err.message : 'items-load-failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const updateName = useCallback(
    async (itemId: string, name: string) => {
      try {
        await window.api.updateItemName(itemId, name)
        await refresh()
      } catch (err) {
        console.error('[useItems] Failed to update item name:', err)
        setError(err instanceof Error ? err.message : 'item-update-failed')
      }
    },
    [refresh]
  )

  const deleteItem = useCallback(
    async (itemId: string) => {
      try {
        await window.api.deleteItem(itemId)
        await refresh()
      } catch (err) {
        console.error('[useItems] Failed to delete item:', err)
        setError(err instanceof Error ? err.message : 'item-delete-failed')
      }
    },
    [refresh]
  )

  useEffect(() => {
    refresh()
    const cleanup = window.api.onItemsUpdated(() => {
      refresh()
    })
    return () => {
      cleanup()
    }
  }, [refresh])

  return { items, loading, error, refresh, updateName, deleteItem }
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useItems.ts
git commit -m "feat(3d): add useItems hook with CRUD and push updates"
```

---

## Task 7: ItemsTab & BookDetailModal

**Files:**

- Create: `src/renderer/src/components/ui/ItemsTab.tsx`
- Create: `src/renderer/src/components/ui/BookDetailModal.tsx`
- Modify: `src/renderer/src/components/ui/BackpackPanel.tsx`

- [ ] **Step 1: Create ItemsTab component**

Create `src/renderer/src/components/ui/ItemsTab.tsx`.

Props: `items: Item[]`, `locale: string`, `onUpdateName: (id, name) => Promise<void>`, `onDeleteItem: (id) => Promise<void>`.

Features:

1. Category filter chips at top: "All" + each unique `item.category` from items. Use color mapping:

```typescript
const CATEGORY_COLORS: Record<string, string> = {
  writing: '#e8b44c',
  research: '#5bb5e8',
  code: '#a78bfa',
  data: '#4ade80',
  communication: '#f472b6',
  organization: '#fb923c',
  visual: '#c084fc',
  general: '#888'
}
```

2. Scrollable list of book cards. Each card: icon + name (truncated), NPC name (resolve from `BUILT_IN_NPCS` via `sourceAgentId`, fallback to ID), category badge, preview (1-2 lines), relative timestamp.
3. Empty state: `t('items.empty')` + `t('items.emptyHint')`.
4. State: `selectedItem` — when set, renders `<BookDetailModal>`.
5. Import `BUILT_IN_NPCS` from `../../game/data/npcs` for NPC name resolution.

Style: follow existing tab patterns (`QuestsTab.tsx`, `AchievementsTab.tsx`). Gold palette, monospace font, card backgrounds using `rgba(200, 180, 140, 0.08)`.

- [ ] **Step 2: Create BookDetailModal component**

Create `src/renderer/src/components/ui/BookDetailModal.tsx`.

Props: `item: BookItem`, `locale: string`, `onClose: () => void`, `onUpdateName: (id, name) => Promise<void>`, `onDelete: (id) => Promise<void>`.

Features:

1. Overlay + centered panel (same dimensions/styling as other modals).
2. Editable name: click to enter edit mode (`useState` for `editing`, `editValue`). Input styled to match theme. Save on blur/Enter.
3. Metadata section: source NPC, category badge, original question (in a subtle box), timestamp.
4. Scrollable body with full markdown via `renderMarkdown()` from `../../utils/renderMarkdown`.
5. Footer: Delete button (click toggles `confirmDelete` state showing "Are you sure?" inline), Close button.

- [ ] **Step 3: Enable items tab in BackpackPanel**

Modify `src/renderer/src/components/ui/BackpackPanel.tsx` (reference lines 1-204):

1. Line 14: Change `available: false` to `available: true` for items tab.
2. Add imports:

```typescript
import { useItems } from '../../hooks/useItems'
import { ItemsTab } from './ItemsTab'
```

3. In the component body, call `useItems()`:

```typescript
const {
  items,
  loading: itemsLoading,
  error: itemsError,
  refresh: refreshItems,
  updateName,
  deleteItem
} = useItems()
```

4. Add `activeTab === 'items'` branch in the content area (after `activeTab === 'cosmetics'`), with loading/error states matching the quests pattern.
5. Keep initial `activeTab` default as `'quests'` (line 29) — no change to existing UX.

- [ ] **Step 4: Run typecheck and dev server**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run dev` — open backpack, verify items tab loads (shows empty state).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/ItemsTab.tsx src/renderer/src/components/ui/BookDetailModal.tsx src/renderer/src/components/ui/BackpackPanel.tsx
git commit -m "feat(3d): add ItemsTab, BookDetailModal, enable items tab in backpack"
```

---

## Task 8: ItemNotification Toast

**Files:**

- Create: `src/renderer/src/components/ui/ItemNotification.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create ItemNotification component**

Create `src/renderer/src/components/ui/ItemNotification.tsx`. Follow `src/renderer/src/components/ui/QuestNotification.tsx` pattern exactly.

**Note:** The `fadeInOut` keyframe animation used by `QuestNotification` and `AchievementNotification` is not defined anywhere in the codebase (pre-existing gap). Add a `<style>` block inside `ItemNotification` to define it:

```css
@keyframes fadeInOut {
  0% {
    opacity: 0;
    transform: translateY(-8px);
  }
  15% {
    opacity: 1;
    transform: translateY(0);
  }
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
```

```typescript
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'
import { EventBus } from '../../game/EventBus'
import type { BookItem } from '../../../../shared/item-types'

interface ItemToast {
  id: number
  bookName: string
}

let toastId = 0

export function ItemNotification() {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<ItemToast[]>([])
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    const handleAdded = (data: { item: BookItem }) => {
      const toast: ItemToast = { id: ++toastId, bookName: data.item.name }
      setToasts((prev) => [...prev, toast])
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
        timersRef.current.delete(timer)
      }, 3000)
      timersRef.current.add(timer)
    }

    EventBus.on('item:added', handleAdded)
    return () => {
      EventBus.off('item:added', handleAdded)
      for (const timer of timersRef.current) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 100,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        zIndex: 250
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            fontFamily: 'monospace',
            fontSize: 14,
            color: '#e8d5a8',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
            textAlign: 'center',
            animation: 'fadeInOut 3s ease-in-out'
          }}
        >
          🎒 {t('dialogue.addedToBackpack', { name: toast.bookName })}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Mount in App.tsx**

In `src/renderer/src/App.tsx` (reference line 12-13 for imports, line 188-189 for placement):

1. Import: `import { ItemNotification } from './components/ui/ItemNotification'`
2. Add `<ItemNotification />` after `<AchievementNotification />` (line 189).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/ItemNotification.tsx src/renderer/src/App.tsx
git commit -m "feat(3d): add ItemNotification toast and mount in App"
```

---

## Task 9: Dialogue — Add to Backpack Button

**Files:**

- Modify: `src/renderer/src/components/ui/DialoguePanel.tsx`

- [ ] **Step 1: Extend MessageBubble props and add save button**

In `DialoguePanel.tsx`, modify `MessageBubble` (reference lines 100-198):

1. Add new props to `MessageBubble`: `agentId: string`, `previousUserMessage: string`, `category: string`, `locale: string`.

2. Add state: `const [saving, setSaving] = useState(false)` and `const [saved, setSaved] = useState(false)`.

3. Add import for `BUILT_IN_NPCS` (already imported at line 13) and `EventBus` (already imported at line 11), and `BookItem` from `../../../../shared/item-types`.

4. Add `handleSaveToBackpack` handler:

```typescript
const handleSaveToBackpack = async (): Promise<void> => {
  if (saving || saved) return
  setSaving(true)
  try {
    const npc = BUILT_IN_NPCS.find((n) => n.id === agentId)
    const npcName = npc?.name[locale] ?? npc?.name['zh-TW'] ?? agentId
    const book = await window.api.addBookItem({
      markdownContent: msg.content,
      sourceAgentId: agentId,
      sourceQuestion: previousUserMessage,
      category,
      locale,
      npcName
    })
    setSaved(true)
    EventBus.emit('item:added', { item: book })
    setTimeout(() => setSaved(false), 2000)
  } catch (err) {
    console.error('[DialoguePanel] Failed to save to backpack:', err)
  } finally {
    setSaving(false)
  }
}
```

5. Add the save button next to the existing copy button (inside the `<div style={{ marginTop: 2 }}>` on line 170). Place it after the copy button with `marginLeft: 4`. Styled identically but with save/saving/saved states.

6. Update `MessageBubble` call sites in the main `DialoguePanel` to pass new props. Resolve `category` from NPC definition:

```typescript
const npcDef = BUILT_IN_NPCS.find((n) => n.id === dialogue.agentId)
const npcCategory = npcDef?.skills?.[0] ?? 'general'
```

For `previousUserMessage`: for each assistant message at index `i`, find the last user message before it.

- [ ] **Step 2: Run typecheck and test manually**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run dev` — open a dialogue, send a message, verify save button appears on assistant messages. Click it, verify loading state and toast.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/DialoguePanel.tsx
git commit -m "feat(3d): add save-to-backpack button on NPC response bubbles"
```

---

## Task 10: BookPickerModal & Context Injection

**Files:**

- Create: `src/renderer/src/components/ui/BookPickerModal.tsx`
- Modify: `src/renderer/src/components/ui/DialoguePanel.tsx`

- [ ] **Step 1: Create BookPickerModal**

Create `src/renderer/src/components/ui/BookPickerModal.tsx`.

Props: `onAttach: (items: BookItem[]) => void`, `onClose: () => void`.

Features:

1. Dark overlay + gold-bordered centered panel (match backpack modal styling from `BackpackPanel.tsx`).
2. Title: `t('items.pickBooks')`.
3. Category filter chips (reuse same `CATEGORY_COLORS` mapping).
4. Scrollable list of book cards with checkboxes. Each card: icon, name, source NPC, preview, checkbox.
5. Footer: selected count (`t('items.attachCount', { count })`), Attach button (disabled when count=0), Cancel button.
6. Empty state: `t('items.noBooks')`.
7. Uses `useItems()` hook internally.

- [ ] **Step 2: Add "Reference Books" menu item to InputArea**

In `DialoguePanel.tsx`, modify `InputArea` (reference lines 200-398):

1. Add new props: `attachedBooks: BookItem[]`, `onAttachBooks: (books: BookItem[]) => void`, `onRemoveBook: (id: string) => void`.

2. Add state: `const [bookPickerOpen, setBookPickerOpen] = useState(false)`.

3. In the `menuOpen` dropdown (after the file picker button at line 339-364), add a second button:

```tsx
<button
  onMouseDown={() => {
    triggerClose()
    setBookPickerOpen(true)
  }}
  style={/* identical styling to file picker button */}
  onMouseEnter={(e) => {
    e.currentTarget.style.background = 'rgba(200, 180, 140, 0.15)'
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.background = 'none'
  }}
>
  <span style={{ fontSize: 14 }}>📖</span>
  {t('dialogue.referenceBooks')}
</button>
```

4. Render `BookPickerModal` conditionally:

```tsx
{
  bookPickerOpen && (
    <BookPickerModal
      onAttach={(books) => {
        onAttachBooks(books)
        setBookPickerOpen(false)
      }}
      onClose={() => setBookPickerOpen(false)}
    />
  )
}
```

5. Add pill display above the textarea (inside the input area's outer div, before the textarea):

```tsx
{
  attachedBooks.length > 0 && (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '4px 0 0',
        flexShrink: 0,
        width: '100%'
      }}
    >
      {attachedBooks.map((book) => (
        <span
          key={book.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 12,
            background: 'rgba(200, 180, 140, 0.08)',
            border: '1px solid rgba(200, 180, 140, 0.3)',
            color: '#c4a46c',
            fontFamily: 'monospace',
            fontSize: 11
          }}
        >
          📖 {book.name.length > 20 ? book.name.slice(0, 20) + '…' : book.name}
          <button
            onClick={() => onRemoveBook(book.id)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(200, 180, 140, 0.6)',
              cursor: 'pointer',
              padding: 0,
              fontSize: 11,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Wire up state in parent DialoguePanel**

In the main `DialoguePanel` component:

1. Add state:

```typescript
const [attachedBooks, setAttachedBooks] = useState<BookItem[]>([])
```

2. Clear `attachedBooks` when dialogue closes (in the `handleClose` or equivalent).

3. Pass props to `InputArea`:

```typescript
attachedBooks={attachedBooks}
onAttachBooks={(books) => setAttachedBooks((prev) => [...prev, ...books.filter((b) => !prev.some((p) => p.id === b.id))])}
onRemoveBook={(id) => setAttachedBooks((prev) => prev.filter((b) => b.id !== id))}
```

4. Modify the send function to prepend book context:

```typescript
const buildMessageWithContext = (text: string, currentLocale: string): string => {
  if (attachedBooks.length === 0) return text
  const referenceLabel = t('dialogue.referenceLabel')
  const colon = currentLocale === 'en' ? ': ' : '：'
  const bookBlocks = attachedBooks
    .map((b) => `[📖 ${referenceLabel}${colon}${b.name}]\n${b.markdownContent}`)
    .join('\n---\n')
  return `${bookBlocks}\n---\n\n${text}`
}
```

In the `send` callback, wrap `text` with `const finalText = buildMessageWithContext(text, locale)` and use `finalText` when calling `window.api.sendMessage(dialogue.agentId, finalText, locale)`. Clear `attachedBooks` with `setAttachedBooks([])` after the send call. Add `attachedBooks` to the `useCallback` dependency array.

- [ ] **Step 4: Run typecheck and test manually**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run dev`:

1. Save a book from one NPC
2. Open another NPC's dialogue
3. Click "+" → "Reference Books" → select book → Attach
4. Verify pill appears
5. Send message, verify NPC acknowledges the referenced content

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/BookPickerModal.tsx src/renderer/src/components/ui/DialoguePanel.tsx
git commit -m "feat(3d): add BookPickerModal and context injection via dialogue '+' menu"
```

---

## Task 11: Final Verification & Cleanup

- [ ] **Step 1: Run full test suite**

Run: `npm run test:unit`
Expected: All tests PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run linting**

Run: `npm run lint`
Expected: PASS (fix any issues)

- [ ] **Step 4: Manual end-to-end test**

1. Open app (`npm run dev`)
2. Talk to an NPC, get a response
3. Click save button on the response — verify toast appears, button shows checkmark
4. Open backpack — items tab — verify book card appears with name, category badge, preview
5. Click book card — verify BookDetailModal shows full content, metadata
6. Edit the book name — verify it saves
7. Open a different NPC dialogue
8. Click "+" — "Reference Books" — verify BookPickerModal shows the saved book
9. Select it, click Attach — verify pill appears below input
10. Send message — verify the message includes the book context
11. Delete the book from inventory — verify it's removed

- [ ] **Step 5: Update CLAUDE.md**

Update the "Implementation Phases" section in `CLAUDE.md`:

- Change "Completed" line to include Phase 3C and 3D
- Add Phase 3D description: "Inventory tab with collectible books, save NPC responses to backpack, cross-NPC context injection"
- Update "Next up" to Phase 4

- [ ] **Step 6: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Phase 3D completion"
```
