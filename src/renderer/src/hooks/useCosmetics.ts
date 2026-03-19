import { useState, useEffect, useCallback } from 'react'
import type { PlayerCosmetic } from '../../../shared/cosmetic-types'

export function useCosmetics(): {
  cosmetics: PlayerCosmetic[]
  loading: boolean
  error: string | null
  equip: (cosmeticDefId: string) => Promise<void>
  unequip: (cosmeticDefId: string) => Promise<void>
  equipped: PlayerCosmetic[]
  refresh: () => Promise<void>
} {
  const [cosmetics, setCosmetics] = useState<PlayerCosmetic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const result = await window.api.getCosmetics()
      setCosmetics(result)
    } catch (err) {
      console.error('[useCosmetics] Failed to fetch cosmetics:', err)
      setError(err instanceof Error ? err.message : 'cosmetic-load-failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const equip = useCallback(
    async (cosmeticDefId: string) => {
      try {
        await window.api.equipCosmetic(cosmeticDefId)
        await refresh()
      } catch (err) {
        console.error('[useCosmetics] Failed to equip cosmetic:', err)
        setError(err instanceof Error ? err.message : 'cosmetic-equip-failed')
      }
    },
    [refresh]
  )

  const unequip = useCallback(
    async (cosmeticDefId: string) => {
      try {
        await window.api.unequipCosmetic(cosmeticDefId)
        await refresh()
      } catch (err) {
        console.error('[useCosmetics] Failed to unequip cosmetic:', err)
        setError(err instanceof Error ? err.message : 'cosmetic-unequip-failed')
      }
    },
    [refresh]
  )

  useEffect(() => {
    refresh()

    const cleanupUpdated = window.api.onCosmeticsUpdated((updated: PlayerCosmetic[]) => {
      setCosmetics(updated)
      setError(null)
    })

    return () => {
      cleanupUpdated()
    }
  }, [refresh])

  const equipped = cosmetics.filter((c) => c.equipped)

  return { cosmetics, loading, error, equip, unequip, equipped, refresh }
}
