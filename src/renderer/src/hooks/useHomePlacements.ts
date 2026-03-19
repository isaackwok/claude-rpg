import { useState, useEffect, useCallback } from 'react'
import type { HomePlacement } from '../../../shared/cosmetic-types'

export function useHomePlacements(): {
  placements: HomePlacement[]
  loading: boolean
  place: (cosmeticDefId: string, tileX: number, tileY: number) => Promise<void>
  remove: (cosmeticDefId: string) => Promise<void>
  refresh: () => Promise<void>
} {
  const [placements, setPlacements] = useState<HomePlacement[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await window.api.getHomePlacements()
      setPlacements(result)
    } catch (err) {
      console.error('[useHomePlacements] Failed to fetch placements:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const place = useCallback(
    async (cosmeticDefId: string, tileX: number, tileY: number) => {
      try {
        await window.api.placeDecoration(cosmeticDefId, tileX, tileY)
        await refresh()
      } catch (err) {
        console.error('[useHomePlacements] Failed to place decoration:', err)
      }
    },
    [refresh]
  )

  const remove = useCallback(
    async (cosmeticDefId: string) => {
      try {
        await window.api.removeDecoration(cosmeticDefId)
        await refresh()
      } catch (err) {
        console.error('[useHomePlacements] Failed to remove decoration:', err)
      }
    },
    [refresh]
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  return { placements, loading, place, remove, refresh }
}
