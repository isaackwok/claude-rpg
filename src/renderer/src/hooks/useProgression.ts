import { useState, useEffect, useCallback } from 'react'
import { EventBus } from '../game/EventBus'
import type { PlayerState, XPAwardResult } from '../../../shared/types'

export function useProgression() {
  const [playerState, setPlayerState] = useState<PlayerState | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const state = await window.api.getPlayerState()
    setPlayerState(state)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()

    const cleanupXP = window.api.onXPAwarded((result: XPAwardResult & { agentId?: string }) => {
      // Refresh state from main process
      refresh()

      // Emit EventBus events so Phaser can react
      for (const award of result.awards) {
        EventBus.emit('xp:gained', {
          category: award.category,
          amount: award.amount,
          newTotal: award.newTotal,
          agentId: result.agentId ?? ''
        })
      }

      for (const levelUp of result.levelUps) {
        EventBus.emit('level:up', {
          category: levelUp.category,
          newLevel: levelUp.newLevel,
          overallLevel: result.overallLevelUp?.newLevel ?? 0
        })
      }

      if (result.titleChanged) {
        EventBus.emit('title:changed', { newTitle: result.titleChanged })
      }
    })

    const cleanupTitle = window.api.onTitleChanged(() => {
      refresh()
    })

    return () => {
      cleanupXP()
      cleanupTitle()
    }
  }, [refresh])

  return { playerState, loading, refresh }
}
