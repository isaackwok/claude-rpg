import type { AgentId, SkillCategory } from './types'

export type ItemType = 'book'
export type ItemCategory = SkillCategory | 'general'

export interface ItemBase {
  id: string
  playerId: string
  type: ItemType
  name: string
  icon: string
  category: ItemCategory
  createdAt: number
}

export interface BookItem extends ItemBase {
  type: 'book'
  markdownContent: string
  sourceAgentId: AgentId
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
