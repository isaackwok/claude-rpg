import { useState, useEffect, useCallback } from 'react'
import { EventBus } from '../game/EventBus'
import type { PlayerAchievement, AchievementCheckResult } from '../../../shared/achievement-types'

export function useAchievements(): {
  achievements: PlayerAchievement[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  unlockedCount: number
  totalCount: number
} {
  const [achievements, setAchievements] = useState<PlayerAchievement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const result = await window.api.getAchievements()
      setAchievements(result)
    } catch (err) {
      console.error('[useAchievements] Failed to fetch achievements:', err)
      setError(err instanceof Error ? err.message : 'achievement-load-failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    const cleanupUnlocked = window.api.onAchievementsUnlocked(
      (unlocked: AchievementCheckResult['unlocked']) => {
        refresh().catch((err) =>
          console.error('[useAchievements] refresh after unlock failed:', err)
        )

        for (const a of unlocked) {
          EventBus.emit('achievement:unlocked', {
            achievementDefId: a.achievementDefId,
            title: a.title
            // cosmeticReward omitted: IPC payload only carries the defId string,
            // not the full { id, title, type } shape the EventBus event requires.
            // Consumers that need cosmetic details should use the achievements state.
          })
        }
      }
    )

    return () => {
      cleanupUnlocked()
    }
  }, [refresh])

  const unlockedCount = achievements.filter((a) => a.unlocked).length
  const totalCount = achievements.length

  return { achievements, loading, error, refresh, unlockedCount, totalCount }
}
