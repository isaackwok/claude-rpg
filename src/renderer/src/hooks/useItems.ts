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
