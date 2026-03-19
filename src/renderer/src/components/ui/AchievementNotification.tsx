import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'
import { EventBus } from '../../game/EventBus'
import type { LocalizedString } from '../../../../shared/types'

interface AchievementToast {
  id: number
  title: LocalizedString
  cosmeticReward?: { id: string; title: LocalizedString; type: 'overlay' | 'decoration' }
}

// Module-level counter ensures unique toast IDs across component re-mounts
let toastId = 0

export function AchievementNotification(): React.JSX.Element | null {
  const { t, locale } = useTranslation()
  const [toasts, setToasts] = useState<AchievementToast[]>([])
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    const addAutoRemoveToast = (toast: AchievementToast): void => {
      setToasts((prev) => [...prev, toast])
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
        timersRef.current.delete(timer)
      }, 4000)
      timersRef.current.add(timer)
    }

    const handleUnlocked = (data: {
      achievementDefId: string
      title: LocalizedString
      cosmeticReward?: { id: string; title: LocalizedString; type: 'overlay' | 'decoration' }
    }): void => {
      addAutoRemoveToast({
        id: ++toastId,
        title: data.title,
        cosmeticReward: data.cosmeticReward
      })
    }

    EventBus.on('achievement:unlocked', handleUnlocked)
    const timers = timersRef.current
    return () => {
      EventBus.off('achievement:unlocked', handleUnlocked)
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        zIndex: 251
      }}
    >
      {toasts.map((toast) => {
        const titleText = toast.title[locale] ?? toast.title['zh-TW'] ?? ''
        const cosmeticTitle = toast.cosmeticReward
          ? (toast.cosmeticReward.title[locale] ?? toast.cosmeticReward.title['zh-TW'] ?? '')
          : undefined

        const text = cosmeticTitle
          ? `🏆 ${titleText} — ${cosmeticTitle} ${t('achievements.unlocked')}！`
          : `🏆 ${titleText} — ${t('achievements.unlocked')}！`

        return (
          <div
            key={toast.id}
            style={{
              fontFamily: 'monospace',
              fontSize: 18,
              fontWeight: 'bold',
              color: '#ffd700',
              textShadow: '0 0 16px rgba(255, 215, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.8)',
              textAlign: 'center',
              animation: 'fadeInOut 4s ease-in-out'
            }}
          >
            {text}
          </div>
        )
      })}
    </div>
  )
}
