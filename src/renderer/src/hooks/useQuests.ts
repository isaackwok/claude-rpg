import { useState, useEffect, useCallback } from 'react'
import { EventBus } from '../game/EventBus'
import type { PlayerQuest, LocalizedString, QuestVisibility } from '../../../shared/types'

export function useQuests() {
  const [quests, setQuests] = useState<PlayerQuest[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await window.api.getQuests()
      setQuests(result)
    } catch (err) {
      console.error('[useQuests] Failed to fetch quests:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    const cleanupUpdated = window.api.onQuestsUpdated(
      (data: {
        quests: PlayerQuest[]
        completed?: { questDefId: string; title: LocalizedString; xpReward: number }[]
      }) => {
        setQuests(data.quests)

        if (data.completed) {
          for (const c of data.completed) {
            EventBus.emit('quest:completed', {
              questId: c.questDefId,
              title: c.title,
              xpReward: c.xpReward
            })
          }
        }
      }
    )

    const cleanupDiscovered = window.api.onQuestDiscovered(
      (data: { questDefId: string; visibility: QuestVisibility }) => {
        refresh()
        EventBus.emit('quest:discovered', {
          questDefId: data.questDefId,
          visibility: data.visibility
        })
      }
    )

    return () => {
      cleanupUpdated()
      cleanupDiscovered()
    }
  }, [refresh])

  // Badge shows quests with actual progress (not just seeded-but-untouched)
  const activeCount = quests.filter((q) => q.status === 'active' && q.progress > 0).length
  const completedCount = quests.filter((q) => q.status === 'completed').length

  return { quests, loading, refresh, activeCount, completedCount }
}
