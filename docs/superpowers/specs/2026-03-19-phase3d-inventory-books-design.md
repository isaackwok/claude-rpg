# Phase 3D: Inventory & Books

> Save NPC responses as collectible "books" in the backpack inventory, then inject them as context into other NPC conversations.

## Summary

Phase 3D enables the currently-stubbed items tab in the backpack. Users can save any NPC response as a **book** — a markdown-content item with an AI-generated RPG name. Books live in the inventory, where users can browse, filter, view, edit names, and delete them. From the dialogue "+" menu, users can attach one or more books as context before sending a message, enabling cross-NPC knowledge transfer.

The item system uses a **normalized data model** (base `items` table + type-specific `book_items` table) to support future item types without schema pollution.

## Decisions Log

| Question                   | Decision                                                                                           | Rationale                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Item metadata richness     | Rich — content, AI name, source NPC, timestamp, source question, preview, editable name, auto-tags | Maximizes usefulness for browsing and context injection        |
| Name generation            | AI-generated via Haiku, with template fallback                                                     | Gives each book character; fallback ensures reliability        |
| Context injection mode     | Full content prepended to message                                                                  | Simple, deterministic, no extra API cost                       |
| Book selection in "+" menu | Multi-select with checkboxes                                                                       | Avoids tedious repeated menu opens                             |
| Book viewing in inventory  | Detail modal on click                                                                              | Keeps list clean, gives space for full markdown + edit actions |
| Tags/categories            | Predefined — auto-tagged from NPC skill domain                                                     | Zero user effort, enables filtering for free                   |
| Architecture               | Normalized (items + book_items tables)                                                             | Matches existing codebase patterns, scales for future types    |

## Data Model

### Database Tables (Migration 4)

**`items` — base table for all item types**

| Column       | Type    | Constraints            | Notes                   |
| ------------ | ------- | ---------------------- | ----------------------- |
| `id`         | TEXT    | PRIMARY KEY            | UUID                    |
| `player_id`  | TEXT    | NOT NULL, FK → players | Owner                   |
| `type`       | TEXT    | NOT NULL               | Discriminator: `'book'` |
| `name`       | TEXT    | NOT NULL               | User-editable RPG name  |
| `icon`       | TEXT    | NOT NULL               | Emoji, e.g. `'📖'`      |
| `category`   | TEXT    | NOT NULL               | NPC skill domain        |
| `created_at` | INTEGER | NOT NULL               | Unix timestamp          |

**`book_items` — book-specific fields**

| Column             | Type | Constraints                               | Notes                                   |
| ------------------ | ---- | ----------------------------------------- | --------------------------------------- |
| `item_id`          | TEXT | PRIMARY KEY, FK → items ON DELETE CASCADE | 1:1 with items row                      |
| `markdown_content` | TEXT | NOT NULL                                  | Full NPC response                       |
| `source_agent_id`  | TEXT | NOT NULL                                  | Which NPC produced it                   |
| `source_question`  | TEXT | NOT NULL                                  | User message that prompted the response |
| `preview`          | TEXT | NOT NULL                                  | First ~100 chars, markdown stripped     |

### TypeScript Types (`src/shared/item-types.ts`)

```typescript
export type ItemType = 'book' // union grows with future types

export interface ItemBase {
  id: string
  playerId: string
  type: ItemType
  name: string
  icon: string
  category: string // NPC skill domain
  createdAt: number
}

export interface BookItem extends ItemBase {
  type: 'book'
  markdownContent: string
  sourceAgentId: string
  sourceQuestion: string
  preview: string
}

// Discriminated union — add future types here
export type Item = BookItem
```

## Name Generation

When saving a book:

1. Main process receives the NPC response content + locale
2. Makes a Haiku call with a short prompt:
   - zh-TW format: `"[類別]之書：[主題]"` (e.g., "研究之書：網頁效能優化")
   - en format: `"Tome of [Genre]: [Topic]"` (e.g., "Tome of Research: Web Performance")
   - Input: first 500 chars of the response content
3. Returns the generated name, stored immediately

**Fallback** (API key missing, network error, Haiku failure):

- zh-TW: `"{NPC名稱}的筆記 #{count}"` (e.g., "書記官的筆記 #3")
- en: `"{NPC Name}'s Notes #{count}"` (e.g., "The Scribe's Notes #3")

**Cost:** ~50–100 input tokens + ~20 output tokens per save. Negligible.

## Dialogue Integration

### "Add to Backpack" Button

**Placement:** Next to the existing copy button (`📋`) on each assistant message bubble.

**Icon:** `🎒`

**Flow:**

1. User clicks `🎒` on an NPC response
2. Button shows brief loading state (spinner or dim) while Haiku generates the name
3. On success: button flashes `✓` (same pattern as copy button) + toast notification: "已加入背包：{book name}" / "Added to backpack: {book name}"
4. On failure: fallback name used, still saves successfully
5. Item persisted to SQLite via IPC

**Duplicate handling:** Allowed — each save creates a distinct book. No dedup logic.

**Data captured:**

- `markdown_content` → assistant message raw content
- `source_agent_id` → current NPC's agent ID
- `source_question` → user message immediately preceding this response
- `category` → NPC's skill domain (from agent definitions in renderer). For NPCs without a `skills` array (e.g., Guild Master, Bartender), use `'general'` as fallback category
- `preview` → first ~100 chars, markdown stripped
- `icon` → `'📖'`

**Note:** The renderer resolves the NPC skill domain to a category string before sending via IPC, since `BUILT_IN_NPCS` data lives in the renderer process.

### Context Injection via "+" Menu

**New menu item:** `"📖 參考書籍"` / `"📖 Reference Books"` added below the existing file picker option in the "+" dropdown.

**Flow:**

1. User clicks "+" → sees file picker option and "Reference Books"
2. Clicking "Reference Books" opens a **BookPickerModal**
3. Modal shows all inventory books, grouped/filterable by category (skill domain, color-coded)
4. Each book displays: icon, name, source NPC, preview snippet, checkbox
5. User selects one or more books → clicks "附加" / "Attach"
6. Modal closes. Selected books appear as **pills/chips** below the input area
7. Pills show book icon + truncated name + `×` to remove
8. On send, attached books are prepended as context:

```
[📖 參考資料：{book name}]        ← zh-TW
[📖 Reference: {book name}]      ← en (locale-aware)
{full markdown content}
---
[📖 參考資料：{book name 2}]
{full markdown content 2}
---

{user's actual message}
```

**Injection format is locale-aware** — the `[📖 ...]` header uses the user's current locale to avoid mixing languages in the prompt sent to Claude.

**Pill styling:**

- Small rounded chips in gold palette (`#c4a46c` border, `rgba(200, 180, 140, 0.08)` bg)
- Book icon + truncated name
- `×` button to remove before sending

## Inventory Tab (Backpack)

### Enabling

Flip `available: false` → `true` for the items tab in `BackpackPanel.tsx`.

### Layout

- **Top bar:** Category filter chips — "All" + one per skill domain (color-coded per CLAUDE.md palette: writing `#e8b44c`, research `#5bb5e8`, code `#a78bfa`, data `#4ade80`, communication `#f472b6`, organization `#fb923c`, visual `#c084fc`)
- **Content:** Scrollable list of book cards
- **Empty state:** "還沒有收藏任何物品" / "No items collected yet" with hint about saving NPC responses via `🎒`

### Book Card (List Item)

- Icon (`📖`) + name (truncated if long)
- Source NPC name + relative timestamp
- Category badge (skill domain, color-coded)
- Preview snippet (1–2 lines)
- Click → opens BookDetailModal

### BookDetailModal

- Full markdown-rendered content (reuse existing `renderMarkdown()`)
- Editable name field (click to edit, save on blur/Enter)
- Metadata display: source NPC, original question, timestamp
- Category badge
- Actions: "刪除" / "Delete" with confirmation dialog, "關閉" / "Close"

## Architecture

### New Files

| Layer         | File                                                  | Purpose                                                                |
| ------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Shared types  | `src/shared/item-types.ts`                            | `ItemBase`, `BookItem`, `Item` union, `ItemType`                       |
| DB migration  | `src/main/db/migrations.ts`                           | Migration 4: `items` + `book_items` tables                             |
| Repository    | `src/main/db/item-repository.ts`                      | CRUD for items + book_items (JOIN queries)                             |
| IPC handlers  | `src/main/index.ts` (extend)                          | `getItems`, `addBookItem`, `updateItemName`, `deleteItem`              |
| Preload       | `src/preload/index.ts` (extend)                       | Expose item IPC channels on `window.api`                               |
| Hook          | `src/renderer/src/hooks/useItems.ts`                  | Fetch on mount, listen for push updates, refresh                       |
| Tab component | `src/renderer/src/components/ui/ItemsTab.tsx`         | Inventory list + category filter                                       |
| Detail modal  | `src/renderer/src/components/ui/BookDetailModal.tsx`  | View, edit name, delete                                                |
| Book picker   | `src/renderer/src/components/ui/BookPickerModal.tsx`  | Multi-select for context injection                                     |
| Notification  | `src/renderer/src/components/ui/ItemNotification.tsx` | Toast for book save confirmation (follows `QuestNotification` pattern) |
| i18n          | Both locale files (extend)                            | Item-related strings                                                   |

### Modified Files

| File                             | Change                                                                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BackpackPanel.tsx`              | Enable items tab (`available: true`), render `ItemsTab`                                                                                                                                                     |
| `DialoguePanel.tsx`              | Add `🎒` button to `MessageBubble` (extend props: `agentId`, `previousUserMessage`, `category`), add "Reference Books" to "+" menu, render attached book pills in `InputArea`, prepend book context on send |
| `src/renderer/src/game/types.ts` | New EventBus events: `'item:added': { item: BookItem }`, `'item:deleted': { itemId: string }`                                                                                                               |

### Data Flows

**Add to backpack:**

```
🎒 click → IPC addBookItem(payload) → main process: Haiku name gen (or fallback)
         → SQLite INSERT (items + book_items) → return BookItem
         → IPC push items-updated → useItems refresh → EventBus item:added
         → ItemNotification toast
```

**View/manage inventory:**

```
Open backpack → items tab → IPC getItems() → SQLite SELECT JOIN
              → useItems() state → ItemsTab renders cards
              → click card → BookDetailModal (edit name, delete)
```

**Inject context:**

```
"+" menu → "Reference Books" → BookPickerModal (IPC getItems)
         → multi-select → attach → pills in InputArea
         → on send: prepend book content blocks → IPC sendMessage
```

### IPC Channels (New)

Name generation is performed atomically inside `add-book-item` — no separate IPC call. The main process handles the Haiku call (or fallback) and returns the completed `BookItem` with its generated name. This avoids race conditions and unnecessary round-trips.

The `playerId` is hardcoded to `'player-1'` in the main process handlers, matching the existing pattern used by quests, achievements, and cosmetics. The renderer does not send `playerId`.

| Channel            | Direction       | Payload                                                                | Returns    |
| ------------------ | --------------- | ---------------------------------------------------------------------- | ---------- |
| `get-items`        | renderer → main | (none)                                                                 | `Item[]`   |
| `add-book-item`    | renderer → main | `{ markdownContent, sourceAgentId, sourceQuestion, category, locale }` | `BookItem` |
| `update-item-name` | renderer → main | `{ itemId, name }`                                                     | `void`     |
| `delete-item`      | renderer → main | `{ itemId }`                                                           | `void`     |
| `items-updated`    | main → renderer | push event                                                             | `void`     |

### Repository Interface

```typescript
export interface IItemRepository {
  getItems(playerId: string): Item[]
  addBookItem(item: Omit<BookItem, 'id' | 'createdAt'>): BookItem
  updateItemName(itemId: string, name: string): void
  deleteItem(itemId: string): void
  getItemCount(playerId: string, sourceAgentId?: string): number
}
```

## Edge Cases & Constraints

- **Token limits:** Full book injection eats NPC context window. Accepted for now — individual responses are typically short. Can add summarization/truncation later.
- **API key absence:** `🎒` button works without API key — falls back to template naming. Book save is purely local.
- **Deleted agents:** Books reference `source_agent_id`. If agent is removed, show agent ID or "Unknown NPC" gracefully.
- **Large inventories:** No pagination for MVP. Scrollable list + category filters handles hundreds of books. Local SQLite is fast.
- **i18n for names:** Haiku prompt includes user locale. Fallback templates also respect locale.
- **No item limits:** Users can save unlimited books. No artificial cap.
- **Duplicate saves:** Allowed. Each save creates a distinct book entry.
- **Attached books on dialogue close:** Attached book pills are ephemeral — cleared when the dialogue panel closes, same as the text input. This is consistent with the current file attachment behavior.
- **NPCs without skill domains:** Guild Master and Bartender have no `skills` array. Use `'general'` as fallback category, with a neutral color for the badge.
- **Migration coordination:** This adds Migration 4. If concurrent work on another branch also adds Migration 4, the later merge will need to renumber.

## Out of Scope (Future)

- Freeform user tags
- Book summarization for token-efficient injection
- Additional item types (potions, scrolls, tools, etc.)
- Pagination / virtual scrolling for large inventories
- Book sharing between players
- Drag-and-drop reordering
